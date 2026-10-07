// Mini-validateur JSON Schema (sous-ensemble de draft-07), sans dépendance.
// Gère : type, enum, const, required, properties, patternProperties, additionalProperties,
// items, minItems/maxItems, minLength/maxLength, minimum/maximum, pattern, format (date, uri),
// $ref (local "#/..." ou inter-fichiers "commun.json#/..."), allOf, anyOf, oneOf, if/then/else.

const FORMATS = {
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) &&
    new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v,
  uri: (v) => { try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } },
};

function typeDe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
const typeOk = (t, v) => { const r = typeDe(v); return t === r || (t === 'number' && r === 'integer'); };

/** registre : { 'commun.json': schema, ... } (clé = $id du schéma) */
export function creerValidateur(registre) {
  function resoudre(ref, racine) {
    const [fic, ptr = ''] = ref.split('#');
    const doc = fic ? registre[fic] : racine;
    if (!doc) throw new Error(`Schéma inconnu : ${fic}`);
    let noeud = doc;
    for (const seg of ptr.split('/').filter(Boolean)) noeud = noeud?.[decodeURIComponent(seg)];
    if (noeud === undefined) throw new Error(`Référence introuvable : ${ref}`);
    return { noeud, racine: doc };
  }

  // Retourne la liste d'erreurs {chemin, message}
  function val(s, d, chemin, racine) {
    const e = [];
    const err = (message) => e.push({ chemin: chemin || '/', message });
    if (s.$ref) { const r = resoudre(s.$ref, racine); return val(r.noeud, d, chemin, r.racine); }

    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      if (!types.some((t) => typeOk(t, d))) { err(`type attendu : ${types.join(' ou ')} (reçu : ${typeDe(d)})`); return e; }
    }
    if (s.enum && !s.enum.some((x) => JSON.stringify(x) === JSON.stringify(d))) err(`valeur non autorisée (attendu : ${s.enum.join(', ')})`);
    if (s.const !== undefined && JSON.stringify(s.const) !== JSON.stringify(d)) err(`valeur attendue : ${s.const}`);

    if (typeof d === 'string') {
      if (s.minLength !== undefined && d.length < s.minLength) err(`trop court (min ${s.minLength} caractères)`);
      if (s.maxLength !== undefined && d.length > s.maxLength) err(`trop long (max ${s.maxLength} caractères)`);
      if (s.pattern && !new RegExp(s.pattern).test(d)) err(`format invalide (motif ${s.pattern})`);
      if (s.format && FORMATS[s.format] && !FORMATS[s.format](d)) err(`format ${s.format} invalide`);
    }
    if (typeof d === 'number') {
      if (s.minimum !== undefined && d < s.minimum) err(`inférieur au minimum ${s.minimum}`);
      if (s.maximum !== undefined && d > s.maximum) err(`supérieur au maximum ${s.maximum}`);
    }
    if (Array.isArray(d)) {
      if (s.minItems !== undefined && d.length < s.minItems) err(`au moins ${s.minItems} élément(s) requis`);
      if (s.maxItems !== undefined && d.length > s.maxItems) err(`au plus ${s.maxItems} élément(s)`);
      if (s.items) d.forEach((x, i) => e.push(...val(s.items, x, `${chemin}/${i}`, racine)));
    }
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      for (const k of s.required || []) if (!(k in d)) e.push({ chemin: `${chemin}/${k}`, message: 'champ obligatoire manquant' });
      const props = s.properties || {};
      const motifs = Object.entries(s.patternProperties || {}).map(([p, sc]) => [new RegExp(p), sc]);
      for (const [k, v] of Object.entries(d)) {
        let connu = false;
        if (k in props) { connu = true; e.push(...val(props[k], v, `${chemin}/${k}`, racine)); }
        for (const [re, sc] of motifs) if (re.test(k)) { connu = true; e.push(...val(sc, v, `${chemin}/${k}`, racine)); }
        if (!connu) {
          if (s.additionalProperties === false) e.push({ chemin: `${chemin}/${k}`, message: 'champ non prévu par le schéma' });
          else if (typeof s.additionalProperties === 'object') e.push(...val(s.additionalProperties, v, `${chemin}/${k}`, racine));
        }
      }
    }
    for (const sub of s.allOf || []) e.push(...val(sub, d, chemin, racine));
    if (s.anyOf && !s.anyOf.some((sub) => val(sub, d, chemin, racine).length === 0)) err('ne correspond à aucune des formes autorisées');
    if (s.oneOf && s.oneOf.filter((sub) => val(sub, d, chemin, racine).length === 0).length !== 1) err('doit correspondre à exactement une forme');
    if (s.if) {
      const ok = val(s.if, d, chemin, racine).length === 0;
      if (ok && s.then) e.push(...val(s.then, d, chemin, racine));
      if (!ok && s.else) e.push(...val(s.else, d, chemin, racine));
    }
    return e;
  }

  return {
    /** Valide `donnees` avec le schéma enregistré sous `nom` (ex. 'dispositif.json'). */
    valider(nom, donnees) {
      const s = registre[nom];
      if (!s) throw new Error(`Schéma inconnu : ${nom}`);
      const erreurs = val(s, donnees, '', s);
      return { ok: erreurs.length === 0, erreurs };
    },
  };
}

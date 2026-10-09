// Démarre l'écoute en cherchant un port libre si le port demandé est déjà pris (autre programme sur le poste).
export function ecouter(serveur, host, portSouhaite, essais = 20) {
  return new Promise((resolve, reject) => {
    let port = portSouhaite;
    const tenter = () => {
      const surErreur = (e) => {
        if (e.code === 'EADDRINUSE' && port < portSouhaite + essais) { port += 1; tenter(); } else reject(e);
      };
      serveur.once('error', surErreur);
      serveur.listen(port, host, () => { serveur.removeListener('error', surErreur); resolve(port); });
    };
    tenter();
  });
}

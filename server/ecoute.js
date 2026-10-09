// Démarre l'écoute en cherchant un port utilisable si le port demandé est déjà pris (EADDRINUSE) ou interdit (EACCES : sous Windows, plages de ports réservées par Hyper-V, WSL ou Docker).
export function ecouter(serveur, host, portSouhaite, essais = 200) {
  return new Promise((resolve, reject) => {
    let port = portSouhaite;
    const tenter = () => {
      const surErreur = (e) => {
        if ((e.code === 'EADDRINUSE' || e.code === 'EACCES') && port < portSouhaite + essais) { port += 1; tenter(); } else reject(e);
      };
      serveur.once('error', surErreur);
      serveur.listen(port, host, () => { serveur.removeListener('error', surErreur); resolve(port); });
    };
    tenter();
  });
}

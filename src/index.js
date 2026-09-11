import h5wasm from "h5wasm";

export default {
  async fetch(request, env) {
    return await recupererRadar(env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(recupererRadar(env));
  }
};

async function recupererRadar(env) {

  const url =
    "https://public-api.meteofrance.fr/public/DPRadar/v1/" +
    "mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500";

  const response = await fetch(url, {
    headers: {
      "apikey": env.METEOFRANCE_API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(
      `Meteo-France ${response.status}: ${await response.text()}`
    );
  }

  // Récupération de l'heure du fichier radar
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/(\d{14})/);

  if (!match) {
    throw new Error(
      "Horodatage du produit radar introuvable dans Content-Disposition"
    );
  }

  const s = match[1];

  const timestamp =
    `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}T` +
    `${s.substring(8,10)}:${s.substring(10,12)}:${s.substring(12,14)}Z`;

  const buffer = await response.arrayBuffer();

  const Module = await h5wasm.ready;
  const { FS } = Module;

  FS.writeFile("/radar.h5", new Uint8Array(buffer));

  const file = new h5wasm.File("/radar.h5", "r");
  const dataset = file.get("dataset1/data1/data");

  // Chartrettes
  const ligne = 1207;
  const colonne = 1628;

  const data = dataset.value;
  const cols = dataset.shape[1];

  const valeurBrute = data[ligne * cols + colonne];

  // 65535 = no data
  // 65534 = sous le seuil de détection
  const pluieMm =
    valeurBrute === 65535 || valeurBrute === 65534
      ? 0
      : valeurBrute * 0.01;

  // Lecture de l'historique
  let historique = [];

  const ancien = await env.RADAR_KV.get("radar_history", "json");

  if (ancien && Array.isArray(ancien)) {
    historique = ancien;
  }

  // Ajout de la nouvelle mesure
  historique.push({
    t: timestamp,
    p: pluieMm
  });

  // Conservation de 15 jours
  const limite =
    new Date(timestamp).getTime() - 15 * 24 * 60 * 60 * 1000;

  historique = historique.filter(
    m => new Date(m.t).getTime() >= limite
  );

  // Une seule écriture KV
  await env.RADAR_KV.put(
    "radar_history",
    JSON.stringify(historique)
  );

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp,
      pluie_mm: pluieMm,
      mesures_stockees: historique.length
    }, null, 2),
    {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    }
  );
}

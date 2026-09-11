import h5wasm from "h5wasm";

const POINTS = [
  { nom: "Montargis", ligne: 1312, colonne: 1638 },
  { nom: "Nemours", ligne: 1254, colonne: 1630 },
  { nom: "Château-Landon", ligne: 1279, colonne: 1632 },
  { nom: "Auxerre", ligne: 1349, colonne: 1763 },
  { nom: "Joigny", ligne: 1310, colonne: 1736 },
  { nom: "Pont-sur-Yonne", ligne: 1246, colonne: 1704 },
  { nom: "Nogent-sur-Seine", ligne: 1199, colonne: 1743 },
  { nom: "Montereau", ligne: 1344, colonne: 1616 },
  { nom: "Chartrettes", ligne: 1206, colonne: 1628 }
];

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

  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/(\d{14})/);

  if (!match) {
    throw new Error(
      "Horodatage du produit radar introuvable"
    );
  }

  const s = match[1];

  const timestamp =
    `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}T` +
    `${s.substring(8, 10)}:${s.substring(10, 12)}:${s.substring(12, 14)}Z`;

  const buffer = await response.arrayBuffer();

  const Module = await h5wasm.ready;
  const { FS } = Module;

  FS.writeFile("/radar.h5", new Uint8Array(buffer));

  const file = new h5wasm.File("/radar.h5", "r");
  const dataset = file.get("dataset1/data1/data");

  const data = dataset.value;
  const cols = dataset.shape[1];

  const pluies = POINTS.map(point => {

    const valeurBrute =
      data[point.ligne * cols + point.colonne];

    const pluieMm =
      valeurBrute === 65535 || valeurBrute === 65534
        ? 0
        : valeurBrute * 0.01;

    return pluieMm;
  });

  let historique =
    await env.RADAR_KV.get("radar_history", "json");

  if (!Array.isArray(historique)) {
    historique = [];
  }

  historique.push({
    t: timestamp,
    p: pluies
  });

  const limite =
    new Date(timestamp).getTime() -
    15 * 24 * 60 * 60 * 1000;

  historique = historique.filter(
    m => new Date(m.t).getTime() >= limite
  );

  await env.RADAR_KV.put(
    "radar_history",
    JSON.stringify(historique)
  );

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp,
      mesures_stockees: historique.length,
      points: POINTS.map((point, i) => ({
        nom: point.nom,
        pluie_mm: pluies[i]
      }))
    }, null, 2),
    {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    }
  );
}

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
      `Erreur Météo-France ${response.status}: ${await response.text()}`
    );
  }

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
  const pluieMm = valeurBrute * 0.01;

  const timestamp = new Date().toISOString();

  // Une seule valeur par heure
  const cle = `radar_chartrettes_${timestamp}`;

  await env.RADAR_KV.put(
    cle,
    JSON.stringify({
      point: "Chartrettes",
      timestamp,
      valeur_brute: valeurBrute,
      pluie_mm: pluieMm
    })
  );

  return new Response(
    JSON.stringify({
      ok: true,
      point: "Chartrettes",
      timestamp,
      pluie_mm: pluieMm,
      kv: cle
    }, null, 2),
    {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    }
  );
}

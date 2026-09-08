import h5wasm from "h5wasm";

export default {
  async fetch(request, env) {

    const url =
      "https://public-api.meteofrance.fr/public/DPRadar/v1/" +
      "mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500";

    const response = await fetch(url, {
      headers: {
        "apikey": env.METEOFRANCE_API_KEY
      }
    });

    if (!response.ok) {
      return new Response(
        "Erreur Météo-France : " +
        response.status + " " +
        await response.text(),
        { status: 500 }
      );
    }

    const buffer = await response.arrayBuffer();

    const Module = await h5wasm.ready;
    const { FS } = Module;

    FS.writeFile("/radar.h5", new Uint8Array(buffer));

    const file = new h5wasm.File("/radar.h5", "r");
    const dataset = file.get("dataset1/data1/data");

    // Pixel de Chartrettes
    const ligne = 1207;
    const colonne = 1628;

    const data = dataset.value;
    const cols = dataset.shape[1];

    const valeurBrute = data[ligne * cols + colonne];

    // Valeur radar en mm
    const pluieMm = valeurBrute * 0.01;

    // Heure de la mesure
    const maintenant = new Date();
    const timestamp = maintenant.toISOString();

    // Une mesure = une clé KV
    const cle = `radar_chartrettes_${timestamp}`;

    await env.RADAR_KV.put(
      cle,
      JSON.stringify({
        point: "Chartrettes",
        latitude: 48.483330,
        longitude: 2.700000,
        timestamp: timestamp,
        valeur_brute: valeurBrute,
        pluie_mm: pluieMm
      })
    );

    return new Response(
      JSON.stringify({
        ok: true,
        point: "Chartrettes",
        timestamp: timestamp,
        pixel: {
          ligne: ligne,
          colonne: colonne
        },
        valeur_brute: valeurBrute,
        pluie_mm: pluieMm,
        kv: {
          cle: cle,
          enregistre: true
        }
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  }
};

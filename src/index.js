import h5wasm from "h5wasm";

export default {
  async fetch(request, env) {

    const url =
      "https://public-api.meteofrance.fr/public/DPRadar/v1/" +
      "mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500";

    // Télécharger le HDF5
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

    // Initialiser HDF5/WASM
    const Module = await h5wasm.ready;
    const { FS } = Module;

    // Écrire le fichier dans le système de fichiers virtuel
    const filename = "/radar.h5";

    FS.writeFile(filename, new Uint8Array(buffer));

    // Ouvrir le HDF5
    const file = new h5wasm.File(filename, "r");

    // Lire le dataset Météo-France
    const dataset = file.get("dataset1/data1/data");

    return new Response(
      JSON.stringify({
        ok: true,
        dimensions: dataset.shape,
        type: dataset.dtype,
        message: "HDF5 ouvert avec succès"
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  }
};

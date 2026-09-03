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
    const data1 = file.get("dataset1/data1");
    const dataset1 = file.get("dataset1");

    return new Response(
      JSON.stringify({
        dataset: {
          shape: dataset.shape,
          dtype: dataset.dtype,
          attrs: dataset.attrs
        },

        data1: {
          attrs: data1.attrs
        },

        dataset1: {
          attrs: dataset1.attrs
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

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

    const filename = "/radar.h5";
    FS.writeFile(filename, new Uint8Array(buffer));

    const file = new h5wasm.File(filename, "r");
    const dataset = file.get("dataset1/data1/data");

    /*
      Pour l'instant, on lit la totalité du tableau.
      On cherche ensuite le pixel correspondant à Chartrettes.

      Coordonnées Chartrettes :
      latitude  = 48.483330
      longitude = 2.700000
    */

    const data = dataset.value;

    // Dimensions du raster
    const rows = dataset.shape[0];
    const cols = dataset.shape[1];

    /*
      Géoréférencement Météo-France :
      projection stéréographique polaire.

      On utilise ici les coordonnées projetées connues
      du fichier radar.
    */

    const lat = 48.483330;
    const lon = 2.700000;

    // Paramètres du raster
    const pixelSize = 500;

    // Origine du raster en coordonnées projetées
    const originX = -0.0040559091139585;
    const originY = 1736000.0020674658;

    /*
      Conversion longitude/latitude -> projection
      stéréographique polaire Météo-France.

      Paramètres :
      lat0 = 90°
      lon0 = 0°
      lat_ts = 45°
      ellipsoïde WGS84
    */

    const a = 6378137.0;
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    const latTs = 45 * Math.PI / 180;

    const t =
      Math.tan(Math.PI / 4 - latRad / 2);

    const tTs =
      Math.tan(Math.PI / 4 - latTs / 2);

    const rho =
      2 * a * t /
      Math.sqrt(
        (1 + Math.sin(latTs)) /
        (1 - Math.sin(latTs))
      );

    const rhoTs =
      2 * a * tTs /
      Math.sqrt(
        (1 + Math.sin(latTs)) /
        (1 - Math.sin(latTs))
      );

    const scale = rhoTs / (a * tTs);

    const x = a * scale * Math.cos(latRad) *
      Math.sin(lonRad) / (1 + Math.sin(latRad));

    const y = -a * scale * Math.cos(latRad) *
      Math.cos(lonRad) / (1 + Math.sin(latRad));

    // Pixel correspondant
    const col = Math.floor((x - originX) / pixelSize);
    const row = Math.floor((originY - y) / pixelSize);

    let valeurBrute = null;

    if (
      row >= 0 &&
      row < rows &&
      col >= 0 &&
      col < cols
    ) {
      valeurBrute = data[row * cols + col];
    }

    return new Response(
      JSON.stringify({
        ok: true,
        point: {
          nom: "Chartrettes",
          latitude: lat,
          longitude: lon
        },
        pixel: {
          ligne: row,
          colonne: col
        },
        valeur_brute: valeurBrute,
        pluie_mm: valeurBrute !== null
          ? valeurBrute * 0.01
          : null
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  }
};

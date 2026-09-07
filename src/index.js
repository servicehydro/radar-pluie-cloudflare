export default {
  async fetch(request, env) {

    // Chartrettes
    const lat = 48.483330;
    const lon = 2.700000;

    // Projection Météo-France
    // +proj=stere +lat_0=90 +lon_0=0 +lat_ts=45
    // +ellps=WGS84
    const a = 6378137.0;
    const e = 0.0818191908426;

    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    const latTs = 45 * Math.PI / 180;

    function t(phi) {
      return Math.tan(Math.PI / 4 - phi / 2) /
        Math.pow(
          (1 - e * Math.sin(phi)) /
          (1 + e * Math.sin(phi)),
          e / 2
        );
    }

    const tLat = t(latRad);
    const tTs = t(latTs);

    const mTs =
      Math.cos(latTs) /
      Math.sqrt(1 - e * e * Math.sin(latTs) ** 2);

    const rho =
      a * mTs * tLat / tTs;

    const x = rho * Math.sin(lonRad);
    const y = -rho * Math.cos(lonRad);

    // Paramètres du raster Météo-France
    const pixel = 500;

    const originX = -0.0040559091139585;
    const originY = 1736000.0020674658;

    const colonne = Math.floor(
      (x - originX) / pixel
    );

    const ligne = Math.floor(
      (originY - y) / pixel
    );

    return new Response(
      JSON.stringify({
        point: {
          latitude: lat,
          longitude: lon
        },
        projection: {
          x: x,
          y: y
        },
        pixel: {
          ligne: ligne,
          colonne: colonne
        },
        dans_raster:
          ligne >= 0 &&
          ligne < 3472 &&
          colonne >= 0 &&
          colonne < 3472
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  }
};

import { fromArrayBuffer } from "geotiff";
export default {
  async fetch(request, env) {

    const base =
      "https://public-api.meteofrance.fr/public/arome/1.0/wcs/" +
      "MF-NWP-HIGHRES-AROME-001-FRANCE-WCS";

    // --------------------------------------------------
    // 1. Catalogue AROME
    // --------------------------------------------------

    const capUrl =
      base +
      "/GetCapabilities" +
      "?service=WCS&version=2.0.1&language=fre";

    const capResponse = await fetch(capUrl, {
      headers: {
        "apikey": env.METEOFRANCE_API_KEY
      }
    });

    const catalogue = await capResponse.text();

    if (!capResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          etape: "GetCapabilities",
          status: capResponse.status,
          message: catalogue
        }, null, 2),
        {
          status: 500,
          headers: {
            "content-type": "application/json;charset=UTF-8"
          }
        }
      );
    }

    // --------------------------------------------------
    // 2. Recherche des P2D et sélection du run le plus récent
    // --------------------------------------------------

    const regex =
      /<wcs:CoverageId>(TOTAL_WATER_PRECIPITATION__GROUND_OR_WATER_SURFACE___(\d{4}-\d{2}-\d{2}T\d{2}\.\d{2}\.\d{2}Z)_P2D)<\/wcs:CoverageId>/g;

    const couvertures = [];

    for (const match of catalogue.matchAll(regex)) {
      couvertures.push({
        coverageId: match[1],
        run: match[2]
      });
    }

    if (couvertures.length === 0) {
    const coverageResponse =
      await fetch(coverageUrl, {
        headers: {
          apikey: env.METEOFRANCE_API_KEY
        }
      });

    const buffer =
      await coverageResponse.arrayBuffer();

    if (!coverageResponse.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: coverageResponse.status,
          message:
            new TextDecoder()
              .decode(buffer)
        }, null, 2),
        {
          status: 500,
          headers: {
            "content-type":
              "application/json;charset=UTF-8"
          }
        }
      );
    }

    // Lecture du GeoTIFF
    const tiff =
      await fromArrayBuffer(buffer);

    const image =
      await tiff.getImage();

    const raster =
      await image.readRasters({
        interleave: true
      });

    return new Response(
      JSON.stringify({
        ok: true,
        run: dernier.run,
        echeance_48h: echeance,
        coverageId: dernier.coverageId,

        largeur:
          image.getWidth(),

        hauteur:
          image.getHeight(),

        valeur_brute:
          raster[0],

        origine:
          image.getOrigin(),

        resolution:
          image.getResolution(),

        bbox:
          image.getBoundingBox()

      }, null, 2),
      {
        headers: {
          "content-type":
            "application/json;charset=UTF-8"
        }
      }
    );
    }

    couvertures.sort((a, b) =>
      a.run.localeCompare(b.run)
    );

    const dernier =
      couvertures[couvertures.length - 1];

    // --------------------------------------------------
    // 3. Échéance +48 h
    // --------------------------------------------------

    const runIso =
      dernier.run.replace(
        /^(\d{4}-\d{2}-\d{2}T\d{2})\.(\d{2})\.(\d{2})Z$/,
        "$1:$2:$3Z"
      );

    const echeance =
      new Date(
        new Date(runIso).getTime() +
        48 * 60 * 60 * 1000
      ).toISOString()
    .replace(".000Z", "Z");

    // --------------------------------------------------
    // 4. GetCoverage sur Chartrettes
    // --------------------------------------------------

    const params = new URLSearchParams();

    params.set("service", "WCS");
    params.set("version", "2.0.1");
    params.set("coverageid", dernier.coverageId);

    params.append("time", "");
    params.set("subset", `time(${echeance})`);
    params.append(
      "subset",
      "lat(48.4881157)"
    );
    params.append(
      "subset",
      "long(2.7005289)"
    );

    params.set(
      "format",
      "image/tiff"
    );

    const coverageUrl =
      base +
      "/GetCoverage?" +
      params.toString();

    const coverageResponse =
      await fetch(coverageUrl, {
        headers: {
          "apikey": env.METEOFRANCE_API_KEY
        }
      });

    const contentType =
      coverageResponse.headers.get(
        "content-type"
      );

    const buffer =
      await coverageResponse.arrayBuffer();

    // Pour le diagnostic, on affiche le début
    // de la réponse si elle est textuelle.
    let apercu = null;

    if (
      contentType &&
      contentType.includes("xml")
    ) {
      apercu =
        new TextDecoder()
          .decode(buffer)
          .substring(0, 3000);
    }

    return new Response(
      JSON.stringify({
        ok: coverageResponse.ok,
        run: dernier.run,
        coverageId: dernier.coverageId,
        echeance_48h: echeance,
        status: coverageResponse.status,
        contentType,
        taille_octets: buffer.byteLength,
        apercu
      }, null, 2),
      {
        headers: {
          "content-type":
            "application/json;charset=UTF-8"
        }
      }
    );
  }
};

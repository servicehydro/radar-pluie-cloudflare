import { fromArrayBuffer } from "geotiff";

const BASE =
  "https://public-api.meteofrance.fr/public/arome/1.0/wcs/" +
  "MF-NWP-HIGHRES-AROME-001-FRANCE-WCS";

const LAT = 48.4881157;
const LON = 2.7005289;

export default {
  async fetch(request, env) {

    try {

      // ==================================================
      // 1. GET CAPABILITIES
      // ==================================================

      const capUrl =
        BASE +
        "/GetCapabilities" +
        "?service=WCS&version=2.0.1&language=fre";

      const capResponse = await fetch(capUrl, {
        headers: {
          apikey: env.METEOFRANCE_API_KEY
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
              "content-type":
                "application/json;charset=UTF-8"
            }
          }
        );
      }


      // ==================================================
      // 2. RECHERCHE DES COVERAGES P2D
      // ==================================================

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
        return new Response(
          JSON.stringify({
            ok: false,
            erreur:
              "Aucun coverage AROME P2D trouvé"
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


      // ==================================================
      // 3. RUN LE PLUS RECENT
      // ==================================================

      couvertures.sort((a, b) =>
        a.run.localeCompare(b.run)
      );

      const dernier =
        couvertures[couvertures.length - 1];


      // ==================================================
      // 4. CONVERSION DE L'HEURE DU RUN
      // ==================================================

      const runIso =
        dernier.run.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2})\.(\d{2})\.(\d{2})Z$/,
          "$1:$2:$3Z"
        );


      // ==================================================
      // 5. ECHEANCE +48 H
      // ==================================================

      const echeance =
        new Date(
          new Date(runIso).getTime() +
          48 * 60 * 60 * 1000
        )
          .toISOString()
          .replace(".000Z", "Z");


      // ==================================================
      // 6. GETCOVERAGE
      // ==================================================
      //
      // On demande une petite emprise autour de Chartrettes.
      // Cela permet d'obtenir un vrai GeoTIFF 2D.
      //

      const params =
        new URLSearchParams();

      params.set(
        "service",
        "WCS"
      );

      params.set(
        "version",
        "2.0.1"
      );

      params.set(
        "coverageid",
        dernier.coverageId
      );

      params.append(
        "subset",
        `time(${echeance})`
      );

      params.append(
        "subset",
        "lat(48.48,48.50)"
      );

      params.append(
        "subset",
        "long(2.69,2.71)"
      );

      params.set(
        "format",
        "image/tiff"
      );


      const coverageUrl =
        BASE +
        "/GetCoverage?" +
        params.toString();


      const coverageResponse =
        await fetch(
          coverageUrl,
          {
            headers: {
              apikey:
                env.METEOFRANCE_API_KEY
            }
          }
        );


      const buffer =
        await coverageResponse.arrayBuffer();


      // ==================================================
      // 7. ERREUR GETCOVERAGE
      // ==================================================

      if (!coverageResponse.ok) {

        const message =
          new TextDecoder()
            .decode(buffer);

        return new Response(
          JSON.stringify({
            ok: false,
            etape: "GetCoverage",
            status:
              coverageResponse.status,
            message
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


      // ==================================================
      // 8. LECTURE DU GEOTIFF
      // ==================================================

      const tiff =
        await fromArrayBuffer(buffer);

      const image =
        await tiff.getImage();


      const width =
        image.getWidth();

      const height =
        image.getHeight();

      const bbox =
        image.getBoundingBox();

      const origin =
        image.getOrigin();

      const resolution =
        image.getResolution();


      // ==================================================
      // 9. LECTURE DES VALEURS
      // ==================================================

      const raster =
        await image.readRasters({
          interleave: true
        });


      // ==================================================
      // 10. LOCALISATION DE CHARTRETTES
      // ==================================================

      const xmin =
        bbox[0];

      const ymin =
        bbox[1];

      const xmax =
        bbox[2];

      const ymax =
        bbox[3];


      const colonne =
        Math.floor(
          (
            (LON - xmin) /
            (xmax - xmin)
          ) *
          width
        );


      const ligne =
        Math.floor(
          (
            (ymax - LAT) /
            (ymax - ymin)
          ) *
          height
        );


      const index =
        ligne * width + colonne;


      const valeurBrute =
        raster[index];


      // ==================================================
      // 11. RESULTAT
      // ==================================================

      return new Response(
        JSON.stringify({

          ok: true,

          point: {
            nom: "Chartrettes",
            latitude: LAT,
            longitude: LON
          },

          run:
            dernier.run,

          coverageId:
            dernier.coverageId,

          echeance_48h:
            echeance,

          geotiff: {
            largeur:
              width,

            hauteur:
              height,

            origine:
              origin,

            resolution:
              resolution,

            bbox:
              bbox
          },

          pixel: {
            ligne:
              ligne,

            colonne:
              colonne,

            index:
              index
          },

          valeur_brute:
            valeurBrute

        }, null, 2),

        {
          headers: {
            "content-type":
              "application/json;charset=UTF-8"
          }
        }
      );

    } catch (error) {

      return new Response(
        JSON.stringify({

          ok: false,

          erreur:
            error?.message ||
            String(error),

          stack:
            error?.stack ||
            null

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

  }
};

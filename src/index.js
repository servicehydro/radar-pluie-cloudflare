import { fromArrayBuffer } from "geotiff";

const BASE =
  "https://public-api.meteofrance.fr/public/arome/1.0/wcs/" +
  "MF-NWP-HIGHRES-AROME-001-FRANCE-WCS";

const POINTS = [
  { nom: "Montargis", bassin: "Loing", position: "Amont", lat: 47.9978628, lon: 2.7310072 },
  { nom: "Nemours", bassin: "Loing", position: "Médian", lat: 48.2680260, lon: 2.6953079 },
  { nom: "Château-Landon", bassin: "Loing", position: "Aval", lat: 48.1496366, lon: 2.7032718 },

  { nom: "Auxerre", bassin: "Yonne", position: "Amont", lat: 47.7961287, lon: 3.5705790 },
  { nom: "Joigny", bassin: "Yonne", position: "Médian", lat: 47.9812486, lon: 3.3995767 },
  { nom: "Pont-sur-Yonne", bassin: "Yonne", position: "Aval", lat: 48.2852895, lon: 3.2045813 },

  { nom: "Nogent-sur-Seine", bassin: "Seine", position: "Amont", lat: 48.4924390, lon: 3.4978181 },
  { nom: "Montereau", bassin: "Seine", position: "Médian", lat: 47.8564484, lon: 2.5717138 },
  { nom: "Chartrettes", bassin: "Seine", position: "Aval", lat: 48.4881157, lon: 2.7005289 }
];

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
        throw new Error(
          `GetCapabilities ${capResponse.status}: ${catalogue}`
        );
      }

      // ==================================================
      // 2. COVERAGE P2D
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
        throw new Error("Aucun coverage AROME P2D trouvé");
      }

      couvertures.sort((a, b) =>
        a.run.localeCompare(b.run)
      );

      const dernier =
        couvertures[couvertures.length - 1];

      // ==================================================
      // 3. RUN -> ISO
      // ==================================================

      const runIso =
        dernier.run.replace(
          /^(\d{4}-\d{2}-\d{2}T\d{2})\.(\d{2})\.(\d{2})Z$/,
          "$1:$2:$3Z"
        );

      // ==================================================
      // 4. ECHEANCE +48 H
      // ==================================================

      const echeance =
        new Date(
          new Date(runIso).getTime() +
          48 * 60 * 60 * 1000
        )
          .toISOString()
          .replace(".000Z", "Z");

      // ==================================================
      // 5. EMPRISE DES 9 POINTS
      // ==================================================

      const latMin =
        Math.min(...POINTS.map(p => p.lat));

      const latMax =
        Math.max(...POINTS.map(p => p.lat));

      const lonMin =
        Math.min(...POINTS.map(p => p.lon));

      const lonMax =
        Math.max(...POINTS.map(p => p.lon));

      const latMinDemande =
        Math.floor(latMin * 100) / 100;

      const latMaxDemande =
        Math.ceil(latMax * 100) / 100;

      const lonMinDemande =
        Math.floor(lonMin * 100) / 100;

      const lonMaxDemande =
        Math.ceil(lonMax * 100) / 100;

      // ==================================================
      // 6. GETCOVERAGE
      // ==================================================

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
        `lat(${latMinDemande},${latMaxDemande})`
      );

      params.append(
        "subset",
        `long(${lonMinDemande},${lonMaxDemande})`
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

      if (!coverageResponse.ok) {

        throw new Error(
          `GetCoverage ${coverageResponse.status}: ` +
          new TextDecoder().decode(buffer)
        );

      }

      // ==================================================
      // 7. LECTURE GEOTIFF
      // ==================================================

      const tiff =
        await fromArrayBuffer(buffer);

      const image =
        await tiff.getImage();

      const width =
        image.getWidth();

      const height =
        image.getHeight();

      const origin =
        image.getOrigin();

      const resolution =
        image.getResolution();

      const bbox =
        image.getBoundingBox();

      const raster =
        await image.readRasters({
          interleave: true
        });

      // ==================================================
      // 8. EXTRACTION DES 9 POINTS
      // ==================================================

      const resultats =
        POINTS.map(point => {

          const colonne =
            Math.floor(
              (point.lon - origin[0]) /
              resolution[0]
            );

          const ligne =
            Math.floor(
              (point.lat - origin[1]) /
              resolution[1]
            );

          const index =
            ligne * width + colonne;

          const valeur =
            raster[index];

          return {
            nom: point.nom,
            bassin: point.bassin,
            position: point.position,
            latitude: point.lat,
            longitude: point.lon,
            pixel: {
              ligne,
              colonne
            },
            pluie_mm:
              Number(valeur)
          };

        });

      // ==================================================
      // 9. RESULTAT
      // ==================================================

      return new Response(
        JSON.stringify({

          ok: true,

          run:
            dernier.run,

          echeance_48h:
            echeance,

          coverageId:
            dernier.coverageId,

          geotiff: {
            largeur: width,
            hauteur: height,
            origine: origin,
            resolution,
            bbox
          },

          points:
            resultats

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

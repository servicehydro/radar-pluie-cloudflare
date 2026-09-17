export default {
  async fetch(request, env) {

    const url =
      "https://public-api.meteofrance.fr/public/arome/1.0/wcs/" +
      "MF-NWP-HIGHRES-AROME-001-FRANCE-WCS/GetCapabilities" +
      "?service=WCS&version=2.0.1&language=fre";

    const response = await fetch(url, {
      headers: {
        "apikey": env.METEOFRANCE_API_KEY
      }
    });

    const texte = await response.text();

    if (!response.ok) {
      return new Response(
        `Erreur Météo-France ${response.status}\n\n${texte}`,
        { status: 500 }
      );
    }

    // On ne garde que les CoverageId de précipitations
    const matches = [
      ...texte.matchAll(
        /<wcs:CoverageId>([^<]*TOTAL_WATER_PRECIPITATION[^<]*)<\/wcs:CoverageId>/g
      )
    ].map(m => m[1]);

    return new Response(
      JSON.stringify({
        ok: true,
        nombre: matches.length,
        couvertures: matches
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  }
};

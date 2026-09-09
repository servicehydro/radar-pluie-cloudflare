export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Worker fonctionne",
        kv_present: !!env.RADAR_KV,
        api_key_present: !!env.METEOFRANCE_API_KEY
      }, null, 2),
      {
        headers: {
          "content-type": "application/json;charset=UTF-8"
        }
      }
    );
  },

  async scheduled(event, env, ctx) {
    console.log("Cron exécuté");
  }
};

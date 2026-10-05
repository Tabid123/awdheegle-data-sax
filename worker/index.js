const SUPABASE_URL = "https://xpqvfcmalgvrpoqwbqtv.supabase.co";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function authorize(request) {
  const authorization = request.headers.get("Authorization") || "";
  const apiKey = request.headers.get("apikey") || authorization.replace(/^Bearer\s+/i, "");
  if (!authorization || !apiKey) return false;

  const res = await fetch(
    SUPABASE_URL + "/rest/v1/rpc/cloudflare_somlink_proxy_authorized",
    {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  return res.ok;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/somlink-send") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      if (!(await authorize(request))) return json({ error: "unauthorized" }, 401);

      const raw = await request.text();
      const upstream = await fetch("https://api.data.somlink.net/data/send_data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

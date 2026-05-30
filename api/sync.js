import { createHash } from "crypto";

// Reads Upstash Redis REST credentials (works with either the Upstash or Vercel KV env-var names)
function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redisGet(url, token, key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  return d.result; // stored string, or null
}

async function redisSet(url, token, key, value) {
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: value,
  });
  return r.ok;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const { url, token } = redisEnv();
  if (!url || !token) return res.status(501).json({ error: "sync_not_configured" });

  try {
    const { code, action, save } = req.body || {};
    if (!code || typeof code !== "string" || code.trim().length < 4)
      return res.status(400).json({ error: "invalid_code" });

    // The raw code is never stored — only a hash of it forms the storage key.
    const key =
      "wtsave:" +
      createHash("sha256").update(code.trim().toLowerCase()).digest("hex").slice(0, 40);

    if (action === "pull") {
      const raw = await redisGet(url, token, key);
      return res.json({ ok: true, save: raw ? JSON.parse(raw) : null });
    }
    if (action === "push") {
      if (!save || typeof save !== "object") return res.status(400).json({ error: "no_save" });
      const ok = await redisSet(url, token, key, JSON.stringify(save));
      return res.json({ ok });
    }
    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    return res.status(500).json({ error: "sync_failed", detail: err.message });
  }
}

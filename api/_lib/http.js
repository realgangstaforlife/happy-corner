const DEFAULT_ALLOWED_ORIGINS = [
  "https://happycorner.top",
  "https://www.happycorner.top",
  "https://notas.happycorner.top",
  "https://happycorner.lol",
  "https://www.happycorner.lol",
  "https://happy-corner.vercel.app",
];


export function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function applyCors(req, res, { methods = ["GET", "POST", "OPTIONS"] } = {}) {
  const origin = req.headers.origin;
  const allowlist = getAllowedOrigins();

  if (origin && allowlist.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }

  return false;
}

export function json(res, status, body) {
  res.status(status).json(body);
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    const err = new Error(`Missing env var: ${name}`);
    err.code = "MISSING_ENV";
    throw err;
  }
  return v;
}

export function readJsonBody(req) {
  return req.body || {};
}

export function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}


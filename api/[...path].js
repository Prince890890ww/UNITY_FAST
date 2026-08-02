export default async function handler(req, res) {
  const path = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : req.query.path || "";

  const url = `https://mdalone-production.up.railway.app/${path}${req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""}`;

  const response = await fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
    redirect: "manual"
  });

  const body = await response.arrayBuffer();

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") {
      res.setHeader(key, value);
    }
  });

  res.status(response.status).send(Buffer.from(body));
}

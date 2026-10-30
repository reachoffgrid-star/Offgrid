// Vercel serverless function: GET /api/geo
// Returns the visitor's approximate location from the headers Vercel adds to every request,
// so the home page can show live air quality for their city without asking for permission
// and without sending their IP address to any other service.
module.exports = (req, res) => {
  const h = req.headers;
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const city = h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : null;
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({
    city,
    country: h['x-vercel-ip-country'] || null,
    lat: num(h['x-vercel-ip-latitude']),
    lon: num(h['x-vercel-ip-longitude'])
  });
};

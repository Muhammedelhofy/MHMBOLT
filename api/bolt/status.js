module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const configured = !!(process.env.BOLT_CLIENT_ID && process.env.BOLT_CLIENT_SECRET);
  res.json({ configured });
};

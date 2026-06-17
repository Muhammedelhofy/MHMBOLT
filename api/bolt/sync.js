let cachedToken = null;
let tokenExpiry = 0;

async function getBoltToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const body = new URLSearchParams({
    client_id:     process.env.BOLT_CLIENT_ID,
    client_secret: process.env.BOLT_CLIENT_SECRET,
    grant_type:    'client_credentials',
    scope:         'fleet-integration:api'
  });

  const resp = await fetch('https://oidc.bolt.eu/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  });
  if (!resp.ok) throw new Error(`Bolt token error: ${resp.status} ${await resp.text()}`);

  const data = await resp.json();
  cachedToken  = data.access_token;
  tokenExpiry  = Date.now() + (data.expires_in - 30) * 1000;
  return cachedToken;
}

async function boltAPI(method, path, payload) {
  const token = await getBoltToken();
  const opts  = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  };
  if (payload) opts.body = JSON.stringify(payload);

  const resp = await fetch(`https://node.bolt.eu/fleet-integration-gateway${path}`, opts);
  if (!resp.ok) throw new Error(`Bolt API ${path}: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.BOLT_CLIENT_ID || !process.env.BOLT_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: 'Bolt credentials not configured on server' });
  }

  const { date } = req.body || {};
  if (!date) return res.status(400).json({ ok: false, error: 'date required (yyyy-MM-dd)' });

  try {
    const d       = new Date(date + 'T00:00:00Z');
    const startTs = Math.floor(d.getTime() / 1000);
    const endTs   = startTs + 86400;

    // 1. Get company IDs
    const compResp   = await boltAPI('GET', '/fleetIntegration/v1/getCompanies');
    const companyIds = compResp.data?.company_ids ?? [];
    if (!companyIds.length) throw new Error('getCompanies returned no company IDs');

    // 2. Paginate all orders for the day
    const allOrders = [];
    for (const cid of companyIds) {
      let offset = 0;
      const limit  = 500;
      let total    = Infinity;

      while (allOrders.length < total) {
        const resp   = await boltAPI('POST', '/fleetIntegration/v1/getFleetOrders', {
          offset, limit, company_ids: [cid], start_ts: startTs, end_ts: endTs
        });
        const orders = resp.data?.orders ?? [];
        total        = Number(resp.data?.total_orders ?? 0);
        for (const o of orders) allOrders.push(o);
        if (orders.length < limit) break;
        offset += orders.length;
      }
    }

    // 3. Aggregate per driver
    const driverMap = {};
    for (const order of allOrders) {
      const uuid = order.driver_uuid;
      if (!driverMap[uuid]) {
        driverMap[uuid] = {
          name: '', driverId: uuid, phone: '',
          orders: 0, hoursOnline: 0,
          netEarnings: 0, grossEarnings: 0, tips: 0,
          commission: 0, bookingFees: 0, cashEarnings: 0,
          distanceTotal: 0, distanceAvg: 0,
          isActive: false, _cnt: 0
        };
      }
      const dr = driverMap[uuid];
      if (order.driver_name)  dr.name  = order.driver_name;
      if (order.driver_phone) dr.phone = order.driver_phone;

      const p = order.order_price;
      if (p) {
        dr.netEarnings   += Number(p.net_earnings) || 0;
        dr.grossEarnings += Number(p.ride_price)   || 0;
        dr.tips          += Number(p.tip)          || 0;
        dr.commission    += Number(p.commission)   || 0;
        dr.bookingFees   += Number(p.booking_fee)  || 0;
        if (order.payment_method === 'cash') dr.cashEarnings += Number(p.ride_price) || 0;
      }
      dr.distanceTotal += Number(order.ride_distance) || 0;
      dr.orders++;
      dr._cnt++;
    }

    // 4. Finalise + round
    const drivers = Object.values(driverMap).map(dr => {
      if (dr._cnt > 0) dr.distanceAvg = Math.round(dr.distanceTotal / dr._cnt * 100) / 100;
      dr.netEarnings   = Math.round(dr.netEarnings   * 100) / 100;
      dr.grossEarnings = Math.round(dr.grossEarnings * 100) / 100;
      dr.tips          = Math.round(dr.tips          * 100) / 100;
      dr.commission    = Math.round(dr.commission    * 100) / 100;
      dr.bookingFees   = Math.round(dr.bookingFees   * 100) / 100;
      dr.cashEarnings  = Math.round(dr.cashEarnings  * 100) / 100;
      dr.distanceTotal = Math.round(dr.distanceTotal * 100) / 100;
      dr.isActive      = dr.orders > 0 || dr.grossEarnings > 0;
      delete dr._cnt;
      return dr;
    });

    res.json({ ok: true, date, totalOrders: allOrders.length, driverCount: drivers.length, drivers });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

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
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 30) * 1000;
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

// Paginate any POST endpoint that returns a list + total_rows/total_orders
async function paginateAll(path, body, listKey, totalKey) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  let total = Infinity;
  while (all.length < total) {
    const resp  = await boltAPI('POST', path, { ...body, offset, limit });
    const items = resp.data?.[listKey] ?? [];
    total       = Number(resp.data?.[totalKey] ?? 0);
    for (const i of items) all.push(i);
    if (items.length < limit) break;
    offset += items.length;
  }
  return all;
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
    // Saudi Arabia is UTC+3 (no DST) — align with Bolt dashboard day boundaries
    const d       = new Date(date + 'T00:00:00+03:00');
    const startTs = Math.floor(d.getTime() / 1000);
    const endTs   = startTs + 86400;

    // 1. Company IDs
    const compResp   = await boltAPI('GET', '/fleetIntegration/v1/getCompanies');
    const companyIds = compResp.data?.company_ids ?? [];
    if (!companyIds.length) throw new Error('getCompanies returned no company IDs');

    // 2. Orders — use price_review filter so dates align with Bolt's Earnings report
    const allOrders = await paginateAll(
      '/fleetIntegration/v1/getFleetOrders',
      { company_ids: companyIds, start_ts: startTs, end_ts: endTs, time_range_filter_type: 'price_review' },
      'orders', 'total_orders'
    );

    // 3. State logs per company → hours online per driver
    const hoursOnlineMap = {};
    for (const cid of companyIds) {
      try {
        const logs = await paginateAll(
          '/fleetIntegration/v1/getFleetStateLogs',
          { company_id: cid, start_ts: startTs, end_ts: endTs },
          'state_logs', 'total_rows'
        );
        // Group by driver, sort by time, sum non-inactive durations
        const byDriver = {};
        for (const log of logs) {
          if (!byDriver[log.driver_uuid]) byDriver[log.driver_uuid] = [];
          byDriver[log.driver_uuid].push(log);
        }
        for (const [uuid, dLogs] of Object.entries(byDriver)) {
          dLogs.sort((a, b) => a.created - b.created);
          let secs = 0;
          let onlineAt = null;
          for (const log of dLogs) {
            if (log.state !== 'inactive') {
              if (!onlineAt) onlineAt = log.created;
            } else {
              if (onlineAt) { secs += log.created - onlineAt; onlineAt = null; }
            }
          }
          if (onlineAt) secs += endTs - onlineAt; // still online at day end
          hoursOnlineMap[uuid] = (hoursOnlineMap[uuid] || 0) + secs;
        }
      } catch (_) { /* state logs optional — don't fail the whole sync */ }
    }

    // 4. Driver profiles → rating + score
    const profileMap = {};
    for (const cid of companyIds) {
      try {
        const drivers = await paginateAll(
          '/fleetIntegration/v1/getDrivers',
          { company_id: cid, start_ts: startTs, end_ts: endTs },
          'drivers', 'total'
        );
        for (const d of drivers) profileMap[d.driver_uuid] = d;
      } catch (_) { /* profiles optional */ }
    }

    // 5. Aggregate orders per driver
    const driverMap = {};
    for (const order of allOrders) {
      const uuid = order.driver_uuid;
      if (!driverMap[uuid]) {
        driverMap[uuid] = {
          name: '', driverId: uuid, phone: '',
          orders: 0, hoursOnline: 0, rating: 0, score: 0,
          netEarnings: 0, grossEarnings: 0, tips: 0,
          commission: 0, bookingFees: 0, tollFees: 0,
          cancellationFees: 0, cashEarnings: 0,
          distanceTotal: 0, distanceAvg: 0,
          isActive: false, _cnt: 0
        };
      }
      const dr = driverMap[uuid];
      if (order.driver_name)  dr.name  = order.driver_name;
      if (order.driver_phone) dr.phone = order.driver_phone;

      const p = order.order_price;
      if (p && p.net_earnings != null) {
        const ridePrice  = Number(p.ride_price)       || 0;
        const bookingFee = Number(p.booking_fee)      || 0;
        dr.netEarnings     += Number(p.net_earnings)  || 0;
        dr.grossEarnings   += ridePrice + bookingFee;
        dr.tips            += Number(p.tip)           || 0;
        dr.commission      += Number(p.commission)    || 0;
        dr.bookingFees     += bookingFee;
        dr.tollFees        += Number(p.toll_fee)      || 0;
        dr.cancellationFees += Number(p.cancellation_fee) || 0;
        if (order.payment_method === 'cash') dr.cashEarnings += ridePrice;
        // Ride duration for utilization: accepted → finished
        if (order.order_finished_timestamp && order.order_accepted_timestamp) {
          dr._rideSeconds = (dr._rideSeconds || 0) +
            (order.order_finished_timestamp - order.order_accepted_timestamp);
        }
        dr.orders++;
      }
      dr.distanceTotal += Number(order.ride_distance) || 0;
      dr._cnt++;
    }

    // 6. Merge hours online + driver profile
    const r2 = v => Math.round((v || 0) * 100) / 100;
    const drivers = Object.values(driverMap).map(dr => {
      const secs = hoursOnlineMap[dr.driverId] || 0;
      dr.hoursOnline  = r2(secs / 3600);
      dr.utilization  = secs > 0 ? r2((dr._rideSeconds || 0) / secs * 100) : 0;
      dr.finishRate   = dr._cnt > 0 ? r2(dr.orders / dr._cnt * 100) : 0;
      delete dr._rideSeconds;

      const prof = profileMap[dr.driverId];
      if (prof) {
        dr.rating = prof.driver_rating || 0;
        dr.score  = prof.driver_score  || 0;
        if (!dr.name && prof.first_name) dr.name = `${prof.first_name} ${prof.last_name || ''}`.trim();
      }

      if (dr._cnt > 0) dr.distanceAvg = r2(dr.distanceTotal / dr._cnt);
      dr.netEarnings      = r2(dr.netEarnings);
      dr.grossEarnings    = r2(dr.grossEarnings);
      dr.tips             = r2(dr.tips);
      dr.commission       = r2(dr.commission);
      dr.bookingFees      = r2(dr.bookingFees);
      dr.tollFees         = r2(dr.tollFees);
      dr.cashEarnings     = r2(dr.cashEarnings);
      dr.cancellationFees = r2(dr.cancellationFees);
      dr.distanceTotal    = r2(dr.distanceTotal);
      dr.isActive         = dr.orders > 0 || dr.grossEarnings > 0;
      delete dr._cnt;
      return dr;
    });

    res.json({ ok: true, date, totalOrders: allOrders.length, driverCount: drivers.length, drivers });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};

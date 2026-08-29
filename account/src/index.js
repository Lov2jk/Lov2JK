import {
  cleanText,
  normalizeEmail,
  normalizeIndianMobile,
  normalizePincode,
  now,
  parseCookie,
  passwordVerify,
  randomToken,
  safeUrl,
  secureEqual,
  sha256,
} from './security.js';

const CUSTOMER_COOKIE = 'jkc_customer_session';
const OAUTH_COOKIE = 'jkc_oauth_state';
const OWNER_COOKIE = 'jkc_owner_session';
const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const OWNER_SESSION_SECONDS = 60 * 60 * 8;
const ORDER_STATUSES = ['Received', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Refunded'];
const PAYMENT_STATUSES = ['Pending confirmation', 'Awaiting payment', 'Paid', 'Failed', 'Refunded', 'Partially refunded'];

function allowedOrigins(env) {
  return new Set([env.SITE_ORIGIN, 'http://localhost:8766', 'http://127.0.0.1:8766'].filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  return allowedOrigins(env).has(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin' }
    : {};
}

function securityHeaders() {
  return {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'cross-origin-opener-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function json(request, env, data, status = 200, extra = {}) {
  return Response.json(data, {
    status,
    headers: { ...securityHeaders(), ...corsHeaders(request, env), ...extra },
  });
}

function redirect(location, cookieHeader = '') {
  const headers = new Headers({ location, ...securityHeaders() });
  if (cookieHeader) headers.append('set-cookie', cookieHeader);
  return new Response(null, { status: 302, headers });
}

function cookieDomain(request, env) {
  try {
    const requestHost = new URL(request.url).hostname;
    const siteHost = new URL(env.SITE_ORIGIN).hostname;
    return requestHost.endsWith('.jkchennai.in') && siteHost.endsWith('jkchennai.in') ? '; Domain=.jkchennai.in' : '';
  } catch {
    return '';
  }
}

function sessionCookie(request, env, name, token, maxAge, sameSite = 'Lax') {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}${cookieDomain(request, env)}`;
}

async function boundedJson(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 80_000) throw new Error('Request is too large.');
  return request.json();
}

function requireAllowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigins(env).has(origin)) throw new Error('This request did not come from the JK Chennai website.');
}

async function audit(env, request, actorType, actorId, action, targetType = '', targetId = '', details = '') {
  const ipHash = await sha256(request.headers.get('cf-connecting-ip') || 'unknown');
  await env.DB.prepare('INSERT INTO audit_log VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), actorType, actorId || null, action, targetType || null, targetId || null, cleanText(details, 1000), ipHash, now())
    .run();
}

async function customerSession(request, env) {
  const token = parseCookie(request, CUSTOMER_COOKIE);
  if (!token) return null;
  return env.DB.prepare(`SELECT s.token_hash,s.customer_id,s.csrf_hash,s.expires_at,c.email,c.name,c.avatar_url,c.phone
    FROM customer_sessions s JOIN customers c ON c.id=s.customer_id
    WHERE s.token_hash=? AND s.expires_at>?`).bind(await sha256(token), now()).first();
}

async function requireCustomer(request, env, csrf = true) {
  const current = await customerSession(request, env);
  if (!current) return { error: json(request, env, { error: 'Please sign in to continue.' }, 401) };
  if (csrf && !['GET', 'HEAD'].includes(request.method)) {
    requireAllowedOrigin(request, env);
    const supplied = request.headers.get('x-csrf-token') || '';
    if (!supplied || !(await secureEqual(await sha256(supplied), current.csrf_hash))) {
      return { error: json(request, env, { error: 'Your secure session expired. Refresh and try again.' }, 403) };
    }
  }
  return { current };
}

async function ownerSession(request, env) {
  const token = parseCookie(request, OWNER_COOKIE);
  if (!token) return null;
  return env.DB.prepare('SELECT * FROM owner_sessions WHERE token_hash=? AND expires_at>?').bind(await sha256(token), now()).first();
}

async function requireOwner(request, env, csrf = true) {
  const current = await ownerSession(request, env);
  if (!current) return { error: json(request, env, { error: 'Owner login required.' }, 401) };
  if (csrf && !['GET', 'HEAD'].includes(request.method)) {
    const supplied = request.headers.get('x-csrf-token') || '';
    if (!supplied || !(await secureEqual(await sha256(supplied), current.csrf_hash))) {
      return { error: json(request, env, { error: 'Security token expired. Refresh and try again.' }, 403) };
    }
  }
  return { current };
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET) throw new Error('Customer login is waiting for the Turnstile setup.');
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET);
  body.set('response', String(token || ''));
  body.set('remoteip', request.headers.get('cf-connecting-ip') || '');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const result = await response.json();
  if (!result.success) throw new Error('Security check failed. Refresh and try again.');
}

function pkceChallenge(verifier) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(buffer =>
    btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  );
}

async function googleStart(request, env) {
  requireAllowedOrigin(request, env);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json(request, env, { error: 'Google login has not been connected yet.' }, 503);
  const body = await boundedJson(request);
  await verifyTurnstile(request, env, body.turnstileToken);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.prepare('INSERT INTO oauth_states VALUES(?,?,?,?)').bind(await sha256(state), verifier, expires, now()).run();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return json(request, env, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, 200, {
    'set-cookie': sessionCookie(request, env, OAUTH_COOKIE, state, 600, 'Lax'),
  });
}

async function googleCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const cookieState = decodeURIComponent(parseCookie(request, OAUTH_COOKIE));
  const failure = message => redirect(`${env.SITE_ORIGIN}/account.html?login=error&message=${encodeURIComponent(message)}`, sessionCookie(request, env, OAUTH_COOKIE, '', 0));
  if (!state || !code || !cookieState || !(await secureEqual(state, cookieState))) return failure('Login request expired. Please try again.');
  const record = await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING code_verifier').bind(await sha256(state), now()).first();
  if (!record) return failure('Login request expired. Please try again.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: record.code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: env.GOOGLE_REDIRECT_URI,
    }),
  });
  if (!tokenResponse.ok) return failure('Google could not complete the login.');
  const tokens = await tokenResponse.json();
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) return failure('Google profile verification failed.');
  const profile = await profileResponse.json();
  if (!profile.email_verified) return failure('Please verify your Google email first.');
  const email = normalizeEmail(profile.email);
  const time = now();
  await env.DB.prepare(`INSERT INTO customers(id,email,name,avatar_url,phone,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), email, cleanText(profile.name, 120) || 'JK Chennai customer', safeUrl(profile.picture, { hosts: ['googleusercontent.com'] }), null, time, time).run();
  const customer = await env.DB.prepare('SELECT * FROM customers WHERE email=?').bind(email).first();
  const token = randomToken();
  const csrf = randomToken();
  const expires = new Date(Date.now() + CUSTOMER_SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare('INSERT INTO customer_sessions VALUES(?,?,?,?,?,?)').bind(await sha256(token), customer.id, await sha256(csrf), expires, time, time).run();
  await audit(env, request, 'customer', customer.id, 'login', 'customer', customer.id);
  return redirect(`${env.SITE_ORIGIN}/account.html?login=success`, sessionCookie(request, env, CUSTOMER_COOKIE, token, CUSTOMER_SESSION_SECONDS));
}

function validateAddress(data) {
  const label = cleanText(data.label || 'Home', 40) || 'Home';
  const recipientName = cleanText(data.recipientName, 120);
  const address = cleanText(data.address, 800);
  if (!recipientName || address.length < 10) throw new Error('Name and complete delivery address are required.');
  return { label, recipientName, mobile: normalizeIndianMobile(data.mobile), address, pincode: normalizePincode(data.pincode), isDefault: data.isDefault === true };
}

function validateOrder(data) {
  const reference = cleanText(data.reference, 30).toUpperCase();
  if (!/^JKC-\d{6}-[A-Z0-9]{4,12}$/.test(reference)) throw new Error('Invalid order reference.');
  const recipientName = cleanText(data.recipientName, 120);
  const deliveryAddress = cleanText(data.deliveryAddress, 800);
  if (!recipientName || deliveryAddress.length < 10) throw new Error('Complete delivery information is required.');
  const items = Array.isArray(data.items) ? data.items.slice(0, 30).map(item => ({
    productSlug: cleanText(item.productSlug, 160),
    productName: cleanText(item.productName, 200),
    sku: cleanText(item.sku, 100),
    colour: cleanText(item.colour, 80),
    size: cleanText(item.size, 80),
    quantity: Math.min(20, Math.max(1, Number(item.quantity) || 1)),
    unitPrice: Math.min(1_000_000, Math.max(0, Number(item.unitPrice) || 0)),
    imageUrl: safeUrl(item.imageUrl || ''),
  })) : [];
  if (!items.length || items.some(item => !item.productSlug || !item.productName || !item.sku)) throw new Error('At least one valid product is required.');
  return {
    reference,
    recipientName,
    mobile: normalizeIndianMobile(data.mobile),
    pincode: normalizePincode(data.pincode),
    deliveryAddress,
    paymentMethod: cleanText(data.paymentMethod, 80),
    customerNotes: cleanText(data.customerNotes, 800),
    items,
    itemsTotal: Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100,
  };
}

async function customerApi(request, env, path) {
  if (path === '/api/session' && request.method === 'GET') {
    const current = await customerSession(request, env);
    if (!current) return json(request, env, {
      authenticated: false,
      authConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TURNSTILE_SECRET),
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    });
    const csrf = randomToken();
    await env.DB.prepare('UPDATE customer_sessions SET csrf_hash=?,last_seen_at=? WHERE token_hash=?').bind(await sha256(csrf), now(), current.token_hash).run();
    return json(request, env, { authenticated: true, csrf, customer: { email: current.email, name: current.name, avatarUrl: current.avatar_url, phone: current.phone || '' } });
  }
  const auth = await requireCustomer(request, env, path !== '/api/session');
  if (auth.error) return auth.error;
  const current = auth.current;
  if (path === '/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(current.token_hash).run();
    return json(request, env, { ok: true }, 200, { 'set-cookie': sessionCookie(request, env, CUSTOMER_COOKIE, '', 0) });
  }
  if (path === '/api/profile' && request.method === 'PATCH') {
    const data = await boundedJson(request);
    const name = cleanText(data.name, 120);
    if (!name) throw new Error('Your name is required.');
    const phone = data.phone ? normalizeIndianMobile(data.phone) : '';
    await env.DB.prepare('UPDATE customers SET name=?,phone=?,updated_at=? WHERE id=?').bind(name, phone || null, now(), current.customer_id).run();
    await audit(env, request, 'customer', current.customer_id, 'profile_update', 'customer', current.customer_id);
    return json(request, env, { ok: true });
  }
  if (path === '/api/addresses' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM addresses WHERE customer_id=? ORDER BY is_default DESC,created_at DESC').bind(current.customer_id).all();
    return json(request, env, { addresses: rows.results });
  }
  if (path === '/api/addresses' && request.method === 'POST') {
    const data = validateAddress(await boundedJson(request));
    const count = await env.DB.prepare('SELECT COUNT(*) n FROM addresses WHERE customer_id=?').bind(current.customer_id).first();
    const id = crypto.randomUUID();
    const time = now();
    if (data.isDefault || Number(count.n) === 0) await env.DB.prepare('UPDATE addresses SET is_default=0 WHERE customer_id=?').bind(current.customer_id).run();
    await env.DB.prepare('INSERT INTO addresses VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, current.customer_id, data.label, data.recipientName, data.mobile, data.address, data.pincode, data.isDefault || Number(count.n) === 0 ? 1 : 0, time, time).run();
    return json(request, env, { ok: true, id }, 201);
  }
  const addressMatch = path.match(/^\/api\/addresses\/([^/]+)$/);
  if (addressMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM addresses WHERE id=? AND customer_id=?').bind(addressMatch[1], current.customer_id).run();
    return json(request, env, { ok: true });
  }
  if (path === '/api/saved' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT product_slug FROM saved_items WHERE customer_id=? ORDER BY created_at DESC').bind(current.customer_id).all();
    return json(request, env, { slugs: rows.results.map(row => row.product_slug) });
  }
  const savedMatch = path.match(/^\/api\/saved\/([^/]+)$/);
  if (savedMatch && request.method === 'PUT') {
    const slug = cleanText(decodeURIComponent(savedMatch[1]), 160);
    await env.DB.prepare('INSERT INTO saved_items VALUES(?,?,?) ON CONFLICT(customer_id,product_slug) DO NOTHING').bind(current.customer_id, slug, now()).run();
    return json(request, env, { ok: true });
  }
  if (savedMatch && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM saved_items WHERE customer_id=? AND product_slug=?').bind(current.customer_id, cleanText(decodeURIComponent(savedMatch[1]), 160)).run();
    return json(request, env, { ok: true });
  }
  if (path === '/api/orders' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT o.*,(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count
      FROM orders o WHERE o.customer_id=? ORDER BY o.created_at DESC LIMIT 100`).bind(current.customer_id).all();
    return json(request, env, { orders: rows.results });
  }
  if (path === '/api/orders' && request.method === 'POST') {
    const order = validateOrder(await boundedJson(request));
    const existing = await env.DB.prepare('SELECT id,customer_id FROM orders WHERE reference=?').bind(order.reference).first();
    if (existing) {
      if (existing.customer_id === current.customer_id) return json(request, env, { ok: true, reference: order.reference, existing: true });
      return json(request, env, { error: 'Please refresh the cart to create a new order reference.' }, 409);
    }
    const id = crypto.randomUUID();
    const time = now();
    const statements = [env.DB.prepare(`INSERT INTO orders(id,reference,customer_id,status,payment_status,payment_method,items_total,shipping_total,currency,recipient_name,mobile,pincode,delivery_address,customer_notes,source,created_at,updated_at)
      VALUES(?,?,?,'Received','Pending confirmation',?,?,0,'INR',?,?,?,?,?,'website_whatsapp',?,?)`)
      .bind(id, order.reference, current.customer_id, order.paymentMethod || null, order.itemsTotal, order.recipientName, order.mobile, order.pincode, order.deliveryAddress, order.customerNotes || null, time, time)];
    for (const item of order.items) statements.push(env.DB.prepare('INSERT INTO order_items VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, item.productSlug, item.productName, item.sku, item.colour || null, item.size || null, item.quantity, item.unitPrice, item.imageUrl || null));
    await env.DB.batch(statements);
    await audit(env, request, 'customer', current.customer_id, 'order_create', 'order', id, order.reference);
    return json(request, env, { ok: true, reference: order.reference }, 201);
  }
  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && request.method === 'GET') {
    const order = await env.DB.prepare('SELECT * FROM orders WHERE reference=? AND customer_id=?').bind(decodeURIComponent(orderMatch[1]).toUpperCase(), current.customer_id).first();
    if (!order) return json(request, env, { error: 'Order not found.' }, 404);
    const items = await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(order.id).all();
    return json(request, env, { order, items: items.results });
  }
  if (path === '/api/account' && request.method === 'DELETE') {
    await audit(env, request, 'customer', current.customer_id, 'account_delete', 'customer', current.customer_id);
    await env.DB.prepare('DELETE FROM customers WHERE id=?').bind(current.customer_id).run();
    return json(request, env, { ok: true }, 200, { 'set-cookie': sessionCookie(request, env, CUSTOMER_COOKIE, '', 0) });
  }
  return json(request, env, { error: 'Not found.' }, 404);
}

async function ownerApi(request, env, path) {
  if (path === '/owner/api/login' && request.method === 'POST') {
    const data = await boundedJson(request);
    const username = cleanText(data.username, 80).toLowerCase();
    const attemptKey = await sha256(`${request.headers.get('cf-connecting-ip') || 'unknown'}:${username}`);
    const attempt = await env.DB.prepare('SELECT * FROM owner_login_attempts WHERE key=?').bind(attemptKey).first();
    if (attempt?.blocked_until && attempt.blocked_until > now()) return json(request, env, { error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    const user = username ? await env.CRM_DB.prepare("SELECT * FROM users WHERE username=? AND role='admin' AND enabled=1").bind(username).first() : null;
    if (!user || !(await passwordVerify(String(data.password || ''), user))) {
      const recent = attempt && Date.now() - new Date(attempt.window_started).getTime() < 15 * 60_000;
      const count = recent ? Number(attempt.count) + 1 : 1;
      const windowStarted = recent ? attempt.window_started : now();
      const blockedUntil = count >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      await env.DB.prepare(`INSERT INTO owner_login_attempts VALUES(?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET count=excluded.count,window_started=excluded.window_started,blocked_until=excluded.blocked_until`)
        .bind(attemptKey, count, windowStarted, blockedUntil).run();
      await audit(env, request, 'owner', '', 'owner_login_failed');
      return json(request, env, { error: 'Incorrect owner access key.' }, 401);
    }
    await env.DB.prepare('DELETE FROM owner_login_attempts WHERE key=?').bind(attemptKey).run();
    const token = randomToken();
    const csrf = randomToken();
    const time = now();
    await env.DB.prepare('INSERT INTO owner_sessions VALUES(?,?,?,?)').bind(await sha256(token), await sha256(csrf), new Date(Date.now() + OWNER_SESSION_SECONDS * 1000).toISOString(), time).run();
    await audit(env, request, 'owner', user.id, 'owner_login');
    return json(request, env, { ok: true, csrf, name: user.name }, 200, { 'set-cookie': sessionCookie(request, env, OWNER_COOKIE, token, OWNER_SESSION_SECONDS, 'Strict') });
  }
  const auth = await requireOwner(request, env, path !== '/owner/api/session');
  if (auth.error) return auth.error;
  if (path === '/owner/api/session' && request.method === 'GET') {
    const csrf = randomToken();
    await env.DB.prepare('UPDATE owner_sessions SET csrf_hash=? WHERE token_hash=?').bind(await sha256(csrf), auth.current.token_hash).run();
    return json(request, env, { ok: true, csrf });
  }
  if (path === '/owner/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM owner_sessions WHERE token_hash=?').bind(auth.current.token_hash).run();
    return json(request, env, { ok: true }, 200, { 'set-cookie': sessionCookie(request, env, OWNER_COOKIE, '', 0) });
  }
  if (path === '/owner/api/orders' && request.method === 'GET') {
    const url = new URL(request.url);
    const search = `%${cleanText(url.searchParams.get('q'), 80)}%`;
    const rows = await env.DB.prepare(`SELECT o.*,c.email customer_email FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
      WHERE o.reference LIKE ? OR o.recipient_name LIKE ? OR o.mobile LIKE ? ORDER BY o.created_at DESC LIMIT 200`).bind(search, search, search).all();
    return json(request, env, { orders: rows.results });
  }
  const match = path.match(/^\/owner\/api\/orders\/([^/]+)$/);
  if (match && request.method === 'PATCH') {
    const data = await boundedJson(request);
    const status = cleanText(data.status, 40);
    const paymentStatus = cleanText(data.paymentStatus, 40);
    if (!ORDER_STATUSES.includes(status) || !PAYMENT_STATUSES.includes(paymentStatus)) throw new Error('Choose a valid order and payment status.');
    const trackingUrl = safeUrl(data.trackingUrl || '');
    const paymentReference = cleanText(data.paymentReference, 120);
    const ownerNotes = cleanText(data.ownerNotes, 1000);
    await env.DB.prepare('UPDATE orders SET status=?,payment_status=?,payment_reference=?,tracking_url=?,owner_notes=?,updated_at=? WHERE reference=?')
      .bind(status, paymentStatus, paymentReference || null, trackingUrl || null, ownerNotes || null, now(), decodeURIComponent(match[1]).toUpperCase()).run();
    await audit(env, request, 'owner', 'owner', 'order_update', 'order', match[1], `${status}; ${paymentStatus}`);
    return json(request, env, { ok: true });
  }
  return json(request, env, { error: 'Not found.' }, 404);
}

const ownerCss = `<style>:root{--orange:#f4511e;--blue:#063b6f;--ink:#13202a;--cream:#fff8ef;--line:#eadfd3}*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px system-ui}.wrap{width:min(1200px,94%);margin:auto;padding:24px}.brand{font-size:28px;font-weight:900}.brand span{color:var(--orange)}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin:20px 0;box-shadow:0 10px 30px #1727360c}input,select,textarea{width:100%;padding:11px;border:1px solid #ccc;border-radius:10px;font:inherit}label{display:grid;gap:6px;font-weight:700}button{border:0;border-radius:999px;padding:11px 16px;background:var(--orange);color:#fff;font-weight:800;cursor:pointer}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toolbar input{flex:1;min-width:220px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:1250px}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left;vertical-align:top;font-size:14px}.edit{display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:8px}.message{min-height:1.5em}.error{color:#b42318}.ok{color:#267345}@media(max-width:650px){.wrap{padding:12px}.edit{grid-template-columns:1fr}}</style>`;

function ownerPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JK Chennai Orders</title>${ownerCss}</head><body><main class="wrap"><header class="toolbar"><div class="brand">JK <span>Chennai</span></div><b>Cloud orders</b><button id="logout" hidden>Logout</button></header><section id="loginCard" class="card" style="max-width:480px"><h1>Owner login</h1><p>Use the same private owner login as your JK Chennai customer-contact admin.</p><form id="login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><p><button>Open orders</button></p><p id="loginMessage" class="message error"></p></form></section><section id="ordersCard" class="card" hidden><div class="toolbar"><h1>Customer orders</h1><input id="search" placeholder="Search reference, name or mobile"><button id="find">Search</button></div><p id="message" class="message"></p><div class="scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Update status</th><th>Tracking & notes</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></section></main><script>
let csrf='';const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};async function call(path,opt={}){opt.credentials='include';opt.headers={...(opt.headers||{}),'content-type':'application/json','x-csrf-token':csrf};const r=await fetch(path,opt),d=await r.json().catch(()=>({error:'Request failed'}));if(!r.ok)throw new Error(d.error||'Request failed');return d}async function start(){try{const s=await call('/owner/api/session');csrf=s.csrf;showOrders();await load()}catch{}}function showOrders(){loginCard.hidden=true;ordersCard.hidden=false;logout.hidden=false}async function load(){const d=await call('/owner/api/orders?q='+encodeURIComponent(search.value));rows.innerHTML=d.orders.map(o=>'<tr><td><b>'+esc(o.reference)+'</b><br><small>'+new Date(o.created_at).toLocaleString('en-IN')+'</small></td><td>'+esc(o.recipient_name)+'<br>'+esc(o.mobile)+'<br><small>'+esc(o.customer_email)+'</small></td><td>₹'+Number(o.items_total+o.shipping_total).toLocaleString('en-IN')+'</td><td><div class="edit"><select data-status>'+${JSON.stringify(ORDER_STATUSES)}.map(x=>'<option '+(x===o.status?'selected':'')+'>'+x+'</option>').join('')+'</select><select data-payment>'+${JSON.stringify(PAYMENT_STATUSES)}.map(x=>'<option '+(x===o.payment_status?'selected':'')+'>'+x+'</option>').join('')+'</select></div></td><td><input data-tracking value="'+esc(o.tracking_url)+'" placeholder="Courier tracking URL"><textarea data-notes rows="2" placeholder="Private owner notes">'+esc(o.owner_notes)+'</textarea></td><td><button data-save="'+esc(o.reference)+'">Save</button></td></tr>').join('')||'<tr><td colspan="6">No cloud orders yet.</td></tr>'}login.onsubmit=async e=>{e.preventDefault();try{const d=await call('/owner/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(login)))});csrf=d.csrf;showOrders();await load()}catch(x){loginMessage.textContent=x.message}};find.onclick=load;rows.onclick=async e=>{if(!e.target.dataset.save)return;const tr=e.target.closest('tr');try{await call('/owner/api/orders/'+encodeURIComponent(e.target.dataset.save),{method:'PATCH',body:JSON.stringify({status:tr.querySelector('[data-status]').value,paymentStatus:tr.querySelector('[data-payment]').value,trackingUrl:tr.querySelector('[data-tracking]').value,ownerNotes:tr.querySelector('[data-notes]').value})});message.className='message ok';message.textContent='Order updated.'}catch(x){message.className='message error';message.textContent=x.message}};logout.onclick=async()=>{await call('/owner/api/logout',{method:'POST'});location.reload()};start();
  </script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'OPTIONS') {
        const origin = request.headers.get('origin') || '';
        if (!allowedOrigins(env).has(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), 'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-max-age': '86400' } });
      }
      if (path === '/health') return json(request, env, { ok: true, service: 'jk-chennai-accounts' });
      if (path === '/auth/google/start' && request.method === 'POST') return googleStart(request, env);
      if (path === '/auth/google/callback' && request.method === 'GET') return googleCallback(request, env);
      if (path.startsWith('/api/')) return customerApi(request, env, path);
      if (path.startsWith('/owner/api/')) return ownerApi(request, env, path);
      if (path === '/owner' || path === '/owner/orders') return new Response(ownerPage(), { headers: { 'content-type': 'text/html;charset=utf-8', ...securityHeaders() } });
      return redirect(`${env.SITE_ORIGIN}/account.html`);
    } catch (error) {
      console.error(JSON.stringify({ message: 'request_failed', path, method: request.method, error: error instanceof Error ? error.message : String(error) }));
      const message = error instanceof Error ? error.message : 'Request failed.';
      const status = /required|invalid|valid|complete|allowed|secure|check failed/i.test(message) ? 400 : 500;
      return json(request, env, { error: message }, status);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').bind(now()),
      env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at<=?').bind(now()),
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(now()),
    ]));
  },
};

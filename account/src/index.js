import {
  cleanText,
  normalizeEmail,
  normalizeIndianMobile,
  normalizePincode,
  now,
  parseCookie,
  passwordHash,
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
const REVIEW_STATUSES = ['Pending', 'Approved', 'Rejected'];
const REVIEW_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function allowedOrigins(env) {
  let accountOrigin = '';
  try { accountOrigin = new URL(env.GOOGLE_REDIRECT_URI).origin; } catch {}
  return new Set([env.SITE_ORIGIN, accountOrigin, 'http://localhost:8766', 'http://127.0.0.1:8766', 'http://127.0.0.1:8787'].filter(Boolean));
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

async function boundedReviewForm(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 650_000) throw new Error('Review photo could not be compressed enough. Please choose another photo.');
  const form = await request.formData();
  const photo = form.get('photo');
  if (photo instanceof File && photo.size > 500_000) throw new Error('Review photo could not be compressed enough. Please choose another photo.');
  return { form, photo: photo instanceof File && photo.size ? photo : null };
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
    requireAllowedOrigin(request, env);
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

function validateReview(form) {
  const orderItemId = cleanText(form.get('orderItemId'), 80);
  const displayName = cleanText(form.get('displayName'), 60);
  const rating = Number(form.get('rating'));
  const reviewText = cleanText(form.get('reviewText'), 800);
  if (!orderItemId || !displayName || !Number.isInteger(rating) || rating < 1 || rating > 5 || reviewText.length < 10) {
    throw new Error('Choose a product, rating, display name and write at least 10 characters.');
  }
  return { orderItemId, displayName, rating, reviewText };
}

async function orderEventsForCustomer(env, customerId) {
  const rows = await env.DB.prepare(`SELECT e.order_id,e.status,e.message,e.created_at
    FROM order_events e JOIN orders o ON o.id=e.order_id
    WHERE o.customer_id=? ORDER BY e.created_at ASC`).bind(customerId).all();
  return rows.results;
}

function reviewPhotoUrl(request, photoKey) {
  return photoKey ? `${new URL(request.url).origin}/review-media/${encodeURIComponent(photoKey).replace(/%2F/g, '/')}` : '';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function ownerOrderFilters(request) {
  const url = new URL(request.url);
  return {
    q: cleanText(url.searchParams.get('q'), 80),
    status: cleanText(url.searchParams.get('status'), 40),
    from: cleanText(url.searchParams.get('from'), 10),
    to: cleanText(url.searchParams.get('to'), 10),
  };
}

async function findOwnerOrders(request, env) {
  const filters = ownerOrderFilters(request);
  if (filters.status && !ORDER_STATUSES.includes(filters.status)) throw new Error('Choose a valid order status.');
  const search = `%${filters.q}%`;
  const rows = await env.DB.prepare(`SELECT o.*,c.email customer_email,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
    WHERE (o.reference LIKE ? OR o.recipient_name LIKE ? OR o.mobile LIKE ? OR COALESCE(c.email,'') LIKE ?)
      AND (?='' OR o.status=?) AND (?='' OR date(o.created_at)>=date(?)) AND (?='' OR date(o.created_at)<=date(?))
    ORDER BY o.created_at DESC LIMIT 500`)
    .bind(search, search, search, search, filters.status, filters.status, filters.from, filters.from, filters.to, filters.to).all();
  return rows.results;
}

async function customerApi(request, env, path) {
  if (path === '/api/public/reviews' && request.method === 'GET') {
    const slug = cleanText(new URL(request.url).searchParams.get('product'), 160);
    if (!slug) return json(request, env, { reviews: [] }, 200, { 'cache-control': 'public, max-age=60, s-maxage=300' });
    const rows = await env.DB.prepare(`SELECT id,product_slug,display_name,rating,review_text,photo_key,approved_at
      FROM customer_reviews WHERE product_slug=? AND status='Approved' ORDER BY approved_at DESC LIMIT 100`).bind(slug).all();
    return json(request, env, { reviews: rows.results.map(row => ({
      id: row.id,
      productSlug: row.product_slug,
      name: row.display_name,
      rating: row.rating,
      text: row.review_text,
      photo: reviewPhotoUrl(request, row.photo_key),
      date: row.approved_at,
      verified: true,
    })) }, 200, { 'cache-control': 'public, max-age=60, s-maxage=300' });
  }
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
    const events = await orderEventsForCustomer(env, current.customer_id);
    return json(request, env, { orders: rows.results.map(order => ({ ...order, events: events.filter(event => event.order_id === order.id) })) });
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
    statements.push(env.DB.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), id, 'Received', 'Order received from website checkout', time));
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
    const events = await env.DB.prepare('SELECT status,message,created_at FROM order_events WHERE order_id=? ORDER BY created_at ASC').bind(order.id).all();
    return json(request, env, { order, items: items.results, events: events.results });
  }
  if (path === '/api/reviews/eligible' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT oi.id order_item_id,oi.product_slug,oi.product_name,oi.sku,oi.image_url,o.reference,o.created_at,
      r.id review_id,r.display_name,r.rating,r.review_text,r.photo_key,r.status review_status,r.owner_note
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
      LEFT JOIN customer_reviews r ON r.order_item_id=oi.id
      WHERE o.customer_id=? AND o.status='Delivered' ORDER BY o.updated_at DESC`).bind(current.customer_id).all();
    return json(request, env, { items: rows.results.map(row => ({ ...row, photo_url: reviewPhotoUrl(request, row.photo_key) })) });
  }
  if (path === '/api/reviews' && request.method === 'POST') {
    const { form, photo } = await boundedReviewForm(request);
    const review = validateReview(form);
    const eligible = await env.DB.prepare(`SELECT oi.id,oi.product_slug,r.photo_key
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
      LEFT JOIN customer_reviews r ON r.order_item_id=oi.id
      WHERE oi.id=? AND o.customer_id=? AND o.status='Delivered'`).bind(review.orderItemId, current.customer_id).first();
    if (!eligible) return json(request, env, { error: 'Reviews are available after this order is delivered.' }, 403);
    let photoKey = eligible.photo_key || null;
    if (photo) {
      const extension = REVIEW_IMAGE_TYPES.get(photo.type);
      if (!extension) throw new Error('Use a JPG, PNG, WebP or GIF review photo.');
      const newKey = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO review_media VALUES(?,?,?,?,?)').bind(newKey, photo.type, await photo.arrayBuffer(), photo.size, now()).run();
      if (photoKey) await env.DB.prepare('DELETE FROM review_media WHERE id=?').bind(photoKey).run();
      photoKey = newKey;
    }
    const time = now();
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO customer_reviews(id,order_item_id,customer_id,product_slug,display_name,rating,review_text,photo_key,status,owner_note,created_at,updated_at,approved_at)
      VALUES(?,?,?,?,?,?,?,?,'Pending',NULL,?,?,NULL)
      ON CONFLICT(order_item_id) DO UPDATE SET display_name=excluded.display_name,rating=excluded.rating,review_text=excluded.review_text,
      photo_key=excluded.photo_key,status='Pending',owner_note=NULL,updated_at=excluded.updated_at,approved_at=NULL`)
      .bind(id, review.orderItemId, current.customer_id, eligible.product_slug, review.displayName, review.rating, review.reviewText, photoKey, time, time).run();
    await audit(env, request, 'customer', current.customer_id, 'review_submit', 'order_item', review.orderItemId, eligible.product_slug);
    return json(request, env, { ok: true, status: 'Pending' }, 201);
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
    requireAllowedOrigin(request, env);
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
    await env.DB.prepare('INSERT INTO owner_sessions(token_hash,csrf_hash,expires_at,created_at,owner_username) VALUES(?,?,?,?,?)').bind(await sha256(token), await sha256(csrf), new Date(Date.now() + OWNER_SESSION_SECONDS * 1000).toISOString(), time, user.username).run();
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
  if (path === '/owner/api/password' && request.method === 'POST') {
    const data = await boundedJson(request);
    const password = String(data.password || '');
    if (password.length < 12 || password.length > 200) throw new Error('Password must contain at least 12 characters.');
    if (!auth.current.owner_username) return json(request, env, { error: 'Please sign out and sign in again before changing the password.' }, 409);
    const hashed = await passwordHash(password);
    const result = await env.CRM_DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,updated_at=? WHERE username=? AND role='admin' AND enabled=1")
      .bind(hashed.hash, hashed.salt, hashed.iterations, now(), auth.current.owner_username).run();
    if (!result.meta.changes) return json(request, env, { error: 'Owner account not found.' }, 404);
    await audit(env, request, 'owner', auth.current.owner_username, 'owner_password_change', 'owner', auth.current.owner_username);
    await env.DB.prepare('DELETE FROM owner_sessions WHERE token_hash<>?').bind(auth.current.token_hash).run();
    return json(request, env, { ok: true });
  }
  if (path === '/owner/api/orders' && request.method === 'GET') {
    return json(request, env, { orders: await findOwnerOrders(request, env) });
  }
  if (path === '/owner/api/orders.csv' && request.method === 'GET') {
    const rows = await findOwnerOrders(request, env);
    const headers = ['Reference','Date','Customer','Mobile','Email','Items','Items total','Shipping','Status','Payment status','Payment method','Payment reference','Tracking URL','PIN code','Address','Customer notes','Owner notes'];
    const lines = [headers, ...rows.map(order => [order.reference,order.created_at,order.recipient_name,order.mobile,order.customer_email,order.item_count,order.items_total,order.shipping_total,order.status,order.payment_status,order.payment_method,order.payment_reference,order.tracking_url,order.pincode,order.delivery_address,order.customer_notes,order.owner_notes])];
    return new Response('\ufeff' + lines.map(line => line.map(csvCell).join(',')).join('\r\n'), {
      headers: { ...securityHeaders(), 'content-type': 'text/csv;charset=utf-8', 'content-disposition': `attachment; filename="jk-chennai-orders-${new Date().toISOString().slice(0,10)}.csv"` },
    });
  }
  const match = path.match(/^\/owner\/api\/orders\/([^/]+)$/);
  if (match && request.method === 'GET') {
    const reference = decodeURIComponent(match[1]).toUpperCase();
    const order = await env.DB.prepare(`SELECT o.*,c.email customer_email FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.reference=?`).bind(reference).first();
    if (!order) return json(request, env, { error: 'Order not found.' }, 404);
    const [items, events] = await Promise.all([
      env.DB.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid').bind(order.id).all(),
      env.DB.prepare('SELECT status,message,created_at FROM order_events WHERE order_id=? ORDER BY created_at ASC').bind(order.id).all(),
    ]);
    return json(request, env, { order, items: items.results, events: events.results });
  }
  if (match && request.method === 'PATCH') {
    const data = await boundedJson(request);
    const status = cleanText(data.status, 40);
    const paymentStatus = cleanText(data.paymentStatus, 40);
    if (!ORDER_STATUSES.includes(status) || !PAYMENT_STATUSES.includes(paymentStatus)) throw new Error('Choose a valid order and payment status.');
    const trackingUrl = safeUrl(data.trackingUrl || '');
    const paymentReference = cleanText(data.paymentReference, 120);
    const ownerNotes = cleanText(data.ownerNotes, 1000);
    const reference = decodeURIComponent(match[1]).toUpperCase();
    const existing = await env.DB.prepare('SELECT id,status FROM orders WHERE reference=?').bind(reference).first();
    if (!existing) return json(request, env, { error: 'Order not found.' }, 404);
    const time = now();
    const statements = [env.DB.prepare('UPDATE orders SET status=?,payment_status=?,payment_reference=?,tracking_url=?,owner_notes=?,updated_at=? WHERE reference=?')
      .bind(status, paymentStatus, paymentReference || null, trackingUrl || null, ownerNotes || null, time, reference)];
    if (existing.status !== status) statements.push(env.DB.prepare('INSERT INTO order_events VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), existing.id, status, cleanText(data.statusMessage, 240) || `Order marked ${status}`, time));
    await env.DB.batch(statements);
    await audit(env, request, 'owner', 'owner', 'order_update', 'order', match[1], `${status}; ${paymentStatus}`);
    return json(request, env, { ok: true });
  }
  if (path === '/owner/api/reviews' && request.method === 'GET') {
    const status = cleanText(new URL(request.url).searchParams.get('status') || 'Pending', 20);
    if (status !== 'All' && !REVIEW_STATUSES.includes(status)) throw new Error('Choose a valid review status.');
    const rows = await env.DB.prepare(`SELECT r.*,oi.product_name,oi.sku,o.reference,c.email
      FROM customer_reviews r JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=oi.order_id JOIN customers c ON c.id=r.customer_id
      WHERE (?='All' OR r.status=?) ORDER BY r.created_at DESC LIMIT 300`).bind(status, status).all();
    return json(request, env, { reviews: rows.results.map(row => ({ ...row, photo_url: reviewPhotoUrl(request, row.photo_key) })) });
  }
  const reviewMatch = path.match(/^\/owner\/api\/reviews\/([^/]+)$/);
  if (reviewMatch && request.method === 'PATCH') {
    const data = await boundedJson(request);
    const status = cleanText(data.status, 20);
    if (!['Approved', 'Rejected'].includes(status)) throw new Error('Choose Approve or Reject.');
    const ownerNote = cleanText(data.ownerNote, 500);
    const result = await env.DB.prepare('UPDATE customer_reviews SET status=?,owner_note=?,approved_at=?,updated_at=? WHERE id=?')
      .bind(status, ownerNote || null, status === 'Approved' ? now() : null, now(), reviewMatch[1]).run();
    if (!result.meta.changes) return json(request, env, { error: 'Review not found.' }, 404);
    await audit(env, request, 'owner', 'owner', `review_${status.toLowerCase()}`, 'review', reviewMatch[1], ownerNote);
    return json(request, env, { ok: true });
  }
  return json(request, env, { error: 'Not found.' }, 404);
}

const ownerCss = `<style>:root{--orange:#f4511e;--blue:#063b6f;--ink:#13202a;--cream:#fff8ef;--line:#eadfd3;--green:#267345}*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px system-ui}.wrap{width:min(1400px,96%);margin:auto;padding:24px}.brand{font-size:28px;font-weight:900}.brand span{color:var(--orange)}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin:18px 0;box-shadow:0 10px 30px #1727360c}input,select,textarea{width:100%;padding:10px;border:1px solid #cfc6bd;border-radius:10px;font:inherit}label{display:grid;gap:5px;font-weight:700}button,.button{border:0;border-radius:999px;padding:10px 15px;background:var(--orange);color:#fff;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.secondary{background:white;color:var(--ink);border:1px solid var(--line)}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toolbar h1{margin-right:auto}.filters{display:grid;grid-template-columns:2fr repeat(3,1fr) auto auto;gap:10px;align-items:end}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0}.stat{background:#f8f4ef;border-radius:14px;padding:12px}.stat b{display:block;font-size:24px}.tabs{display:flex;gap:8px;margin:18px 0}.tabs button.active{background:var(--blue)}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;min-width:1300px}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left;vertical-align:top;font-size:13px}.edit{display:grid;grid-template-columns:1fr 1fr;gap:7px}.edit textarea,.edit [data-status-message]{grid-column:1/-1}.message{min-height:1.5em}.error{color:#b42318}.ok{color:var(--green)}.review-photo{width:90px;height:90px;object-fit:cover;border-radius:12px}.modal{position:fixed;inset:0;background:#071a26aa;display:grid;place-items:center;padding:20px;z-index:10}.modal[hidden]{display:none}.modal-box{background:white;width:min(800px,100%);max-height:90vh;overflow:auto;border-radius:18px;padding:24px}.packing{padding:10px}.packing-head{display:flex;justify-content:space-between;border-bottom:2px solid var(--ink);padding-bottom:15px}.packing table{min-width:0}.muted{color:#63717a}@media(max-width:850px){.wrap{padding:12px}.filters,.stats{grid-template-columns:1fr 1fr}.filters>*:first-child{grid-column:1/-1}.edit{grid-template-columns:1fr}}@media print{body>*:not(.modal){display:none!important}.modal{position:static;background:white;padding:0}.modal-box{max-height:none;width:100%;box-shadow:none}.modal .toolbar{display:none}.packing{display:block}}</style>`;

function ownerPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JK Chennai Owner Dashboard</title>${ownerCss}</head><body><main class="wrap"><header class="toolbar"><div class="brand">JK <span>Chennai</span></div><b>Owner dashboard</b><button id="logout" class="secondary" hidden>Logout</button></header><section id="loginCard" class="card" style="max-width:480px"><h1>Owner login</h1><p>Use the same private owner login as your JK Chennai customer-contact admin.</p><form id="login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><p><button>Open dashboard</button></p><p id="loginMessage" class="message error"></p></form></section><section id="dashboard" hidden><nav class="tabs"><button class="active" data-tab="orders">Orders</button><button data-tab="reviews">Reviews awaiting approval</button></nav><section id="ordersCard" class="card"><div class="toolbar"><h1>Customer orders</h1></div><div class="filters"><label>Search<input id="search" placeholder="Reference, name, mobile or email"></label><label>Status<select id="status"><option value="">All statuses</option>${ORDER_STATUSES.map(value => `<option>${value}</option>`).join('')}</select></label><label>From<input id="from" type="date"></label><label>To<input id="to" type="date"></label><button id="find">Apply</button><button id="export" class="secondary">Export CSV</button></div><div id="stats" class="stats"></div><p id="message" class="message"></p><div class="scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status & payment</th><th>Tracking, references & notes</th><th>Actions</th></tr></thead><tbody id="rows"></tbody></table></div></section><section id="reviewsCard" class="card" hidden><div class="toolbar"><h1>Verified customer reviews</h1><label>Status<select id="reviewStatus"><option>Pending</option><option>Approved</option><option>Rejected</option><option>All</option></select></label><button id="loadReviews">Apply</button></div><p class="muted">Only customers with a delivered website order can submit here. Approve a review before it appears on the product page.</p><p id="reviewMessage" class="message"></p><div class="scroll"><table><thead><tr><th>Product</th><th>Customer</th><th>Review</th><th>Photo</th><th>Decision</th></tr></thead><tbody id="reviewRows"></tbody></table></div></section></section></main><div id="modal" class="modal" hidden><div class="modal-box"><div class="toolbar"><button id="printPacking">Print packing slip</button><button id="closeModal" class="secondary">Close</button></div><div id="packing" class="packing"></div></div></div><script>
let csrf='';const statuses=${JSON.stringify(ORDER_STATUSES)},payments=${JSON.stringify(PAYMENT_STATUSES)},byId=id=>document.getElementById(id);const esc=v=>{const d=document.createElement('div');d.textContent=v??'';return d.innerHTML};async function call(path,opt={}){opt.credentials='include';opt.headers={...(opt.headers||{}),'content-type':'application/json','x-csrf-token':csrf};const r=await fetch(path,opt),d=await r.json().catch(()=>({error:'Request failed'}));if(!r.ok)throw new Error(d.error||'Request failed');return d}function query(){return new URLSearchParams({q:byId('search').value,status:byId('status').value,from:byId('from').value,to:byId('to').value}).toString()}async function start(){try{const s=await call('/owner/api/session');csrf=s.csrf;showDashboard();await load()}catch{}}function showDashboard(){byId('loginCard').hidden=true;byId('dashboard').hidden=false;byId('logout').hidden=false}function orderStats(list){const count=name=>list.filter(o=>o.status===name).length;byId('stats').innerHTML=['All:'+list.length,'Received:'+count('Received'),'Packed:'+count('Packed'),'Shipped:'+count('Shipped'),'Delivered:'+count('Delivered')].map(x=>{const [a,b]=x.split(':');return '<div class="stat"><b>'+b+'</b><span>'+a+'</span></div>'}).join('')}async function load(){const d=await call('/owner/api/orders?'+query());orderStats(d.orders);byId('rows').innerHTML=d.orders.map(o=>'<tr><td><b>'+esc(o.reference)+'</b><br><small>'+new Date(o.created_at).toLocaleString('en-IN')+' · '+o.item_count+' item(s)</small></td><td>'+esc(o.recipient_name)+'<br>'+esc(o.mobile)+'<br><small>'+esc(o.customer_email)+'</small></td><td><b>₹'+Number(o.items_total+o.shipping_total).toLocaleString('en-IN')+'</b></td><td><div class="edit"><select data-status>'+statuses.map(x=>'<option '+(x===o.status?'selected':'')+'>'+x+'</option>').join('')+'</select><select data-payment>'+payments.map(x=>'<option '+(x===o.payment_status?'selected':'')+'>'+x+'</option>').join('')+'</select><input data-status-message placeholder="Customer-visible status note"></div></td><td><div class="edit"><input data-payment-ref value="'+esc(o.payment_reference)+'" placeholder="Payment reference"><input data-tracking value="'+esc(o.tracking_url)+'" placeholder="Courier tracking URL"><textarea data-notes rows="2" placeholder="Private owner notes">'+esc(o.owner_notes)+'</textarea></div></td><td><button data-save="'+esc(o.reference)+'">Save</button> <button class="secondary" data-pack="'+esc(o.reference)+'">View / print</button></td></tr>').join('')||'<tr><td colspan="6">No orders match these filters.</td></tr>'}async function packingSlip(ref){const d=await call('/owner/api/orders/'+encodeURIComponent(ref));const o=d.order;byId('packing').innerHTML='<div class="packing-head"><div><h2>JK CHENNAI</h2><p>Order packing slip</p></div><div><b>'+esc(o.reference)+'</b><br>'+new Date(o.created_at).toLocaleDateString('en-IN')+'</div></div><h3>Deliver to</h3><p><b>'+esc(o.recipient_name)+'</b><br>'+esc(o.delivery_address)+'<br>PIN: '+esc(o.pincode)+' · Mobile: '+esc(o.mobile)+'</p><table><thead><tr><th>Item</th><th>SKU / variant</th><th>Qty</th><th>Price</th></tr></thead><tbody>'+d.items.map(i=>'<tr><td>'+esc(i.product_name)+'</td><td>'+esc(i.sku)+(i.colour?' · '+esc(i.colour):'')+(i.size?' · '+esc(i.size):'')+'</td><td>'+i.quantity+'</td><td>₹'+Number(i.unit_price*i.quantity).toLocaleString('en-IN')+'</td></tr>').join('')+'</tbody></table><p><b>Items total: ₹'+Number(o.items_total).toLocaleString('en-IN')+'</b></p>'+(o.customer_notes?'<p><b>Customer note:</b> '+esc(o.customer_notes)+'</p>':'');byId('modal').hidden=false}async function reviews(){const d=await call('/owner/api/reviews?status='+encodeURIComponent(byId('reviewStatus').value));byId('reviewRows').innerHTML=d.reviews.map(r=>'<tr><td><b>'+esc(r.product_name)+'</b><br>'+esc(r.sku)+'<br><small>'+esc(r.reference)+'</small></td><td>'+esc(r.display_name)+'<br><small>'+esc(r.email)+'</small></td><td><div style="color:#e79b00">'+('★'.repeat(r.rating))+'</div><p>'+esc(r.review_text)+'</p><small>Status: '+esc(r.status)+'</small></td><td>'+(r.photo_url?'<a href="'+esc(r.photo_url)+'" target="_blank"><img class="review-photo" src="'+esc(r.photo_url)+'" alt="Review photo"></a>':'No photo')+'</td><td><textarea data-review-note rows="2" placeholder="Optional private note">'+esc(r.owner_note)+'</textarea><p><button data-review="'+r.id+'" data-decision="Approved">Approve</button> <button class="secondary" data-review="'+r.id+'" data-decision="Rejected">Reject</button></p></td></tr>').join('')||'<tr><td colspan="5">No reviews in this list.</td></tr>'}byId('login').onsubmit=async e=>{e.preventDefault();try{const d=await call('/owner/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(byId('login'))))});csrf=d.csrf;showDashboard();await load()}catch(x){byId('loginMessage').textContent=x.message}};byId('find').onclick=load;byId('export').onclick=()=>location.href='/owner/api/orders.csv?'+query();byId('rows').onclick=async e=>{const save=e.target.closest('[data-save]'),pack=e.target.closest('[data-pack]');if(pack){await packingSlip(pack.dataset.pack);return}if(!save)return;const tr=save.closest('tr');try{await call('/owner/api/orders/'+encodeURIComponent(save.dataset.save),{method:'PATCH',body:JSON.stringify({status:tr.querySelector('[data-status]').value,paymentStatus:tr.querySelector('[data-payment]').value,statusMessage:tr.querySelector('[data-status-message]').value,paymentReference:tr.querySelector('[data-payment-ref]').value,trackingUrl:tr.querySelector('[data-tracking]').value,ownerNotes:tr.querySelector('[data-notes]').value})});byId('message').className='message ok';byId('message').textContent='Order updated and timeline saved.';await load()}catch(x){byId('message').className='message error';byId('message').textContent=x.message}};document.querySelector('.tabs').onclick=async e=>{const b=e.target.closest('[data-tab]');if(!b)return;document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('active',x===b));byId('ordersCard').hidden=b.dataset.tab!=='orders';byId('reviewsCard').hidden=b.dataset.tab!=='reviews';if(b.dataset.tab==='reviews')await reviews()};byId('loadReviews').onclick=reviews;byId('reviewRows').onclick=async e=>{const b=e.target.closest('[data-review]');if(!b)return;const note=b.closest('tr').querySelector('[data-review-note]').value;try{await call('/owner/api/reviews/'+b.dataset.review,{method:'PATCH',body:JSON.stringify({status:b.dataset.decision,ownerNote:note})});byId('reviewMessage').className='message ok';byId('reviewMessage').textContent='Review '+b.dataset.decision.toLowerCase()+'.';await reviews()}catch(x){byId('reviewMessage').className='message error';byId('reviewMessage').textContent=x.message}};byId('closeModal').onclick=()=>byId('modal').hidden=true;byId('printPacking').onclick=()=>print();byId('logout').onclick=async()=>{await call('/owner/api/logout',{method:'POST',body:'{}'});location.reload()};start();
  </script></body></html>`;
}

function ownerPasswordEnhancement(html) {
  const addition = `<style>dialog{border:0;border-radius:18px;padding:0;box-shadow:0 24px 70px #0005}dialog::backdrop{background:#071a2699}.password-card{width:min(430px,88vw);margin:0}.password-card .toolbar{justify-content:flex-end}</style><script>(()=>{const logoutButton=document.getElementById('logout'),button=document.createElement('button');button.id='changePassword';button.className='secondary';button.textContent='Change password';button.hidden=logoutButton.hidden;logoutButton.before(button);new MutationObserver(()=>button.hidden=logoutButton.hidden).observe(logoutButton,{attributes:true,attributeFilter:['hidden']});document.body.insertAdjacentHTML('beforeend','<dialog id="passwordDialog"><form id="passwordForm" class="card password-card"><h2>Change owner password</h2><p>Use at least 12 characters. A longer passphrase is easier to remember and safer.</p><label>New password<input name="password" type="password" minlength="12" maxlength="200" required autocomplete="new-password"></label><label>Confirm password<input name="confirmPassword" type="password" minlength="12" maxlength="200" required autocomplete="new-password"></label><div class="toolbar"><button type="button" class="secondary" id="cancelPassword">Cancel</button><button>Save password</button></div><p id="passwordMessage" class="message"></p></form></dialog>');const dialog=document.getElementById('passwordDialog'),form=document.getElementById('passwordForm'),message=document.getElementById('passwordMessage');button.onclick=()=>dialog.showModal();document.getElementById('cancelPassword').onclick=()=>dialog.close();form.onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));if(data.password!==data.confirmPassword){message.className='message error';message.textContent='The two passwords do not match.';return}try{await call('/owner/api/password',{method:'POST',body:JSON.stringify({password:data.password})});message.className='message ok';message.textContent='Password changed successfully.';form.reset();setTimeout(()=>dialog.close(),900)}catch(error){message.className='message error';message.textContent=error.message}}})()</script>`;
  return html.replace('</body>', `${addition}</body>`);
}

async function serveReviewMedia(request, env, path) {
  const key = decodeURIComponent(path.slice('/review-media/'.length));
  if (!/^[a-f0-9-]{20,}$/i.test(key)) return new Response('Not found', { status: 404, headers: securityHeaders() });
  const object = await env.DB.prepare('SELECT mime_type,bytes FROM review_media WHERE id=?').bind(key).first();
  if (!object) return new Response('Not found', { status: 404, headers: securityHeaders() });
  const headers = new Headers({
    'cache-control': 'public, max-age=31536000, immutable',
    'content-type': object.mime_type,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
  });
  return new Response(new Uint8Array(object.bytes), { headers });
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
      if (path.startsWith('/review-media/') && request.method === 'GET') return serveReviewMedia(request, env, path);
      if (path.startsWith('/api/')) return customerApi(request, env, path);
      if (path.startsWith('/owner/api/')) return ownerApi(request, env, path);
      if (path === '/owner' || path === '/owner/orders') return new Response(ownerPasswordEnhancement(ownerPage()).replace('</head>', '<style>[hidden]{display:none!important}</style></head>'), { headers: { 'content-type': 'text/html;charset=utf-8', ...securityHeaders() } });
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

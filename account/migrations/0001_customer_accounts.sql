PRAGMA foreign_keys=ON;

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  label TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  address TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX addresses_customer ON addresses(customer_id, is_default DESC, created_at DESC);

CREATE TABLE saved_items (
  customer_id TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(customer_id, product_slug),
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'Received',
  payment_status TEXT NOT NULL DEFAULT 'Pending confirmation',
  payment_method TEXT,
  payment_reference TEXT,
  items_total REAL NOT NULL DEFAULT 0,
  shipping_total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  recipient_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  pincode TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  customer_notes TEXT,
  owner_notes TEXT,
  tracking_url TEXT,
  source TEXT NOT NULL DEFAULT 'website_whatsapp',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
);
CREATE INDEX orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX orders_status ON orders(status, created_at DESC);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  colour TEXT,
  size TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  image_url TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX order_items_order ON order_items(order_id);

CREATE TABLE owner_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX owner_sessions_expiry ON owner_sessions(expires_at);

CREATE TABLE owner_login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_started TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX account_audit_created ON audit_log(created_at DESC);

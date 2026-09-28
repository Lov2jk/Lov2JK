CREATE TABLE wholesale_quotes (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, contact_name TEXT NOT NULL,
  company_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, whatsapp TEXT,
  country TEXT NOT NULL, website_url TEXT, buyer_type TEXT NOT NULL, product_codes TEXT,
  requested_categories TEXT, estimated_quantity TEXT NOT NULL, destination TEXT, message TEXT,
  consent_confirmed INTEGER NOT NULL CHECK(consent_confirmed=1), status TEXT NOT NULL DEFAULT 'New',
  owner_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX wholesale_quotes_created ON wholesale_quotes(created_at DESC);
CREATE INDEX wholesale_quotes_status ON wholesale_quotes(status, created_at DESC);
CREATE TABLE wholesale_quote_rate_limits (ip_hash TEXT PRIMARY KEY, window_started TEXT NOT NULL, count INTEGER NOT NULL);

PRAGMA foreign_keys=ON;

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX order_events_order ON order_events(order_id, created_at ASC);

INSERT INTO order_events(id, order_id, status, message, created_at)
SELECT lower(hex(randomblob(16))), id, status, 'Current order status', updated_at
FROM orders;

CREATE TABLE customer_reviews (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  product_slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  photo_key TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')),
  owner_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX customer_reviews_product ON customer_reviews(product_slug, status, approved_at DESC);
CREATE INDEX customer_reviews_owner_queue ON customer_reviews(status, created_at DESC);

PRAGMA foreign_keys=ON;

CREATE TABLE review_media (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_references (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  duration_seconds REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_voice_references_name
ON voice_references (
  display_name
);

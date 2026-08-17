CREATE TABLE IF NOT EXISTS biography_analyses (
  id TEXT PRIMARY KEY NOT NULL,

  vault_person TEXT NOT NULL
    CHECK (vault_person IN ('Papa', 'Dad', 'Mom')),

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'error')),

  source_recording_count INTEGER NOT NULL DEFAULT 0,

  analysis_json TEXT,

  analysis_error TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_biography_analyses_vault
ON biography_analyses (vault_person, updated_at);

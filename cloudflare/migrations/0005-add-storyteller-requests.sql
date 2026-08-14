CREATE TABLE IF NOT EXISTS storyteller_requests (
  id TEXT PRIMARY KEY NOT NULL,

  token_hash TEXT NOT NULL UNIQUE,

  vault_person TEXT NOT NULL
    CHECK (vault_person IN ('Papa', 'Dad', 'Mom')),

  question_id TEXT NOT NULL,

  recipient_name TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'revoked', 'expired')),

  expires_at TEXT,
  revoked_at TEXT,
  submitted_at TEXT,

  recording_id TEXT,

  created_by TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (question_id)
    REFERENCES questions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (recording_id)
    REFERENCES audio_tracks(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_storyteller_requests_token
ON storyteller_requests (token_hash);

CREATE INDEX IF NOT EXISTS idx_storyteller_requests_question
ON storyteller_requests (question_id, vault_person);

CREATE INDEX IF NOT EXISTS idx_storyteller_requests_status
ON storyteller_requests (status);

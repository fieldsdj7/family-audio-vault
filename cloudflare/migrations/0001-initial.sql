-- Fields Family Audio Vault: initial Cloudflare D1 schema
-- Simplified Question Library version (no manual Question Tracker statuses).
-- Safe to run in a new, empty D1 database.
-- This creates empty tables only. It does not change Supabase or the live site.

PRAGMA foreign_keys = ON;

-- Cloudflare Access identifies each family member by verified email address.
CREATE TABLE IF NOT EXISTS vault_members (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Non-admin family members receive access only to the named vaults listed here.
CREATE TABLE IF NOT EXISTS vault_access (
  member_email TEXT NOT NULL COLLATE NOCASE,
  vault_person TEXT NOT NULL CHECK (vault_person IN ('Papa', 'Dad', 'Mom')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_email, vault_person),
  FOREIGN KEY (member_email) REFERENCES vault_members(email) ON DELETE CASCADE
);

-- Permanent numbered backup of the physical question cards.
-- Progress is calculated from linked recordings rather than stored manually.
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY NOT NULL,
  question_number INTEGER NOT NULL UNIQUE CHECK (question_number > 0),
  question_text TEXT NOT NULL CHECK (length(trim(question_text)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_questions_number
  ON questions(question_number);

-- IDs are text so existing Supabase UUIDs can be preserved during migration.
-- Each visible answer may point to one numbered question. Multiple people and
-- multiple recordings may still answer the same question.
CREATE TABLE IF NOT EXISTS audio_tracks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  speaker TEXT NOT NULL,
  category TEXT,
  vault_person TEXT NOT NULL DEFAULT 'Dad'
    CHECK (vault_person IN ('Papa', 'Dad', 'Mom')),
  question_id TEXT,
  storage_path TEXT,
  audio_url TEXT,
  transcript TEXT,
  transcription_status TEXT NOT NULL DEFAULT 'not_started',
  transcription_error TEXT,
  story_title TEXT,
  story_chapter TEXT,
  story_status TEXT NOT NULL DEFAULT 'not_started',
  story_error TEXT,
  source_track_id TEXT,
  clip_start_seconds REAL,
  clip_end_seconds REAL,
  split_notes TEXT,
  is_split_master INTEGER NOT NULL DEFAULT 0
    CHECK (is_split_master IN (0, 1)),
  trashed_at TEXT,
  trashed_by TEXT COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL,
  FOREIGN KEY (source_track_id) REFERENCES audio_tracks(id) ON DELETE RESTRICT,
  CHECK (
    clip_end_seconds IS NULL
    OR clip_start_seconds IS NULL
    OR clip_end_seconds > clip_start_seconds
  )
);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_vault_created
  ON audio_tracks(vault_person, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_question
  ON audio_tracks(question_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_source
  ON audio_tracks(source_track_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_storage_path
  ON audio_tracks(storage_path);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_trashed
  ON audio_tracks(trashed_at);

CREATE TABLE IF NOT EXISTS audio_track_reviews (
  audio_track_id TEXT PRIMARY KEY NOT NULL,
  transcript_reviewed_at TEXT,
  story_approved_at TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audio_track_id) REFERENCES audio_tracks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vault_backup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL COLLATE NOCASE,
  recording_count INTEGER NOT NULL DEFAULT 0,
  audio_file_count INTEGER NOT NULL DEFAULT 0,
  missing_audio_count INTEGER NOT NULL DEFAULT 0,
  backup_size_bytes INTEGER,
  FOREIGN KEY (created_by) REFERENCES vault_members(email) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_backup_history_created
  ON vault_backup_history(created_at DESC);

-- Reserved for the planned photo-and-caption feature. Photos attach to a story
-- through its audio entry and will be included in full Vault backups.
CREATE TABLE IF NOT EXISTS story_photos (
  id TEXT PRIMARY KEY NOT NULL,
  audio_track_id TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audio_track_id) REFERENCES audio_tracks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_photos_track_order
  ON story_photos(audio_track_id, sort_order, created_at);

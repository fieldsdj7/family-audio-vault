CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY NOT NULL,
  audio_track_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  speaker_label TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (audio_track_id)
    REFERENCES audio_tracks(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_track
ON transcript_segments (
  audio_track_id,
  segment_index
);

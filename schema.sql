CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, album_id TEXT, kind TEXT NOT NULL DEFAULT 'photo', duration REAL, mime TEXT, caption TEXT, taken_at TEXT,
  width INT, height INT, bytes INT, uploaded_at INTEGER NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, fp TEXT,
  kb_move TEXT, kb_speed TEXT
);
CREATE INDEX IF NOT EXISTS photos_fp ON photos(fp);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT, kind TEXT, ua TEXT, first_seen INTEGER, last_seen INTEGER, ver TEXT,
  overrides TEXT, cmd TEXT, cmd_seq INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY, fails INT NOT NULL, first_fail INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0
);

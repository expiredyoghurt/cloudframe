CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, album_id TEXT, kind TEXT NOT NULL DEFAULT 'photo', duration REAL, mime TEXT, caption TEXT, taken_at TEXT,
  width INT, height INT, bytes INT, uploaded_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY, fails INT NOT NULL, first_fail INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0
);

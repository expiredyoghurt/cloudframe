-- Upgrading from v1.1-v1.8? Run this once in the D1 Console (coming from v1.0, run migration-v1.1.sql first).
ALTER TABLE photos ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN deleted_at INTEGER;
ALTER TABLE photos ADD COLUMN fp TEXT;
CREATE INDEX IF NOT EXISTS photos_fp ON photos(fp);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT, kind TEXT, ua TEXT, first_seen INTEGER, last_seen INTEGER, ver TEXT,
  overrides TEXT, cmd TEXT, cmd_seq INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0
);

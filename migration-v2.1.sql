-- Upgrading from v2.0? Run this once in the D1 Console (adds the picture fingerprint and the optional AI vector used by duplicate detection).
-- Coming from v1.9, run migration-v2.0.sql first; from v1.1-v1.8, run migration-v1.9.sql, then migration-v2.0.sql, then this one.
-- Safe to skip for now: frames keep playing and the exact-copy check still works; the look-alike check starts working once this has been run.
ALTER TABLE photos ADD COLUMN ph TEXT;
ALTER TABLE photos ADD COLUMN emb TEXT;

-- Upgrading from v1.9? Run this once in the D1 Console BEFORE or right after deploying v2.0 (adds the per-photo Ken Burns columns).
-- Coming from v1.1-v1.8, run migration-v1.9.sql first; from v1.0, run migration-v1.1.sql and then migration-v1.9.sql.
-- Safe to skip for now: frames keep playing without it, but per-photo Ken Burns choices can't be saved until it has been run.
ALTER TABLE photos ADD COLUMN kb_move TEXT;
ALTER TABLE photos ADD COLUMN kb_speed TEXT;

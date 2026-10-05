-- Only needed if you already deployed v1.0. Run once in the D1 Console.
ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE photos ADD COLUMN duration REAL;
ALTER TABLE photos ADD COLUMN mime TEXT;

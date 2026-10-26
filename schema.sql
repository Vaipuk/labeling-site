CREATE TABLE IF NOT EXISTS people (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  code        TEXT NOT NULL,
  pair_id     TEXT NOT NULL,
  grade       TEXT NOT NULL CHECK (grade IN ('critical', 'worth_knowing', 'background', 'not_relevant')),
  why         TEXT,
  graded_at   TEXT NOT NULL,
  PRIMARY KEY (code, pair_id)
);

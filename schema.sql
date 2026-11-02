CREATE TABLE IF NOT EXISTS testers (
  tester_hash TEXT PRIMARY KEY,
  lat REAL,
  lon REAL
);

-- Meta redelivers a webhook it thinks failed; this stops a second answer.
CREATE TABLE IF NOT EXISTS seen_messages (
  message_id TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  tester_hash TEXT NOT NULL,
  input TEXT NOT NULL,
  transcript TEXT,
  confidence REAL,
  topic TEXT,
  outcome TEXT NOT NULL,
  sources TEXT,
  reply TEXT
);

-- Recent turns per tester so follow-up questions make sense; cleared with the log after the test week.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  tester_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_tester ON messages (tester_hash, id);

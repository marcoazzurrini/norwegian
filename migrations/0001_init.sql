-- One learner's data. The app merges; the server stores and hands out changes.

-- Counters: 'rev' numbers each change to memory, 'epoch' numbers the data generation (it changes on "Start over").
CREATE TABLE state (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO state (key, value) VALUES ('rev', 0), ('epoch', 0);

-- One row per learned item. 'stamp' is the time of its last review; the later copy wins.
CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  stamp INTEGER NOT NULL,
  rev INTEGER NOT NULL
);
CREATE INDEX memory_rev ON memory (rev);

-- Every review ever made. Rows are only added.
CREATE TABLE log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL
);

-- Settings and counters, as one document.
CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);

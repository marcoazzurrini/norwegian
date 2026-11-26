-- The learner's data is kept apart for each course. Every table of that data gets a 'course'
-- column, and everything stored before there were courses becomes the first course, 'no'.
--
-- SQLite cannot change the key of a table, so each table is made again under a new name, filled
-- from the old one, and then takes the old one's place. Nothing is read or changed in 'event'
-- and the sign-in tables. If any statement fails, D1 undoes the whole file.

-- Counters, for each course: 'rev' numbers each change to memory, 'epoch' numbers the data generation.
-- A course that has no row yet counts from 0.
CREATE TABLE state_next (
  course TEXT NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (course, key)
);
INSERT INTO state_next (course, key, value) SELECT 'no', key, value FROM state;
DROP TABLE state;
ALTER TABLE state_next RENAME TO state;

-- One row per learned item of a course. An item's id is only unique within its course.
CREATE TABLE memory_next (
  course TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  stamp INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (course, id)
);
INSERT INTO memory_next (course, id, data, stamp, rev) SELECT 'no', id, data, stamp, rev FROM memory;
DROP TABLE memory;
ALTER TABLE memory_next RENAME TO memory;
CREATE INDEX memory_rev ON memory (course, rev);

-- Every review ever made, in every course. 'seq' numbers the rows of all courses together, so a
-- device's cursor into one course still only ever moves forward.
CREATE TABLE log_next (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  course TEXT NOT NULL,
  uid TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE (course, uid)
);
-- The devices hold cursors into the old numbering, so the new table must go on counting where the
-- old one stopped, also when "Start over" has deleted the rows with the highest numbers. A row
-- with the last number ever given, added and removed again, makes the table remember that number.
INSERT INTO log_next (seq, course, uid, data)
  SELECT seq, 'no', '', '' FROM sqlite_sequence WHERE name = 'log' AND seq > 0;
DELETE FROM log_next;
INSERT INTO log_next (seq, course, uid, data) SELECT seq, 'no', uid, data FROM log ORDER BY seq;
DROP TABLE log;
ALTER TABLE log_next RENAME TO log;
CREATE INDEX log_course_seq ON log (course, seq);

-- Settings and counters, as one document for each course.
CREATE TABLE meta_next (course TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
INSERT INTO meta_next (course, data) SELECT 'no', data FROM meta;
DROP TABLE meta;
ALTER TABLE meta_next RENAME TO meta;

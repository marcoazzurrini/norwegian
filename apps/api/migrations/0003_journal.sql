-- The journal: what happened in the app, kept to find out later why it behaved as it did.
-- Rows are only added, and "Start over" leaves them. 'at', 'kind' and 'session' are copies of
-- fields in 'data', as columns, so that a query can filter on them.
CREATE TABLE event (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  session TEXT,
  data TEXT NOT NULL
);
CREATE INDEX event_at ON event (at);
CREATE INDEX event_session ON event (session);

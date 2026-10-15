-- D1 staging schema. This is separate from the production PostgreSQL journal.
-- All access is through the authenticated Worker. D1 has no PostgreSQL RLS.
-- Identity and purchase eligibility are projections, never auth credentials.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  deleted_at TEXT,
  projection_version INTEGER NOT NULL DEFAULT 0 CHECK (projection_version >= 0)
);
CREATE INDEX users_role_active_idx ON users(role, active);
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  projection_version INTEGER NOT NULL DEFAULT 0 CHECK (projection_version >= 0)
);
CREATE TABLE chat_client_access (
  client_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_unlocked INTEGER NOT NULL CHECK (project_unlocked IN (0, 1)),
  projection_version INTEGER NOT NULL DEFAULT 0 CHECK (projection_version >= 0)
);

-- UTC timestamps use the fixed YYYY-MM-DDTHH:mm:ss.sssZ format. Current
-- PostgreSQL chat columns have millisecond precision; TEXT ordering preserves
-- the existing (created_at, id) cursor, including tied timestamps.
CREATE TABLE chat_rooms (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('manager', 'support')),
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TEXT,
  last_message_preview TEXT CHECK (length(last_message_preview) <= 180),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24 AND substr(created_at, 24) = 'Z'),
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24 AND substr(updated_at, 24) = 'Z'),
  CHECK (kind = 'manager' OR manager_id IS NULL)
);
CREATE UNIQUE INDEX chat_rooms_manager_client_idx ON chat_rooms(client_id) WHERE kind = 'manager';
CREATE INDEX chat_rooms_manager_updated_idx ON chat_rooms(manager_id, updated_at, id);
CREATE INDEX chat_rooms_client_updated_idx ON chat_rooms(client_id, updated_at, id);
CREATE INDEX chat_rooms_updated_idx ON chat_rooms(updated_at, id);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL CHECK (length(actor_key) <= 48),
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) <= 4000 AND (length(trim(body)) > 0 OR attachment IS NOT NULL OR deleted_at IS NOT NULL)),
  attachment TEXT CHECK (attachment IS NULL OR (json_valid(attachment) AND json_type(attachment) = 'object')),
  edited_at TEXT,
  deleted_at TEXT,
  client_nonce TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK (length(created_at) = 24 AND substr(created_at, 24) = 'Z')
);
CREATE UNIQUE INDEX chat_messages_actor_nonce_idx ON chat_messages(actor_key, client_nonce);
CREATE INDEX chat_messages_room_created_idx ON chat_messages(room_id, created_at, id);
CREATE TABLE chat_reads (
  room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL CHECK (length(actor_key) <= 48),
  last_read_at TEXT NOT NULL CHECK (length(last_read_at) = 24 AND substr(last_read_at, 24) = 'Z'),
  last_read_id TEXT,
  PRIMARY KEY (room_id, actor_key)
);

CREATE TABLE support_tickets (
  ticket_number INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL UNIQUE REFERENCES chat_rooms(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 3 AND 160),
  category TEXT NOT NULL CHECK (category IN ('billing', 'subscription', 'project', 'technical', 'account', 'other')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status TEXT NOT NULL DEFAULT 'waiting_support' CHECK (status IN ('waiting_support', 'waiting_customer', 'closed')),
  closed_at TEXT,
  closed_by TEXT,
  updated_at TEXT NOT NULL CHECK (length(updated_at) = 24 AND substr(updated_at, 24) = 'Z'),
  CHECK ((status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL) OR (status <> 'closed' AND closed_at IS NULL AND closed_by IS NULL))
);
CREATE INDEX support_tickets_status_updated_idx ON support_tickets(status, updated_at, room_id);

CREATE TABLE chat_migration_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  snapshot_at TEXT NOT NULL,
  source_ticket_sequence INTEGER NOT NULL CHECK (source_ticket_sequence >= 0)
);

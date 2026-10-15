-- Store Worker-normalized search text so SQLite's ASCII-only lower()/LIKE
-- do not change case-insensitive Unicode search after leaving PostgreSQL.
ALTER TABLE chat_messages ADD COLUMN search_body TEXT NOT NULL DEFAULT '';
ALTER TABLE chat_messages ADD COLUMN search_attachment TEXT NOT NULL DEFAULT '';
-- Initial ASCII backfill. Imported rows and all runtime writes supply Unicode
-- lowercase values; verify derived values before cutover of an existing DB.
UPDATE chat_messages SET search_body=lower(body), search_attachment=lower(COALESCE(json_extract(attachment,'$.name'),''));

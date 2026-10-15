// Only these projections and chat records can leave PostgreSQL. No credentials,
// billing details, Supabase tokens, or general user-profile fields are exported.
export const chatD1Tables = [
  { name: "users", columns: ["id", "email", "name", "role", "active", "deleted_at"], query: "SELECT id, email, name, role, active, deleted_at FROM users ORDER BY id" },
  { name: "admin_users", columns: ["id", "email", "name", "role", "active"], query: "SELECT id, email, name, role, active FROM admin_users ORDER BY id" },
  { name: "chat_client_access", columns: ["client_id", "project_unlocked"], query: "SELECT u.id AS client_id, EXISTS (SELECT 1 FROM customer_subscriptions s WHERE s.owner_id = u.id AND s.status = 'paid' AND s.deleted_at IS NULL) AS project_unlocked FROM users u ORDER BY u.id" },
  { name: "chat_rooms", columns: ["id", "client_id", "kind", "manager_id", "last_message_at", "last_message_preview", "created_at", "updated_at"], query: "SELECT id, client_id, kind, manager_id, last_message_at, last_message_preview, created_at, updated_at FROM chat_rooms ORDER BY id" },
  { name: "chat_messages", columns: ["id", "room_id", "actor_key", "sender_user_id", "sender_admin_id", "sender_name", "sender_role", "body", "attachment", "edited_at", "deleted_at", "client_nonce", "created_at"], query: "SELECT id, room_id, actor_key, sender_user_id, sender_admin_id, sender_name, sender_role, body, attachment, edited_at, deleted_at, client_nonce, created_at FROM chat_messages ORDER BY id" },
  { name: "chat_reads", columns: ["room_id", "actor_key", "last_read_at", "last_read_id"], query: "SELECT room_id, actor_key, last_read_at, last_read_id FROM chat_reads ORDER BY room_id, actor_key" },
  { name: "support_tickets", columns: ["room_id", "ticket_number", "subject", "category", "priority", "status", "closed_at", "closed_by", "updated_at"], query: "SELECT room_id, ticket_number, subject, category, priority, status, closed_at, closed_by, updated_at FROM support_tickets ORDER BY room_id" },
];

const dateColumns = new Set(["deleted_at", "last_message_at", "created_at", "updated_at", "edited_at", "last_read_at", "closed_at"]);
export function normalizeChatD1Row(table, row) {
  if (!chatD1Tables.includes(table)) throw new Error("Unknown export table");
  return Object.fromEntries(table.columns.map(column => {
    let value = row[column];
    if (value === undefined) throw new Error("Missing export column");
    if (value !== null && dateColumns.has(column)) {
      const date = value instanceof Date ? value : new Date(value);
      if (!Number.isFinite(date.getTime())) throw new Error("Invalid export timestamp");
      value = date.toISOString();
    } else if (column === "attachment" && value !== null) {
      const attachment = typeof value === "string" ? JSON.parse(value) : value;
      if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) throw new Error("Invalid attachment metadata");
      value = JSON.stringify(attachment);
    } else if (typeof value === "boolean") value = value ? 1 : 0;
    if (typeof value === "string" && value.includes("\0")) throw new Error("Null bytes cannot be exported");
    if (value !== null && !["string", "number"].includes(typeof value)) throw new Error("Unsupported export value");
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("Unsafe export integer");
    return [column, value];
  }));
}
export function chatD1Insert(table, row) {
  const normalized = normalizeChatD1Row(table, row);
  // Hex encoded UTF-8 literals keep quotes, newlines and SQL-looking message
  // text out of the SQL grammar. Import data never becomes an SQL identifier.
  const literal = value => value === null ? "NULL" : typeof value === "number" ? String(value) : `CAST(X'${Buffer.from(value, "utf8").toString("hex")}' AS TEXT)`;
  const columns = [...table.columns], values = columns.map(column => normalized[column]);
  if (table.name === "chat_messages") {
    columns.push("search_body", "search_attachment");
    values.push(normalized.body.toLowerCase(), normalized.attachment ? JSON.parse(normalized.attachment).name.toLowerCase() : "");
  }
  if (table.name === "chat_rooms") { columns.push("search_preview"); values.push((normalized.last_message_preview ?? "").toLowerCase()); }
  if (table.name === "support_tickets") { columns.push("search_subject"); values.push(normalized.subject.toLowerCase()); }
  const statement = `INSERT INTO ${table.name} (${columns.join(",")}) VALUES (${values.map(literal).join(",")});`;
  if (Buffer.byteLength(statement) > 90_000) throw new Error("Export statement exceeds the D1 limit");
  return statement;
}
export function chatD1Finalize(snapshotAt, ticketSequence) {
  if (!Number.isSafeInteger(ticketSequence) || ticketSequence < 0) throw new Error("Invalid ticket sequence");
  const at = new Date(snapshotAt).toISOString();
  return [
    `UPDATE sqlite_sequence SET seq = max(seq, ${ticketSequence}) WHERE name = 'support_tickets';`,
    `INSERT INTO sqlite_sequence (name,seq) SELECT 'support_tickets',${ticketSequence} WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'support_tickets');`,
    `INSERT INTO chat_migration_metadata (id,schema_version,snapshot_at,source_ticket_sequence) VALUES (1,1,'${at}',${ticketSequence});`,
  ];
}

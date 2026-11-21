const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add a PostgreSQL database in Railway.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_settings (
      chat_id BIGINT PRIMARY KEY,
      rules TEXT NOT NULL DEFAULT 'Be respectful. No spam. Enjoy the yapping!',
      antilink BOOLEAN NOT NULL DEFAULT FALSE,
      antiflood BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS warnings (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      admin_id BIGINT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'No reason provided',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function ensureGroup(chatId) {
  await pool.query(
    "INSERT INTO group_settings(chat_id) VALUES($1) ON CONFLICT(chat_id) DO NOTHING",
    [String(chatId)]
  );
}

async function getSettings(chatId) {
  await ensureGroup(chatId);
  const { rows } = await pool.query("SELECT * FROM group_settings WHERE chat_id=$1", [String(chatId)]);
  return rows[0];
}

async function setSetting(chatId, key, value) {
  const allowed = new Set(["antilink", "antiflood", "rules"]);
  if (!allowed.has(key)) throw new Error("Invalid setting");
  await ensureGroup(chatId);
  await pool.query(`UPDATE group_settings SET ${key}=$1 WHERE chat_id=$2`, [value, String(chatId)]);
}

async function addWarning(chatId, userId, adminId, reason) {
  await pool.query(
    "INSERT INTO warnings(chat_id,user_id,admin_id,reason) VALUES($1,$2,$3,$4)",
    [String(chatId), String(userId), String(adminId), reason]
  );
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM warnings WHERE chat_id=$1 AND user_id=$2",
    [String(chatId), String(userId)]
  );
  return rows[0].count;
}

async function getWarnings(chatId, userId) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM warnings WHERE chat_id=$1 AND user_id=$2",
    [String(chatId), String(userId)]
  );
  return rows[0]?.count || 0;
}

async function clearWarnings(chatId, userId) {
  await pool.query("DELETE FROM warnings WHERE chat_id=$1 AND user_id=$2", [String(chatId), String(userId)]);
}

module.exports = { pool, initDb, getSettings, setSetting, addWarning, getWarnings, clearWarnings };

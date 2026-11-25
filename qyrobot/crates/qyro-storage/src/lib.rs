//! SQLite WAL persistence, PRD §14.1 schema migration, event_log resume, and pinned-safe GC.

use chrono::Utc;
use qyro_types::EventEnvelope;
use rusqlite::{Connection, params};
use thiserror::Error;

pub const PHASE1_SCHEMA_SQL: &str = include_str!("../../../../migrations/0001_phase1_core.sql");

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("sqlite error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub struct QyroStorage {
    conn: Connection,
}

impl QyroStorage {
    pub fn open_in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        Self::init(conn)
    }

    pub fn open(path: &str) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    fn init(conn: Connection) -> Result<Self, StorageError> {
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        conn.execute_batch(PHASE1_SCHEMA_SQL)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?1)",
            params!["0001_phase1_core"],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO user_preferences (id, ui_locale, timezone, theme_mode, bot_accent_mode, free_only_mode) VALUES (1, 'id-ID', 'Asia/Jakarta', 'dark', 'bot_color', 1)",
            [],
        )?;
        Ok(Self { conn })
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn append_event(
        &self,
        kind: &str,
        bot_id: Option<&str>,
        payload: &serde_json::Value,
    ) -> Result<EventEnvelope, StorageError> {
        let ts = Utc::now().to_rfc3339();
        let serialized = serde_json::to_string(payload)?;
        self.conn.execute(
            "INSERT INTO event_log (kind, bot_id, payload_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![kind, bot_id, serialized, ts],
        )?;
        let event_id = self.conn.last_insert_rowid();
        Ok(EventEnvelope {
            event_id,
            timestamp: ts,
            kind: kind.to_string(),
            bot_id: bot_id.map(str::to_string),
            payload: payload.clone(),
        })
    }

    pub fn resume_events(&self, last_event_id: i64, limit: usize) -> Result<Vec<EventEnvelope>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT event_id, kind, bot_id, payload_json, created_at FROM event_log WHERE event_id > ?1 ORDER BY event_id ASC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![last_event_id, limit as i64], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (event_id, kind, bot_id, payload_json, timestamp) = row?;
            out.push(EventEnvelope {
                event_id,
                timestamp,
                kind,
                bot_id,
                payload: serde_json::from_str(&payload_json)?,
            });
        }
        Ok(out)
    }

    /// Storage GC (PRD §13.4): never touches pinned=1 items, memory text, or vault_secrets.
    pub fn run_storage_gc(&self, retention_days: i64) -> Result<(usize, usize, usize), StorageError> {
        let del_rtk = self.conn.execute(
            "DELETE FROM library_items WHERE pinned = 0 AND kind = 'rtk_raw_cache' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')",
            [],
        )?;
        let del_shots = self.conn.execute(
            "DELETE FROM library_items WHERE pinned = 0 AND kind = 'screenshot' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')",
            [],
        )?;
        let modifier = format!("-{} days", retention_days.max(1));
        let del_media = self.conn.execute(
            "DELETE FROM library_items WHERE pinned = 0 AND kind = 'media_cache' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)",
            params![modifier],
        )?;
        Ok((del_rtk, del_shots, del_media))
    }
}

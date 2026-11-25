//! Native Observer Memory Engine (claude-mem architecture):
//! <private> stripping before persistence + 3-step FTS5 mem-search (index -> timeline -> details).

use qyro_storage::QyroStorage;
use regex::Regex;
use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct MemSearchHit {
    pub id: String,
    pub session_id: String,
    pub title: String,
    pub summary: String,
}

pub fn strip_private_tags(input: &str) -> (String, usize) {
    let re = Regex::new(r"(?is)<private\b[^>]*>.*?</private>").expect("valid static regex");
    let count = re.find_iter(input).count();
    let sanitized = re.replace_all(input, "[private-redacted]").into_owned();
    (sanitized, count)
}

pub struct QyroMemory<'a> {
    storage: &'a QyroStorage,
}

impl<'a> QyroMemory<'a> {
    pub fn new(storage: &'a QyroStorage) -> Self {
        Self { storage }
    }

    pub fn record_observation(
        &self,
        session_id: &str,
        title: &str,
        body: &str,
        tags: &[String],
    ) -> rusqlite::Result<(String, usize)> {
        let (clean_title, c1) = strip_private_tags(title);
        let (clean_body, c2) = strip_private_tags(body);
        let summary: String = clean_body.chars().take(140).collect();
        let id = format!("obs-{}", &Uuid::new_v4().to_string()[..8]);
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        let total_redacted = c1 + c2;

        self.storage.conn().execute(
            "INSERT INTO memory_observations (id, session_id, title, summary, body, tags_json, private_blocks_redacted)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, session_id, clean_title, summary, clean_body, tags_json, total_redacted as i64],
        )?;
        Ok((id, total_redacted))
    }

    pub fn mem_search_index(&self, query: &str, limit: usize) -> rusqlite::Result<Vec<MemSearchHit>> {
        let mut stmt = self.storage.conn().prepare(
            "SELECT o.id, o.session_id, o.title, o.summary
             FROM memory_observations_fts f
             JOIN memory_observations o ON o.id = f.observation_id
             WHERE memory_observations_fts MATCH ?1
             ORDER BY bm25(memory_observations_fts) ASC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![query, limit as i64], |r| {
            Ok(MemSearchHit {
                id: r.get(0)?,
                session_id: r.get(1)?,
                title: r.get(2)?,
                summary: r.get(3)?,
            })
        })?;
        rows.collect()
    }
}

//! First-class Bahasa Indonesia (id-ID) & English (en-US) Fluent (.ftl) loader & timezone mapper.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Locale {
    IdId,
    EnUs,
}

impl Locale {
    pub fn from_code(code: &str) -> Self {
        if code.eq_ignore_ascii_case("en-US") || code.eq_ignore_ascii_case("en") {
            Self::EnUs
        } else {
            Self::IdId
        }
    }
}

pub fn resolve_indonesian_timezone(input: &str) -> String {
    match input.trim().to_ascii_uppercase().as_str() {
        "WIB" => "Asia/Jakarta".to_string(),
        "WITA" => "Asia/Makassar".to_string(),
        "WIT" => "Asia/Jayapura".to_string(),
        other if !other.is_empty() => input.trim().to_string(),
        _ => "Asia/Jakarta".to_string(),
    }
}

pub fn parse_ftl(source: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for raw in source.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, val)) = line.split_once('=') {
            let k = key.trim();
            if !k.is_empty() {
                map.insert(k.to_string(), val.trim().to_string());
            }
        }
    }
    map
}

pub struct QyroI18n {
    id_bundle: HashMap<String, String>,
    en_bundle: HashMap<String, String>,
}

impl QyroI18n {
    pub fn load_from_dir(dir: &Path) -> std::io::Result<Self> {
        let id_raw = fs::read_to_string(dir.join("id-ID.ftl"))?;
        let en_raw = fs::read_to_string(dir.join("en-US.ftl"))?;
        Ok(Self {
            id_bundle: parse_ftl(&id_raw),
            en_bundle: parse_ftl(&en_raw),
        })
    }

    pub fn t(&self, locale: Locale, key: &str, vars: &[(&str, &str)]) -> String {
        let primary = match locale {
            Locale::IdId => self.id_bundle.get(key),
            Locale::EnUs => self.en_bundle.get(key),
        };
        let template = primary
            .or_else(|| self.en_bundle.get(key))
            .map(String::as_str)
            .unwrap_or(key);

        let mut out = template.to_string();
        for (name, val) in vars {
            let token = format!("{{ ${name} }}");
            out = out.replace(&token, val);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_indonesian_zones_and_ftl_interpolation() {
        assert_eq!(resolve_indonesian_timezone("WIB"), "Asia/Jakarta");
        assert_eq!(resolve_indonesian_timezone("wita"), "Asia/Makassar");
        assert_eq!(resolve_indonesian_timezone("WIT"), "Asia/Jayapura");

        let parsed = parse_ftl("hello = Halo { $name }");
        assert_eq!(parsed.get("hello").map(String::as_str), Some("Halo { $name }"));
    }
}

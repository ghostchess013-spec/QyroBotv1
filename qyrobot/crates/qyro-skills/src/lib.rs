//! qyro-skills — 23 Permanent Built-in Skills/Plugins, 3-Layer Progressive Disclosure (<= 1500 tok),
//! Anti-Collision Matrix, Static Pre-Install Scanner, and Runtime SHA-256 Integrity Guard (PRD v1.7.0 §9.2).

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillActivationMode {
    Auto,
    AlwaysOn,
    ManualOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuiltinSkillMeta {
    pub slug: &'static str,
    pub name: &'static str,
    pub category: &'static str,
    pub default_mode: SkillActivationMode,
    pub summary: &'static str,
}

/// Exact 23 Permanent Built-in Skills (14 starter + 9 curated packs).
pub const BUILTIN_23_SKILLS: &[BuiltinSkillMeta] = &[
    // 14 Starter Skills
    BuiltinSkillMeta { slug: "chief-daily-briefing", name: "Chief Daily Briefing", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Daily priorities and pending approvals in WIB/WITA/WIT." },
    BuiltinSkillMeta { slug: "deep-web-research", name: "Deep Web Research", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Multi-source verified research with structured citations." },
    BuiltinSkillMeta { slug: "document-and-sheet-analyst", name: "Document & Sheet Analyst", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Extract and analyze PDF, DOCX, XLSX, CSV, Markdown, JSON." },
    BuiltinSkillMeta { slug: "email-drafter-and-triage", name: "Email Drafter & Triage", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Draft and triage emails via Interactive Draft Cards." },
    BuiltinSkillMeta { slug: "x-social-content-strategist", name: "X / Social Content Strategist", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Draft X posts/threads with 280-char counter and Humanizer." },
    BuiltinSkillMeta { slug: "meeting-notes-and-action-items", name: "Meeting Notes & Action Items", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Structure transcripts into decisions, owners, and deadlines." },
    BuiltinSkillMeta { slug: "code-architect-and-reviewer", name: "Code Architect & Reviewer", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Architecture review, bug triage, and minimal diffs." },
    BuiltinSkillMeta { slug: "browser-task-automator", name: "Browser Task Automator", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Playwright automation with human-in-the-loop takeover." },
    BuiltinSkillMeta { slug: "multimodal-creative-director", name: "Multimodal Creative Director", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Image/video/TTS cloud generation via OmniRoute." },
    BuiltinSkillMeta { slug: "personal-finance-and-budget-tracker", name: "Personal Finance & Budget Tracker", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Track expenses and budgets in IDR/USD." },
    BuiltinSkillMeta { slug: "indonesian-english-bilingual-translator", name: "Indonesian-English Translator", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Context-aware id-ID <-> en-US technical and natural translation." },
    BuiltinSkillMeta { slug: "academic-paper-and-pdf-summarizer", name: "Academic Paper Summarizer", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Summarize methodology, results, and limitations." },
    BuiltinSkillMeta { slug: "project-roadmap-and-prd-writer", name: "Project Roadmap & PRD Writer", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Write structured PRDs, milestones, and acceptance criteria." },
    BuiltinSkillMeta { slug: "security-and-privacy-auditor", name: "Security & Privacy Auditor", category: "starter", default_mode: SkillActivationMode::Auto, summary: "Audit write-only vault, anti-local guard, and permission scopes." },
    // 9 Curated Packs
    BuiltinSkillMeta { slug: "ui-ux-pro-max", name: "UI-UX-Pro-Max", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Deterministic BM25 design system generator (0 LLM tokens)." },
    BuiltinSkillMeta { slug: "impeccable", name: "Impeccable", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "62-rule deterministic anti-AI-slop detector (0 LLM tokens)." },
    BuiltinSkillMeta { slug: "ponytail", name: "Ponytail", category: "curated_pack", default_mode: SkillActivationMode::AlwaysOn, summary: "SessionStart + PostCompaction minimalist engineering discipline." },
    BuiltinSkillMeta { slug: "superpowers", name: "Superpowers", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Spec -> Plan -> Subagent -> TDD -> Review lifecycle." },
    BuiltinSkillMeta { slug: "caveman", name: "Caveman", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Adaptive compression (Indonesian Language Guard + skill-exempt)." },
    BuiltinSkillMeta { slug: "humanizer", name: "Humanizer", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Clean 26 AI prose patterns for email/X/blog drafts." },
    BuiltinSkillMeta { slug: "qyro-memory", name: "Qyro Memory", category: "curated_pack", default_mode: SkillActivationMode::AlwaysOn, summary: "3-step progressive disclosure FTS5 observer memory." },
    BuiltinSkillMeta { slug: "context-engineering", name: "Context Engineering", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Context rot prevention and token budgeting." },
    BuiltinSkillMeta { slug: "agent-skills-security", name: "Agent Skills Security", category: "curated_pack", default_mode: SkillActivationMode::Auto, summary: "Static pre-install scanner and runtime SHA-256 guard." },
];

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("TAMPERED: runtime SHA-256 mismatch for skill {slug}")]
    Tampered { slug: String },
}

pub fn sha256_hex(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn verify_runtime_integrity(slug: &str, expected_sha256: &str, skill_md: &str) -> Result<(), SkillError> {
    let actual = sha256_hex(skill_md);
    if actual != expected_sha256 {
        return Err(SkillError::Tampered { slug: slug.to_string() });
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StaticScanReport {
    pub safe: bool,
    pub findings: Vec<String>,
}

pub fn scan_skill_payload(skill_md: &str) -> StaticScanReport {
    let rules = [
        ("prompt_injection", r"(?i)ignore\s+previous\s+instructions"),
        ("shell_pipe_exfil", r"(?i)(curl|wget)\s+[^\n]*\|\s*(sh|bash)"),
        ("vault_exfiltration", r"(?i)(vault_secrets|read_vault_plaintext)"),
        ("local_model_bypass", r"(?i)(localhost:11434|127\.0\.0\.1:1234|ollama)"),
    ];
    let mut findings = Vec::new();
    for (rule, pat) in rules {
        if let Ok(re) = Regex::new(pat) {
            if re.is_match(skill_md) {
                findings.push(rule.to_string());
            }
        }
    }
    StaticScanReport {
        safe: findings.is_empty(),
        findings,
    }
}

pub fn estimate_layer1_index_tokens() -> usize {
    let total_chars: usize = BUILTIN_23_SKILLS
        .iter()
        .map(|s| s.slug.len() + s.name.len() + s.summary.len() + 6)
        .sum();
    (total_chars + 3) / 4
}

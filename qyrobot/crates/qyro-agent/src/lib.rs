//! qyro-agent — 2-Layer Reviewer Agent (Layer 1 0ms deterministic + Layer 2 contextual policy)
//! and Interactive Draft Card state machine (PRD v1.7.0 §9.1, §9.3).

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewerDecision {
    Allow,
    Deny,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewerVerdict {
    pub decision: ReviewerDecision,
    pub layer: &'static str,
    pub reason: String,
}

pub fn evaluate_reviewer(tool: &str, target: &str, summary: &str) -> ReviewerVerdict {
    let combined = format!("{} {} {}", tool, target, summary).to_lowercase();

    if let Ok(hard_deny) = Regex::new(r"(rm\s+-rf\s+/|exfiltrate|dump\s+vault|localhost:11434|127\.0\.0\.1:1234)") {
        if hard_deny.is_match(&combined) {
            return ReviewerVerdict {
                decision: ReviewerDecision::Deny,
                layer: "deterministic_0ms",
                reason: "Blocked at Layer 1 (0 ms): violates hard security or Anti-Local-Model boundary.".to_string(),
            };
        }
    }

    if matches!(
        tool,
        "mem_search" | "load_skill" | "impeccable_audit" | "ui_ux_bm25" | "humanizer_pass" | "read_file"
    ) {
        return ReviewerVerdict {
            decision: ReviewerDecision::Allow,
            layer: "deterministic_0ms",
            reason: "Read-only deterministic tool automatically allowed at Layer 1 (0 ms).".to_string(),
        };
    }

    if let Ok(external_write) = Regex::new(r"(send_email|post_x|publish|deploy|delete|shell_exec|install_untrusted_skill)") {
        if external_write.is_match(&combined) {
            return ReviewerVerdict {
                decision: ReviewerDecision::Ask,
                layer: "contextual_policy",
                reason: "External write or privileged action requires human approval via Action Queue.".to_string(),
            };
        }
    }

    ReviewerVerdict {
        decision: ReviewerDecision::Allow,
        layer: "contextual_policy",
        reason: "Internal workspace action passed Reviewer Agent checks.".to_string(),
    }
}

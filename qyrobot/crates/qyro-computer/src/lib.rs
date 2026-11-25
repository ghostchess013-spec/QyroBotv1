//! qyro-computer — Universal Computer Use HAL (HeadlessSandboxBackend AMD/Ampere,
//! LocalDesktopBackend cua-driver, EmbeddedBrowserBackend, RemoteNodeBackend),
//! Dual-Engine Browser (Chromium CDP + Camoufox fallback), cgroups v2 Watchdog & Auto-Sleep (PRD §12).

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComputerBackend {
    HeadlessSandbox,
    LocalDesktop,
    EmbeddedBrowser,
    RemoteNode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserEngine {
    Chromium,
    Camoufox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxState {
    Idle,
    Running,
    Takeover,
    Sleeping,
    Recovering,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CgroupsWatchdogPolicy {
    pub ram_limit_mb: u32,
    pub cpu_quota_pct: u8,
    pub max_tabs: usize,
    pub idle_sleep_min: u32,
    pub heartbeat_interval_sec: u32,
}

impl Default for CgroupsWatchdogPolicy {
    fn default() -> Self {
        Self {
            ram_limit_mb: 1536,
            cpu_quota_pct: 75,
            max_tabs: 6,
            idle_sleep_min: 15,
            heartbeat_interval_sec: 15,
        }
    }
}

#[derive(Debug, Error)]
pub enum ComputerError {
    #[error("cgroups watchdog max tab limit reached ({0})")]
    MaxTabsExceeded(usize),
}

/// Resolves effective browser engine with clean fallback from Camoufox to Chromium when binary is absent.
pub fn resolve_browser_engine(requested: BrowserEngine, camoufox_detected: bool) -> BrowserEngine {
    match requested {
        BrowserEngine::Camoufox if !camoufox_detected => BrowserEngine::Chromium,
        other => other,
    }
}

pub fn enforce_tab_limit(current_tabs: usize, policy: &CgroupsWatchdogPolicy) -> Result<(), ComputerError> {
    if current_tabs >= policy.max_tabs {
        return Err(ComputerError::MaxTabsExceeded(policy.max_tabs));
    }
    Ok(())
}

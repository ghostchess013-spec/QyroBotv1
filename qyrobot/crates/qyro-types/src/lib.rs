//! Core domain types for QyroBot (PRD v1.7.0).

use serde::{Deserialize, Serialize};

pub const UNSET_SENTINEL: &str = "UNSET";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvatarShape {
    Circle,
    Pebble,
    Squircle,
    Capsule,
    Triangle,
    Hexagon,
    Cloud,
    Droplet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvatarColor {
    Ink,
    Brown,
    Red,
    Orange,
    Amber,
    Green,
    Turquoise,
    Blue,
    Purple,
    Pink,
    Grey,
    Cream,
}

impl AvatarColor {
    pub const fn body_hex(self) -> &'static str {
        match self {
            Self::Ink => "#0a0a0c",
            Self::Brown => "#8b5e3c",
            Self::Red => "#e8483f",
            Self::Orange => "#f08a24",
            Self::Amber => "#f0b429",
            Self::Green => "#3ecf8e",
            Self::Turquoise => "#2fbfa0",
            Self::Blue => "#3b93f0",
            Self::Purple => "#8b5cf6",
            Self::Pink => "#e152b0",
            Self::Grey => "#a3a3a3",
            Self::Cream => "#f1efe9",
        }
    }

    pub const fn eye_hex(self) -> &'static str {
        match self {
            Self::Amber | Self::Green | Self::Turquoise | Self::Grey | Self::Cream => "#0a0a0c",
            _ => "#ffffff",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvatarExpression {
    Neutral,
    Attentive,
    Surprised,
    Excited,
    Happy,
    Laughing,
    Angry,
    Sad,
    Scared,
    Suspicious,
    Confused,
    Curious,
    Proud,
    Shy,
    Unimpressed,
    Sleepy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AvatarAnimation {
    Idle,
    Thinking,
    Wink,
    WideEyes,
    Alert,
    Notification,
    Exclamation,
    Sleep,
    Egg,
    Hexagon,
    Play,
    Orbit,
    Swirl,
    Burst,
    Comet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkingMood {
    Idle,
    Thinking,
    Working,
    Waiting,
    Blocked,
    Done,
}

impl WorkingMood {
    pub const fn default_animation(self) -> AvatarAnimation {
        match self {
            Self::Idle => AvatarAnimation::Idle,
            Self::Thinking => AvatarAnimation::Thinking,
            Self::Working => AvatarAnimation::Orbit,
            Self::Waiting => AvatarAnimation::Notification,
            Self::Blocked => AvatarAnimation::Alert,
            Self::Done => AvatarAnimation::Burst,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotAvatarSpec {
    pub kind: String,
    pub shape: AvatarShape,
    pub color: AvatarColor,
    pub expression: AvatarExpression,
    pub animation_override: Option<AvatarAnimation>,
    pub asset_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub event_id: i64,
    pub timestamp: String,
    pub kind: String,
    pub bot_id: Option<String>,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingStrategy {
    Priority,
    Weighted,
    RoundRobin,
    ContextRelay,
    FillFirst,
    P2c,
    Random,
    LeastUsed,
    CostOptimized,
    ResetAware,
    ResetWindow,
    Headroom,
    QuotaWeighted,
    StrictRandom,
    Auto,
    Lkgp,
    ContextOptimized,
    CacheOptimized,
    Fusion,
    Pipeline,
}

impl RoutingStrategy {
    pub const ALL: [Self; 20] = [
        Self::Priority,
        Self::Weighted,
        Self::RoundRobin,
        Self::ContextRelay,
        Self::FillFirst,
        Self::P2c,
        Self::Random,
        Self::LeastUsed,
        Self::CostOptimized,
        Self::ResetAware,
        Self::ResetWindow,
        Self::Headroom,
        Self::QuotaWeighted,
        Self::StrictRandom,
        Self::Auto,
        Self::Lkgp,
        Self::ContextOptimized,
        Self::CacheOptimized,
        Self::Fusion,
        Self::Pipeline,
    ];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderTier {
    Free,
    OauthSub,
    Paid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Modality {
    Text,
    Code,
    Vision,
    Image,
    Video,
    Tts,
    Stt,
    Audio,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avatar_color_contrast_matches_prd() {
        assert_eq!(AvatarColor::Ink.body_hex(), "#0a0a0c");
        assert_eq!(AvatarColor::Ink.eye_hex(), "#ffffff");
        assert_eq!(AvatarColor::Amber.body_hex(), "#f0b429");
        assert_eq!(AvatarColor::Amber.eye_hex(), "#0a0a0c");
        assert_eq!(RoutingStrategy::ALL.len(), 20);
    }
}

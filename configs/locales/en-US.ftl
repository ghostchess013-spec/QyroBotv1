# QyroBot Fluent Localization — English (en-US)
app-name = QyroBot
app-phase = Phase 1 Core
nav-overview = Overview & Storage
nav-router = OmniRoute Cloud Router
nav-compression = RTK + Caveman Compression
nav-vault = Write-Only Vault
nav-memory = Observer Memory
nav-backup = Backup & Storage GC

status-free-only-on = Free-Tier-Only Mode Active
status-free-only-off = Multi-Tier Mode (Free + Paid)
status-local-guard = Anti-Local-Model Guard Active
status-configured = Configured (Write-Only)
status-unset = UNSET

err-local-endpoint-blocked = Local AI endpoint hard-blocked by Anti-Local-Model Guard: { $reason }
err-voxcpm-unset = VoxCPM2 Cloud endpoint is UNSET. Configure a remote HTTPS vLLM-Omni server URL first.
err-free-quota-exhausted = Free-tier quota for modality { $modality } is exhausted. Earliest reset at { $resetAt }. Free-Tier-Only Mode prevents silent fallback to paid keys.
err-vault-decrypt-failed = Vault decryption failed: ciphertext tampered or key mismatch.
err-backup-invalid = Invalid .qyrobak snapshot archive or wrong passphrase.

action-queue-title = Needs Attention
action-queue-empty = No pending items. All bots are operating normally.
action-approve = Approve
action-deny = Deny

event-log-title = Real-Time Event Log (last_event_id Resume)
vault-title = Write-Only Encrypted Vault
vault-subtitle = Secrets are encrypted with ChaCha20-Poly1305. The UI only ever receives configured status and SHA-256 fingerprint.
memory-title = Cross-Session Observer Memory
memory-subtitle = <private> tags are stripped before storage and FTS5 indexing. Search follows 3-step Progressive Disclosure.
backup-title = Encrypted Snapshot & Garbage Collector
backup-subtitle = Cross-architecture portable format (AMD x86_64 <-> Ampere ARM64) with pinned Library item protection.
router-title = Cloud-Only OmniRoute Engine
router-subtitle = 20 routing strategies, auto/* virtual combos, and strict anti-local-model enforcement.
compression-title = Stacked RTK -> Caveman Compression
compression-subtitle = Language Guard preserves Indonesian prose and negations while bypassing System Prompts and active SKILL.md blocks.

timezone-wib = WIB (Asia/Jakarta, UTC+7)
timezone-wita = WITA (Asia/Makassar, UTC+8)
timezone-wit = WIT (Asia/Jayapura, UTC+9)

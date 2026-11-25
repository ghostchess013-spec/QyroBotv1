# QyroBot Fluent Localization — Bahasa Indonesia (id-ID)
app-name = QyroBot
app-phase = Inti Fase 1
nav-overview = Ringkasan & Penyimpanan
nav-router = Router Cloud OmniRoute
nav-compression = Kompresi RTK + Caveman
nav-vault = Vault Write-Only
nav-memory = Memori Observer
nav-backup = Backup & GC Penyimpanan

status-free-only-on = Mode Free-Tier-Only Aktif
status-free-only-off = Mode Multi-Tier (Gratis + Berbayar)
status-local-guard = Penjaga Anti-Model-Lokal Aktif
status-configured = Terkonfigurasi (Write-Only)
status-unset = BELUM DIATUR

err-local-endpoint-blocked = Endpoint AI lokal ditolak keras oleh Anti-Local-Model Guard: { $reason }
err-voxcpm-unset = Endpoint VoxCPM2 Cloud masih UNSET. Masukkan URL HTTPS server remote vLLM-Omni terlebih dahulu.
err-free-quota-exhausted = Kuota gratis untuk modalitas { $modality } sedang habis. Reset tercepat pada { $resetAt }. Mode Free-Tier-Only mencegah penggunaan kunci berbayar secara diam-diam.
err-vault-decrypt-failed = Dekripsi Vault gagal: ciphertext rusak atau kunci tidak cocok.
err-backup-invalid = Arsip backup .qyrobak tidak valid atau passphrase salah.

action-queue-title = Perlu Perhatian
action-queue-empty = Tidak ada permintaan tertunda. Semua bot berjalan normal.
action-approve = Setujui
action-deny = Tolak

event-log-title = Log Event Real-Time (Resume last_event_id)
vault-title = Vault Terenkripsi Write-Only
vault-subtitle = Rahasia dienkripsi dengan ChaCha20-Poly1305. Antarmuka hanya menerima status terkonfigurasi dan sidik jari SHA-256.
memory-title = Memori Observer Lintas Sesi
memory-subtitle = Tag <private> dihapus sebelum penyimpanan dan pengindeksan FTS5. Pencarian mengikuti 3 langkah Progressive Disclosure.
backup-title = Snapshot Terenkripsi & Garbage Collector
backup-subtitle = Format portabel lintas arsitektur (AMD x86_64 <-> Ampere ARM64) dengan proteksi item Library yang di-pin.
router-title = Mesin OmniRoute Cloud-Only
router-subtitle = 20 strategi routing, virtual combos auto/*, dan penjaga keras anti model lokal.
compression-title = Kompresi Bertingkat RTK -> Caveman
compression-subtitle = Penjaga Bahasa Indonesia mempertahankan negasi dan melewati System Prompt serta SKILL.md aktif.

timezone-wib = WIB (Asia/Jakarta, UTC+7)
timezone-wita = WITA (Asia/Makassar, UTC+8)
timezone-wit = WIT (Asia/Jayapura, UTC+9)

# Product Requirements Document (PRD): QyroBot

- **Nama Proyek:** QyroBot
- **Versi Dokumen:** 1.7.0 (**Final Master Spec** — 100% Paritas Sistem Ikon/Avatar Prosedural Grok Bot + Design Tokens & Onboarding + Native Android + Bahasa Indonesia + Skill Auto-Activation + Permanent Core Multimodal Toolset & Dual-Engine Browser + 23 Built-in Skills/Plugins + Free-Tier-Only Guard + 6 Infrastruktur Produksi)
- **Status:** Final Master Spec — Siap Eksekusi Fase 1
- **Arsitektur Inti:** Rust-first (Workspace Modular, Edition 2024) + Tauri v2 (Desktop & Android Native) + React/TypeScript/Tailwind (Adaptive UI Shell untuk Desktop, Tablet, Android Native, dan Web/PWA)
- **Dukungan Bahasa:** First-Class **Bahasa Indonesia (`id-ID`)** & **English (`en-US`)** di seluruh UI, Voice/Dictation, Parser Routine, Notifikasi Push, Trust Review, Kartu Media, dan Kompresi Konteks
- **Target Platform:** Linux VPS AMD (`x86_64`), Linux VPS Ampere/Graviton (`aarch64`), Windows 10/11 (`x64`/`ARM64`), macOS (`Apple Silicon`/`Intel`), Linux Desktop (`X11` & `Wayland`, `x64`/`ARM64`), **Android 9+ Native (`.apk`/`.aab` untuk `arm64-v8a` & `x86_64`)**, dan Web/PWA (`iOS`/Browser)
- **Kebijakan Model AI:** **100% Cloud/Remote API & OAuth via Native Rust OmniRoute Engine untuk seluruh modalitas (Text, Vision, Image, Video, TTS/VoxCPM2 Remote, STT) dengan default `Free-Tier-Only Mode` — Blokir Keras Model AI Lokal**

---

## 1. Ringkasan Eksekutif & Keputusan Arsitektur

**QyroBot** adalah platform *proactive multi-agent AI teammate* lintas platform, 100% gratis tanpa paywall di sisi aplikasi, dan self-hostable yang mereplikasi 100% pengalaman UX, tata letak Desktop 3-kolom, tata letak Mobile Android single-stack, **sistem ikon/avatar karakter prosedural Grok Bot (8 bentuk, 12 warna hex, 16 ekspresi, 15 state animasi, 6 working moods, dan 1:1 Bot Accent Color)**, shared persistent computer, Reviewer Agent approval, Write-Only Vault, Secure Form, Interactive Draft Cards, Skills (instalasi paket + aktivasi otomatis *Progressive Disclosure*), Routines, dan komposabilitas **GrokBot**, sekaligus melampauinya dengan efisiensi memori Rust, kebebasan 375+ provider cloud (150+ free tier), **Permanent Core Toolset multimodal lengkap**, **23 Permanent Built-in Skills & Curated Plugins**, kompresi **RTK + Caveman** built-in, dukungan penuh ARM64/Wayland, integrasi Android native, lokalisasi penuh Bahasa Indonesia (`id-ID`), serta akses X/Twitter gratis melalui sesi otentikasi mandiri (*self-auth*).

**Keputusan Arsitektur Utama:** Inti backend, router AI multimodal, orkestrator multi-agent, observer memory engine, vault, skill package manager, permanent core toolset, scheduler, sandbox watchdog, backup engine, dan computer-use daemon dibangun sepenuhnya dalam **Rust (Cargo workspace modular)** untuk menghasilkan binary ringan (~30–60 MB RAM idle di VPS) dan kompilasi lintas arsitektur (`x86_64` & `aarch64`), dipasangkan dengan **Tauri v2 + React/TypeScript/Tailwind Adaptive UI Shell** sehingga satu basis kode UI melayani Desktop Native, **Android Native (`.apk`/`.aab`)** lewat plugin Kotlin/JNI tipis, serta Web/PWA untuk akses 24/7 ke server VPS.

---

## 2. Teardown Forensik Referensi Utama (Fakta Terverifikasi)

Seluruh spesifikasi QyroBot berakar dari bedah teknis terhadap dokumentasi resmi Grok Bot (`overview`, `bots`, `mobile`, `settings-and-notifications`), rekonstruksi anatomi avatar Grok Bot (`grokbotexplained.app/avatar-system` & proyek open-source SVG `bloub`), video walkthrough Matt Palmer, OpenBot, OpenMausBot, OmniRoute, serta 9 repositori skill/plugin kurasi.

### 2.1 Dokumentasi Resmi Grok Bot (`docs.x.ai/grok-bot/*`) & Sistem Avatar Prosedural
- **Konsep Inti:** *Proactive AI teammate* yang berbagi **1 cloud Linux VM persisten** (`bot@cloud`) lengkap dengan terminal, filesystem, dan sesi login browser yang terbagi otomatis ke semua bot di mesin yang sama.
- **Tata Letak Desktop 3-Kolom:** Sidebar Kiri (Primary Bot + daftar Bot spesialis dengan subjudul status real-time + tombol `+` `Cmd/Ctrl+N` + `Connect apps` / `Bot templates` / `Settings`), Pane Tengah (Chat, Voice Input `Cmd/Ctrl+D`, Live Voice Chat, kartu inline `Computer Working`, `Approval`, `Secure Form`, dan `Draft Editable`), dan Pane Kanan (Inspector 3-Tab: `Details`, `Library`, `Computer`).
- **Sistem Ikon / Avatar Prosedural Grok Bot (Terverifikasi):**
  - Filosofi visual: *"One simple shape, two eyes"* — setiap bot adalah karakter geometris minimalis berwajah dua mata yang merespons aktivitas secara live.
  - **8 Bentuk Dasar:** `Circle`, `Pebble`, `Squircle`, `Capsule`, `Triangle`, `Hexagon`, `Cloud`, `Droplet` (+ slot musiman seperti `Pumpkin`).
  - **12 Warna Palet Resmi:** `Ink` (`#0a0a0c`), `Brown` (`#8b5e3c`), `Red` (`#e8483f`), `Orange` (`#f08a24`), `Amber` (`#f0b429`), `Green` (`#3ecf8e`), `Turquoise` (`#2fbfa0`), `Blue` (`#3b93f0`), `Purple` (`#8b5cf6`), `Pink` (`#e152b0`), `Grey` (`#a3a3a3`), `Cream` (`#f1efe9`).
  - **16 Ekspresi Wajah:** `Neutral`, `Attentive`, `Surprised`, `Excited`, `Happy`, `Laughing`, `Angry`, `Sad`, `Scared`, `Suspicious`, `Confused`, `Curious`, `Proud`, `Shy`, `Unimpressed`, `Sleepy`.
  - **15 State Animasi:** `Idle`, `Thinking`, `Wink`, `Wide eyes`, `Alert`, `Notification`, `Exclamation`, `Sleep`, `Egg`, `Hexagon`, `Play`, `Orbit`, `Swirl`, `Burst`, `Comet`.
  - **6 Working Moods:** `Idle`, `Working` (*Orbit* — cincin berputar), `Waiting` / `Blocked` (*Notification* — titik biru / *Alert* / *Exclamation*), `Thinking` (*Thinking* — tiga titik), dan `Done` (*Burst* / *Wink*).
  - **Bot Accent Color (`Settings -> General`):** Secara default, warna avatar tiap bot menjadi warna aksen pada pesan dan kartu 1:1 bot tersebut (`Bot color`), dengan opsi menggantinya ke monokrom (`Black`).
  - **Avatar Studio 3-Tab:** `Bot` (shape + expression + color + Randomize/Reset), `Generate` (dari teks), `Upload` (<= 25 MB).
- **Tata Letak & Fitur Resmi Android (`ai.x.grok.bot`, Android 9+):** Single-stack mobile (`Bot List` -> `Chat` -> `Bot Profile` -> `Computer`), Pinned Voice Call bar, `Routines` (`Active`, `swipe-to-delete`, `Edit routine`), `Library` kronologis (`Today`, `This week`, `Older`), `Take over` -> `I'm done`, Share Sheet, `Connect apps -> Android` (Calendar non-berulang, Contacts read-only, Location, Alarms/Timers <= 24 jam), kartu izin 5 menit, dan `Manage your devices`.

### 2.2 Video Walkthrough (`youtu.be/jwogmXNt7o4`), OpenBot, OpenMausBot & OmniRoute
- **Matt Palmer Walkthrough:** Remote Desktop persisten, **Reviewer Agent** terpisah (Allow/Deny/Ask), komposabilitas bot-to-bot (*poke* & Group Chat Round-Robin), *Personal Software as Agents*, dan *Outer Loop vs. Inner Loop*.
- **OpenBot & OpenMausBot:** Local-first workspace, embedded browser `browser-takeover-requested`, custom hex theme, **Write-Only Secrets**, **Channels**, **Fast Auto-Routing (Jev)**, **Portable Team Packages (BotMRR)**, sidecar Rust `cua-driver`. QyroBot memperbaiki `danger-full-access`, mendukung penuh Wayland & Linux ARM64, dan mengunci badge mahkota Chief of Staff ke `bot.is_chief_of_staff == true`.
- **OmniRoute (`cheaper-inference/OmniRoute`):** Gateway multi-protokol untuk **375+ provider cloud (150+ free tier)** & 1.400+ model, Modular Provider Registry, `MODELS_CATALOG_PREFIX_MODE`, Multi-Auth Pool, Live Quota Poller (`>= 60s`), Virtual `auto/*` & Persisted Combos, **20 Strategi Routing**, Bi-Directional SSE Stream Translator, dan **Stacked Compression (`RTK` -> `Caveman`)** hemat 78,4%–94,6% token.

### 2.3 Teardown 9 Repositori Permanent Skills & Plugins Kurasi
1. **`OpenBMB/VoxCPM` (VoxCPM2):** TTS *tokenizer-free* 30 bahasa (termasuk Indonesian), 48 kHz, Voice Design & Cloning -> di QyroBot wajib berjalan **hanya lewat Remote Cloud `vLLM-Omni` OpenAI-compatible API** (nol eksekusi lokal).
2. **`obra/superpowers` (v7.0.2):** Metodologi SDLC otomatis (`brainstorming` -> spec -> plan -> Red/Green TDD -> subagent review) + hook `SessionStart`/`PostCompaction`.
3. **`DietrichGebert/ponytail` (v5.3.3):** Senior engineer minimalis (reuse kode eksisting tanpa pernah memangkas validasi, keamanan, error handling, a11y, atau test logika berisiko) + `/ponytail*` + **Band & Board**.
4. **`nextlevelbuilder/ui-ux-pro-max-skill` (v2.0):** BM25 Design System Generator (194 industri/palet, 80 gaya UI, 34 landing patterns, 74 font pairings, 25 chart types, 22 stacks).
5. **`pbakaus/impeccable`:** 24 perintah desain terarah + **62-rule Rust deterministic anti-AI-slop detector (0 token LLM)** + mode `live`.
6. **`blader/humanizer` (v4.0.0):** Penulisan ulang 26 pola prosa AI + Voice Matching + adaptasi prosa Bahasa Indonesia.
7. **`thedotmack/claude-mem`:** Persistent cross-session memory via Observer Agent paralel + SQLite FTS5 + 3-step `mem-search` + `<private>` filter + `My Work / Memory Viewer` (native Rust di `qyro-memory`).
8. **`addyosmani/agent-skills` (v0.6.17):** 26 production engineering skills + 10 SDLC slash commands (`/spec`..`/ship`) + `references/` dibundel utuh.
9. **`morluto/rea`:** Permanent MCP server & investigation skill berbasis bukti untuk native binaries (bridge Ghidra/IDA/Hopper/Kuna lokal), JS/Electron ASAR, .NET, APK, firmware, dan web.

---

## 3. Matriks Paritas & Keunggulan QyroBot

| Dimensi | GrokBot (x.ai) | OpenBot / OpenMausBot | **QyroBot (Final Master Spec v1.7)** |
| :--- | :--- | :--- | :--- |
| **Biaya & Kuota** | Langganan berbayar xAI | Open-source tanpa free-tier guard | **100% Gratis Tanpa Paywall + `Free-Tier-Only Mode` default** (150+ cloud free tier) |
| **Ikon/Avatar Bot & Visual UI** | 8 shape, 12 warna, 16 ekspresi, 15 animasi, Bot Accent Color | Avatar statis sederhana | **100% Paritas Karakter Prosedural SVG** (8 shape, 12 hex eksak, 16 ekspresi, 15 animasi, 6 mood, Dynamic 1:1 Bot Accent Color, Design Tokens Dark/Light baku) |
| **Core Runtime & Infra** | Proprietary Cloud SaaS | Electron/Node.js (berat, tanpa ARM64/Wayland) | **100% Rust Core** + Tauri v2 + QR Ed25519 Pairing + Resource Watchdog cgroups + Encrypted Backup AMD<->Ampere + Event Resume `last_event_id` |
| **Model AI & Kompresi** | Ekosistem xAI saja | CLI lokal / router parsial | **Native Rust OmniRoute Engine:** 375+ cloud providers, 20 strategi, multimodal + VoxCPM2 Remote, **RTK+Caveman** (language-aware). **Nol model lokal.** |
| **Permanent Core Tools & Skills** | Browser, terminal, skill manual | Terminal & browser lokal | **Full Multimodal Toolset** (Image/Video/TTS/STT/Vision + **Chromium & Camoufox** + PTY + Impeccable 62-rule Rust + REA MCP) + **23 Permanent Built-in Skills/Plugins** |
| **Android & Bahasa Indonesia** | Android terkunci xAI; UI Inggris | Tanpa Android native | **Native Android 9+ (`.apk`/`.aab`)** 100% paritas + **First-Class `id-ID` & `en-US`** |
| **Akses X / Twitter** | Langganan X + batas region `@bot` | Tidak ada | **Self-Auth Gratis Selamanya** (Chromium/Camoufox + Dynamic GraphQL + Anti-Ban Shield + Bookmark/Self-DM/Mention) |

---

## 4. Spesifikasi Visual 100% Paritas Grok Bot: Sistem Ikon/Avatar Prosedural, Design Tokens, Frontend & Onboarding

### 4.1 Spesifikasi Sistem Ikon / Avatar Karakter Prosedural (100% Paritas Grok Bot)

Komponen `<QyroBotAvatar />` di-render sebagai **Pure Procedural SVG (viewBox `0 0 64 64`)** dengan animasi CSS/SMIL 60fps berbasis hardware acceleration sehingga identik tajam di semua DPI (Desktop Retina, Windows HiDPI, Android `xxxhdpi`, Notification Icon, Favicon, dan Export PNG).

#### A. Anatomi Karakter (*"One Simple Shape, Two Eyes"*)
Setiap avatar terdiri dari 4 lapisan terpisah yang dapat dikombinasikan bebas (`8 × 12 × 16 = 1.536` kombinasi dasar × `15` state animasi):
1. **Layer 1 — Body Shape (`8` Bentuk Resmi + Slot Musiman):**
   - `circle`: Lingkaran sempurna (`r=24`, pusat `32,32`).
   - `pebble`: Bentuk batu organik asimetris halus (bezier tertutup lembut, khas karakter utama Grok Bot).
   - `squircle`: Persegi superellipse sudut halus (`rx=14`).
   - `capsule`: Pil vertikal/bulat memanjang dengan kurva lembut.
   - `triangle`: Segitiga sama sisi bersudut tumpul/membulat (`rounded-join`).
   - `hexagon`: Heksagon beraturan bersudut membulat.
   - `cloud`: Siluet awan 5-lobus simetris lembut.
   - `droplet`: Tetesan air membulat dengan ujung atas halus.
   - *(Opsional Musiman / Ekstensi):* `pumpkin`, `star`, dsb. dapat diaktifkan tanpa mengubah 8 bentuk inti.
2. **Layer 2 — Body Colour (`12` Warna Palet Resmi Eksak + Kontras Mata Otomatis):**

| Nama Warna | Kode Hex Body | Warna Mata & Mulut (Auto-Contrast) | Tint Kartu 1:1 (Dark / Light) |
| :--- | :--- | :--- | :--- |
| **`Ink`** | `#0a0a0c` | `#ffffff` (Putih bersih) | `#18181b` / `#f4f4f5` |
| **`Brown`** | `#8b5e3c` | `#ffffff` | `rgba(139, 94, 60, 0.16)` |
| **`Red`** | `#e8483f` | `#ffffff` | `rgba(232, 72, 63, 0.15)` |
| **`Orange`** | `#f08a24` | `#ffffff` | `rgba(240, 138, 36, 0.15)` |
| **`Amber`** | `#f0b429` | `#0a0a0c` (Kontras gelap) | `rgba(240, 180, 41, 0.16)` |
| **`Green`** | `#3ecf8e` | `#0a0a0c` | `rgba(62, 207, 142, 0.15)` |
| **`Turquoise`** | `#2fbfa0` | `#0a0a0c` | `rgba(47, 191, 160, 0.15)` |
| **`Blue`** | `#3b93f0` | `#ffffff` | `rgba(59, 147, 240, 0.15)` |
| **`Purple`** | `#8b5cf6` | `#ffffff` | `rgba(139, 92, 246, 0.15)` |
| **`Pink`** | `#e152b0` | `#ffffff` | `rgba(225, 82, 176, 0.15)` |
| **`Grey`** | `#a3a3a3` | `#0a0a0c` | `rgba(163, 163, 163, 0.16)` |
| **`Cream`** | `#f1efe9` | `#0a0a0c` | `rgba(241, 239, 233, 0.14)` |

3. **Layer 3 — Facial Expression (`16` Ekspresi Dua Mata Resmi):**
   `Neutral` (dua oval vertikal tenang), `Attentive` (mata sedikit membesar & fokus ke atas), `Surprised` (lingkaran penuh tinggi), `Excited` (lengkungan ceria lebar), `Happy` (dua lengkungan `^ ^` lembut), `Laughing` (lengkungan tertutup tebal), `Angry` (alis miring tajam ke dalam), `Sad` (alis miring turun keluar), `Scared` (mata oval besar dengan jarak rapat), `Suspicious` (kelopak atas datar menyipit), `Confused` (satu mata besar, satu mata kecil asimetris), `Curious` (dua mata miring menatap ke samping), `Proud` (kelopak bawah melengkung percaya diri), `Shy` (mata kecil merendah dengan titik pipi halus), `Unimpressed` (dua garis horizontal datar), `Sleepy` (dua lengkungan setengah tertutup rendah).
4. **Layer 4 — Animation Overlay & State Engine (`15` Animasi Resmi <-> `6` Working Moods):**
   - **15 Animation States:** `Idle`, `Thinking`, `Wink`, `Wide eyes`, `Alert`, `Notification`, `Exclamation`, `Sleep`, `Egg`, `Hexagon`, `Play`, `Orbit`, `Swirl`, `Burst`, `Comet`.
   - **Pemetaan Otomatis 6 Working Moods ke Animasi Real-Time:**
     - `Idle` -> **`Idle`** (berkedip halus natural tiap 4–7 detik; tidak ada yang perlu perhatian user).
     - `Thinking` -> **`Thinking`** (tiga titik bergerak lembut / mata scanning halus saat LLM memproses).
     - `Working` -> **`Orbit`** atau **`Swirl`** (cincin orbit berputar mengelilingi body saat menjalankan browser, terminal, routine, atau render video).
     - `Waiting` -> **`Notification`** (muncul titik indikator biru `#3b93f0` di kanan atas — menunggu jawaban/approval ringan).
     - `Blocked` -> **`Alert`** / **`Exclamation`** (tanda seru / getar lembut — butuh `Take Control`, `Secure Form`, atau circuit breaker X).
     - `Done` -> **`Burst`** / **`Wink`** / **`Comet`** (transisi singkat 1.8 detik saat tugas panjang selesai lalu kembali ke `Idle`).
   - **Badge Mahkota Chief of Staff:** Ikon mahkota emas (`#f0b429`) di sudut kanan atas/kiri atas avatar, terikat permanen pada `bot.is_chief_of_staff == true` di posisi sidebar mana pun.
   - **3-Tab Avatar Studio (Identik Grok Bot):**
     - Tab 1 **`Bot`**: Picker 8 Shape + 16 Expression + 12 Colour + live preview 3 mood (`Idle` / `Thinking` / `Needs you`) + tombol **`Randomize`** & **`Reset`**.
     - Tab 2 **`Generate`**: Deskripsi teks (`id-ID`/`en-US`) -> cloud image gen (`auto/image`) -> 4 kandidat -> `Set Avatar`.
     - Tab 3 **`Upload`**: Drag/drop, Browse, atau Galeri Android (`PNG`/`JPEG`/`WebP`/`SVG` `<= 25 MB`) + cropper lingkaran/squircle.

### 4.2 Design Tokens Baku (Dark & Light Mode + Dynamic Bot Accent Color)

Untuk menjamin konsistensi visual 100% mirip estetika minimalis bersih Grok Bot (bukan UI AI generik):
- **Mode Tampilan:** `System` (default), `Dark` (Obsidian minimal), `Light` (Alabaster bersih), plus *Custom Hex Theme override* (`#rrggbb`/`#rrggbbaa`).
- **Bot Accent Color Setting (Persis `docs.x.ai/grok-bot/settings-and-notifications`):**
  - `Bot color` (default): Pesan user, border kartu interaktif, tombol utama, dan highlight aktif di chat 1:1 otomatis memakai warna avatar bot yang sedang dibuka (dengan kalkulasi kontras WCAG AA `>= 4.5:1`).
  - `Black`: Seluruh chat 1:1 tetap memakai aksen monokrom netral.
- **Token Warna Inti:**

| Token CSS | Dark Mode (Obsidian Minimal) | Light Mode (Clean Alabaster) | Kegunaan |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#09090b` | `#ffffff` | Latar utama chat pane |
| `--bg-sidebar` | `#111114` | `#f7f7f8` | Latar sidebar kiri & inspector kanan |
| `--bg-surface` | `#18181c` | `#f2f2f5` | Kartu approval, draft card, composer |
| `--bg-surface-hover` | `#222228` | `#e9e9ee` | Hover item sidebar & tombol sekunder |
| `--border-subtle` | `#27272e` | `#e4e4e9` | Garis pemisah 1px antar pane & kartu |
| `--text-primary` | `#f4f4f6` | `#0a0a0c` | Judul, nama bot, isi pesan |
| `--text-secondary` | `#9a9aa6` | `#62626e` | Subjudul status live, timestamp, metadata |
| `--status-attention` | `#3b93f0` | `#2563eb` | Dot notifikasi & badge unread |
| `--status-warning` | `#f0b429` | `#d97706` | Waiting Approval & mahkota Chief of Staff |
| `--status-danger` | `#e8483f` | `#dc2626` | Error, Deny, Circuit Breaker |
| `--status-success` | `#3ecf8e` | `#16a34a` | Succeeded, Verified SHA-256, Free Tier OK |

- **Tipografi & Geometri:** Font UI `Inter` / system sans (`SF Pro` macOS, `Segoe UI Variable` Windows, `Roboto` Android), monospace `JetBrains Mono` / `SF Mono`. Border radius kartu `16px`, bubble/draft card `14px`, tombol/chip `10px`, avatar sidebar `36×36px`, avatar header `32×32px`, avatar studio preview `96×96px`.

### 4.3 Tata Letak Desktop 3-Kolom, Interactive Draft Cards & Unified Action Queue
1. **Sidebar Kiri (260px Collapsible):**
   - Header: Logo QyroBot + tombol `+` (`Cmd/Ctrl+N`: `Create a Bot`, `Create Channel`, `Create Group Chat`, `Install Skill`, `Import Team`).
   - **Unified Action Queue (`Perlu Perhatian` / `Needs Attention`):** Baris pintar di bagian atas sidebar (hanya muncul atau menampilkan counter merah/amber bila ada item tertunda) yang mengumpulkan seluruh **Approval**, **Secure Form**, **Take Control**, **Skill Trust Review**, dan **Device Permission** dari semua bot di satu inbox terpadu.
   - **Pinned Primary Slot (`Chief of Staff`):** Dengan badge mahkota emas permanen + avatar prosedural live.
   - **Daftar Bot & Section + Channels/Group Chats:** Subjudul status 1 baris real-time + avatar prosedural yang beranimasi sesuai 6 working moods.
   - **Footer Sidebar:** `Connect Apps & MCP`, `AI Router (OmniRoute + FREE Guard)`, `Skills & Templates (23 Built-in)`, `Memory Viewer & My Work`, `Vault & Approvals`, `Settings`.
2. **Pane Tengah (Conversation & Execution Stage):**
   - Top Bar: Avatar live + Nama + Label + pill combo (`auto/coding` + badge `FREE`) + tombol `Open Computer`, `Voice Call`, `...`.
   - **Interactive Inline Draft Cards (Desktop & Android):** Setiap draf Email, pesan Slack, atau Tweet/Balasan X ditampilkan sebagai kartu terstruktur dengan **editor teks inline langsung di dalam chat** (termasuk field `To`/`Subject` untuk email, atau hitungan karakter & preview media untuk X) + tombol `Approve & Send`, `Save Draft`, `Revise with Humanizer`, `Discard`. Suntingan user otomatis dicatat `qyro-memory` agar gaya penulisan bot semakin cocok di kesempatan berikutnya.
   - **Active Skill Chip**, **Inline Multimodal Media Cards** (Image, Async Video, Audio/VoxCPM2), **Inline Computer Card**, **Approval / Skill Trust Review Card**, **Secure Form Card**, **Bot Delegation Chip**.
   - **Qyro Telemetry Band (Opsional di atas Composer — ala Ponytail):** Hemat token `RTK+Caveman`, biaya (`$0.00 Free`), rasio reuse, status test, dan shortcut `/ponytail*` & `/impeccable`.
   - **Composer Bawah:** Input multiline, attachment drag-and-drop, autocomplete Slash Commands, Voice Input (`Cmd/Ctrl+D`), Live Voice Chat.
3. **Pane Kanan (Inspector 3-Tab):** `Details` (Avatar Studio, Routing/Modality, Coding/Design Pack Profile, Core Tools & Browser Engine, Routines, MCP), `Library` (kronologis `Hari ini`/`Minggu ini`/`Lebih lama`, sub-tab `Skills` + `Pasang Skill`, sub-tab `Memory` ala `claude-mem`), dan `Computer` (WebRTC live + `Take Control`/`Teach a Task`).

### 4.4 First-Run Onboarding Flow & Empty States (Guided 4-Step Wizard)
Saat QyroBot pertama kali dibuka (Desktop, Web, atau Android):
1. **Langkah 1 — Bahasa & Zona Waktu:** Auto-deteksi locale perangkat (`Bahasa Indonesia` / `English`) dan zona waktu (`WIB`/`WITA`/`WIT`), serta pilihan mode koneksi (*Jalankan Lokal* atau *Hubungkan ke Server VPS via QR Code*).
2. **Langkah 2 — Koneksi AI Cloud Gratis (`Free-Tier-Only Mode` Aktif):** Panduan cepat menyambungkan minimal 1 akun OAuth/API key gratis (Google AI Studio, Groq, Cerebras, OpenRouter Free, GitHub Models, dll.) dengan tombol **`Test Connection`** langsung.
3. **Langkah 3 — Kenalan dengan Chief of Staff:** Pilih bentuk/warna/ekspresi avatar Chief of Staff (atau pakai default), lalu Chief of Staff langsung menyapa di chat dengan **Starter Cards** siap klik (*"Ringkas inbox & jadwalkan hari ini"*, *"Pantau bookmark X saya"*, *"Bantu riset & bangun proyek"*).
4. **Langkah 4 — Integrasi Opsional (Bisa Dilewati):** Sambungkan akun X via login browser `Ambil alih`, sambungkan Android via QR Code, atau impor memori dari asisten AI lain.

---

## 5. Spesifikasi Native Android (100% Paritas Grok Bot Mobile + Ekstensi QyroBot)

Dibangun dengan **Tauri v2 Mobile (Rust + Kotlin/JNI)** untuk **Android 9+ (API 28+)** pada ponsel, foldable, dan tablet (`arm64-v8a` & `x86_64`):
- **Adaptive UI Shell:** `< 768px` memakai Single-Stack Native Navigation (`BotListScreen` -> `MobileChatScreen` -> `BotProfileScreen` -> `MobileComputerScreen` + tab **`ActionQueueScreen`** di bottom nav); `>= 1024px` (tablet landscape) otomatis beralih ke layout 3-kolom desktop.
- **Avatar Prosedural & Bot Accent Color Identik:** Memakai komponen SVG `<QyroBotAvatar />` yang sama persis (8 shape, 12 hex, 16 ekspresi, 15 animasi, 6 mood, Dynamic 1:1 Bot Accent Color, dan Avatar Studio 3-tab).
- **Interactive Inline Draft Cards & Composer Mobile:** Kartu draft email/Slack/X bisa diedit langsung di layar sentuh; tombol `Start dictation` & `Start voice chat` tampil di composer kosong; Pinned Voice Call bar menempel di bawah header saat panggilan aktif.
- **5 Plugin Native Tauri v2 Kotlin/Rust:**
  1. `tauri-plugin-qyro-share` (Android Share Sheet -> Chief of Staff / pilih bot).
  2. `tauri-plugin-qyro-device-apps` (`Connect apps -> Android` khusus chat pribadi bot sendiri: Calendar non-berulang tanpa undangan, Contacts read-only, Location, Alarms/Timers <= 24 jam; tanpa `NotificationListenerService`).
  3. `tauri-plugin-qyro-voice` (`ForegroundService` untuk Live Voice Chat & Dictation `id-ID`/`en-US`).
  4. `tauri-plugin-qyro-push` (**UnifiedPush** self-hosted gratis via `ntfy`/`Sunup` + opsi **FCM**).
  5. `tauri-plugin-qyro-keystore` (Android `KeyStore` + `BiometricPrompt` + **QR Scanner Pairing Ed25519**).
- **Alur Izin Per Perangkat (5 Menit) & `Manage Your Devices`:** Kartu `QyroBot butuh izin` hanya dikirim ke perangkat target, *fail-closed* setelah 300 detik (`Tanya setiap kali` / `Selalu izinkan` / `Jangan pernah izinkan`), dengan status `Perangkat ini`, `Online sekarang`, atau `Terakhir dibuka` serta pencabutan sesi instan.

---

## 6. Spesifikasi Lokalisasi Bahasa Indonesia & Multi-Bahasa (`i18n`, Voice `id-ID`, Timezone & Caveman Language Guard)

- **Single Source of Truth `i18n` (`id-ID` & `en-US`):** Frontend typed JSON + Backend Rust Fluent (`qyro-i18n` + `configs/locales/{id-ID,en-US}.ftl`).
- **Caveman Language Guard (Built-in di `qyro-router`):** Tahap 1 **RTK** (hemat 60–90% output mesin) + Tahap 2 **Caveman** (hemat ~46% prosa, total 78,4%–94,6%) dengan penjaga bahasa native Rust: **dilarang menerjemahkan teks Bahasa Indonesia ke Inggris**, mengunci kata negasi/pembatas (`tidak`, `jangan`, `bukan`, `belum`, `kecuali`, `hanya`, `wajib`, `dilarang`), dan otomatis bypass `System Prompt`, isi `SKILL.md` aktif, serta aturan Reviewer Agent.
- **Voice & Dictation `id-ID`:** Mode `Auto (id-ID + en-US code-switching)`, `id-ID`, dan `en-US` lewat cloud STT/TTS (`auto/stt`, `auto/tts`, dan `VoxCPM2 Cloud` yang mendukung Bahasa Indonesia secara native) + opsi `SpeechRecognizer` Android.
- **Parser Routine Indonesia & Zona Waktu (`WIB` / `WITA` / `WIT`):** Parsing deterministik jadwal bahasa alami ke cron IANA (`Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`) dan Active Hours Window X Shield.

---

## 7. Arsitektur Rust End-to-End & Kompatibilitas Cross-Platform

### 7.1 Struktur Cargo Workspace (`qyrobot/`)

```text
qyrobot/
├── Cargo.toml                           # Workspace Rust (edition = "2024", resolver = "2")
├── crates/
│   ├── qyro-types/                      # Domain models, BotAvatarSpec (8/12/16/15/6), EventEnvelope, DeviceAuth, MediaJob
│   ├── qyro-i18n/                       # Fluent localization engine (id-ID, en-US)
│   ├── qyro-storage/                    # SQLite (SQLx/rusqlite) + WAL + migrasi + FTS5 + Storage GC
│   ├── qyro-memory/                     # Native Rust Observer Memory Engine (ala claude-mem: 3-step mem-search, <private>, My Work)
│   ├── qyro-vault/                      # Write-only encrypted vault (Argon2id + ChaCha20-Poly1305 + OS Keychain)
│   ├── qyro-backup/                     # Encrypted Snapshot Backup, Restore & Cross-Arch Migration (Local / S3 / R2)
│   ├── qyro-router/                     # Native Rust OmniRoute Engine (375+ cloud providers, Free-Tier Guard, 20 strategies, multimodal + VoxCPM2 remote, RTK+Caveman)
│   ├── qyro-skills/                     # Skill Package Manager, Progressive Disclosure Loader, 23 built-in packs, SHA-256 trust & scanner
│   ├── qyro-tools/                      # Permanent Core Toolset (Multimodal Cloud, Impeccable 62-rule Rust, UI-UX-Pro-Max BM25, FS/Docs, Web Search/Fetch, HTTP, Media Ops)
│   ├── qyro-agent/                      # Agent loop, Chief of Staff, Group Round-Robin, Fast Router, Reviewer Agent, Action Queue, Lifecycle Hooks
│   ├── qyro-scheduler/                  # Cron + NL Schedule Parser (id-ID/en-US, WIB/WITA/WIT) + Event Triggers
│   ├── qyro-mcp/                        # MCP Client/Server (stdio + Streamable HTTP/SSE), Tinkabot Synthesizer & REA MCP Bridge
│   ├── qyro-computer/                   # Computer Use HAL: Dual-Engine Browser (Chromium CDP + Camoufox), Terminal PTY, WebRTC, cua-driver, Resource Watchdog/cgroups
│   ├── qyro-x-bridge/                   # Free Self-Auth X/Twitter Session Manager, Dynamic GraphQL & Anti-Ban Shield
│   ├── qyro-team-pkg/                   # Portable Markdown + YAML Frontmatter Importer/Exporter (BotMRR)
│   └── qyro-server/                     # Binary daemon tunggal (Axum HTTP/WS/SSE + Ed25519 Pairing + RBAC + Event Log Resume + WebRTC + PWA)
├── plugins/                             # Tauri v2 Mobile Plugins (Rust + Kotlin/Android)
│   ├── tauri-plugin-qyro-share/
│   ├── tauri-plugin-qyro-device-apps/
│   ├── tauri-plugin-qyro-voice/
│   ├── tauri-plugin-qyro-push/
│   └── tauri-plugin-qyro-keystore/
├── apps/
│   ├── app-shell/                       # Tauri v2 unified shell (Windows, macOS, Linux, Android + Auto-Updater)
│   └── web/                             # React 19 + TypeScript + Vite + Tailwind CSS (Adaptive UI + QyroBotAvatar SVG + Action Queue + Telemetry Band + Memory Viewer)
└── configs/
    ├── locales/                         # id-ID.ftl & en-US.ftl
    ├── providers/                       # Registry deklaratif TOML 375+ cloud providers (termasuk VoxCPM2 remote profile)
    ├── rtk-filters/                     # Filter kompresi RTK + tests[] verify gate
    ├── builtin-skills/                  # 14 Built-in Starter Skills + 9 Curated Permanent Packs (bundled lengkap dengan references/)
    ├── skills-catalog.json              # Katalog skill eksternal opsional
    └── x-manifest.json                  # Manifest dinamis queryId & feature flags X (auto-refresh)
```

### 7.2 Matriks Target Hardware & Sistem Operasi

| Platform / Arsitektur | Target Triple Rust | Mode Distribusi | Computer Use / Browser / Native Bridge |
| :--- | :--- | :--- | :--- |
| **Linux VPS AMD / Intel** | `x86_64-unknown-linux-musl` / `gnu` | Single binary + `systemd` / Docker Compose | Headless `Cage`/`Xvfb` + **Chromium CDP & Camoufox (`x86_64`)** + PTY + `ffmpeg` + `webrtc-rs` + cgroups Watchdog + `REA` |
| **Linux VPS Ampere / Graviton (ARM64)** | `aarch64-unknown-linux-musl` / `gnu` | Single binary native ARM64 + `systemd` / Docker multi-arch | Native ARM64 `Cage`/`Xvfb` + **ARM64 Chromium CDP** (+ Camoufox jika tersedia, fallback bersih ke Chromium) + PTY + `ffmpeg` + `webrtc-rs` + cgroups Watchdog + `REA` static |
| **Windows 10/11 (x64 & ARM64)** | `x86_64-pc-windows-msvc` / `aarch64-pc-windows-msvc` | Tauri `.msi` / `.exe` + `winget` | Local `cua-driver` + DXGI + **Chromium CDP & Camoufox** + PTY + `REA` (Ghidra/IDA/Hopper/Kuna bridge) |
| **macOS (Apple Silicon & Intel)** | `aarch64-apple-darwin` / `x86_64-apple-darwin` | Universal `.dmg` + Homebrew Cask | Local `cua-driver` (spawned dari proses utama Tauri) + ScreenCaptureKit + **Chromium CDP & Camoufox** + `REA` |
| **Linux Desktop (x64 & ARM64)** | `x86_64-unknown-linux-gnu` / `aarch64-unknown-linux-gnu` | `.AppImage`, `.deb`, `.rpm`, Nix flake | X11 & Wayland Portal (`xdg-desktop-portal` + PipeWire) + `cua-driver` + **Chromium & Camoufox** + `REA` |
| **Android 9+ (Ponsel, Foldable & Tablet)** | `aarch64-linux-android`, `x86_64-linux-android` | **Native Tauri v2 `.apk` / `.aab`** | Remote WebRTC `Ambil alih`/`Selesai` + 5 Plugin Native Kotlin + QR Pairing Ed25519 |
| **iOS & Browser Mobile** | Web/PWA | Install-to-Home-Screen PWA | Remote WebRTC sentuh + Web Push Approval |

---

## 8. Spesifikasi `qyro-router` — Native Rust OmniRoute Engine (100% Cloud Multimodal, Free-Tier Guard & Nol Model Lokal)

### 8.1 Dua Penjaga Mutlak: Anti-Local-Model Guard & `Free-Tier-Only Mode`
1. **Anti-Local-Model Guard (Compile-Time & Runtime):**
   - **Compile-time:** Tidak ada dependensi runtime inferensi AI lokal (`ollama`, `llama.cpp`, `llama.cpp-omni`, `candle`, `mistral.rs`, `vllm`, `gguf`, `whisper.cpp`, `voxcpm-pytorch-local`, `stable-diffusion.cpp`). Hanya utilitas non-AI deterministik yang diizinkan di lokal (`ffmpeg`, `image` crate, **Impeccable 62-rule Rust Slop Detector**, `UI-UX-Pro-Max` BM25, dan static analyzer `REA`).
   - **Runtime Validator:** `ProviderEndpointValidator` menolak keras alamat loopback/lokal (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`, `host.docker.internal`, port inferensi lokal RFC1918) untuk seluruh endpoint AI — termasuk saat memakai **VoxCPM2 Remote TTS Adapter**.
2. **`Free-Tier-Only Mode` (`free_only_mode = true` default):**
   - `CredentialSelector` hanya merutekan ke provider `tier = "free"` atau akun `oauth_sub` gratis (150+ provider cloud free tier), menampilkan badge `FREE` di UI. Jika kuota gratis suatu modalitas habis, mengembalikan pesan transparan sisa waktu reset tanpa diam-diam menggunakan paid key.

### 8.2 Pipeline Eksekusi, 20 Strategi, Kompresi & Gateway
- **7-Tahap Pipeline:** Ingress -> **Stacked Compression (`RTK` -> `Caveman` + Language Guard)** -> Model/Modality/Combo Resolver (Exact Persisted Combo -> Virtual `auto/*` Text/Code & Multimodal `auto/vision|image|video|tts|stt` -> `provider/model`) -> Free-Tier Guard + **20 Strategi Routing OmniRoute** + Multi-Account Pool + Live Quota Poller (`>= 60s`) + Circuit Breaker -> Bi-Directional Protocol & Media Adapter (termasuk `VoxCPM2 Cloud` OpenAI-audio) -> Cloud Executor + Auto-Fallback -> Telemetry & Usage Accounting.
- **20 Strategi Routing:** `priority`, `weighted`, `round-robin`, `context-relay`, `fill-first`, `p2c`, `random`, `least-used`, `cost-optimized`, `reset-aware`, `reset-window`, `headroom`, `quota-weighted`, `strict-random`, `auto` (16-factor), `lkgp`, `context-optimized`, `cache-optimized`, `fusion`, `pipeline`.
- **RTK Verify Gate (`qyro-router verify-rtk`):** Uji 3 intensitas + preservasi negasi `id-ID` + SHA-256 trust + secret redaction.
- **External Gateway (`127.0.0.1:20128`):** Kompatibel dengan Claude Code, Codex, Cursor, OpenCode, Cline, VS Code.

---

## 9. Multi-Agent, Persistent Observer Memory (`qyro-memory`), Skill Ecosystem (`qyro-skills`), Routines & Governance

### 9.1 Multi-Agent & Native Rust Observer Memory (`qyro-memory` — Arsitektur `claude-mem`)
- **Primary Bot (`Chief of Staff`)**, **Channels + Fast Auto-Router (`< 400 ms`)**, **Group Chat Round-Robin Orchestrator**, dan delegasi **`poke_bot`**.
- **Observer Agent Paralel (`qyro-memory`):** Menangkap aktivitas tool call secara pasif via `auto/fast` cloud gratis -> menyimpan observasi terkompresi di SQLite + FTS5 (plus cloud vector opsional) -> **Progressive Disclosure 3-Langkah (`mem-search`: `index` -> `timeline` -> `details`)** -> filter mutlak tag `<private>` -> arsip screenshot media -> panel UI **`My Work / Memory Viewer`**.

### 9.2 Skill Package Manager, Auto-Activation & 23 Permanent Built-in Skills/Plugins (`qyro-skills`)
- **Format Standar (`SKILL.md` + `scripts/` + `references/` + `assets/`):** Kompatibel GrokBot, Cursor, Claude Code, Codex, OpenCode.
- **Auto-Activation & Progressive Disclosure (3-Lapisan):** Layer 1 Indeks Ringan (`<= 1.500 token` + BM25/FTS5 pre-filter `id-ID`/`en-US`) -> Layer 2 `load_skill(slug)` on-demand (verifikasi SHA-256 + bebas kompresi Caveman + tampilkan *Active Skill Chip*) -> Layer 3 `references/` & eksekusi `scripts/` di sandbox lewat Reviewer Agent.
- **3 Mode Aktivasi:** `auto` (default), `always_on`, `manual_only` + hook siklus hidup **`SessionStart` & `PostCompaction`**.
- **5 Jalur Instalasi & Security Gate:** UI Desktop/Android (`Pasang Skill`), Chat (`/skill install`), CLI VPS (`qyro skill ...`), `Teach a Task`/`Tinkabot`, dan Team Packages (`BotMRR`); dilengkapi Preflight Dependency Resolver, lockfile `skills-lock.json` + rollback, Static Pre-Install Scanner, Skill Trust Review Card, dan Runtime SHA-256 Integrity Guard (`TAMPERED` block).
- **14 Built-in Starter Skills:** `chief-daily-briefing`, `deep-web-research`, `document-and-sheet-analyst`, `voice-and-meeting-notes`, `x-bookmark-curator`, `x-thread-and-profile-intel`, `x-voice-draft-composer`, `outer-loop-architect`, `terminal-debugger-and-ops`, `skill-creator-and-refiner`, `tinkabot-api-integrator`, `web-scout-and-comparator`, `multimodal-content-studio`, `visual-and-video-inspector`.
- **9 Permanent Curated Skill Packs & Plugins:**
  1. **`voxcpm-cloud-tts`** (`OpenBMB/VoxCPM` — VoxCPM2 Remote Cloud Adapter 48 kHz, 30 bahasa inc. `id-ID`, Voice Design & Cloning, **nol eksekusi lokal**).
  2. **`superpowers`** (`obra/superpowers` v7.0.2 — brainstorming, spec, plan, Red/Green TDD, subagent review + lifecycle hooks).
  3. **`ponytail`** (`DietrichGebert/ponytail` v5.3.3 — senior dev minimalis, `/ponytail*`, Telemetry Band & Board).
  4. **`ui-ux-pro-max`** (`nextlevelbuilder/ui-ux-pro-max-skill` v2.0 — native Rust BM25 Design System Generator).
  5. **`impeccable`** (`pbakaus/impeccable` — 24 perintah desain + 62-rule Rust deterministic anti-slop detector + mode `live`).
  6. **`humanizer`** (`blader/humanizer` v4.0.0 — 26 pola prosa AI + Voice Matching + adaptasi `id-ID`).
  7. **`qyro-memory` / `mem-search`** (`thedotmack/claude-mem` — native Rust Observer Memory + 3-step `mem-search`).
  8. **`agent-skills`** (`addyosmani/agent-skills` v0.6.17 — 26 skills + 10 SDLC slash commands `/spec`..`/ship` + `references/`).
  9. **`rea`** (`morluto/rea` — permanent MCP bridge & `/rea` untuk binary/Ghidra/IDA/Hopper/Kuna, JS/ASAR, .NET, APK, firmware, web).
- **Matriks Anti-Tabrakan:** `/spec`..`/ship` ke `agent-skills`, ide terbuka ke `superpowers`, `ponytail` sebagai *constraint overlay*; `ui-ux-pro-max` untuk greenfield -> `impeccable` untuk audit/polish; `humanizer` sebagai pass akhir draf tulisan; `RTK+Caveman` di level router selalu melindungi `SKILL.md`.

### 9.3 Routines, Event Triggers & Keamanan (Reviewer Agent + Write-Only Vault + Secure Form)
- **Routines:** Cron (>= 5 menit, NL `id-ID`/`en-US`, `WIB`/`WITA`/`WIT`) + Event Triggers (Webhook HMAC, Slack, GitHub, Linear, Sentry, PagerDuty, Email, X); batas default 50/bot, 20 run history, 300/jam global, 200/jam per routine.
- **Reviewer Agent (2-Layer):** Deterministik (0 ms) + LLM Reviewer (`auto/fast`) -> `{ Allow | Deny | Ask }`.
- **Write-Only Vault (`qyro-vault`):** Argon2id + ChaCha20-Poly1305 + OS Keychain / Android `KeyStore` / 1Password / Bitwarden; frontend hanya melihat `configured: true`.

---

## 10. Permanent Core Toolset (`qyro-tools`) & Dual-Engine Browser

- **Multimodal Cloud Tools (via `qyro-router`):** `generate_image` (`auto/image`), `generate_video` (`auto/video` async job + progress card), `text_to_speech` (`auto/tts` + `voxcpm-cloud-tts`), `transcribe_audio` (`auto/stt` + `ffmpeg` chunking), `analyze_image` (`auto/vision` automatic modality routing), `analyze_video` (native cloud video upload atau fallback deterministik `ffmpeg` keyframe + STT).
- **Dual-Engine Browser (`Chromium CDP` + `Camoufox`):** Default `Chromium` universal (termasuk Ampere `aarch64`); `Camoufox` anti-detect Firefox opsional per-bot/profil dengan runtime arch probe dan fallback bersih ke Chromium jika binary `aarch64` belum tersedia.
- **Terminal PTY (`portable-pty`) + RTK**, **Impeccable 62-Rule Rust Detector**, **UI-UX-Pro-Max BM25 Engine**, **Filesystem & Document Parser** (PDF/DOCX/XLSX/CSV/MD/JSON), **Web Search/Fetch**, **HTTP Request**, **Media Ops (`ffmpeg`)**, **`mem_search`**, **`load_skill`**, **`poke_bot`**, **`schedule_routine`**, **`vault_use`**, **`rea_*` MCP**, dan **Android Device Tools**.

---

## 11. Engine X / Twitter Gratis Selamanya via Self-Auth + Anti-Ban Shield (`qyro-x-bridge`)

> **Batasan Teknis Jujur:** Tidak ada software sisi klien yang dapat menjamin 100% bebas blokir secara matematis terhadap sistem deteksi sisi server X. QyroBot menghindari scraping agresif dan meminimalkan risiko melalui sesi browser asli milik user serta kontrol penuh manusia atas setiap aksi tulis.

- **Dual-Layer Self-Auth:** Login 1 kali via `Ambil alih` pada profil persisten `Chromium` atau `Camoufox` + **Dynamic Bundle Extractor** (`configs/x-manifest.json`, zero hardcoded `queryId`).
- **3 Trigger Gratis Global:** (1) **Bookmark / Bookmark-Folder** (paling aman, zero noise), (2) **Self-DM**, (3) **Mention / Alt-Account**.
- **6 Lapisan X Shield:** Strict Write Gate (`Ask` + Inline Draft Card + `humanizer`), Human-Like Pacing (token bucket + log-normal jitter + Active Hours `WIB`/`WITA`/`WIT`), IP & Session Pinning, Zero-Leak Hygiene (non-headless via Cage/Xvfb, antrean serial 1 worker/akun), Anomaly & Challenge Circuit Breaker (`PAUSED_NEEDS_HUMAN` tanpa auto-retry + push alert), Progressive Warm-Up Guard hari 1–7.

---

## 12. Arsitektur Computer Use Universal & Resource Guardrails VPS (`qyro-computer`)

### 12.1 Empat Backend Computer Use
1. **`HeadlessSandboxBackend` (VPS AMD `x86_64` & Ampere `ARM64`):** `Cage` Wayland / `Xvfb` + container/namespace non-root `bot@qyro` + Chromium/Camoufox + PTY + `ffmpeg` + live stream **`webrtc-rs`**.
2. **`LocalDesktopBackend` (Windows / macOS / Linux Desktop):** Rust `cua-driver` (di macOS di-spawn dari proses utama Tauri untuk TCC) + ScreenCaptureKit / DXGI / PipeWire Portal.
3. **`EmbeddedBrowserBackend` (VPS RAM 1–2 GB):** Browser terisolasi + PTY tanpa desktop environment penuh, tetap mendukung `Ambil alih` via WebRTC/screencast.
4. **`RemoteNodeBackend`:** Koneksi mTLS / Tailscale / WireGuard 24/7 ke `qyro-server` di VPS.

### 12.2 Resource Guardrails & Sandbox Watchdog (Krushial untuk VPS / Ampere Free Tier)
Agar Chromium/Camoufox + terminal agent 24/7 tidak pernah memicu OOM kill pada server VPS:
- **Batas Keras `cgroups v2` (Linux VPS) / Job Objects (Windows):** Batas RAM default sandbox dapat dikonfigurasi (mis. `1.5 GB` untuk VPS 2 GB, `4 GB` untuk Ampere 24 GB) dan kuota CPU (`cpu.max`), serta batas jumlah tab browser aktif simultan (default maks `6` tab).
- **Auto-Sleep Browser saat Idle:** Jika tidak ada routine/chat/Take Control aktif selama `N` menit (default `15 menit`), `qyro-computer` menidurkan proses renderer browser (sambil mempertahankan seluruh cookie & sesi login persisten di disk) sehingga RAM VPS turun ke ~40–60 MB, lalu bangun dalam <2 detik saat dipicu.
- **Health Watchdog & Crash Recovery:** Memantau respons CDP & PTY setiap 15 detik; jika proses browser hang atau crash, watchdog melakukan restart bersih otomatis, mencatat event ke log, dan memberi tahu bot/user tanpa membunuh `qyro-server`.

---

## 13. Infrastruktur Produksi: Pairing Perangkat, Real-Time Sync, Backup Lintas Arsitektur, GC, Auto-Updater & Team RBAC

### 13.1 Keamanan Koneksi & QR Device Pairing (`Ed25519`)
- **Zero-Password Pairing:** Dari Desktop atau CLI VPS (`qyro pair`), server menghasilkan **QR Code sekali pakai** (berlaku 120 detik) berisi `{ server_url, server_ed25519_pubkey, one_time_pairing_token }`.
- **Android / Desktop Client:** Memindai QR -> menghasilkan pasangan kunci perangkat `Ed25519` lokal (disimpan di Android `KeyStore` / OS Keychain) -> menukar kunci publik untuk mendapatkan sesi token terikat perangkat (`device_id`).
- **Instant Revoke:** Menghapus perangkat di `Settings -> Manage your devices` langsung mencabut kunci publik perangkat tersebut dan memutus seluruh koneksi WebSocket/WebRTC-nya dalam <1 detik.

### 13.2 Kontrak Event Real-Time & Offline Sync (`last_event_id`)
- Seluruh komunikasi status antara `qyro-server` (Rust) dan klien (Desktop, Web, Android) menggunakan **Typed Event Envelope** pada WebSocket (dengan fallback SSE):
  ```json
  {
    "event_id": 10482,
    "timestamp": "2026-11-25T10:15:30.412Z",
    "kind": "bot.mood_changed | chat.delta | draft.proposed | skill.activated | approval.requested | computer.takeover_requested | media.job_progress | device.permission_requested",
    "bot_id": "uuid",
    "payload": { "..." : "..." }
  }
  ```
- **Gapless Resume:** Setiap klien menyimpan `last_event_id` terakhir di storage lokal. Saat HP Android berpindah jaringan Wi-Fi <-> 4G/5G atau bangun dari sleep, klien mengirim `resume_from=last_event_id`; server memutar ulang (*replay*) seluruh event yang terlewat secara berurutan sehingga tidak ada pesan terputus, tidak ada kartu approval yang hilang, dan tidak ada duplikasi UI.

### 13.3 Encrypted Snapshot Backup, Restore & Migrasi Lintas Arsitektur (`qyro-backup`)
- **Perintah:** `qyro backup create [--dest local|s3|r2]` dan `qyro backup restore <snapshot.qyrobak>` (juga tersedia di `Settings -> Backup & Migration`).
- **Isi Snapshot Terenkripsi (Argon2id + ChaCha20-Poly1305):** Database SQLite konsisten (via SQLite Online Backup API), `qyro-vault`, `qyro-memory`, `configs/` (termasuk `skills-lock.json` & custom skills), artefak `Library` yang di-pin, dan opsional profil login X/Chromium (dipisah agar ukuran snapshot bisa dipilih *Compact* vs *Full*).
- **Portabilitas Arsitektur 100%:** Karena format snapshot 100% platform-independen (JSON/SQLite/WebP/encrypted blobs), user dapat mem-backup dari **VPS AMD `x86_64`** atau **Windows** lalu langsung me-restore ke **VPS Ampere `ARM64`** dalam hitungan menit tanpa kehilangan memori bot atau konfigurasi. Mendukung jadwal auto-backup harian ke **Cloudflare R2 (10 GB gratis)** atau S3-compatible storage.

### 13.4 Storage Garbage Collector, Auto-Updater & Opsional Live Team RBAC
- **Storage GC Otomatis:** Menjalankan pembersihan terjadwal (default tiap Minggu 03:00 waktu lokal) untuk menghapus raw output RTK > 14 hari, screenshot sementara `qyro-memory` > 30 hari, dan cache video/media tak ter-pin > 30 hari. **Invariant:** Item yang di-pin di `Library`, dokumen memori teks, dan Vault tidak pernah disentuh GC.
- **Auto-Updater & Rollback:**
  - Desktop: **Tauri Updater** dengan verifikasi tanda tangan kriptografis (`minisign`).
  - VPS Linux: `qyro self-update` (mengunduh binary bertanda tangan sesuai arsitektur `x86_64`/`aarch64`, menyimpan backup binary sebelumnya untuk rollback instan jika healthcheck gagal).
  - Android: Notifikasi rilis APK bertanda tangan di GitHub Releases / F-Droid-compatible repo.
- **Opsional Live Team / Multi-User RBAC:** Secara default berjalan dalam *Single-Owner Mode* (zero overhead). Bila diaktifkan untuk tim pada satu VPS, sistem memisahkan peran **`Owner`** dan **`Member`** dengan aturan isolasi keras: *Team Bots* & *Shared Channels* dapat diakses bersama sesuai izin, tetapi **Personal Vault**, **Personal X Session**, dan **Android Device Apps** milik tiap user selalu terisolasi penuh dan tidak pernah bisa dibaca anggota tim lain.

---

## 14. Skema Database & Konfigurasi Build-Dependent

### 14.1 Skema SQLite Inti (WAL Mode + Opsional SQLCipher)
- **`user_preferences`**: `ui_locale`, `timezone`, `theme_mode` (`system`|`dark`|`light`), `bot_accent_mode` (`bot_color`|`black`), `voice_language`, `caveman_non_en_mode`, `free_only_mode` (`true`), `default_browser_engine`, `ponytail_default_level`, `show_telemetry_band`, `skill_index_token_budget` (`1500`), `sandbox_ram_limit_mb`, `browser_idle_sleep_min`, `gc_retention_days`, `theme_hex_json`.
- **`bots`**: `id`, `name`, `label`, `description`, `avatar_spec_json` (type: `procedural` | `generated` | `uploaded`, `shape`, `color`, `expression`, `animation_override`, `asset_path`), `current_mood` (`idle`|`thinking`|`working`|`waiting`|`blocked`|`done`), `is_chief_of_staff`, `section_id`, `routing_target`, `modality_overrides_json`, `browser_engine_override`, `core_tools_policy_json`, `coding_pack_profile`, `response_locale_override`, `voice_language_override`, `compression_policy_json`, `approval_profile_id`, timestamps.
- **`channels`, `channel_members`, `messages` (`active_skills_json`, `draft_card_json`), `delegations`**.
- **`action_queue`**: `id`, `bot_id`, `kind` (`approval`|`secure_form`|`takeover`|`skill_trust`|`device_permission`|`draft_review`), `status` (`pending`|`resolved`|`expired`), `payload_json`, `target_device_id`, `expires_at`, `created_at`.
- **`event_log`**: `event_id` (monotonic integer PK), `kind`, `bot_id`, `payload_json`, `created_at` (retensi rolling untuk resume `last_event_id`).
- **`memory_sessions`, `memory_observations`, `memory_observations_fts` (`qyro-memory`)**.
- **`media_jobs`, `library_items` (dengan kolom `pinned` untuk proteksi GC)**.
- **`routines`, `routine_runs`**, **`skills`, `skill_bindings`, `skills_fts`, `skill_trust_audit`**.
- **`provider_connections`, `combos`**, **`devices` (dengan `ed25519_pubkey` & `revoked_at`), `device_permissions`**, **`approval_rules`, `audit_log`**, **`users` & `team_roles`** (opsional RBAC).

### 14.2 Pemisahan Data Build-Dependent (Zero Hardcoded External Values)
- `configs/providers/*.toml`: Katalog 375+ cloud providers (endpoint `voxcpm2-cloud` berstatus `UNSET` sampai diisi user).
- `configs/x-manifest.json`: `query_ids`, `feature_switches`, `bundle_hash` berstatus `UNSET` sampai diekstrak dari live `x.com`.
- `configs/rtk-filters/*.json`: Wajib lulus `qyro-router verify-rtk`.
- `configs/builtin-skills/`: 14 starter skills + 9 curated packs dengan manifest SHA-256 & `references/` utuh.
- **Runtime Binary Probe:** Mendeteksi `chromium`, `camoufox`, `ffmpeg`, dan engine `REA` (`ghidra`, `ida`, `hopper`, `kuna`) saat boot.

---

## 15. Packaging, Instalasi Universal & Roadmap Implementasi

### 15.1 Distribusi & Instalasi
- **Linux VPS (AMD `x86_64` & Ampere `ARM64`):** `curl -fsSL https://get.qyrobot.dev/install.sh | sh` (binary native + `ffmpeg` + Chromium + Camoufox jika didukung + `systemd` + cgroups + PWA + CLI `qyro`) atau Docker Multi-Arch (`linux/amd64`, `linux/arm64`).
- **Android 9+:** Signed `.apk` (`arm64-v8a`, `x86_64`) & `.aab` via `cargo tauri android build`.
- **Windows (x64 & ARM64):** `.msi` / `.exe` + `winget`.
- **macOS (Apple Silicon & Intel):** Universal `.dmg` + Homebrew Cask.
- **Linux Desktop:** `.AppImage`, `.deb`, `.rpm`, Nix flake.

### 15.2 Roadmap Implementasi Bertahap
1. **Fase 1 — Core Rust, `qyro-i18n`, `qyro-vault`, `qyro-memory`, `qyro-backup` & `qyro-router`:** Scaffolding Cargo workspace, migrasi SQLite penuh (termasuk `event_log` & `action_queue`), Write-Only Vault, porting OmniRoute ke Rust (Anti-Local Guard, **`Free-Tier-Only Mode`**, 375+ provider registry + remote `VoxCPM2 Cloud` adapter, 20 strategi routing, multimodal `auto/*`, **RTK + Caveman Language Guard** + `verify-rtk`), fondasi `qyro-memory`, serta test suite terkompilasi.
2. **Fase 2 — 100% Parity Grok Bot UI, Procedural Avatar Engine, `qyro-skills` (23 Built-in Packs), `qyro-tools` & Agent Loop:** `<QyroBotAvatar />` SVG (8 shape, 12 hex eksak, 16 ekspresi, 15 animasi, 6 mood, Dynamic 1:1 Bot Accent Color), Design Tokens Dark/Light, First-Run Onboarding, Unified Action Queue, Interactive Inline Draft Cards, Telemetry Band & Board, Memory Viewer, `qyro-skills` (Progressive Disclosure + 23 built-in packs + anti-tabrakan), `qyro-tools` multimodal + Impeccable 62-rule Rust + UI-UX-Pro-Max BM25, dan Reviewer Agent.
3. **Fase 3 — `qyro-computer` (Chromium + Camoufox + Watchdog cgroups), `REA` MCP Bridge, QR Pairing & Plugin Android Native:** `HeadlessSandboxBackend` (AMD & Ampere + auto-sleep + cgroups), `LocalDesktopBackend` (`cua-driver`), `MobileComputerScreen` (`Ambil alih`/`Selesai`), `Teach a Task`, permanent `REA` MCP bridge, QR Pairing `Ed25519` + `last_event_id` resume, dan 5 plugin Android Tauri.
4. **Fase 4 — `qyro-x-bridge` (Free Self-Auth X + Anti-Ban Shield):** Persistent X profile (Chromium/Camoufox), Dynamic Bundle Extractor, 6-layer Anti-Ban Shield + pass `humanizer` pada Inline Draft Card, dan 3 trigger gratis (Bookmark, Self-DM, Mention).
5. **Fase 5 — Ekosistem, Backup R2/S3, Auto-Updater, Storage GC, Scheduler NL `id-ID` & Team RBAC:** Installer GitHub/ZIP/Catalog + CLI `qyro skill` + rollback lockfile, `qyro backup` cross-arch AMD<->Ampere, Storage GC, Auto-Updater, Channels + Fast Auto-Router, Group Chat Round-Robin, Routines & Event Triggers (`id-ID`/`en-US`, `WIB`/`WITA`/`WIT`), Tinkabot, Portable Team Packages (BotMRR), dan opsi Live Team RBAC.
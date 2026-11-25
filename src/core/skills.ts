/**
 * qyro-skills — Skill Package Manager, 23 Permanent Built-in Skills/Plugins,
 * 3-Layer Progressive Disclosure (<= 1500 token Layer 1 index), Anti-Collision Matrix,
 * Static Pre-Install Scanner, and Runtime SHA-256 Integrity Guard (PRD v1.7.0 §9.2).
 */

import crypto from 'node:crypto';
import type { QyroStorage } from './storage';

export type SkillCategory = 'starter' | 'curated_pack' | 'custom';
export type SkillActivationMode = 'auto' | 'always_on' | 'manual_only';

export interface SkillDefinition {
  slug: string;
  name: string;
  version: string;
  category: SkillCategory;
  source: string;
  activation_mode: SkillActivationMode;
  description: string;
  keywords: string[];
  slash_commands: string[];
  lifecycle_hooks?: Array<'SessionStart' | 'PostCompaction'>;
  skill_md: string;
  references: string[];
}

export interface InstalledSkillRecord {
  slug: string;
  name: string;
  version: string;
  category: SkillCategory;
  source: string;
  activation_mode: SkillActivationMode;
  sha256: string;
  description: string;
  keywords: string[];
  slash_commands: string[];
  lifecycle_hooks: string[];
  references: string[];
  installed_at: string;
}

export interface LoadedSkillResult {
  ok: boolean;
  tampered?: boolean;
  slug: string;
  name?: string;
  sha256?: string;
  skill_md?: string;
  references?: string[];
  caveman_exempt: true;
  error?: string;
}

export interface StaticScanResult {
  safe: boolean;
  risk_level: 'low' | 'medium' | 'high';
  findings: Array<{ rule: string; detail: string }>;
}

/**
 * 14 Built-in Starter Skills + 9 Permanent Curated Skill Packs = 23 Permanent Built-in Skills
 */
export const BUILTIN_23_SKILLS: SkillDefinition[] = [
  // --- 14 Built-in Starter Skills ---
  {
    slug: 'chief-daily-briefing',
    name: 'Chief Daily Briefing',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Ringkasan harian agenda, antrean persetujuan, email penting, dan prioritas tim dalam WIB/WITA/WIT.',
    keywords: ['briefing', 'harian', 'agenda', 'ringkas', 'jadwal', 'inbox', 'morning', 'daily', 'summary'],
    slash_commands: ['/briefing'],
    skill_md: '# Chief Daily Briefing\nKumpulkan prioritas hari ini, action queue tertunda, dan rekomendasi langkah pertama dalam Bahasa Indonesia atau Inggris sesuai locale user.',
    references: ['references/briefing-template.md'],
  },
  {
    slug: 'deep-web-research',
    name: 'Deep Web Research',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Riset web multi-sumber terverifikasi dengan sitasi terstruktur dan perbandingan fakta.',
    keywords: ['riset', 'research', 'bandingkan', 'compare', 'sumber', 'web', 'investigasi', 'benchmark'],
    slash_commands: ['/research'],
    skill_md: '# Deep Web Research\nKumpulkan fakta dari sumber primer, pisahkan fakta terverifikasi dari asumsi, dan sajikan ringkasan terstruktur.',
    references: ['references/citation-rubric.md'],
  },
  {
    slug: 'document-and-sheet-analyst',
    name: 'Document & Sheet Analyst',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Ekstraksi, ringkasan, dan kalkulasi dokumen PDF, DOCX, XLSX, CSV, Markdown, dan JSON.',
    keywords: ['pdf', 'docx', 'xlsx', 'csv', 'excel', 'spreadsheet', 'dokumen', 'tabel', 'laporan'],
    slash_commands: ['/analyze-doc'],
    skill_md: '# Document & Sheet Analyst\nValidasi skema kolom, hitung agregasi numerik secara deterministik, dan laporkan anomali.',
    references: ['references/tabular-checks.md'],
  },
  {
    slug: 'voice-and-meeting-notes',
    name: 'Voice & Meeting Notes',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Transkripsi rapat id-ID/en-US code-switching, daftar keputusan, dan action items pemilik tugas.',
    keywords: ['rapat', 'meeting', 'notulen', 'transkrip', 'rekaman', 'voice', 'audio', 'stt'],
    slash_commands: ['/meeting'],
    skill_md: '# Voice & Meeting Notes\nUbah transkrip rapat menjadi keputusan, tindak lanjut berbatas waktu, dan draf follow-up email.',
    references: ['references/notulen-id.md'],
  },
  {
    slug: 'x-bookmark-curator',
    name: 'X Bookmark Curator',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Kurasi bookmark X/Twitter gratis via self-auth menjadi ringkasan topik dan arsip memori.',
    keywords: ['bookmark', 'x', 'twitter', 'kurasi', 'simpanan', 'folder'],
    slash_commands: ['/x-bookmarks'],
    skill_md: '# X Bookmark Curator\nKelompokkan bookmark X berdasarkan tema, ekstrak poin inti, dan arsipkan ke qyro-memory.',
    references: ['references/x-shield-safe-read.md'],
  },
  {
    slug: 'x-thread-and-profile-intel',
    name: 'X Thread & Profile Intel',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Analisis thread panjang dan profil X dengan anti-ban pacing tanpa scraping agresif.',
    keywords: ['thread', 'profil', 'profile', 'intel', 'tweet', 'analisis x'],
    slash_commands: ['/x-intel'],
    skill_md: '# X Thread & Profile Intel\nRangkum argumen utama thread, tautan primer, dan konteks diskusi tanpa memicu rate limit.',
    references: ['references/x-pacing-policy.md'],
  },
  {
    slug: 'x-voice-draft-composer',
    name: 'X Voice Draft Composer',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Menyusun draf tweet/balasan X dalam Interactive Draft Card dengan batas 280 karakter & Humanizer pass.',
    keywords: ['draft-x', 'tweet', 'post x', 'balasan x', 'utasan', 'caption x'],
    slash_commands: ['/draft-x'],
    skill_md: '# X Voice Draft Composer\nSelalu hasilkan Interactive Draft Card agar manusia menyunting dan menyetujui sebelum aksi tulis.',
    references: ['references/x-voice-guide.md'],
  },
  {
    slug: 'outer-loop-architect',
    name: 'Outer Loop Architect',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Merancang orkestrasi multi-agent, pendelegasian bot-to-bot, dan batas tugas outer loop vs inner loop.',
    keywords: ['arsitektur', 'orchestrate', 'delegasi', 'outer loop', 'multi-agent', 'workflow'],
    slash_commands: ['/architect'],
    skill_md: '# Outer Loop Architect\nPecah sasaran besar menjadi subtugas terukur dengan kontrak verifikasi jelas antar bot.',
    references: ['references/outer-loop-patterns.md'],
  },
  {
    slug: 'terminal-debugger-and-ops',
    name: 'Terminal Debugger & Ops',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Diagnosa error terminal, systemd VPS AMD/Ampere, Docker, dan filter log RTK hemat token.',
    keywords: ['terminal', 'debug', 'vps', 'systemd', 'docker', 'error', 'log', 'ops', 'linux'],
    slash_commands: ['/ops'],
    skill_md: '# Terminal Debugger & Ops\nReproduksi masalah, saring output mesin dengan RTK, dan minta approval Reviewer Agent untuk perintah destruktif.',
    references: ['references/vps-runbook.md'],
  },
  {
    slug: 'skill-creator-and-refiner',
    name: 'Skill Creator & Refiner',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Membuat dan menyempurnakan paket SKILL.md standar dengan manifest SHA-256 & references/.',
    keywords: ['buat skill', 'create skill', 'skill.md', 'refine skill', 'paket skill'],
    slash_commands: ['/create-skill'],
    skill_md: '# Skill Creator & Refiner\nSusun frontmatter, kata kunci aktivasi, instruksi deterministik, dan daftar referensi minimal.',
    references: ['references/skill-spec-v1.7.md'],
  },
  {
    slug: 'tinkabot-api-integrator',
    name: 'Tinkabot API Integrator',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Mensintesis klien REST/GraphQL/MCP dengan penyimpanan kunci eksklusif lewat Write-Only Vault.',
    keywords: ['api', 'webhook', 'mcp', 'integrasi', 'rest', 'graphql', 'tinkabot'],
    slash_commands: ['/integrate'],
    skill_md: '# Tinkabot API Integrator\nGunakan vault_use untuk kredensial tanpa pernah mencetak token ke log atau chat.',
    references: ['references/mcp-synthesizer.md'],
  },
  {
    slug: 'web-scout-and-comparator',
    name: 'Web Scout & Comparator',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Pemantauan harga, rilis produk, dan tabel perbandingan terstruktur menggunakan browser sandbox.',
    keywords: ['scout', 'harga', 'produk', 'rilis', 'monitor', 'perbandingan'],
    slash_commands: ['/scout'],
    skill_md: '# Web Scout & Comparator\nBandingkan spesifikasi dengan metrik terukur dan sumber waktu pengambilan data.',
    references: ['references/comparison-matrix.md'],
  },
  {
    slug: 'multimodal-content-studio',
    name: 'Multimodal Content Studio',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Koordinasi cloud generate_image, generate_video async, dan text_to_speech melalui auto/* gratis.',
    keywords: ['gambar', 'image', 'video', 'generate', 'poster', 'konten', 'studio', 'multimodal'],
    slash_commands: ['/studio'],
    skill_md: '# Multimodal Content Studio\nRutekan aset gambar/video/audio melalui OmniRoute auto/image, auto/video, dan auto/tts.',
    references: ['references/multimodal-presets.md'],
  },
  {
    slug: 'visual-and-video-inspector',
    name: 'Visual & Video Inspector',
    version: '1.7.0',
    category: 'starter',
    source: 'builtin:starter',
    activation_mode: 'auto',
    description: 'Inspeksi screenshot UI, foto dokumen, dan keyframe video via auto/vision cloud.',
    keywords: ['vision', 'screenshot', 'lihat gambar', 'analisis video', 'inspeksi visual'],
    slash_commands: ['/inspect'],
    skill_md: '# Visual & Video Inspector\nAnalisa kontras, tata letak, teks OCR, dan temuan cacat visual secara objektif.',
    references: ['references/visual-qa-checklist.md'],
  },

  // --- 9 Permanent Curated Skill Packs & Plugins ---
  {
    slug: 'voxcpm-cloud-tts',
    name: 'VoxCPM2 Remote Cloud TTS',
    version: '2.0.0',
    category: 'curated_pack',
    source: 'OpenBMB/VoxCPM (Remote vLLM-Omni Only)',
    activation_mode: 'auto',
    description: 'TTS tokenizer-free 48 kHz 30 bahasa (termasuk id-ID), Voice Design & Cloning — 100% remote cloud HTTPS.',
    keywords: ['voxcpm', 'tts', 'suara', 'narasi', 'voice cloning', '48khz', 'dubbing'],
    slash_commands: ['/voxcpm'],
    skill_md: '# VoxCPM2 Cloud TTS\nWAJIB menggunakan endpoint remote HTTPS vLLM-Omni (voxcpm2-cloud). Eksekusi lokal diblokir keras oleh Anti-Local-Model Guard.',
    references: ['references/voxcpm2-openai-audio.md'],
  },
  {
    slug: 'superpowers',
    name: 'Superpowers SDLC',
    version: '7.0.2',
    category: 'curated_pack',
    source: 'obra/superpowers',
    activation_mode: 'auto',
    description: 'Metodologi SDLC otomatis: brainstorming -> spec -> plan -> Red/Green TDD -> subagent review.',
    keywords: ['brainstorm', 'ide', 'tdd', 'red green', 'superpowers', 'roadmap', 'desain fitur'],
    slash_commands: ['/brainstorm', '/tdd'],
    lifecycle_hooks: ['SessionStart', 'PostCompaction'],
    skill_md: '# Superpowers v7.0.2\nMulai ide terbuka dengan brainstorming terstruktur, kunci spesifikasi, tulis test gagal (Red) sebelum implementasi (Green).',
    references: ['references/tdd-loop.md', 'references/subagent-review.md'],
  },
  {
    slug: 'ponytail',
    name: 'Ponytail Minimalist Dev',
    version: '5.3.3',
    category: 'curated_pack',
    source: 'DietrichGebert/ponytail',
    activation_mode: 'always_on',
    description: 'Overlay senior engineer minimalis: reuse kode eksisting tanpa memangkas validasi, keamanan, a11y, atau test.',
    keywords: ['ponytail', 'minimalis', 'refactor', 'reuse', 'clean code', 'telemetry'],
    slash_commands: ['/ponytail', '/ponytail-strict'],
    skill_md: '# Ponytail v5.3.3 Constraint Overlay\nUtamakan reuse modul eksisting dan diff ringkas. Dilarang memangkas validasi boundary, keamanan, error handling, aksesibilitas, atau test berisiko.',
    references: ['references/ponytail-guardrails.md'],
  },
  {
    slug: 'ui-ux-pro-max',
    name: 'UI-UX Pro Max BM25',
    version: '2.0.0',
    category: 'curated_pack',
    source: 'nextlevelbuilder/ui-ux-pro-max-skill',
    activation_mode: 'auto',
    description: 'Design System Generator BM25 deterministik (palet domain, gaya UI, font pairing, landing & chart patterns).',
    keywords: ['ui-ux', 'design system', 'palet', 'warna', 'typography', 'landing page', 'greenfield', 'wireframe'],
    slash_commands: ['/ui-ux', '/design-system'],
    skill_md: '# UI-UX Pro Max v2.0\nUntuk proyek UI greenfield, jalankan mesin BM25 deterministik terlebih dahulu untuk menghasilkan palet, font pairing, dan pola layout domain.',
    references: ['references/bm25-catalog.md'],
  },
  {
    slug: 'impeccable',
    name: 'Impeccable 62-Rule Anti-Slop',
    version: '1.7.0',
    category: 'curated_pack',
    source: 'pbakaus/impeccable',
    activation_mode: 'auto',
    description: '24 perintah desain terarah + 62-rule deterministic anti-AI-slop detector (0 token LLM) + mode live audit.',
    keywords: ['impeccable', 'audit ui', 'anti-slop', 'slop', 'polish', 'review desain', 'kontras', 'aksesibilitas'],
    slash_commands: ['/impeccable', '/polish', '/audit-ui'],
    skill_md: '# Impeccable\nJalankan 62-rule deterministic anti-AI-slop detector (0 token LLM) pada kode UI/CSS sebelum merilis antarmuka.',
    references: ['references/impeccable-62-rules.md'],
  },
  {
    slug: 'humanizer',
    name: 'Humanizer Prose Engine',
    version: '4.0.0',
    category: 'curated_pack',
    source: 'blader/humanizer',
    activation_mode: 'auto',
    description: 'Menghapus 26 pola prosa AI + Voice Matching + adaptasi gaya Bahasa Indonesia natural untuk draf.',
    keywords: ['humanizer', 'haluskan', 'prosa', 'natural', 'draf', 'draft', 'email', 'tulisan', 'ai slop text'],
    slash_commands: ['/humanizer', '/draft-email'],
    skill_md: '# Humanizer v4.0.0\nJalankan sebagai pass akhir pada draf email, Slack, dan tweet X untuk menghapus klise AI dan menyelaraskan suara penulis.',
    references: ['references/26-ai-prose-patterns.md'],
  },
  {
    slug: 'qyro-memory',
    name: 'Qyro Observer Memory (mem-search)',
    version: '1.7.0',
    category: 'curated_pack',
    source: 'thedotmack/claude-mem (Native QyroBot)',
    activation_mode: 'always_on',
    description: 'Memori lintas sesi FTS5 dengan 3-step Progressive Disclosure (index -> timeline -> details) & filter <private>.',
    keywords: ['memori', 'memory', 'ingat', 'riwayat', 'mem-search', 'keputusan lalu', 'my work'],
    slash_commands: ['/mem-search'],
    skill_md: '# Qyro Observer Memory\nSelalu cari memori lewat 3 langkah (index -> timeline -> details) agar hemat konteks. Konten <private> tidak pernah disimpan.',
    references: ['references/progressive-memory.md'],
  },
  {
    slug: 'agent-skills',
    name: 'Production Agent Skills (26 + 10 SDLC)',
    version: '0.6.17',
    category: 'curated_pack',
    source: 'addyosmani/agent-skills',
    activation_mode: 'auto',
    description: '26 engineering skills produksi + 10 slash command SDLC (/spec, /plan, /build, /test, /review, /ship, dll).',
    keywords: ['spec', 'plan', 'build', 'test', 'review', 'ship', 'ci', 'security', 'performance', 'sdlc'],
    slash_commands: ['/spec', '/plan', '/build', '/test', '/review', '/ship', '/debug', '/refactor', '/perf', '/sec'],
    skill_md: '# Addy Osmani Agent Skills v0.6.17\nTangani perintah SDLC terstruktur (/spec hingga /ship) dengan standar engineering produksi dan checklist verifikasi.',
    references: ['references/sdlc-commands.md', 'references/production-checklist.md'],
  },
  {
    slug: 'rea',
    name: 'REA Binary & Reverse Engineering MCP',
    version: '1.0.0',
    category: 'curated_pack',
    source: 'morluto/rea',
    activation_mode: 'auto',
    description: 'Investigasi berbasis bukti untuk binary native (bridge Ghidra/IDA/Hopper/Kuna), JS/ASAR, .NET, APK, firmware.',
    keywords: ['rea', 'reverse', 'binary', 'ghidra', 'ida', 'apk', 'asar', 'firmware', 'elf', 'pe', 'disasm'],
    slash_commands: ['/rea'],
    skill_md: '# REA Reverse Engineering\nVerifikasi setiap offset, simbol, dan struktur langsung dari artefak binary atau bridge Ghidra/IDA/Hopper; jangan pernah mengarang alamat.',
    references: ['references/rea-evidence-protocol.md'],
  },
];

export function computeSkillSha256(skillMd: string, slug: string, version: string): string {
  return crypto
    .createHash('sha256')
    .update(`${slug}@${version}\n`)
    .update(skillMd, 'utf8')
    .digest('hex');
}

/**
 * Static Pre-Install Scanner (PRD §9.2): detects risky patterns in custom skills before install.
 */
export function scanSkillPayload(skillMd: string): StaticScanResult {
  const findings: Array<{ rule: string; detail: string }> = [];
  const rules: Array<[RegExp, string, string]> = [
    [/rm\s+-rf\s+\/(\s|$|\*)/i, 'DESTRUCTIVE_FS', 'Destructive root filesystem deletion command detected.'],
    [/curl\s+[^\n]+\|\s*(sh|bash|zsh)/i, 'REMOTE_PIPE_EXEC', 'Piped remote shell execution (curl | sh) detected.'],
    [/wget\s+[^\n]+\|\s*(sh|bash|zsh)/i, 'REMOTE_PIPE_EXEC', 'Piped remote shell execution (wget | sh) detected.'],
    [/(vault_secrets|QYRO_VAULT_MASTER_KEY|\.env\b|id_rsa)/i, 'SECRET_EXFIL_RISK', 'References sensitive vault/secret material directly.'],
    [/localhost:11434|127\.0\.0\.1:1234|ollama\s+run/i, 'LOCAL_MODEL_POLICY', 'Attempts to invoke a forbidden local AI model endpoint.'],
    [/eval\s*\(|child_process|danger-full-access/i, 'UNSANDBOXED_EXEC', 'Requests unsandboxed code execution or full-access bypass.'],
  ];

  for (const [re, rule, detail] of rules) {
    if (re.test(skillMd)) {
      findings.push({ rule, detail });
    }
  }

  const riskLevel: 'low' | 'medium' | 'high' =
    findings.length >= 2 || findings.some((f) => f.rule === 'DESTRUCTIVE_FS' || f.rule === 'SECRET_EXFIL_RISK')
      ? 'high'
      : findings.length === 1
        ? 'medium'
        : 'low';

  return {
    safe: findings.length === 0,
    risk_level: riskLevel,
    findings,
  };
}

export class QyroSkillsManager {
  private readonly storage: QyroStorage;

  constructor(storage: QyroStorage) {
    this.storage = storage;
    this.seedBuiltin23Skills();
  }

  private seedBuiltin23Skills(): void {
    const insertSkill = this.storage.db.prepare(
      `INSERT OR IGNORE INTO skills (slug, name, version, source, activation_mode, sha256, manifest_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const deleteFts = this.storage.db.prepare(`DELETE FROM skills_fts WHERE slug = ?`);
    const insertFts = this.storage.db.prepare(
      `INSERT INTO skills_fts (slug, name, description, keywords) VALUES (?, ?, ?, ?)`
    );

    for (const def of BUILTIN_23_SKILLS) {
      const sha256 = computeSkillSha256(def.skill_md, def.slug, def.version);
      const manifest = {
        category: def.category,
        description: def.description,
        keywords: def.keywords,
        slash_commands: def.slash_commands,
        lifecycle_hooks: def.lifecycle_hooks ?? [],
        skill_md: def.skill_md,
        references: def.references,
      };
      const res = insertSkill.run(
        def.slug,
        def.name,
        def.version,
        def.source,
        def.activation_mode,
        sha256,
        JSON.stringify(manifest)
      );
      if (Number(res.changes) > 0) {
        deleteFts.run(def.slug);
        insertFts.run(
          def.slug,
          def.name,
          def.description,
          [...def.keywords, ...def.slash_commands].join(' ')
        );
      }
    }
  }

  listSkills(): InstalledSkillRecord[] {
    const rows = this.storage.db
      .prepare(`SELECT * FROM skills ORDER BY source ASC, name ASC`)
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const manifest = JSON.parse(String(row.manifest_json)) as {
        category?: SkillCategory;
        description?: string;
        keywords?: string[];
        slash_commands?: string[];
        lifecycle_hooks?: string[];
        references?: string[];
      };
      return {
        slug: String(row.slug),
        name: String(row.name),
        version: String(row.version),
        category: manifest.category ?? 'custom',
        source: String(row.source),
        activation_mode: row.activation_mode as SkillActivationMode,
        sha256: String(row.sha256),
        description: manifest.description ?? '',
        keywords: manifest.keywords ?? [],
        slash_commands: manifest.slash_commands ?? [],
        lifecycle_hooks: manifest.lifecycle_hooks ?? [],
        references: manifest.references ?? [],
        installed_at: String(row.installed_at),
      };
    });
  }

  updateActivationMode(slug: string, mode: SkillActivationMode): InstalledSkillRecord | null {
    const res = this.storage.db
      .prepare(`UPDATE skills SET activation_mode = ? WHERE slug = ?`)
      .run(mode, slug);
    if (Number(res.changes) === 0) return null;
    return this.listSkills().find((s) => s.slug === slug) ?? null;
  }

  /**
   * Layer 1 Progressive Disclosure: lightweight skill index strictly capped by token budget (<= 1500 tokens).
   */
  buildLayer1Index(tokenBudget = 1500): {
    entries: Array<{ slug: string; name: string; mode: SkillActivationMode; summary: string }>;
    estimated_tokens: number;
    within_budget: boolean;
  } {
    const all = this.listSkills();
    const entries: Array<{ slug: string; name: string; mode: SkillActivationMode; summary: string }> = [];
    let chars = 0;
    const maxChars = tokenBudget * 4;

    for (const s of all) {
      if (s.activation_mode === 'manual_only') continue;
      const summary = s.description.slice(0, 96);
      const lineChars = s.slug.length + s.name.length + summary.length + 12;
      if (chars + lineChars > maxChars) break;
      chars += lineChars;
      entries.push({ slug: s.slug, name: s.name, mode: s.activation_mode, summary });
    }

    const estTokens = Math.ceil(chars / 4);
    return {
      entries,
      estimated_tokens: estTokens,
      within_budget: estTokens <= tokenBudget,
    };
  }

  /**
   * Anti-Collision Matrix + Bilingual Progressive Disclosure matcher (PRD §9.2):
   * - /spec../ship -> agent-skills
   * - open-ended ideation -> superpowers
   * - ponytail always acts as constraint overlay
   * - greenfield UI -> ui-ux-pro-max; audit/polish -> impeccable
   * - draft writing -> humanizer pass
   */
  matchSkillsForPrompt(prompt: string): {
    activated_slugs: string[];
    routing_notes: string[];
  } {
    const lower = prompt.toLowerCase();
    const all = this.listSkills();
    const bySlug = new Map(all.map((s) => [s.slug, s]));
    const selected = new Set<string>();
    const notes: string[] = [];

    // 1. Always-on overlays (e.g., ponytail, qyro-memory)
    for (const s of all) {
      if (s.activation_mode === 'always_on') {
        selected.add(s.slug);
      }
    }

    // 2. Explicit Slash Command Anti-Collision Rules
    if (/^\/(spec|plan|build|test|review|ship|debug|refactor|perf|sec)\b/i.test(lower)) {
      selected.add('agent-skills');
      notes.push('Anti-Collision: SDLC slash command routed to agent-skills (+ ponytail overlay).');
    }
    if (/^\/(brainstorm|tdd)\b|\b(brainstorm|ide baru|red\/green|tdd)\b/i.test(lower)) {
      selected.add('superpowers');
      notes.push('Anti-Collision: open ideation/TDD routed to superpowers.');
    }
    if (/^\/(ui-ux|design-system)\b|\b(design system|palet warna|greenfield|landing page|typography)\b/i.test(lower)) {
      selected.add('ui-ux-pro-max');
      notes.push('Anti-Collision: greenfield UI routed to ui-ux-pro-max BM25.');
    }
    if (/^\/(impeccable|polish|audit-ui)\b|\b(impeccable|anti-slop|audit ui|slop|polish ui)\b/i.test(lower)) {
      selected.add('impeccable');
      notes.push('Anti-Collision: UI audit/polish routed to impeccable 62-rule detector.');
    }
    if (/^\/(humanizer|draft-email|draft-x)\b|\b(humanizer|haluskan|draf|draft|email|tweet|post x)\b/i.test(lower)) {
      selected.add('humanizer');
      if (/\b(draft-x|tweet|post x|utasan|balasan x)\b/i.test(lower)) {
        selected.add('x-voice-draft-composer');
      }
      notes.push('Anti-Collision: prose polish pass assigned to humanizer.');
    }
    if (/^\/rea\b|\b(ghidra|ida|hopper|binary|disasm|asar|apk|firmware|offset)\b/i.test(lower)) {
      selected.add('rea');
      notes.push('Anti-Collision: binary/RE investigation routed to rea MCP.');
    }
    if (/^\/voxcpm\b|\b(voxcpm|voice cloning|tts 48khz)\b/i.test(lower)) {
      selected.add('voxcpm-cloud-tts');
    }

    // 3. Bilingual FTS5 / keyword match for remaining auto skills
    const tokens = lower.match(/[a-z0-9_-]{3,}/g) ?? [];
    for (const s of all) {
      if (s.activation_mode !== 'auto') continue;
      if (selected.has(s.slug)) continue;
      const hitSlash = s.slash_commands.some((cmd) => lower.includes(cmd.toLowerCase()));
      const hitKeyword = s.keywords.some((kw) => lower.includes(kw.toLowerCase()));
      const hitToken = tokens.some((tok) => s.slug.includes(tok));
      if (hitSlash || hitKeyword || hitToken) {
        selected.add(s.slug);
      }
    }

    // Cap auto-activated skills to keep context crisp
    const ordered = Array.from(selected).filter((slug) => bySlug.has(slug)).slice(0, 6);
    return {
      activated_slugs: ordered,
      routing_notes: notes,
    };
  }

  /**
   * Layer 2 Progressive Disclosure: load_skill(slug) with Runtime SHA-256 Integrity Guard.
   * If stored manifest content does not match registered SHA-256 -> blocks as TAMPERED & audits.
   */
  loadSkill(slug: string): LoadedSkillResult {
    const row = this.storage.db
      .prepare(`SELECT slug, name, version, sha256, manifest_json FROM skills WHERE slug = ?`)
      .get(slug) as
      | { slug: string; name: string; version: string; sha256: string; manifest_json: string }
      | undefined;

    if (!row) {
      return {
        ok: false,
        slug,
        caveman_exempt: true,
        error: `Skill "${slug}" not found.`,
      };
    }

    const manifest = JSON.parse(row.manifest_json) as {
      skill_md?: string;
      references?: string[];
    };
    const skillMd = manifest.skill_md ?? '';
    const actualSha = computeSkillSha256(skillMd, row.slug, row.version);

    if (actualSha !== row.sha256) {
      this.storage.db
        .prepare(
          `INSERT INTO skill_trust_audit (id, skill_slug, sha256, decision, notes)
           VALUES (?, ?, ?, 'tampered_blocked', ?)`
        )
        .run(
          `aud-${crypto.randomUUID().slice(0, 8)}`,
          row.slug,
          actualSha,
          `Runtime SHA-256 integrity mismatch (expected ${row.sha256.slice(0, 16)}, got ${actualSha.slice(0, 16)})`
        );

      return {
        ok: false,
        tampered: true,
        slug: row.slug,
        name: row.name,
        sha256: actualSha,
        caveman_exempt: true,
        error: `TAMPERED: Skill "${row.slug}" failed SHA-256 integrity verification and was blocked.`,
      };
    }

    return {
      ok: true,
      slug: row.slug,
      name: row.name,
      sha256: row.sha256,
      skill_md: skillMd,
      references: manifest.references ?? [],
      caveman_exempt: true,
    };
  }

  /**
   * Install custom skill with Static Pre-Install Scanner & Skill Trust Review Card.
   */
  installCustomSkill(params: {
    slug: string;
    name: string;
    description: string;
    skill_md: string;
    keywords?: string[];
    bot_id?: string;
  }): {
    installed: boolean;
    requires_trust_review: boolean;
    scan: StaticScanResult;
    skill?: InstalledSkillRecord;
    action_id?: string;
  } {
    const cleanSlug = params.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
    if (cleanSlug.length < 2) {
      throw new Error('Skill slug must be at least 2 characters');
    }

    const scan = scanSkillPayload(params.skill_md);
    const sha256 = computeSkillSha256(params.skill_md, cleanSlug, '1.0.0');

    if (!scan.safe) {
      const action = this.storage.enqueueAction(
        params.bot_id ?? 'bot-chief-of-staff',
        'skill_trust',
        {
          title: `Skill Trust Review: ${params.name} (${cleanSlug})`,
          summary: `Static scanner mendeteksi ${scan.findings.length} temuan risiko (${scan.risk_level.toUpperCase()}): ${scan.findings.map((f) => f.rule).join(', ')}`,
          slug: cleanSlug,
          sha256,
          findings: scan.findings,
        }
      );

      this.storage.db
        .prepare(
          `INSERT INTO skill_trust_audit (id, skill_slug, sha256, decision, notes)
           VALUES (?, ?, ?, 'denied', ?)`
        )
        .run(
          `aud-${crypto.randomUUID().slice(0, 8)}`,
          cleanSlug,
          sha256,
          `Held for Trust Review: ${scan.findings.map((f) => f.rule).join(', ')}`
        );

      return {
        installed: false,
        requires_trust_review: true,
        scan,
        action_id: action.id,
      };
    }

    const manifest = {
      category: 'custom' as SkillCategory,
      description: params.description.trim() || params.name,
      keywords: params.keywords ?? [cleanSlug],
      slash_commands: [`/${cleanSlug}`],
      lifecycle_hooks: [],
      skill_md: params.skill_md,
      references: [],
    };

    this.storage.db
      .prepare(
        `INSERT OR REPLACE INTO skills (slug, name, version, source, activation_mode, sha256, manifest_json)
         VALUES (?, ?, '1.0.0', 'custom:local', 'auto', ?, ?)`
      )
      .run(cleanSlug, params.name.trim(), sha256, JSON.stringify(manifest));

    this.storage.db.prepare(`DELETE FROM skills_fts WHERE slug = ?`).run(cleanSlug);
    this.storage.db
      .prepare(`INSERT INTO skills_fts (slug, name, description, keywords) VALUES (?, ?, ?, ?)`)
      .run(cleanSlug, params.name.trim(), manifest.description, manifest.keywords.join(' '));

    this.storage.db
      .prepare(
        `INSERT INTO skill_trust_audit (id, skill_slug, sha256, decision, notes)
         VALUES (?, ?, ?, 'approved', 'Passed static pre-install scanner cleanly')`
      )
      .run(`aud-${crypto.randomUUID().slice(0, 8)}`, cleanSlug, sha256);

    return {
      installed: true,
      requires_trust_review: false,
      scan,
      skill: this.listSkills().find((s) => s.slug === cleanSlug),
    };
  }
}

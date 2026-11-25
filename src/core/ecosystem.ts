/**
 * qyro-ecosystem — Phase 5 Skill Installer (GitHub / ZIP / Catalog) + configs/skills-lock.json
 * + Rollback, Tinkabot API Integrator (Anti-Local Guard + vault_use), and
 * Portable Team Packages (BotMRR zero-secret export/import) (PRD v1.7.0 §9.2, §10.4, §15.2).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { QyroStorage } from './storage';
import {
  computeSkillSha256,
  scanSkillPayload,
  type InstalledSkillRecord,
  type QyroSkillsManager,
  type StaticScanResult,
} from './skills';
import { validateCloudEndpoint } from './router/endpointGuard';

export type SkillInstallSourceType = 'github' | 'zip' | 'catalog' | 'tinkabot';

export interface SkillLockEntry {
  slug: string;
  name: string;
  version: string;
  source_type: SkillInstallSourceType;
  source_ref: string;
  sha256: string;
  installed_at: string;
}

export interface SkillsLockfile {
  lockfile_version: 1;
  updated_at: string;
  entries: SkillLockEntry[];
}

export interface SkillLockHistoryRecord {
  id: string;
  action: string;
  entry_count: number;
  created_at: string;
}

export interface CatalogSkillTemplate {
  slug: string;
  name: string;
  version: string;
  description: string;
  source_ref: string;
  keywords: string[];
  skill_md: string;
}

export const CURATED_CATALOG_TEMPLATES: CatalogSkillTemplate[] = [
  {
    slug: 'notion-brief-sync',
    name: 'Notion Brief Sync',
    version: '1.2.0',
    description: 'Sinkronisasi ringkasan rapat & action items ke workspace Notion melalui Write-Only Vault.',
    source_ref: 'catalog://qyrobot/notion-brief-sync@1.2.0',
    keywords: ['notion', 'brief', 'sync', 'notulen', 'docs'],
    skill_md:
      '# Notion Brief Sync\nGunakan `vault_use("NOTION_API_KEY")` untuk autentikasi header Bearer ke `https://api.notion.com/v1/pages`. Jangan pernah mencetak token ke chat atau log.',
  },
  {
    slug: 'linear-issue-triage',
    name: 'Linear Issue Triage',
    version: '1.1.0',
    description: 'Triase tiket bug & prioritas sprint Linear dengan konfirmasi Reviewer Agent untuk aksi tulis.',
    source_ref: 'catalog://qyrobot/linear-issue-triage@1.1.0',
    keywords: ['linear', 'issue', 'triage', 'sprint', 'bug'],
    skill_md:
      '# Linear Issue Triage\nAmbil daftar issue aktif via `https://api.linear.app/graphql` memakai `vault_use("LINEAR_API_KEY")`. Buat ringkasan prioritas tanpa memodifikasi status sebelum approval.',
  },
  {
    slug: 'invoice-parser-id',
    name: 'Invoice & Faktur ID Parser',
    version: '1.0.3',
    description: 'Ekstrak nomor faktur, PPN 11%, NPWP, dan jatuh tempo dari dokumen PDF/CSV secara deterministik.',
    source_ref: 'catalog://qyrobot/invoice-parser-id@1.0.3',
    keywords: ['invoice', 'faktur', 'ppn', 'npwp', 'keuangan'],
    skill_md:
      '# Invoice & Faktur ID Parser\nValidasi format tanggal WIB/WITA/WIT, hitung total + PPN secara aritmetika deterministik, dan sajikan tabel verifikasi.',
  },
  {
    slug: 'github-release-digest',
    name: 'GitHub Release Digest',
    version: '1.3.0',
    description: 'Pantau rilis repo GitHub, breaking changes, dan ringkasan changelog harian.',
    source_ref: 'catalog://qyrobot/github-release-digest@1.3.0',
    keywords: ['github', 'release', 'changelog', 'repo', 'semver'],
    skill_md:
      '# GitHub Release Digest\nKueri `https://api.github.com/repos/{owner}/{repo}/releases` dengan `vault_use("GITHUB_TOKEN")` dan rangkum perubahan versi terbaru.',
  },
];

export interface TinkabotEndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
}

export interface TinkabotSynthesisResult {
  ok: boolean;
  blocked_reason?: string;
  endpoint_guard_code?: string;
  slug?: string;
  name?: string;
  vault_secret_name?: string;
  base_url?: string;
  skill_md?: string;
  sha256?: string;
  scan?: StaticScanResult;
  installed?: boolean;
  lockfile?: SkillsLockfile;
}

export interface BotMrrTeamPackage {
  format: 'qyro-team-package/v1';
  package_name: string;
  author: string;
  description: string;
  exported_at: string;
  source_arch: string;
  stripped_sensitive_categories: [
    'vault_secrets',
    'personal_x_sessions',
    'android_device_keys',
    'memory_observations',
  ];
  bots: Array<{
    name: string;
    label: string;
    description: string;
    avatar_spec: Record<string, unknown>;
    routing_target: string;
  }>;
  channels: Array<{
    name: string;
    kind: 'channel' | 'group_chat' | 'direct';
    routing_mode: string;
    member_bot_names: string[];
  }>;
  routines: Array<{
    name: string;
    bot_name: string;
    schedule_expr: string;
    timezone: string;
    prompt: string;
    trigger_type: string;
  }>;
  custom_skills: Array<{
    slug: string;
    name: string;
    version: string;
    description: string;
    keywords: string[];
    skill_md: string;
    sha256: string;
  }>;
  checksum_sha256: string;
}

const FORBIDDEN_PACKAGE_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/"vault_secrets"\s*:/i, 'Contains forbidden vault_secrets section'],
  [/"ciphertext"\s*:/i, 'Contains encrypted vault ciphertext'],
  [/"auth_token"\s*:/i, 'Contains personal X auth_token'],
  [/"ct0"\s*:/i, 'Contains personal X ct0 cookie'],
  [/"private_key"\s*:/i, 'Contains private key material'],
  [/"public_key_pem"\s*:/i, 'Contains paired Android device key'],
  [/BEGIN\s+(RSA|EC|OPENSSH|PRIVATE)\s+KEY/i, 'Contains PEM private key block'],
  [/QYRO_VAULT_MASTER_KEY/i, 'References vault master key'],
  [/\bsk-[a-zA-Z0-9]{20,}\b/, 'Contains raw API key token'],
];

function computePackageChecksum(pkgWithoutChecksum: Omit<BotMrrTeamPackage, 'checksum_sha256'>): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(pkgWithoutChecksum), 'utf8')
    .digest('hex');
}

export class QyroEcosystemManager {
  private readonly storage: QyroStorage;
  private readonly skills: QyroSkillsManager;
  private readonly lockfilePath: string;

  constructor(
    storage: QyroStorage,
    skills: QyroSkillsManager,
    lockfilePath = path.resolve(process.cwd(), 'configs/skills-lock.json')
  ) {
    this.storage = storage;
    this.skills = skills;
    this.lockfilePath = lockfilePath;
    this.ensureLockfileExists();
  }

  private ensureLockfileExists(): void {
    const dir = path.dirname(this.lockfilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.lockfilePath)) {
      const initial: SkillsLockfile = {
        lockfile_version: 1,
        updated_at: new Date().toISOString(),
        entries: [],
      };
      fs.writeFileSync(this.lockfilePath, JSON.stringify(initial, null, 2) + '\n', 'utf8');
    }
  }

  readLockfile(): SkillsLockfile {
    this.ensureLockfileExists();
    try {
      const raw = fs.readFileSync(this.lockfilePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SkillsLockfile>;
      return {
        lockfile_version: 1,
        updated_at: parsed.updated_at ?? new Date().toISOString(),
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    } catch {
      return {
        lockfile_version: 1,
        updated_at: new Date().toISOString(),
        entries: [],
      };
    }
  }

  private writeLockfile(lockfile: SkillsLockfile): void {
    this.ensureLockfileExists();
    const updated: SkillsLockfile = {
      lockfile_version: 1,
      updated_at: new Date().toISOString(),
      entries: lockfile.entries,
    };
    fs.writeFileSync(this.lockfilePath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  }

  private recordLockSnapshot(action: string, snapshot: SkillsLockfile): string {
    const id = `lock-${crypto.randomUUID().slice(0, 8)}`;
    this.storage.db
      .prepare(
        `INSERT INTO skill_lock_history (id, action, lockfile_json) VALUES (?, ?, ?)`
      )
      .run(id, action, JSON.stringify(snapshot));
    return id;
  }

  listLockHistory(limit = 15): SkillLockHistoryRecord[] {
    const rows = this.storage.db
      .prepare(
        `SELECT id, action, lockfile_json, created_at
         FROM skill_lock_history
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(Math.max(1, Math.min(50, limit))) as Array<{
      id: string;
      action: string;
      lockfile_json: string;
      created_at: string;
    }>;

    return rows.map((r) => {
      let count = 0;
      try {
        const parsed = JSON.parse(r.lockfile_json) as SkillsLockfile;
        count = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
      } catch {
        count = 0;
      }
      return {
        id: r.id,
        action: r.action,
        entry_count: count,
        created_at: r.created_at,
      };
    });
  }

  listCatalog(): CatalogSkillTemplate[] {
    return CURATED_CATALOG_TEMPLATES;
  }

  /**
   * Install a skill from GitHub repo reference, ZIP manifest, Curated Catalog, or Tinkabot synthesis.
   * Runs Static Pre-Install Scanner, writes configs/skills-lock.json, and saves rollback snapshot.
   */
  installSkillPackage(params: {
    source_type: SkillInstallSourceType;
    source_ref: string;
    slug?: string;
    name?: string;
    version?: string;
    description?: string;
    skill_md?: string;
    keywords?: string[];
    bot_id?: string;
  }): {
    installed: boolean;
    requires_trust_review: boolean;
    error?: string;
    scan?: StaticScanResult;
    entry?: SkillLockEntry;
    skill?: InstalledSkillRecord;
    lockfile?: SkillsLockfile;
    history_id?: string;
    action_id?: string;
  } {
    let slug = (params.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    let name = (params.name ?? '').trim();
    let version = (params.version ?? '1.0.0').trim() || '1.0.0';
    let description = (params.description ?? '').trim();
    let skillMd = (params.skill_md ?? '').trim();
    let keywords = params.keywords ?? [];
    const sourceRef = params.source_ref.trim();

    if (params.source_type === 'catalog') {
      const tpl = CURATED_CATALOG_TEMPLATES.find(
        (c) => c.slug === slug || c.slug === sourceRef || c.source_ref === sourceRef
      );
      if (!tpl) {
        return {
          installed: false,
          requires_trust_review: false,
          error: `Template catalog "${sourceRef || slug}" tidak ditemukan.`,
        };
      }
      slug = tpl.slug;
      name = tpl.name;
      version = tpl.version;
      description = tpl.description;
      skillMd = tpl.skill_md;
      keywords = tpl.keywords;
    } else if (params.source_type === 'github') {
      if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(sourceRef)) {
        return {
          installed: false,
          requires_trust_review: false,
          error: 'Source GitHub wajib memakai URL HTTPS valid (https://github.com/org/repo).',
        };
      }
      if (!slug) {
        const repoPart = sourceRef.split('/').filter(Boolean).pop() ?? 'github-skill';
        slug = repoPart.toLowerCase().replace(/\.git$/, '').replace(/[^a-z0-9-]/g, '-');
      }
      if (!name) name = slug;
      if (!skillMd) {
        return {
          installed: false,
          requires_trust_review: false,
          error: 'Konten SKILL.md dari paket GitHub wajib disertakan untuk dipindai Static Scanner.',
        };
      }
    } else if (params.source_type === 'zip') {
      if (!sourceRef.toLowerCase().endsWith('.zip')) {
        return {
          installed: false,
          requires_trust_review: false,
          error: 'Nama artefak ZIP harus berakhiran .zip.',
        };
      }
      if (!slug) {
        slug = sourceRef
          .replace(/\.zip$/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-');
      }
      if (!name) name = slug;
      if (!skillMd) {
        return {
          installed: false,
          requires_trust_review: false,
          error: 'Konten SKILL.md yang diekstrak dari ZIP wajib disertakan untuk verifikasi SHA-256.',
        };
      }
    }

    if (slug.length < 2) {
      return {
        installed: false,
        requires_trust_review: false,
        error: 'Slug skill minimal 2 karakter.',
      };
    }

    // Run static pre-install scanner before modifying lockfile or DB
    const scan = scanSkillPayload(skillMd);
    const sha256 = computeSkillSha256(skillMd, slug, version);

    if (!scan.safe) {
      const action = this.storage.enqueueAction(
        params.bot_id ?? 'bot-chief-of-staff',
        'skill_trust',
        {
          title: `Skill Installer Blocked: ${name || slug} (${params.source_type})`,
          summary: `Static scanner menemukan ${scan.findings.length} risiko (${scan.risk_level.toUpperCase()}): ${scan.findings.map((f) => f.rule).join(', ')}`,
          slug,
          source_type: params.source_type,
          source_ref: sourceRef,
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
          slug,
          sha256,
          `Installer blocked (${params.source_type}): ${scan.findings.map((f) => f.rule).join(', ')}`
        );

      return {
        installed: false,
        requires_trust_review: true,
        scan,
        action_id: action.id,
      };
    }

    // Snapshot previous lockfile for atomic rollback
    const previousLock = this.readLockfile();
    const historyId = this.recordLockSnapshot(
      `pre-install:${slug}@${version}`,
      previousLock
    );

    // Upsert into SQLite skills + FTS5 + audit
    const manifest = {
      category: 'custom' as const,
      description: description || `${name || slug} (${params.source_type})`,
      keywords: keywords.length > 0 ? keywords : [slug, params.source_type],
      slash_commands: [`/${slug}`],
      lifecycle_hooks: [],
      skill_md: skillMd,
      references: [`source:${sourceRef}`],
    };

    const sourceLabel = `${params.source_type}:${sourceRef}`;
    this.storage.db
      .prepare(
        `INSERT OR REPLACE INTO skills (slug, name, version, source, activation_mode, sha256, manifest_json)
         VALUES (?, ?, ?, ?, 'auto', ?, ?)`
      )
      .run(slug, name || slug, version, sourceLabel, sha256, JSON.stringify(manifest));

    this.storage.db.prepare(`DELETE FROM skills_fts WHERE slug = ?`).run(slug);
    this.storage.db
      .prepare(`INSERT INTO skills_fts (slug, name, description, keywords) VALUES (?, ?, ?, ?)`)
      .run(slug, name || slug, manifest.description, manifest.keywords.join(' '));

    this.storage.db
      .prepare(
        `INSERT INTO skill_trust_audit (id, skill_slug, sha256, decision, notes)
         VALUES (?, ?, ?, 'approved', ?)`
      )
      .run(
        `aud-${crypto.randomUUID().slice(0, 8)}`,
        slug,
        sha256,
        `Installed via ${params.source_type} and locked in skills-lock.json`
      );

    const entry: SkillLockEntry = {
      slug,
      name: name || slug,
      version,
      source_type: params.source_type,
      source_ref: sourceRef,
      sha256,
      installed_at: new Date().toISOString(),
    };

    const filteredEntries = previousLock.entries.filter((e) => e.slug !== slug);
    const nextLock: SkillsLockfile = {
      lockfile_version: 1,
      updated_at: new Date().toISOString(),
      entries: [...filteredEntries, entry],
    };
    this.writeLockfile(nextLock);

    return {
      installed: true,
      requires_trust_review: false,
      scan,
      entry,
      skill: this.skills.listSkills().find((s) => s.slug === slug),
      lockfile: this.readLockfile(),
      history_id: historyId,
    };
  }

  /**
   * Roll back configs/skills-lock.json and remove custom skills installed after the chosen snapshot.
   */
  rollbackLockfile(historyId?: string): {
    rolled_back: boolean;
    error?: string;
    restored_from_id?: string;
    removed_slugs: string[];
    lockfile: SkillsLockfile;
  } {
    const row = (
      historyId
        ? this.storage.db
            .prepare(`SELECT id, action, lockfile_json FROM skill_lock_history WHERE id = ?`)
            .get(historyId)
        : this.storage.db
            .prepare(
              `SELECT id, action, lockfile_json FROM skill_lock_history ORDER BY created_at DESC, rowid DESC LIMIT 1`
            )
            .get()
    ) as { id: string; action: string; lockfile_json: string } | undefined;

    if (!row) {
      return {
        rolled_back: false,
        error: 'Belum ada riwayat snapshot lockfile untuk rollback.',
        removed_slugs: [],
        lockfile: this.readLockfile(),
      };
    }

    const currentLock = this.readLockfile();
    const targetLock = JSON.parse(row.lockfile_json) as SkillsLockfile;
    const targetSlugs = new Set(targetLock.entries.map((e) => e.slug));
    const removedSlugs: string[] = [];

    for (const currentEntry of currentLock.entries) {
      if (!targetSlugs.has(currentEntry.slug)) {
        // Only remove user-installed custom skills (never touch the 23 permanent built-in packs)
        this.storage.db
          .prepare(
            `DELETE FROM skills WHERE slug = ? AND json_extract(manifest_json, '$.category') = 'custom'`
          )
          .run(currentEntry.slug);
        this.storage.db
          .prepare(
            `DELETE FROM skills_fts WHERE slug = ? AND slug NOT IN (SELECT slug FROM skills)`
          )
          .run(currentEntry.slug);
        removedSlugs.push(currentEntry.slug);
      }
    }

    this.writeLockfile(targetLock);
    this.storage.db.prepare(`DELETE FROM skill_lock_history WHERE id = ?`).run(row.id);

    return {
      rolled_back: true,
      restored_from_id: row.id,
      removed_slugs: removedSlugs,
      lockfile: this.readLockfile(),
    };
  }

  /**
   * Tinkabot API Integrator (PRD §9.2 & §15.2):
   * Synthesizes a safe REST/GraphQL/MCP integration skill enforcing Anti-Local Guard + vault_use.
   */
  synthesizeTinkabotSkill(params: {
    service_name: string;
    base_url: string;
    auth_header?: string;
    vault_secret_name: string;
    endpoints: TinkabotEndpointSpec[];
    install?: boolean;
  }): TinkabotSynthesisResult {
    const serviceName = params.service_name.trim();
    if (!serviceName) {
      return { ok: false, blocked_reason: 'Nama layanan API wajib diisi.' };
    }

    // Strict Anti-Local-Model & Remote HTTPS Guard
    const guard = validateCloudEndpoint(params.base_url, 'tinkabot-integrator');
    if (!guard.allowed) {
      return {
        ok: false,
        blocked_reason: `Tinkabot API Integrator diblokir oleh Endpoint Guard: ${guard.reason}`,
        endpoint_guard_code: guard.code,
      };
    }

    const vaultSecretName = params.vault_secret_name.trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,64}$/.test(vaultSecretName) || vaultSecretName.startsWith('SK_')) {
      return {
        ok: false,
        blocked_reason:
          'Nama kunci Vault harus berupa alias uppercase (A-Z, 0-9, _), bukan nilai API key mentah.',
      };
    }

    const cleanEndpoints = (params.endpoints.length > 0
      ? params.endpoints
      : [{ method: 'GET' as const, path: '/v1/status', summary: 'Health & resource status' }]
    ).slice(0, 12);

    const authHeader = (params.auth_header?.trim() || 'Authorization: Bearer').replace(/[\r\n]/g, '');
    const slug = `tinkabot-${serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`;

    const endpointDocs = cleanEndpoints
      .map((ep) => `- \`${ep.method} ${guard.normalizedUrl}${ep.path.startsWith('/') ? ep.path : '/' + ep.path}\` — ${ep.summary}`)
      .join('\n');

    const skillMd = [
      `# Tinkabot Integration: ${serviceName}`,
      '',
      `Base URL (Verified Remote HTTPS): \`${guard.normalizedUrl}\``,
      `Authentication: \`${authHeader} \${vault_use("${vaultSecretName}")}\``,
      '',
      '## Security Policy',
      '- Kredensial diambil eksklusif melalui `vault_use(...)` dari Write-Only Vault.',
      '- Dilarang keras mencetak header autentikasi atau API key ke chat, memori, atau log.',
      '- Aksi tulis (POST/PUT/DELETE) wajib melalui Reviewer Agent & Action Queue.',
      '',
      '## Synthesized Endpoints',
      endpointDocs,
    ].join('\n');

    const scan = scanSkillPayload(skillMd);
    const sha256 = computeSkillSha256(skillMd, slug, '1.0.0');

    let installed = false;
    let lockfile: SkillsLockfile | undefined;

    if (params.install && scan.safe) {
      const res = this.installSkillPackage({
        source_type: 'tinkabot',
        source_ref: guard.normalizedUrl ?? params.base_url,
        slug,
        name: `${serviceName} API (Tinkabot)`,
        version: '1.0.0',
        description: `Integrasi REST/MCP otomatis untuk ${serviceName} via vault_use("${vaultSecretName}").`,
        skill_md: skillMd,
        keywords: [slug, serviceName.toLowerCase(), 'api', 'tinkabot'],
      });
      installed = res.installed;
      lockfile = res.lockfile;
    }

    return {
      ok: true,
      slug,
      name: `${serviceName} API (Tinkabot)`,
      vault_secret_name: vaultSecretName,
      base_url: guard.normalizedUrl,
      skill_md: skillMd,
      sha256,
      scan,
      installed,
      lockfile,
    };
  }

  /**
   * Portable Team Packages (BotMRR) — Zero-Secret Export (PRD §10.4 & §15.2).
   * Strictly strips Vault secrets, personal X sessions, Android device keys, and private memory.
   */
  exportTeamPackage(params: {
    package_name: string;
    author?: string;
    description?: string;
  }): BotMrrTeamPackage {
    const bots = this.storage.listBots();
    const botNameById = new Map(bots.map((b) => [b.id, b.name]));

    const channelRows = this.storage.db
      .prepare(`SELECT id, name, kind, routing_mode FROM channels ORDER BY created_at ASC`)
      .all() as Array<{ id: string; name: string; kind: 'channel' | 'group_chat' | 'direct'; routing_mode: string }>;

    const channels = channelRows.map((ch) => {
      const members = this.storage.db
        .prepare(`SELECT bot_id FROM channel_members WHERE channel_id = ? ORDER BY turn_order ASC`)
        .all(ch.id) as Array<{ bot_id: string }>;
      return {
        name: ch.name,
        kind: ch.kind,
        routing_mode: ch.routing_mode,
        member_bot_names: members.map((m) => botNameById.get(m.bot_id) ?? m.bot_id),
      };
    });

    const routineRows = this.storage.db
      .prepare(
        `SELECT name, bot_id, schedule_expr, timezone, prompt, trigger_type FROM routines ORDER BY created_at ASC`
      )
      .all() as Array<{
      name: string;
      bot_id: string;
      schedule_expr: string;
      timezone: string;
      prompt: string;
      trigger_type: string;
    }>;

    const customSkillRows = this.storage.db
      .prepare(
        `SELECT slug, name, version, sha256, manifest_json
         FROM skills
         WHERE json_extract(manifest_json, '$.category') = 'custom'
         ORDER BY slug ASC`
      )
      .all() as Array<{
      slug: string;
      name: string;
      version: string;
      sha256: string;
      manifest_json: string;
    }>;

    const customSkills = customSkillRows.map((row) => {
      const manifest = JSON.parse(row.manifest_json) as {
        description?: string;
        keywords?: string[];
        skill_md?: string;
      };
      return {
        slug: row.slug,
        name: row.name,
        version: row.version,
        description: manifest.description ?? '',
        keywords: manifest.keywords ?? [],
        skill_md: manifest.skill_md ?? '',
        sha256: row.sha256,
      };
    });

    const basePkg: Omit<BotMrrTeamPackage, 'checksum_sha256'> = {
      format: 'qyro-team-package/v1',
      package_name: params.package_name.trim() || 'QyroBot Team Bundle',
      author: params.author?.trim() || 'QyroBot Owner',
      description:
        params.description?.trim() ||
        'Paket tim portabel (bots, channels, routines, custom skills) tanpa rahasia Vault/X/Android.',
      exported_at: new Date().toISOString(),
      source_arch: `${process.platform}/${process.arch}`,
      stripped_sensitive_categories: [
        'vault_secrets',
        'personal_x_sessions',
        'android_device_keys',
        'memory_observations',
      ],
      bots: bots.map((b) => ({
        name: b.name,
        label: b.label,
        description: b.description,
        avatar_spec: b.avatar_spec as unknown as Record<string, unknown>,
        routing_target: b.routing_target,
      })),
      channels,
      routines: routineRows.map((r) => ({
        name: r.name,
        bot_name: botNameById.get(r.bot_id) ?? 'Chief of Staff',
        schedule_expr: r.schedule_expr,
        timezone: r.timezone,
        prompt: r.prompt,
        trigger_type: r.trigger_type,
      })),
      custom_skills: customSkills,
    };

    const checksum = computePackageChecksum(basePkg);
    return {
      ...basePkg,
      checksum_sha256: checksum,
    };
  }

  /**
   * Import Portable Team Package (BotMRR) with checksum verification, secret-leak guard, and static scan.
   */
  importTeamPackage(pkg: BotMrrTeamPackage): {
    ok: boolean;
    error?: string;
    imported_bots: number;
    imported_skills: number;
    skipped_existing_bots: number;
    zero_secret_verified: boolean;
  } {
    if (!pkg || pkg.format !== 'qyro-team-package/v1') {
      return {
        ok: false,
        error: 'Format paket tidak valid (harus qyro-team-package/v1).',
        imported_bots: 0,
        imported_skills: 0,
        skipped_existing_bots: 0,
        zero_secret_verified: false,
      };
    }

    const serialized = JSON.stringify(pkg);
    for (const [re, msg] of FORBIDDEN_PACKAGE_SECRET_PATTERNS) {
      if (re.test(serialized)) {
        return {
          ok: false,
          error: `Paket ditolak oleh Zero-Secret Guard: ${msg}.`,
          imported_bots: 0,
          imported_skills: 0,
          skipped_existing_bots: 0,
          zero_secret_verified: false,
        };
      }
    }

    const { checksum_sha256, ...rest } = pkg;
    const expectedChecksum = computePackageChecksum(rest);
    if (checksum_sha256 !== expectedChecksum) {
      return {
        ok: false,
        error: `Checksum paket tidak cocok (expected ${expectedChecksum.slice(0, 12)}, got ${String(checksum_sha256).slice(0, 12)}).`,
        imported_bots: 0,
        imported_skills: 0,
        skipped_existing_bots: 0,
        zero_secret_verified: true,
      };
    }

    const existingBots = new Set(this.storage.listBots().map((b) => b.name.toLowerCase()));
    let importedBots = 0;
    let skippedBots = 0;

    for (const bot of pkg.bots ?? []) {
      if (existingBots.has(bot.name.toLowerCase())) {
        skippedBots++;
        continue;
      }
      this.storage.createBot({
        name: bot.name,
        label: bot.label,
        description: bot.description,
        avatar_spec: bot.avatar_spec as never,
        routing_target: bot.routing_target,
      });
      existingBots.add(bot.name.toLowerCase());
      importedBots++;
    }

    let importedSkills = 0;
    for (const skill of pkg.custom_skills ?? []) {
      const res = this.installSkillPackage({
        source_type: 'catalog',
        source_ref: `botmrr://${pkg.package_name}/${skill.slug}`,
        slug: skill.slug,
        name: skill.name,
        version: skill.version,
        description: skill.description,
        skill_md: skill.skill_md,
        keywords: skill.keywords,
      });
      // For custom skills from BotMRR, install via zip/tinkabot path if not in curated catalog
      if (!res.installed && !res.requires_trust_review) {
        const direct = this.installSkillPackage({
          source_type: 'zip',
          source_ref: `${skill.slug}.zip`,
          slug: skill.slug,
          name: skill.name,
          version: skill.version,
          description: skill.description,
          skill_md: skill.skill_md,
          keywords: skill.keywords,
        });
        if (direct.installed) importedSkills++;
      } else if (res.installed) {
        importedSkills++;
      }
    }

    return {
      ok: true,
      imported_bots: importedBots,
      imported_skills: importedSkills,
      skipped_existing_bots: skippedBots,
      zero_secret_verified: true,
    };
  }
}

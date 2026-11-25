/**
 * Phase 1 Comprehensive Unit Test Suite (node:test)
 * Tests: qyro-types, qyro-i18n, qyro-storage, qyro-vault, qyro-memory, qyro-backup, qyro-router
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_ANIMATIONS,
  AVATAR_COLORS,
  AVATAR_EXPRESSIONS,
  AVATAR_SHAPES,
  ROUTING_STRATEGIES,
  UNSET_SENTINEL,
  WORKING_MOODS,
} from './types';
import { QyroI18n, resolveTimezone } from './i18n';
import { QyroStorage } from './storage';
import { QyroVault } from './vault';
import { QyroMemory, stripPrivateTags } from './memory';
import { QyroBackup } from './backup';
import { validateCloudEndpoint } from './router/endpointGuard';
import { compressContext, runVerifyRtkGate } from './router/compression';
import { OmniRouteEngine } from './router/engine';

test('qyro-types enforces exact Grok Bot Avatar specification counts', () => {
  assert.equal(AVATAR_SHAPES.length, 8);
  assert.equal(AVATAR_COLORS.length, 12);
  assert.equal(AVATAR_EXPRESSIONS.length, 16);
  assert.equal(AVATAR_ANIMATIONS.length, 15);
  assert.equal(WORKING_MOODS.length, 6);
  assert.equal(ROUTING_STRATEGIES.length, 20);
  const ink = AVATAR_COLORS.find((c) => c.id === 'ink');
  const amber = AVATAR_COLORS.find((c) => c.id === 'amber');
  assert.equal(ink?.hex, '#0a0a0c');
  assert.equal(ink?.eyeHex, '#ffffff');
  assert.equal(amber?.hex, '#f0b429');
  assert.equal(amber?.eyeHex, '#0a0a0c');
});

test('qyro-i18n loads id-ID and en-US Fluent bundles and resolves WIB/WITA/WIT', () => {
  const i18n = new QyroI18n();
  assert.equal(i18n.t('id-ID', 'status-free-only-on'), 'Mode Free-Tier-Only Aktif');
  assert.equal(i18n.t('en-US', 'status-free-only-on'), 'Free-Tier-Only Mode Active');

  const interpolated = i18n.t('id-ID', 'err-free-quota-exhausted', {
    modality: 'coding',
    resetAt: '14:00 WIB',
  });
  assert.match(interpolated, /coding/);
  assert.match(interpolated, /14:00 WIB/);

  assert.equal(resolveTimezone('WIB'), 'Asia/Jakarta');
  assert.equal(resolveTimezone('wita'), 'Asia/Makassar');
  assert.equal(resolveTimezone('WIT'), 'Asia/Jayapura');
});

test('qyro-storage applies full PRD §14.1 schema, resumes event_log gaplessly, and protects pinned items in GC', () => {
  const storage = new QyroStorage(':memory:');
  const stats = storage.getStats();

  // Verify core tables exist
  assert.ok(stats.table_count >= 25, `Expected >= 25 tables, got ${stats.table_count}`);
  assert.equal(stats.schema_version, '0005_phase5_ecosystem_rbac');

  const prefs = storage.getPreferences();
  assert.equal(prefs.ui_locale, 'id-ID');
  assert.equal(prefs.free_only_mode, true);
  assert.equal(prefs.bot_accent_mode, 'bot_color');

  // Monotonic event_log & gapless resume
  const e1 = storage.appendEvent('chat.delta', 'bot-chief-of-staff', { chunk: 'Halo' });
  const e2 = storage.appendEvent('chat.delta', 'bot-chief-of-staff', { chunk: ' dunia' });
  assert.ok(e2.event_id > e1.event_id);

  const resumed = storage.resumeEvents(e1.event_id);
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].event_id, e2.event_id);

  // Action queue lifecycle
  const act = storage.enqueueAction('bot-chief-of-staff', 'approval', { title: 'Test approval' });
  assert.equal(act.status, 'pending');
  const resolved = storage.resolveAction(act.id, 'approved');
  assert.equal(resolved?.status, 'resolved');

  // Storage GC preserves pinned items while removing stale unpinned rtk cache
  storage.addLibraryItem({
    kind: 'rtk_raw_cache',
    title: 'old-rtk.log',
    size_bytes: 5000,
    pinned: false,
    ageDays: 20,
  });
  storage.addLibraryItem({
    kind: 'rtk_raw_cache',
    title: 'pinned-rtk.log',
    size_bytes: 5000,
    pinned: true,
    ageDays: 60,
  });

  const gc = storage.runStorageGc();
  assert.ok(gc.deleted_rtk_cache >= 1);
  assert.ok(gc.preserved_pinned_items >= 2);
  const remaining = storage.listLibraryItems();
  assert.ok(remaining.some((item) => item.title === 'pinned-rtk.log' && item.pinned));
  assert.ok(!remaining.some((item) => item.title === 'old-rtk.log'));

  storage.close();
});

test('qyro-vault enforces ChaCha20-Poly1305 AEAD, Write-Only metadata, tamper detection, and redaction', () => {
  const storage = new QyroStorage(':memory:');
  const vault = new QyroVault(storage, 'unit-test-master-secret');

  const meta = vault.setSecret('GROQ_FREE_KEY', 'gsk_superSecretTokenValue99887766', 'groq-cloud');
  assert.equal(meta.configured, true);
  assert.equal(meta.key_name, 'GROQ_FREE_KEY');
  assert.equal((meta as unknown as Record<string, unknown>).plaintext, undefined);

  // Backend-only resolution works
  const decrypted = vault.resolveForBackendExecution('GROQ_FREE_KEY');
  assert.equal(decrypted, 'gsk_superSecretTokenValue99887766');

  // Redaction strips stored secret AND generic bearer/API key patterns
  const red = vault.redactSecrets(
    'Failed call with key gsk_superSecretTokenValue99887766 and sk-proj-abcdef1234567890xyz'
  );
  assert.equal(red.redacted.includes('gsk_superSecretTokenValue99887766'), false);
  assert.equal(red.redacted.includes('sk-proj-abcdef1234567890xyz'), false);
  assert.ok(red.matches_removed >= 2);

  // Tampering ciphertext causes authentication tag failure
  storage.db
    .prepare(`UPDATE vault_secrets SET ciphertext_b64 = ? WHERE key_name = ?`)
    .run(Buffer.from('tampered-bytes').toString('base64'), 'GROQ_FREE_KEY');
  assert.throws(() => vault.resolveForBackendExecution('GROQ_FREE_KEY'));

  storage.close();
});

test('qyro-memory strips <private> tags before persistence/FTS5 and executes 3-step mem-search', () => {
  const storage = new QyroStorage(':memory:');
  const memory = new QyroMemory(storage);

  const stripped = stripPrivateTags('Public note <private>PIN-RAHASIA-8844</private> end.');
  assert.equal(stripped.redactedCount, 1);
  assert.equal(stripped.sanitized.includes('PIN-RAHASIA-8844'), false);

  const obs = memory.recordObservation({
    title: 'Konfigurasi Server Ampere',
    body: 'Deploy qyro-server pada ARM64 <private>password-root-super-rahasia</private> selesai.',
    tags: ['ampere', 'arm64'],
  });

  assert.equal(obs.private_blocks_redacted, 1);
  assert.equal(obs.body.includes('password-root-super-rahasia'), false);

  // Private content MUST NOT be searchable via FTS5
  const leakedHits = memory.memSearchIndex('password-root-super-rahasia');
  assert.equal(leakedHits.length, 0);

  // Step 1: Index search finds public text
  const indexHits = memory.memSearchIndex('Ampere');
  assert.ok(indexHits.some((h) => h.id === obs.id));

  // Step 2: Timeline returns chronological neighbors in same session
  const timeline = memory.memSearchTimeline(obs.id, 3);
  assert.ok(timeline.some((h) => h.id === obs.id));

  // Step 3: Details returns full body for chosen IDs
  const details = memory.memSearchDetails([obs.id]);
  assert.equal(details.length, 1);
  assert.equal(details[0].id, obs.id);
  assert.equal(details[0].private_blocks_redacted, 1);

  storage.close();
});

test('qyro-backup creates encrypted .qyrobak archive, rejects wrong passphrase, and restores cleanly into fresh DB', () => {
  const srcStorage = new QyroStorage(':memory:');
  const srcVault = new QyroVault(srcStorage, 'same-vault-key');
  const srcMemory = new QyroMemory(srcStorage);
  srcVault.setSecret('OPENROUTER_KEY', 'sk-or-v1-testvalue1234567890', 'openrouter-free');
  srcMemory.recordObservation({
    title: 'Migrasi AMD ke Ampere',
    body: 'Snapshot lintas arsitektur terverifikasi.',
    tags: ['backup'],
  });

  const backup = new QyroBackup(srcStorage);
  const snap = backup.createSnapshot('strong-backup-passphrase', 'compact');
  assert.ok(snap.size_bytes > 64);
  assert.equal(snap.archive.subarray(0, 8).toString('ascii'), 'QYROBAK1');

  // Wrong passphrase MUST fail
  assert.throws(() => QyroBackup.decryptAndVerify(snap.archive, 'wrong-passphrase'));

  // Tampered byte MUST fail
  const tampered = Buffer.from(snap.archive);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => QyroBackup.decryptAndVerify(tampered, 'strong-backup-passphrase'));

  // Restore into a completely fresh SQLite DB
  const dstStorage = new QyroStorage(':memory:');
  const dstBackup = new QyroBackup(dstStorage);
  const restored = dstBackup.restoreSnapshot(snap.archive, 'strong-backup-passphrase');
  assert.ok(restored.restored_tables.vault_secrets >= 1);

  const dstVault = new QyroVault(dstStorage, 'same-vault-key');
  assert.equal(dstVault.resolveForBackendExecution('OPENROUTER_KEY'), 'sk-or-v1-testvalue1234567890');

  const dstMemory = new QyroMemory(dstStorage);
  assert.ok(dstMemory.memSearchIndex('Ampere').length >= 1);

  srcStorage.close();
  dstStorage.close();
});

test('qyro-router Anti-Local-Model Guard blocks all local endpoints and VoxCPM2 UNSET', () => {
  const blockedUrls = [
    'http://localhost:11434/v1',
    'https://localhost:8000/v1',
    'http://127.0.0.1:1234/v1',
    'http://[::1]:8080/v1',
    'http://0.0.0.0:11434',
    'http://host.docker.internal:11434/v1',
    'https://192.168.1.20:11434/v1',
    'https://10.0.0.5:8000/v1',
    'http://api.openai.com/v1', // plain HTTP rejected
    UNSET_SENTINEL,
  ];

  for (const url of blockedUrls) {
    const res = validateCloudEndpoint(url, 'voxcpm2-cloud');
    assert.equal(res.allowed, false, `Expected "${url}" to be blocked`);
  }

  const valid = validateCloudEndpoint('https://voxcpm2.cloud.example.com/v1/audio/speech', 'voxcpm2-cloud');
  assert.equal(valid.allowed, true);
});

test('qyro-router enforces Free-Tier-Only Mode and supports all 20 routing strategies', () => {
  const storage = new QyroStorage(':memory:');
  const router = new OmniRouteEngine(storage);

  // VoxCPM2 starts UNSET
  const voxUnset = router.route({ target: 'voxcpm2-cloud' });
  assert.equal(voxUnset.ok, false);
  assert.equal(voxUnset.error_code, 'VOXCPM2_ENDPOINT_UNSET');

  // Configuring VoxCPM2 with localhost MUST be rejected
  const voxLocal = router.configureVoxCpm2Endpoint('http://127.0.0.1:8000/v1');
  assert.equal(voxLocal.ok, false);

  // Configuring VoxCPM2 with remote HTTPS succeeds
  const voxRemote = router.configureVoxCpm2Endpoint('https://voxcpm2.mycloud.dev/v1');
  assert.equal(voxRemote.ok, true);
  const voxRouted = router.route({ target: 'voxcpm2-cloud' });
  assert.equal(voxRouted.ok, true);
  assert.equal(voxRouted.selected_provider?.id, 'voxcpm2-cloud');

  // Free-Tier-Only Mode MUST NOT silently fall back to paid providers when free quota is exhausted
  const exhausted = router.route({
    target: 'auto/coding',
    freeOnlyOverride: true,
    simulateFreeExhausted: true,
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.error_code, 'FREE_QUOTA_EXHAUSTED');
  assert.ok(exhausted.earliest_reset_at);

  // When Free-Tier-Only Mode is explicitly disabled, paid providers become eligible
  const paidAllowed = router.route({
    target: 'auto/coding',
    freeOnlyOverride: false,
    simulateFreeExhausted: true,
  });
  assert.equal(paidAllowed.ok, true);
  assert.equal(paidAllowed.selected_provider?.tier, 'paid');

  // All 20 routing strategies must execute cleanly
  for (const strategy of ROUTING_STRATEGIES) {
    const decision = router.route({
      target: 'auto/coding',
      strategy,
      freeOnlyOverride: true,
    });
    assert.equal(decision.ok, true, `Strategy "${strategy}" failed`);
    assert.ok(
      decision.selected_provider?.tier === 'free' || decision.selected_provider?.tier === 'oauth_sub',
      `Strategy "${strategy}" selected non-free provider under Free-Tier-Only Mode`
    );
  }

  storage.close();
});

test('qyro-router RTK + Caveman Language Guard and verify-rtk gate pass 100%', () => {
  const report = runVerifyRtkGate();
  assert.equal(report.passed, true, JSON.stringify(report.checks, null, 2));
  assert.equal(report.passed_checks, report.total_checks);

  // Double-check Indonesian prose stays Indonesian and keeps negations
  const res = compressContext({
    text: 'Sebenarnya pada dasarnya sistem ini tidak boleh mengirim data rahasia, jangan pernah hapus backup yang di-pin, dan wajib memakai HTTPS.',
    role: 'user_prose',
    cavemanIntensity: 'aggressive',
  });
  assert.equal(res.detected_language, 'id-ID');
  assert.ok(res.output.includes('tidak'));
  assert.ok(res.output.includes('jangan'));
  assert.ok(res.output.includes('wajib'));
  assert.ok(res.savings_pct > 15);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QyroStorage } from './storage';
import { QyroMemory } from './memory';
import { QyroComputerEngine } from './computer';
import {
  QyroXBridgeEngine,
  computeLogNormalDelayMs,
  detectXAnomaly,
  extractXManifestFromBundle,
  getWarmupQuota,
  isWithinActiveHours,
} from './x-bridge';

function createTempManifestPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qyro-x-test-'));
  return path.join(dir, 'x-manifest.json');
}

test('qyro-x-bridge Dynamic Bundle Extractor starts UNSET, parses real queryId pairs with SHA-256, and gates writes when UNSET', () => {
  const storage = new QyroStorage(':memory:');
  const memory = new QyroMemory(storage);
  const computer = new QyroComputerEngine(storage, memory);
  const manifestPath = createTempManifestPath();
  const xBridge = new QyroXBridgeEngine(storage, computer, manifestPath);

  // 1. Starts UNSET (PRD §14.2 zero hardcoded queryId)
  const initSnap = xBridge.getSnapshot();
  assert.equal(initSnap.manifest.status, 'UNSET');
  assert.equal(initSnap.manifest.query_ids, 'UNSET');
  assert.equal(initSnap.manifest.bundle_hash, 'UNSET');

  // 2. Empty/garbage bundle keeps manifest UNSET
  const badExtract = xBridge.extractManifest('console.log("no graphql ops here");');
  assert.equal(badExtract.ok, false);
  assert.equal(badExtract.snapshot.manifest.status, 'UNSET');

  // 3. Complete self-auth, still blocked by MANIFEST_UNSET before extraction
  xBridge.completeSelfAuthLogin({
    handle: 'qyro_builder',
    pinned_ip: '203.0.113.42',
    warmup_day: 5,
  });
  const evalBeforeExtract = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '203.0.113.42',
    now: new Date('2026-11-25T05:00:00Z'), // 12:00 WIB
  });
  assert.equal(evalBeforeExtract.allowed, false);
  assert.equal(evalBeforeExtract.code, 'MANIFEST_UNSET');

  // 4. Extract from realistic X webpack bundle snippet
  const sampleBundle = `
    e.exports={queryId:"aBcDeFgHiJkLmN0123",operationName:"CreateTweet",operationType:"mutation"};
    e.exports={operationName:"Bookmarks",queryId:"ZyXwVuTsRqPoNm9876",operationType:"query"};
    const sw={"responsive_web_graphql_exclude_directive_enabled":true,"tweetypie_unmention_optimization_enabled":true};
  `;
  const extracted = xBridge.extractManifest(sampleBundle, 'main.test.js');
  assert.equal(extracted.ok, true);
  assert.equal(extracted.extracted_query_count, 2);
  assert.equal(extracted.extracted_switch_count, 2);
  assert.equal(extracted.snapshot.manifest.status, 'EXTRACTED');
  assert.ok(extracted.snapshot.manifest.bundle_hash.startsWith('sha256:'));
  assert.notEqual(extracted.snapshot.manifest.query_ids, 'UNSET');
  if (extracted.snapshot.manifest.query_ids !== 'UNSET') {
    assert.equal(extracted.snapshot.manifest.query_ids.CreateTweet, 'aBcDeFgHiJkLmN0123');
    assert.equal(extracted.snapshot.manifest.query_ids.Bookmarks, 'ZyXwVuTsRqPoNm9876');
  }

  // 5. Reset back to UNSET cleanly
  const resetSnap = xBridge.resetManifestToUnset();
  assert.equal(resetSnap.manifest.status, 'UNSET');
  assert.equal(resetSnap.manifest.query_ids, 'UNSET');
});

test('qyro-x-bridge enforces all 6 X Shield layers: Write Gate + Humanizer, Active Hours + Jitter, IP Pin, Zero-Leak, Circuit Breaker, Warm-Up Days 1-7', () => {
  const storage = new QyroStorage(':memory:');
  const memory = new QyroMemory(storage);
  const computer = new QyroComputerEngine(storage, memory);
  const manifestPath = createTempManifestPath();
  const xBridge = new QyroXBridgeEngine(storage, computer, manifestPath);

  // Setup: Self-Auth + Extracted Manifest
  xBridge.completeSelfAuthLogin({
    handle: '@qyro_ops',
    pinned_ip: '198.51.100.77',
    warmup_day: 1,
  });
  xBridge.extractManifest('e.exports={queryId:"qWeRtYuIoPaSdFg123",operationName:"CreateTweet"};');

  const noonWib = new Date('2026-11-25T05:00:00Z'); // 12:00 Asia/Jakarta (WIB)
  const threeAmWib = new Date('2026-11-25T20:00:00Z'); // 03:00 Asia/Jakarta (WIB)

  // Layer 1: Strict Write Gate rejects unapproved auto-post
  const unapproved = xBridge.evaluateWriteShield({
    humanApproved: false,
    outboundIp: '198.51.100.77',
    now: noonWib,
  });
  assert.equal(unapproved.allowed, false);
  assert.equal(unapproved.code, 'STRICT_WRITE_GATE_BLOCKED');

  // Layer 6: Warm-Up Day 1-2 blocks writes (max_writes_per_day = 0)
  assert.equal(getWarmupQuota(1).max_writes_per_day, 0);
  assert.equal(getWarmupQuota(2).max_writes_per_day, 0);
  assert.equal(getWarmupQuota(3).max_writes_per_day, 3);
  assert.equal(getWarmupQuota(5).max_writes_per_day, 8);
  assert.equal(getWarmupQuota(7).max_writes_per_day, 15);

  const day1Block = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '198.51.100.77',
    now: noonWib,
  });
  assert.equal(day1Block.allowed, false);
  assert.equal(day1Block.code, 'WARMUP_WRITE_LIMIT');

  // Advance to Warm-Up Day 4 (writes allowed: 3/day)
  xBridge.updateShieldConfig({ warmup_day: 4, active_tz: 'Asia/Jakarta', active_start_hour: 7, active_end_hour: 23 });

  // Layer 2: Active Hours WIB check & Log-Normal Jitter bounds
  assert.equal(isWithinActiveHours(12, 7, 23), true);
  assert.equal(isWithinActiveHours(3, 7, 23), false);
  const jitter = computeLogNormalDelayMs(22, 0.55, () => 0.5);
  assert.ok(jitter >= 4_000 && jitter <= 180_000, `Unexpected jitter ${jitter}`);

  const outsideHours = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '198.51.100.77',
    now: threeAmWib,
  });
  assert.equal(outsideHours.allowed, false);
  assert.equal(outsideHours.code, 'OUTSIDE_ACTIVE_HOURS');

  // Layer 3: IP & Session Pinning rejects mid-session IP drift
  const ipDrift = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '192.0.2.99',
    now: noonWib,
  });
  assert.equal(ipDrift.allowed, false);
  assert.equal(ipDrift.code, 'IP_MISMATCH_BLOCKED');

  // Layer 4: Zero-Leak Hygiene rejects headless_forbidden
  xBridge.updateShieldConfig({ display_mode: 'headless_forbidden' });
  const headlessBlock = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '198.51.100.77',
    now: noonWib,
  });
  assert.equal(headlessBlock.allowed, false);
  assert.equal(headlessBlock.code, 'ZERO_LEAK_HEADLESS_BLOCKED');
  xBridge.updateShieldConfig({ display_mode: 'cage_wayland' });

  // Layer 1 + Humanizer + Full 6-Layer Approval Dispatch
  const proposed = xBridge.proposeWriteDraft({
    bot_id: 'bot-chief-of-staff',
    action_kind: 'post_tweet',
    raw_text: 'Di era digital saat ini, mari kita delve into rilis QyroBot Fase 4!',
  });
  assert.equal(proposed.draft.status, 'awaiting_approval');
  assert.ok(proposed.draft.patterns_cleaned.length >= 2);
  assert.ok(!proposed.draft.humanized_text.toLowerCase().includes('delve into'));

  const dispatched = xBridge.approveAndDispatchDraft(proposed.draft.id, {
    outbound_ip: '198.51.100.77',
    now: noonWib,
    rng: () => 0.5,
  });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.draft?.status, 'dispatched');
  assert.equal(dispatched.snapshot.profile.writes_today, 1);

  // Layer 5: Anomaly & Challenge Circuit Breaker -> PAUSED_NEEDS_HUMAN (0 auto-retry)
  assert.equal(detectXAnomaly({ httpStatus: 429 }).tripped, true);
  assert.equal(detectXAnomaly({ bodySnippet: 'Arkose challenge_required' }).tripped, true);

  const tripped = xBridge.tripCircuitBreaker({
    bot_id: 'bot-chief-of-staff',
    http_status: 429,
  });
  assert.equal(tripped.tripped, true);
  assert.equal(tripped.snapshot.profile.status, 'paused_needs_human');

  const pausedBlock = xBridge.evaluateWriteShield({
    humanApproved: true,
    outboundIp: '198.51.100.77',
    now: noonWib,
  });
  assert.equal(pausedBlock.allowed, false);
  assert.equal(pausedBlock.code, 'CIRCUIT_BREAKER_PAUSED');

  // Human resume unlocks account cleanly
  const resumed = xBridge.resumeAfterHumanCheck();
  assert.equal(resumed.profile.status, 'authenticated');
});

test('qyro-x-bridge supports all 3 Free Global Triggers (Bookmark, Self-DM, Mention/Alt allowlist) without auto-posting', () => {
  const storage = new QyroStorage(':memory:');
  const memory = new QyroMemory(storage);
  const computer = new QyroComputerEngine(storage, memory);
  const manifestPath = createTempManifestPath();
  const xBridge = new QyroXBridgeEngine(storage, computer, manifestPath);

  xBridge.completeSelfAuthLogin({ handle: 'owner_id', pinned_ip: '203.0.113.10', warmup_day: 3 });
  xBridge.updateShieldConfig({ alt_allowlist: ['@trusted_alt'] });

  // 1. Bookmark trigger -> creates humanized draft awaiting approval
  const bm = xBridge.ingestFreeTrigger({
    trigger_kind: 'bookmark',
    bot_id: 'bot-chief-of-staff',
    source_handle: '@rustlang',
    folder_or_thread: 'Rust Releases',
    source_text: 'Rust 2024 edition memory safety summary.',
  });
  assert.equal(bm.accepted, true);
  assert.equal(bm.draft?.status, 'awaiting_approval');
  assert.equal(bm.draft?.action_kind, 'quote_tweet');

  // 2. Self-DM trigger
  const dm = xBridge.ingestFreeTrigger({
    trigger_kind: 'self_dm',
    bot_id: 'bot-chief-of-staff',
    source_handle: '@owner_id',
    source_text: 'Buat thread rilis v1.7 sore ini jam 17 WIB.',
  });
  assert.equal(dm.accepted, true);
  assert.equal(dm.draft?.action_kind, 'post_tweet');

  // 3. Mention/Alt trigger: untrusted handle rejected, allowlisted handle accepted
  const rejectedMention = xBridge.ingestFreeTrigger({
    trigger_kind: 'mention_alt',
    bot_id: 'bot-chief-of-staff',
    source_handle: '@random_spammer',
    source_text: 'Reply to this spam!',
  });
  assert.equal(rejectedMention.accepted, false);

  const allowedMention = xBridge.ingestFreeTrigger({
    trigger_kind: 'mention_alt',
    bot_id: 'bot-chief-of-staff',
    source_handle: '@trusted_alt',
    source_text: 'Tolong bantu ringkas performa VPS Ampere hari ini.',
  });
  assert.equal(allowedMention.accepted, true);
  assert.equal(allowedMention.draft?.action_kind, 'reply');
  assert.equal(allowedMention.snapshot.trigger_events.length, 3);
});

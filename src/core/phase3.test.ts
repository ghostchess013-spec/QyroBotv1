import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { QyroStorage } from './storage';
import { QyroMemory } from './memory';
import { COMPUTER_BACKENDS, QyroComputerEngine } from './computer';
import {
  QyroReaMcpBridge,
  extractAsciiStrings,
  inspectBinaryBuffer,
  scanAobPattern,
} from './mcp';
import { ANDROID_5_TAURI_PLUGINS, QyroPairingManager } from './pairing';

function tempDbPath(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `qyro-p3-${prefix}-`));
  return path.join(dir, 'test.db');
}

test('qyro-computer enforces 4 backends, cgroups max-tabs, Camoufox fallback, Auto-Sleep, Watchdog, Takeover, and Teach a Task', () => {
  const dbPath = tempDbPath('computer');
  const storage = new QyroStorage(dbPath);
  const memory = new QyroMemory(storage);
  try {
    assert.equal(COMPUTER_BACKENDS.length, 4);
    const computer = new QyroComputerEngine(storage, memory);

    // 1. Camoufox fallback when binary absent on host
    const afterCamoufox = computer.updateConfig({ browser_engine: 'camoufox', max_tabs: 2 });
    const camProbe = afterCamoufox.probes.find((p) => p.binary === 'camoufox');
    if (!camProbe?.detected) {
      assert.equal(afterCamoufox.policy.effective_browser, 'chromium');
      assert.ok(afterCamoufox.policy.camoufox_fallback_reason);
    }

    // 2. Hard max_tabs enforcement (1 initial tab + 1 allowed -> 3rd blocked)
    const tab2 = computer.openTab('https://example.com', 'Example');
    assert.equal(tab2.ok, true);
    const tab3 = computer.openTab('https://blocked.example.com', 'Blocked');
    assert.equal(tab3.ok, false);
    assert.match(tab3.error ?? '', /maksimal 2 tab/i);

    // 3. Auto-Sleep drops RAM estimate to <= 60 MB while keeping profile intact
    const asleep = computer.triggerIdleSleep();
    assert.equal(asleep.state, 'sleeping');
    assert.ok(asleep.estimated_ram_mb <= 60);
    assert.equal(asleep.persistent_profile_preserved, true);

    // 4. Watchdog crash recovery restarts cleanly
    const rec = computer.simulateWatchdogCrashRecovery();
    assert.equal(rec.recovered, true);
    assert.equal(rec.restarts, 1);
    assert.equal(rec.snapshot.state, 'running');

    // 5. Takeover (Ambil alih -> Selesai)
    const tk = computer.startTakeover('bot-chief-of-staff', 'Login CAPTCHA');
    assert.equal(tk.state, 'takeover');
    assert.ok(tk.takeover_action_id);
    const doneTk = computer.endTakeover();
    assert.equal(doneTk.state, 'running');
    assert.equal(doneTk.takeover_action_id, null);

    // 6. Teach a Task records steps, persists to SQLite & qyro-memory, and replays
    computer.startRecordingTask();
    computer.recordStep({ action: 'click', target: '#login-btn' });
    computer.runPtyCommand('free -m');
    const saved = computer.saveTaughtTask({ name: 'Daily Status Check', description: 'Verify status' });
    assert.equal(saved.task.steps.length, 2);
    const replayed = computer.replayTaughtTask(saved.task.id);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.steps_executed, 2);

    const memHits = memory.memSearchIndex('Daily Status Check', 5);
    assert.ok(memHits.length >= 1);
  } finally {
    storage.close();
  }
});

test('qyro-mcp performs real PE/ELF inspection, exact AOB wildcard scan, ASCII strings, and honest BACKEND_UNSET gating', () => {
  const dbPath = tempDbPath('mcp');
  const storage = new QyroStorage(dbPath);
  try {
    const mcp = new QyroReaMcpBridge(storage);

    // 1. Minimal valid 64-bit ELF header buffer
    const elfBuf = Buffer.alloc(64);
    elfBuf[0] = 0x7f;
    elfBuf[1] = 0x45;
    elfBuf[2] = 0x4c;
    elfBuf[3] = 0x46;
    elfBuf[4] = 2; // 64-bit
    elfBuf[5] = 1; // little endian
    elfBuf.writeUInt16LE(0x3e, 18); // EM_X86_64
    elfBuf.writeBigUInt64LE(0x401000n, 24); // entry point
    elfBuf.writeUInt16LE(12, 60); // e_shnum
    const elfInfo = inspectBinaryBuffer(elfBuf);
    assert.equal(elfInfo.valid, true);
    assert.equal(elfInfo.format, 'ELF');
    assert.equal(elfInfo.bits, 64);
    assert.equal(elfInfo.machine, 'x86_64 (EM_X86_64)');
    assert.equal(elfInfo.entry_point_rva, '0x401000');
    assert.equal(elfInfo.section_count, 12);

    // 2. Minimal valid PE x64 buffer
    const peBuf = Buffer.alloc(0x100);
    peBuf.write('MZ', 0, 'ascii');
    peBuf.writeUInt32LE(0x80, 0x3c); // e_lfanew = 0x80
    peBuf.write('PE\0\0', 0x80, 'ascii');
    peBuf.writeUInt16LE(0x8664, 0x84); // AMD64
    peBuf.writeUInt16LE(5, 0x86); // 5 sections
    peBuf.writeUInt16LE(0x20b, 0x98); // PE32+
    peBuf.writeUInt32LE(0x1450, 0x98 + 16); // AddressOfEntryPoint
    const peInfo = inspectBinaryBuffer(peBuf);
    assert.equal(peInfo.valid, true);
    assert.equal(peInfo.format, 'PE');
    assert.equal(peInfo.machine, 'x64 (AMD64)');
    assert.equal(peInfo.section_count, 5);
    assert.equal(peInfo.entry_point_rva, '0x1450');

    // 3. Exact AOB wildcard scan
    const codeBuf = Buffer.from([0x90, 0x48, 0x8b, 0x05, 0x11, 0x22, 0xe8, 0xaa, 0xbb, 0x90]);
    const matches = scanAobPattern(codeBuf, '48 8B ?? 11 ?? E8');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].file_offset_dec, 1);
    assert.equal(matches[0].file_offset_hex, '0x0001');

    // 4. ASCII strings extraction
    const strBuf = Buffer.concat([Buffer.from([0, 0]), Buffer.from('QyroEngineInit', 'ascii'), Buffer.from([0, 1])]);
    const strs = extractAsciiStrings(strBuf, 4);
    assert.equal(strs.length, 1);
    assert.equal(strs[0].value, 'QyroEngineInit');
    assert.equal(strs[0].file_offset_hex, '0x0002');

    // 5. MCP JSON-RPC 2.0 tools/list + honest BACKEND_UNSET gating for decompile
    const listResp = mcp.handleJsonRpc({ id: 1, method: 'tools/list' }) as {
      result: { tools: Array<{ name: string }> };
    };
    assert.equal(listResp.result.tools.length, 5);

    const decompResp = mcp.handleJsonRpc({
      id: 2,
      method: 'tools/call',
      params: { name: 'rea_decompile_function', arguments: { rva: '0x1450' } },
    }) as { result: { ok: boolean; status?: string } };
    const hasDecompiler = mcp
      .getProbes()
      .some((p) => ['ghidra', 'ida', 'hopper', 'kuna'].includes(p.engine) && p.detected);
    if (!hasDecompiler) {
      assert.equal(decompResp.result.ok, false);
      assert.equal(decompResp.result.status, 'BACKEND_UNSET');
    }
  } finally {
    storage.close();
  }
});

test('qyro-pairing enforces real Ed25519 QR 120s handshake, rejects bad/replayed/expired tokens, instant revoke, and 5-min fail-closed Android permissions', () => {
  const dbPath = tempDbPath('pairing');
  const storage = new QyroStorage(dbPath);
  try {
    assert.equal(ANDROID_5_TAURI_PLUGINS.length, 5);
    const pairing = new QyroPairingManager(storage);
    const offer = pairing.createPairingOffer('https://vps.qyrobot.dev');
    assert.equal(offer.ttl_seconds, 120);
    assert.equal(offer.qr_matrix.length, 25);

    // 1. Reject forged Ed25519 signature
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const pubDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).toString('base64');
    const forged = pairing.completePairing({
      one_time_pairing_token: offer.one_time_pairing_token,
      device_name: 'Forged Phone',
      platform: 'android',
      client_ed25519_pubkey_spki_b64: pubDer,
      signature_b64: Buffer.alloc(64, 1).toString('base64'),
    });
    assert.equal(forged.ok, false);

    // 2. Reject expired (> 120s)
    const offerExp = pairing.createPairingOffer('https://vps.qyrobot.dev');
    const { publicKey: pk2, privateKey: sk2 } = crypto.generateKeyPairSync('ed25519');
    const sig2 = crypto.sign(null, Buffer.from(offerExp.one_time_pairing_token, 'utf8'), sk2);
    const expired = pairing.completePairing({
      one_time_pairing_token: offerExp.one_time_pairing_token,
      device_name: 'Late Phone',
      platform: 'android',
      client_ed25519_pubkey_spki_b64: Buffer.from(pk2.export({ format: 'der', type: 'spki' })).toString('base64'),
      signature_b64: sig2.toString('base64'),
      nowMs: Date.now() + 130_000,
    });
    assert.equal(expired.ok, false);

    // 3. Valid Ed25519 handshake succeeds & second replay fails
    const okPair = pairing.simulateEd25519ClientHandshake({
      one_time_pairing_token: offer.one_time_pairing_token,
      device_name: 'Pixel 9 Pro',
    });
    assert.equal(okPair.ok, true);
    assert.ok(okPair.device?.id);

    const replay = pairing.simulateEd25519ClientHandshake({
      one_time_pairing_token: offer.one_time_pairing_token,
      device_name: 'Replay Attack',
    });
    assert.equal(replay.ok, false);

    // 4. Permanently ban NotificationListenerService (PRD §5)
    const banned = pairing.requestDevicePermission({
      bot_id: 'bot-chief-of-staff',
      device_id: okPair.device!.id,
      capability: 'notification_listener',
      reason: 'Read notifications',
    });
    assert.equal(banned.denied, true);

    // 5. Request valid capability -> pending 300s fail-closed -> expires when swept after 301s
    const permReq = pairing.requestDevicePermission({
      bot_id: 'bot-chief-of-staff',
      device_id: okPair.device!.id,
      capability: 'calendar',
      reason: 'Check meetings today',
    });
    assert.ok(permReq.pending_request?.action_id);
    assert.equal(permReq.pending_request?.fail_closed_seconds, 300);

    const expiredCount = pairing.sweepExpiredPermissions(Date.now() + 305_000);
    assert.equal(expiredCount, 1);

    // 6. Instant Revoke blocks future permission requests
    const revoked = pairing.revokeDevice(okPair.device!.id);
    assert.ok(revoked?.revoked_at);
    const afterRevoke = pairing.requestDevicePermission({
      bot_id: 'bot-chief-of-staff',
      device_id: okPair.device!.id,
      capability: 'location',
      reason: 'Weather check',
    });
    assert.equal(afterRevoke.denied, true);
  } finally {
    storage.close();
  }
});

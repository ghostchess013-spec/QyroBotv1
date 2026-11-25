import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  KeyRound,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { BotRecord, DeviceAuthRecord, EventEnvelope, UiLocale } from '../core/types';
import type {
  AndroidDeviceCapability,
  AndroidTauriPluginSpec,
  DevicePermissionPolicy,
  DevicePermissionRecord,
  PairingOffer,
} from '../core/pairing';
import { api } from '../lib/api';

interface PairingDevicesPanelProps {
  bots: BotRecord[];
  activeBotId: string;
  locale: UiLocale;
  onRefreshBootstrap: () => Promise<void>;
}

const CAPABILITIES: AndroidDeviceCapability[] = ['calendar', 'contacts', 'location', 'alarms_timers'];

export const PairingDevicesPanel: React.FC<PairingDevicesPanelProps> = ({
  bots,
  activeBotId,
  locale,
  onRefreshBootstrap,
}) => {
  const isId = locale === 'id-ID';
  const [serverPubKey, setServerPubKey] = useState('');
  const [devices, setDevices] = useState<DeviceAuthRecord[]>([]);
  const [permissions, setPermissions] = useState<DevicePermissionRecord[]>([]);
  const [plugins, setPlugins] = useState<AndroidTauriPluginSpec[]>([]);
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [simDeviceName, setSimDeviceName] = useState('Pixel 9 Pro (Android 14)');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [permMsg, setPermMsg] = useState<string | null>(null);

  const [resumeCursor, setResumeCursor] = useState('0');
  const [resumedEvents, setResumedEvents] = useState<EventEnvelope[]>([]);

  const [shareBotId, setShareBotId] = useState(activeBotId);
  const [shareTitle, setShareTitle] = useState('Artikel Riset Android');
  const [shareText, setShareText] = useState('Ringkas artikel ini dan simpan ke qyro-memory.');

  const loadState = useCallback(async () => {
    const res = await api.getPairingState();
    setServerPubKey(res.server_ed25519_pubkey);
    setDevices(res.devices);
    setPermissions(res.permissions);
    setPlugins(res.android_plugins);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (!offer) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((Date.parse(offer.expires_at) - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offer]);

  const handleGenerateQr = async () => {
    setStatusMsg(null);
    const res = await api.createPairingOffer(window.location.origin);
    setOffer(res.offer);
  };

  const handleSimulateHandshake = async () => {
    if (!offer) return;
    const res = await api.simulatePairingHandshake({
      one_time_pairing_token: offer.one_time_pairing_token,
      device_name: simDeviceName,
      platform: 'android-14-arm64',
    });
    if (res.data.ok) {
      setDevices(res.data.devices);
      setPermissions(res.data.permissions);
      setStatusMsg(
        isId
          ? `Handshake Ed25519 terverifikasi! Perangkat "${res.data.device?.name}" terhubung.`
          : `Ed25519 handshake verified! Device "${res.data.device?.name}" paired.`
      );
      setOffer(null);
    } else {
      setStatusMsg(res.data.error ?? 'Pairing failed');
    }
  };

  const handleRevoke = async (deviceId: string) => {
    const res = await api.revokeDevice(deviceId);
    setDevices(res.devices);
    setStatusMsg(
      isId
        ? `Perangkat ${deviceId} dicabut instan (<1 detik). Kunci publik Ed25519 dibatalkan.`
        : `Device ${deviceId} instantly revoked (<1s). Ed25519 public key invalidated.`
    );
    await onRefreshBootstrap();
  };

  const handleRequestPerm = async (deviceId: string, capability: string) => {
    const res = await api.requestDevicePermission({
      bot_id: activeBotId,
      device_id: deviceId,
      capability,
      reason: `Akses ${capability} dari bot aktif`,
    });
    if (res.data.denied) {
      setPermMsg(res.data.error ?? 'Ditolak');
    } else if (res.data.allowed_immediately) {
      setPermMsg(isId ? `Diizinkan langsung (${capability} = always_allow).` : `Allowed immediately (${capability}).`);
    } else if (res.data.pending_request) {
      setPermMsg(
        isId
          ? `Kartu "QyroBot butuh izin" (${capability}) masuk Perlu Perhatian — fail-closed 300 detik.`
          : `Permission card (${capability}) queued in Needs Attention — 300s fail-closed.`
      );
      await onRefreshBootstrap();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1060px] mx-auto space-y-6">
        <div className="border-b border-[var(--border-subtle)] pb-4 space-y-1">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {isId ? 'Pairing QR Ed25519, Perangkat & 5 Plugin Android Tauri' : 'Ed25519 QR Pairing, Devices & 5 Android Tauri Plugins'}
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] truncate">
            Server Ed25519 PubKey: {serverPubKey.slice(0, 44)}...
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* QR Pairing Generator & Handshake */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-[var(--text-secondary)]" />
                {isId ? 'Zero-Password QR Pairing (120 Detik)' : 'Zero-Password QR Pairing (120s TTL)'}
              </h2>
              <button
                type="button"
                onClick={() => void handleGenerateQr()}
                className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                {isId ? 'Buat QR Baru' : 'Generate QR'}
              </button>
            </div>

            {offer ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <svg
                    viewBox={`0 0 ${offer.qr_matrix.length} ${offer.qr_matrix.length}`}
                    className="w-36 h-36 bg-white p-2 rounded-xl border border-[var(--border-subtle)] shrink-0"
                    role="img"
                    aria-label="Ed25519 One-Time QR Pairing Code"
                  >
                    {offer.qr_matrix.map((row, r) =>
                      row.map((cell, c) =>
                        cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0a0a0c" /> : null
                      )
                    )}
                  </svg>
                  <div className="space-y-1.5 text-xs min-w-0 flex-1">
                    <p className="font-mono tabular-nums font-semibold text-[var(--status-warning)]">
                      TTL: {secondsLeft}s / 120s
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-secondary)] break-all">
                      token: {offer.one_time_pairing_token}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {isId
                        ? 'Pindai dari aplikasi Android QyroBot atau uji handshake kriptografi Ed25519 di bawah.'
                        : 'Scan from QyroBot Android app or run a live Ed25519 cryptographic handshake below.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <input
                    type="text"
                    aria-label="Simulated Android device name"
                    value={simDeviceName}
                    onChange={(e) => setSimDeviceName(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSimulateHandshake()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--status-success)] text-[#0a0a0c] text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {isId ? 'Uji Handshake Ed25519' : 'Run Ed25519 Handshake'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-6 text-center text-xs text-[var(--text-secondary)]">
                {isId
                  ? 'Klik "Buat QR Baru" untuk menerbitkan token pairing Ed25519 sekali pakai (berlaku 120 detik).'
                  : 'Click "Generate QR" to issue a 120-second one-time Ed25519 pairing token.'}
              </div>
            )}

            {statusMsg && (
              <p className="text-xs text-[var(--status-success)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2.5">
                {statusMsg}
              </p>
            )}
          </section>

          {/* Manage Your Devices + 5-Min Fail-Closed Permissions */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[var(--text-secondary)]" />
              {isId ? `Kelola Perangkat (${devices.length})` : `Manage Your Devices (${devices.length})`}
            </h2>

            {permMsg && (
              <p className="text-xs font-mono text-[var(--text-primary)] bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2.5">
                {permMsg}
              </p>
            )}

            {devices.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {isId
                  ? 'Belum ada perangkat terhubung. Lakukan pairing QR Ed25519 terlebih dahulu.'
                  : 'No paired devices yet. Complete an Ed25519 QR handshake first.'}
              </p>
            ) : (
              <div className="space-y-3">
                {devices.map((dev) => {
                  const isRevoked = Boolean(dev.revoked_at);
                  const devPerms = permissions.filter((p) => p.device_id === dev.id);
                  return (
                    <div
                      key={dev.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {dev.name}
                          </p>
                          <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                            {dev.platform} · {isRevoked ? 'REVOKED' : 'Online sekarang'}
                          </p>
                        </div>
                        {!isRevoked && (
                          <button
                            type="button"
                            onClick={() => void handleRevoke(dev.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--status-danger)] hover:bg-[var(--bg-surface)] whitespace-nowrap shrink-0"
                          >
                            <Ban className="w-3 h-3" />
                            {isId ? 'Cabut Instan' : 'Revoke'}
                          </button>
                        )}
                      </div>

                      {!isRevoked && (
                        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                            {CAPABILITIES.map((cap) => {
                              const current =
                                devPerms.find((p) => p.capability === cap)?.policy ?? 'ask';
                              return (
                                <div key={cap} className="flex items-center justify-between gap-2 text-[11px]">
                                  <button
                                    type="button"
                                    onClick={() => void handleRequestPerm(dev.id, cap)}
                                    className="text-[var(--status-attention)] hover:underline font-mono whitespace-nowrap"
                                    title="Kirim kartu izin 300 detik"
                                  >
                                    {cap}
                                  </button>
                                  <select
                                    aria-label={`${dev.name} ${cap} policy`}
                                    value={current}
                                    onChange={async (e) => {
                                      const res = await api.setDevicePermission(
                                        dev.id,
                                        cap,
                                        e.target.value as DevicePermissionPolicy
                                      );
                                      setPermissions(res.permissions);
                                    }}
                                    className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10px]"
                                  >
                                    <option value="ask">ask</option>
                                    <option value="always_allow">always</option>
                                    <option value="never_allow">never</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRequestPerm(dev.id, 'notification_listener')}
                            className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--status-danger)] underline"
                          >
                            {isId
                              ? 'Uji blokir permanen NotificationListenerService (PRD §5)'
                              : 'Test permanent NotificationListenerService block (PRD §5)'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Row 2: 5 Native Android Tauri Plugins + Share Sheet & Gapless Event Resume */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 5 Native Android Tauri v2 Plugins */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" />
              {isId ? '5 Plugin Android Tauri v2 (Rust + Kotlin)' : '5 Native Android Tauri v2 Plugins (Rust + Kotlin)'}
            </h2>
            <div className="space-y-2">
              {plugins.map((pl) => (
                <div
                  key={pl.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                    <p className="text-xs font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {pl.id}
                    </p>
                    <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                      {pl.android_apis[0]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {pl.guardrail}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Android Share Sheet Simulator + Gapless last_event_id Resume */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-[var(--text-secondary)]" />
                tauri-plugin-qyro-share (Android Share Sheet)
              </h2>
              <select
                aria-label="Target Bot for Share Sheet"
                value={shareBotId}
                onChange={(e) => setShareBotId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                {bots.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label="Shared item title"
                value={shareTitle}
                onChange={(e) => setShareTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
              <textarea
                rows={2}
                aria-label="Shared text content"
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  await api.simulateAndroidShare({
                    bot_id: shareBotId,
                    title: shareTitle,
                    text: shareText,
                  });
                  setStatusMsg(
                    isId ? 'Konten Android Share Sheet berhasil diteruskan ke chat bot.' : 'Android Share Sheet payload routed to bot chat.'
                  );
                  await onRefreshBootstrap();
                }}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium"
              >
                {isId ? 'Kirim via Android Share Sheet' : 'Route via Android Share Sheet'}
              </button>
            </section>

            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-[var(--text-secondary)]" />
                {isId ? 'Sinkronisasi Offline Gapless (last_event_id)' : 'Gapless Offline Sync (last_event_id)'}
              </h2>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  aria-label="resume_from event_id"
                  value={resumeCursor}
                  onChange={(e) => setResumeCursor(e.target.value)}
                  className="w-28 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await api.resumeEvents(Number(resumeCursor) || 0);
                    setResumedEvents(res.events);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium"
                >
                  {isId ? 'Putar Ulang Event Terlewat' : 'Replay Missed Events'}
                </button>
              </div>
              {resumedEvents.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-1 text-[11px] font-mono tabular-nums">
                  {resumedEvents.slice(-8).map((ev) => (
                    <div key={ev.event_id} className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-primary)]">
                        #{ev.event_id} {ev.kind}
                      </span>
                      <span className="text-[var(--text-secondary)] truncate">
                        {ev.bot_id ?? 'system'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

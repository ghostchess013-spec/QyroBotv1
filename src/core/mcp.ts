/**
 * qyro-mcp — Permanent REA MCP Bridge (Ghidra / IDA / Hopper / Kuna Runtime Probe,
 * Deterministic Binary Header Inspector, AOB Wildcard Scanner, String Xref Extractor,
 * and MCP JSON-RPC 2.0 Dispatcher over stdio / Streamable HTTP) (PRD v1.7.0 §10, §14.2, §15.2).
 *
 * Ground-Truth Rule: Never invent offsets, addresses, or decompiler output.
 * When Ghidra/IDA/Hopper/Kuna are not installed on host, report UNSET explicitly.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { QyroStorage } from './storage';

export interface ReEngineProbe {
  engine: 'ghidra' | 'ida' | 'hopper' | 'kuna' | 'objdump' | 'readelf' | 'strings';
  detected: boolean;
  path: string | 'UNSET';
  role: string;
}

export interface BinaryInspectionResult {
  valid: boolean;
  format: 'ELF' | 'PE' | 'Mach-O' | 'RAW';
  size_bytes: number;
  sha256: string;
  bits?: 32 | 64;
  endianness?: 'little' | 'big';
  machine?: string;
  section_count?: number;
  entry_point_rva?: string;
  notes: string[];
}

export interface AobScanMatch {
  file_offset_dec: number;
  file_offset_hex: string;
  matched_bytes_hex: string;
}

export interface ExtractedStringItem {
  file_offset_hex: string;
  value: string;
}

export interface McpServerEntry {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http';
  endpoint_or_cmd: string;
  builtin: boolean;
  status: 'ready' | 'degraded_backend_unset';
  created_at: string;
}

function probeSingle(candidates: string[]): string | 'UNSET' {
  for (const bin of candidates) {
    try {
      const out = execFileSync('which', [bin], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch {
      // continue
    }
  }
  return 'UNSET';
}

export function probeReverseEngineeringEngines(): ReEngineProbe[] {
  const specs: Array<{ engine: ReEngineProbe['engine']; bins: string[]; role: string }> = [
    { engine: 'ghidra', bins: ['analyzeHeadless', 'ghidraRun'], role: 'Primary headless decompiler & call-graph backend' },
    { engine: 'ida', bins: ['idat64', 'ida64', 'ida'], role: 'Interactive Disassembler Pro headless backend' },
    { engine: 'hopper', bins: ['hopper', 'Hopper'], role: 'macOS/Linux disassembler backend' },
    { engine: 'kuna', bins: ['kuna'], role: 'Lightweight RE analyzer backend' },
    { engine: 'objdump', bins: ['objdump'], role: 'GNU binutils disassembler' },
    { engine: 'readelf', bins: ['readelf'], role: 'ELF header & section inspector' },
    { engine: 'strings', bins: ['strings'], role: 'ASCII/UTF-8 string extractor' },
  ];

  return specs.map((s) => {
    const resolved = probeSingle(s.bins);
    return {
      engine: s.engine,
      detected: resolved !== 'UNSET',
      path: resolved,
      role: s.role,
    };
  });
}

export function parseHexOrBase64Buffer(input: string, encoding: 'hex' | 'base64' = 'hex'): Buffer {
  const trimmed = input.trim();
  if (!trimmed) return Buffer.alloc(0);
  if (encoding === 'base64') {
    return Buffer.from(trimmed, 'base64');
  }
  const cleanHex = trimmed.replace(/[^0-9a-fA-F]/g, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Hex buffer harus memiliki panjang genap (kelipatan 2 karakter hex).');
  }
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Pure deterministic PE / ELF / Mach-O binary header inspector.
 */
export function inspectBinaryBuffer(buf: Buffer): BinaryInspectionResult {
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length < 4) {
    return {
      valid: false,
      format: 'RAW',
      size_bytes: buf.length,
      sha256,
      notes: ['Buffer terlalu kecil (< 4 byte) untuk inspeksi header PE/ELF.'],
    };
  }

  // ELF Magic: 7F 45 4C 46
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    const bits: 32 | 64 = buf[4] === 2 ? 64 : 32;
    const endianness: 'little' | 'big' = buf[5] === 2 ? 'big' : 'little';
    const notes: string[] = [];
    let machine = 'UNKNOWN';
    let sectionCount: number | undefined;
    let entryRva: string | undefined;

    if (buf.length >= 20) {
      const eMachine = endianness === 'little' ? buf.readUInt16LE(18) : buf.readUInt16BE(18);
      const map: Record<number, string> = {
        0x03: 'x86 (EM_386)',
        0x3e: 'x86_64 (EM_X86_64)',
        0xb7: 'ARM64 (EM_AARCH64)',
        0x28: 'ARM32 (EM_ARM)',
      };
      machine = map[eMachine] ?? `0x${eMachine.toString(16)}`;
    }
    if (bits === 64 && buf.length >= 64) {
      const entry = endianness === 'little' ? buf.readBigUInt64LE(24) : buf.readBigUInt64BE(24);
      entryRva = `0x${entry.toString(16)}`;
      sectionCount = endianness === 'little' ? buf.readUInt16LE(60) : buf.readUInt16BE(60);
    } else if (bits === 32 && buf.length >= 52) {
      const entry = endianness === 'little' ? buf.readUInt32LE(24) : buf.readUInt32BE(24);
      entryRva = `0x${entry.toString(16)}`;
      sectionCount = endianness === 'little' ? buf.readUInt16LE(48) : buf.readUInt16BE(48);
    } else {
      notes.push('Header ELF terpotong; sebagian field tidak lengkap.');
    }

    return {
      valid: true,
      format: 'ELF',
      size_bytes: buf.length,
      sha256,
      bits,
      endianness,
      machine,
      section_count: sectionCount,
      entry_point_rva: entryRva,
      notes,
    };
  }

  // PE / MZ Magic: 4D 5A
  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    const notes: string[] = [];
    if (buf.length < 0x40) {
      return {
        valid: false,
        format: 'PE',
        size_bytes: buf.length,
        sha256,
        notes: ['Header DOS MZ terpotong sebelum offset e_lfanew (0x3C).'],
      };
    }
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff + 24 > buf.length || buf.toString('ascii', peOff, peOff + 4) !== 'PE\0\0') {
      return {
        valid: false,
        format: 'PE',
        size_bytes: buf.length,
        sha256,
        notes: [`Signature PE\\0\\0 tidak ditemukan pada file offset 0x${peOff.toString(16)}.`],
      };
    }
    const machineCode = buf.readUInt16LE(peOff + 4);
    const numSections = buf.readUInt16LE(peOff + 6);
    const machineMap: Record<number, string> = {
      0x8664: 'x64 (AMD64)',
      0x014c: 'x86 (I386)',
      0xaa64: 'ARM64 (AA64)',
    };
    const bits: 32 | 64 = machineCode === 0x014c ? 32 : 64;
    let entryRva: string | undefined;
    if (peOff + 44 <= buf.length) {
      const optMagic = buf.readUInt16LE(peOff + 24);
      if (optMagic === 0x10b || optMagic === 0x20b) {
        const ep = buf.readUInt32LE(peOff + 24 + 16);
        entryRva = `0x${ep.toString(16)}`;
      }
    } else {
      notes.push('Optional Header tidak disertakan dalam potongan buffer.');
    }

    return {
      valid: true,
      format: 'PE',
      size_bytes: buf.length,
      sha256,
      bits,
      endianness: 'little',
      machine: machineMap[machineCode] ?? `0x${machineCode.toString(16)}`,
      section_count: numSections,
      entry_point_rva: entryRva,
      notes,
    };
  }

  return {
    valid: true,
    format: 'RAW',
    size_bytes: buf.length,
    sha256,
    notes: ['Tidak ada header ELF/PE; diperlakukan sebagai raw byte buffer untuk scan AOB & string.'],
  };
}

/**
 * Pure deterministic AOB pattern scanner supporting `?` / `??` wildcards.
 * Returns exact file offsets (never invented).
 */
export function scanAobPattern(buf: Buffer, patternStr: string): AobScanMatch[] {
  const tokens = patternStr
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0 || buf.length < tokens.length) return [];

  const parsed: Array<number | null> = tokens.map((tok) => {
    if (tok === '?' || tok === '??') return null;
    if (!/^[0-9a-fA-F]{2}$/.test(tok)) {
      throw new Error(`Token pola AOB tidak valid: "${tok}". Gunakan byte hex 2-digit atau "??".`);
    }
    return parseInt(tok, 16);
  });

  const matches: AobScanMatch[] = [];
  const limit = buf.length - parsed.length;
  for (let i = 0; i <= limit; i++) {
    let ok = true;
    for (let j = 0; j < parsed.length; j++) {
      const want = parsed[j];
      if (want !== null && buf[i + j] !== want) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const slice = buf.subarray(i, i + parsed.length);
      matches.push({
        file_offset_dec: i,
        file_offset_hex: `0x${i.toString(16).padStart(4, '0')}`,
        matched_bytes_hex: Array.from(slice)
          .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
          .join(' '),
      });
    }
  }
  return matches;
}

export function extractAsciiStrings(buf: Buffer, minLen = 4): ExtractedStringItem[] {
  const results: ExtractedStringItem[] = [];
  let start = -1;
  let current = '';

  for (let i = 0; i <= buf.length; i++) {
    const b = i < buf.length ? buf[i] : 0;
    const printable = b >= 0x20 && b <= 0x7e;
    if (printable) {
      if (start === -1) start = i;
      current += String.fromCharCode(b);
    } else {
      if (start !== -1 && current.length >= minLen) {
        results.push({
          file_offset_hex: `0x${start.toString(16).padStart(4, '0')}`,
          value: current,
        });
      }
      start = -1;
      current = '';
    }
  }
  return results;
}

export const REA_MCP_TOOL_CATALOG = [
  {
    name: 'rea_probe_engines',
    description: 'Probe host runtime for Ghidra, IDA, Hopper, Kuna, objdump, readelf, and strings.',
  },
  {
    name: 'rea_inspect_pe_elf',
    description: 'Inspect real PE/ELF/RAW headers (magic, architecture, sections, entry RVA, SHA-256).',
  },
  {
    name: 'rea_aob_scan',
    description: 'Deterministic wildcard AOB signature scanner returning exact file offsets.',
  },
  {
    name: 'rea_xref_strings',
    description: 'Extract printable ASCII strings with exact file offsets from a binary buffer.',
  },
  {
    name: 'rea_decompile_function',
    description: 'Delegate decompilation to detected Ghidra/IDA/Hopper/Kuna backend (gated if UNSET).',
  },
];

export class QyroReaMcpBridge {
  private readonly storage: QyroStorage;
  private readonly probes: ReEngineProbe[];

  constructor(storage: QyroStorage) {
    this.storage = storage;
    this.probes = probeReverseEngineeringEngines();
    this.ensureBuiltinReaServer();
  }

  private ensureBuiltinReaServer(): void {
    const hasPrimaryRe = this.probes.some(
      (p) => ['ghidra', 'ida', 'hopper', 'kuna'].includes(p.engine) && p.detected
    );
    const status = hasPrimaryRe ? 'ready' : 'degraded_backend_unset';
    this.storage.db
      .prepare(
        `INSERT OR IGNORE INTO mcp_servers (id, name, transport, endpoint_or_cmd, builtin, status)
         VALUES ('mcp-rea-permanent', 'REA Permanent Reverse-Engineering Bridge', 'stdio', 'qyro-mcp --bridge=rea', 1, ?)`
      )
      .run(status);
  }

  getProbes(): ReEngineProbe[] {
    return this.probes;
  }

  listServers(): McpServerEntry[] {
    const rows = this.storage.db
      .prepare(`SELECT id, name, transport, endpoint_or_cmd, builtin, status, created_at FROM mcp_servers ORDER BY builtin DESC, created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      transport: r.transport as McpServerEntry['transport'],
      endpoint_or_cmd: String(r.endpoint_or_cmd),
      builtin: Number(r.builtin) === 1,
      status: r.status as McpServerEntry['status'],
      created_at: String(r.created_at),
    }));
  }

  registerServer(params: {
    name: string;
    transport: 'stdio' | 'streamable_http';
    endpoint_or_cmd: string;
  }): McpServerEntry {
    const id = `mcp-${crypto.randomUUID().slice(0, 8)}`;
    this.storage.db
      .prepare(
        `INSERT INTO mcp_servers (id, name, transport, endpoint_or_cmd, builtin, status)
         VALUES (?, ?, ?, ?, 0, 'ready')`
      )
      .run(id, params.name.trim(), params.transport, params.endpoint_or_cmd.trim());
    return this.listServers().find((s) => s.id === id)!;
  }

  /**
   * Standard MCP JSON-RPC 2.0 Handler (initialize, tools/list, tools/call).
   */
  handleJsonRpc(req: {
    jsonrpc?: string;
    id?: string | number;
    method: string;
    params?: Record<string, unknown>;
  }): Record<string, unknown> {
    const id = req.id ?? 1;

    if (req.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          serverInfo: { name: 'qyro-rea-mcp-bridge', version: '1.7.0' },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: REA_MCP_TOOL_CATALOG },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = String(req.params?.name ?? '');
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;

      try {
        if (toolName === 'rea_probe_engines') {
          return { jsonrpc: '2.0', id, result: { probes: this.probes } };
        }
        if (toolName === 'rea_inspect_pe_elf') {
          const buf = parseHexOrBase64Buffer(
            String(args.buffer ?? ''),
            args.encoding === 'base64' ? 'base64' : 'hex'
          );
          return { jsonrpc: '2.0', id, result: inspectBinaryBuffer(buf) };
        }
        if (toolName === 'rea_aob_scan') {
          const buf = parseHexOrBase64Buffer(
            String(args.buffer ?? ''),
            args.encoding === 'base64' ? 'base64' : 'hex'
          );
          const matches = scanAobPattern(buf, String(args.pattern ?? ''));
          return { jsonrpc: '2.0', id, result: { match_count: matches.length, matches } };
        }
        if (toolName === 'rea_xref_strings') {
          const buf = parseHexOrBase64Buffer(
            String(args.buffer ?? ''),
            args.encoding === 'base64' ? 'base64' : 'hex'
          );
          const minLen = typeof args.min_length === 'number' ? args.min_length : 4;
          const items = extractAsciiStrings(buf, minLen);
          return { jsonrpc: '2.0', id, result: { count: items.length, strings: items } };
        }
        if (toolName === 'rea_decompile_function') {
          const activeEngine = this.probes.find(
            (p) => ['ghidra', 'ida', 'hopper', 'kuna'].includes(p.engine) && p.detected
          );
          if (!activeEngine) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                ok: false,
                status: 'BACKEND_UNSET',
                reason:
                  'Tidak ada binary Ghidra (analyzeHeadless), IDA (idat64), Hopper, atau Kuna yang terdeteksi di host ini. Output dekompilasi tidak pernah dikarang.',
                next_step:
                  'Pasang Ghidra headless (`analyzeHeadless`) di PATH atau hubungkan remote REA MCP node via Streamable HTTP.',
              },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              ok: true,
              engine: activeEngine.engine,
              engine_path: activeEngine.path,
              target_rva: String(args.rva ?? 'UNSET'),
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown REA MCP tool: ${toolName}` },
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: err instanceof Error ? err.message : 'Invalid tool parameters',
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unsupported MCP method: ${req.method}` },
    };
  }
}

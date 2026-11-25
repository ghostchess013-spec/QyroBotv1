import React, { useCallback, useEffect, useState } from 'react';
import { Binary, Cpu, Plus, Search, Server } from 'lucide-react';
import type { UiLocale } from '../core/types';
import type { McpServerEntry, ReEngineProbe } from '../core/mcp';
import { api } from '../lib/api';

interface ReaMcpPanelProps {
  locale: UiLocale;
}

const SAMPLE_ELF_HEX =
  '7f454c4602010100000000000000000002003e00010000000010400000000000400000000000000000000000000000000000000040003800020040000c000b00488b051122e8aabbccdd5179726f52454100';

const SAMPLE_PE_HEX =
  '4d5a90000300000004000000ffff0000b800000000000000400000000000000000000000000000000000000000000000000000000000000000000000400000005045000064860500000000000000000000000000f00022000b020e0000100000000000000000000050140000488b057788e811223344';

export const ReaMcpPanel: React.FC<ReaMcpPanelProps> = ({ locale }) => {
  const isId = locale === 'id-ID';
  const [probes, setProbes] = useState<ReEngineProbe[]>([]);
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>([]);

  const [hexBuffer, setHexBuffer] = useState(SAMPLE_ELF_HEX);
  const [aobPattern, setAobPattern] = useState('48 8B 05 ?? ?? E8');
  const [rpcOutput, setRpcOutput] = useState<string | null>(null);

  const [srvName, setSrvName] = useState('');
  const [srvTransport, setSrvTransport] = useState<'stdio' | 'streamable_http'>('streamable_http');
  const [srvEndpoint, setSrvEndpoint] = useState('');

  const loadState = useCallback(async () => {
    const res = await api.getMcpState();
    setProbes(res.probes);
    setServers(res.servers);
    setTools(res.tools);
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const invokeTool = async (name: string, args: Record<string, unknown>) => {
    const resp = await api.callMcpRpc({
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    });
    setRpcOutput(JSON.stringify(resp, null, 2));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1060px] mx-auto space-y-6">
        <div className="border-b border-[var(--border-subtle)] pb-4 space-y-1">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {isId ? 'Permanent REA MCP Bridge & Binary Workbench' : 'Permanent REA MCP Bridge & Binary Workbench'}
          </h1>
          <p className="text-xs text-[var(--text-secondary)]">
            {isId
              ? 'Jembatan MCP JSON-RPC 2.0 permanen (Ghidra/IDA/Hopper/Kuna probe jujur, inspeksi PE/ELF deterministik, pemindai AOB wildcard, dan ekstraktor string).'
              : 'Permanent MCP JSON-RPC 2.0 bridge (honest Ghidra/IDA/Hopper/Kuna host probe, deterministic PE/ELF inspector, wildcard AOB scanner, and string extractor).'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Interactive REA MCP Tool Runner */}
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Binary className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                {isId ? 'Uji REA MCP Tools (JSON-RPC 2.0)' : 'Test REA MCP Tools (JSON-RPC 2.0)'}
              </h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setHexBuffer(SAMPLE_ELF_HEX)}
                  className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-[11px] font-mono whitespace-nowrap shrink-0"
                >
                  Sample ELF64
                </button>
                <button
                  type="button"
                  onClick={() => setHexBuffer(SAMPLE_PE_HEX)}
                  className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-[11px] font-mono whitespace-nowrap shrink-0"
                >
                  Sample PE64
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="rea-hex-buf" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isId ? 'Buffer Biner (Hex)' : 'Binary Buffer (Hex)'}
              </label>
              <textarea
                id="rea-hex-buf"
                rows={3}
                value={hexBuffer}
                onChange={(e) => setHexBuffer(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="rea-aob" className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isId ? 'Pola AOB (mendukung ?? wildcard)' : 'AOB Pattern (supports ?? wildcards)'}
              </label>
              <input
                id="rea-aob"
                type="text"
                value={aobPattern}
                onChange={(e) => setAobPattern(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void invokeTool('rea_inspect_pe_elf', { buffer: hexBuffer, encoding: 'hex' })}
                className="px-3 py-1.5 rounded-lg bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                Inspect PE/ELF
              </button>
              <button
                type="button"
                onClick={() =>
                  void invokeTool('rea_aob_scan', { buffer: hexBuffer, pattern: aobPattern, encoding: 'hex' })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                Scan AOB
              </button>
              <button
                type="button"
                onClick={() =>
                  void invokeTool('rea_xref_strings', { buffer: hexBuffer, min_length: 4, encoding: 'hex' })
                }
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                Extract Strings
              </button>
              <button
                type="button"
                onClick={() => void invokeTool('rea_decompile_function', { rva: '0x401000' })}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
              >
                Decompile Gate
              </button>
            </div>

            {rpcOutput && (
              <pre className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-[11px] font-mono text-[var(--text-primary)] overflow-x-auto max-h-60 overflow-y-auto">
                {rpcOutput}
              </pre>
            )}
          </section>

          {/* Host Engine Probes & MCP Server Registry */}
          <div className="space-y-5">
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
              <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[var(--text-secondary)]" />
                {isId ? 'Probe Engine Reverse Engineering (Host Nyata)' : 'Reverse Engineering Engine Probe (Real Host)'}
              </h2>
              <div className="divide-y divide-[var(--border-subtle)]">
                {probes.map((p) => (
                  <div key={p.engine} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-[var(--text-primary)]">{p.engine}</p>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate">{p.role}</p>
                    </div>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        p.detected ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
                      }`}
                    >
                      {p.detected ? p.path : 'UNSET'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-sidebar)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-[var(--text-secondary)]" />
                  MCP Servers ({servers.length}) · Tools ({tools.length})
                </h2>
              </div>

              <div className="space-y-2">
                {servers.map((srv) => (
                  <div
                    key={srv.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">{srv.name}</p>
                      <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                        {srv.transport} · {srv.endpoint_or_cmd}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)] shrink-0">
                      {srv.status}
                    </span>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!srvName.trim() || !srvEndpoint.trim()) return;
                  const res = await api.registerMcpServer({
                    name: srvName,
                    transport: srvTransport,
                    endpoint_or_cmd: srvEndpoint,
                  });
                  setServers(res.servers);
                  setSrvName('');
                  setSrvEndpoint('');
                }}
                className="space-y-2 pt-2 border-t border-[var(--border-subtle)]"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    aria-label="MCP Server Name"
                    value={srvName}
                    onChange={(e) => setSrvName(e.target.value)}
                    placeholder={isId ? 'Nama server MCP' : 'MCP server name'}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                  <select
                    aria-label="MCP Transport"
                    value={srvTransport}
                    onChange={(e) => setSrvTransport(e.target.value as 'stdio' | 'streamable_http')}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="streamable_http">Streamable HTTP/SSE</option>
                    <option value="stdio">stdio</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    aria-label="MCP endpoint or command"
                    value={srvEndpoint}
                    onChange={(e) => setSrvEndpoint(e.target.value)}
                    placeholder="https://mcp.example.com/sse atau npx ..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isId ? 'Tambah' : 'Add'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

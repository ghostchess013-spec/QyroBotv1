/**
 * qyro-router/endpointGuard — Anti-Local-Model Guard (PRD v1.7.0 §8.1)
 * Strictly blocks localhost, 127.0.0.0/8, ::1, 0.0.0.0, host.docker.internal,
 * link-local, and RFC1918 private local-inference endpoints (including VoxCPM2).
 */

import { UNSET_SENTINEL, type UnsetOr } from '../types';

export interface EndpointValidationResult {
  allowed: boolean;
  code:
    | 'OK'
    | 'UNSET_ENDPOINT'
    | 'INVALID_URL'
    | 'NON_HTTPS_BLOCKED'
    | 'LOOPBACK_BLOCKED'
    | 'DOCKER_INTERNAL_BLOCKED'
    | 'PRIVATE_NETWORK_BLOCKED'
    | 'LOCAL_INFERENCE_PORT_BLOCKED';
  reason: string;
  normalizedUrl?: string;
}

const LOCAL_INFERENCE_PORTS = new Set([
  11434, // Ollama
  11435,
  1234, // LM Studio
  8000, // Local vLLM / llama.cpp
  8080, // llama.cpp server / LocalAI
  5000, // TextGen WebUI / local TTS
  7860, // Gradio local
  8188, // ComfyUI local
  9000, // Whisper local
  9880, // Local TTS
]);

function isIpv4InCidr(ip: string): 'loopback' | 'unspecified' | 'rfc1918' | 'link_local' | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const [a, b] = nums;
  if (a === 127) return 'loopback';
  if (a === 0) return 'unspecified';
  if (a === 10) return 'rfc1918';
  if (a === 172 && b >= 16 && b <= 31) return 'rfc1918';
  if (a === 192 && b === 168) return 'rfc1918';
  if (a === 169 && b === 254) return 'link_local';
  return null;
}

function isLocalIpv6(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    clean === '::1' ||
    clean === '::' ||
    clean === '0:0:0:0:0:0:0:1' ||
    clean.startsWith('fe80:') ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    clean.startsWith('::ffff:127.') ||
    clean.startsWith('::ffff:10.') ||
    clean.startsWith('::ffff:192.168.')
  );
}

export function validateCloudEndpoint(
  endpoint: UnsetOr<string> | null | undefined,
  providerId?: string
): EndpointValidationResult {
  if (!endpoint || endpoint.trim() === '' || endpoint.trim().toUpperCase() === UNSET_SENTINEL) {
    return {
      allowed: false,
      code: 'UNSET_ENDPOINT',
      reason:
        providerId === 'voxcpm2-cloud'
          ? 'VoxCPM2 Cloud endpoint is UNSET. Provide a remote HTTPS vLLM-Omni endpoint URL.'
          : 'Cloud provider endpoint is UNSET.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    return {
      allowed: false,
      code: 'INVALID_URL',
      reason: `Malformed endpoint URL: "${endpoint}"`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  // Check loopback/localhost hostnames first so error codes are maximally diagnostic
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === '0.0.0.0' ||
    isLocalIpv6(cleanHost)
  ) {
    return {
      allowed: false,
      code: 'LOOPBACK_BLOCKED',
      reason: `Loopback/local host "${cleanHost}" is strictly forbidden by Anti-Local-Model Guard.`,
    };
  }

  if (
    cleanHost === 'host.docker.internal' ||
    cleanHost === 'gateway.docker.internal' ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal')
  ) {
    return {
      allowed: false,
      code: 'DOCKER_INTERNAL_BLOCKED',
      reason: `Internal/local container hostname "${cleanHost}" is blocked by Anti-Local-Model Guard.`,
    };
  }

  const ipv4Class = isIpv4InCidr(cleanHost);
  if (ipv4Class === 'loopback' || ipv4Class === 'unspecified') {
    return {
      allowed: false,
      code: 'LOOPBACK_BLOCKED',
      reason: `IPv4 ${ipv4Class} address "${cleanHost}" is blocked by Anti-Local-Model Guard.`,
    };
  }

  if (ipv4Class === 'rfc1918' || ipv4Class === 'link_local') {
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    if (LOCAL_INFERENCE_PORTS.has(port)) {
      return {
        allowed: false,
        code: 'LOCAL_INFERENCE_PORT_BLOCKED',
        reason: `Private network local inference port ${cleanHost}:${port} is blocked by Anti-Local-Model Guard.`,
      };
    }
    return {
      allowed: false,
      code: 'PRIVATE_NETWORK_BLOCKED',
      reason: `RFC1918/link-local address "${cleanHost}" is blocked; QyroBot allows Cloud/Remote endpoints only.`,
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      allowed: false,
      code: 'NON_HTTPS_BLOCKED',
      reason: `Insecure protocol "${parsed.protocol}" rejected. All cloud AI endpoints must use HTTPS.`,
    };
  }

  return {
    allowed: true,
    code: 'OK',
    reason: 'Verified remote HTTPS cloud endpoint.',
    normalizedUrl: parsed.toString().replace(/\/$/, ''),
  };
}

import dns from 'dns/promises';
import net from 'net';

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // Multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA fc00::/7
  if (normalized.startsWith('fe80:') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true; // Link-local fe80::/10
  }
  if (normalized.startsWith('ff')) return true; // Multicast
  if (normalized.startsWith('2001:db8:')) return true; // Documentation prefix

  // IPv4-mapped IPv6 may be written in dotted-decimal or hexadecimal form.
  // Decode both forms so ::ffff:7f00:1 cannot disguise 127.0.0.1.
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);

    const hexMatch = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const high = Number.parseInt(hexMatch[1], 16);
      const low = Number.parseInt(hexMatch[2], 16);
      const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
      return isPrivateIPv4(ipv4);
    }

    // Unrecognised IPv4-mapped representations are rejected conservatively.
    return true;
  }
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid HTTP Request URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// protocols are allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing embedded username/password credentials are not allowed.');
  }
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.home.arpa')
  ) {
    throw new Error(`Blocked internal or restricted hostname: ${hostname}`);
  }

  if (net.isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error(`Blocked private or loopback IP address: ${hostname}`);
    }
    return parsed;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Unable to resolve hostname: ${hostname}`);
  }

  if (!records.length) {
    throw new Error(`Hostname resolved to no IP addresses: ${hostname}`);
  }

  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new Error(`Blocked request resolving to private/internal network address (${record.address}).`);
    }
  }

  return parsed;
}


/**
 * Fetch a user-configurable or integration URL only after validating its host.
 * Redirects are deliberately not followed: a public endpoint must not be able
 * to redirect a workflow into a private network or metadata service.
 */
export async function safeFetch(rawUrl: string | URL, init: RequestInit = {}): Promise<Response> {
  const parsed = await assertSafeExternalUrl(String(rawUrl));
  const response = await globalThis.fetch(parsed.toString(), {
    ...init,
    // Set this after init so a caller cannot opt back into automatic redirects.
    redirect: 'manual',
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    try {
      await response.body?.cancel();
    } catch {
      // The response is being rejected regardless; ignore cleanup failures.
    }
    throw new Error('The external server returned a redirect. CROX blocks redirects for SSRF protection.');
  }

  return response;
}

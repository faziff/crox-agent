/**
 * Safe path traversal and template interpolation without eval() or new Function().
 * Supports {{trigger.body.email}}, {{prev.text}}, {{nodes.node_1.data}}, etc.
 */

export function resolvePath(context: unknown, rawPath: string): unknown {
  if (!rawPath) return undefined;
  const segments = rawPath
    .trim()
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = context;
  for (const segment of segments) {
    if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
      return undefined;
    }
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    const val = resolvePath(context, expr);
    if (val === undefined || val === null) {
      return '';
    }
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '[Object]';
      }
    }
    return String(val);
  });
}

export function sanitizeForStorage(value: unknown, secretsToMask: string[] = []): unknown {
  if (!secretsToMask.length) return value;
  const validSecrets = secretsToMask.filter((s) => s && s.length >= 4);
  if (!validSecrets.length) return value;

  const maskInString = (str: string) => {
    let out = str;
    for (const secret of validSecrets) {
      if (out.includes(secret)) {
        out = out.split(secret).join('••••••••');
      }
    }
    return out;
  };

  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') return maskInString(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (/authorization|password|secret|api[-_]?key|token/i.test(k) && typeof v === 'string') {
          result[k] = '••••••••';
        } else {
          result[k] = walk(v);
        }
      }
      return result;
    }
    return item;
  };

  return walk(value);
}

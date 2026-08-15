import type { MessageTree, TranslateVars } from './types';

export function getMessage(tree: MessageTree, key: string): string | undefined {
  const parts = key.split('.');
  let cur: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v == null ? `{${name}}` : String(v);
  });
}

export function translate(
  tree: MessageTree,
  key: string,
  vars?: TranslateVars,
  fallbackTree?: MessageTree
): string {
  const raw =
    getMessage(tree, key) ??
    (fallbackTree ? getMessage(fallbackTree, key) : undefined) ??
    key;
  return interpolate(raw, vars);
}

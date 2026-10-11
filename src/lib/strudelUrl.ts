/* strudel.cc share links carry the code in the hash: #<urlencoded base64 of UTF-8>.
   Same scheme as code2hash/hash2code in @strudel/core, kept here so the main
   bundle doesn't need the engine to build a link. */

export function codeToHash(code: string): string {
  const bytes = new TextEncoder().encode(code);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return encodeURIComponent(btoa(bin));
}

export function hashToCode(hash: string): string {
  const bin = atob(decodeURIComponent(hash));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const strudelLink = (code: string) => `https://strudel.cc/#${codeToHash(code)}`;

/** If `text` is a strudel.cc link with code in its hash, return the code; otherwise null. */
export function codeFromStrudelUrl(text: string): string | null {
  const t = text.trim();
  if (/\s/.test(t)) return null;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (!/(^|\.)strudel\.cc$/.test(url.hostname) || url.hash.length < 2) return null;
  try {
    return hashToCode(url.hash.slice(1));
  } catch {
    return null;
  }
}

/** True for strudel.cc links that point at a saved pattern id rather than carrying code. */
export function isStrudelIdUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return /(^|\.)strudel\.cc$/.test(url.hostname) && !url.hash && url.search.length > 1;
  } catch {
    return false;
  }
}

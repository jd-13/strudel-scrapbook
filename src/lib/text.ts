export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Description text to HTML: escaped, with `backticks` as <code>. */
export const renderDescription = (t: string) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>');

/** Code to HTML with string literals and line comments highlighted. */
export function highlight(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(/("[^"\n]*"|'[^'\n]*'|`[^`]*`)|(\/\/[^\n]*)/g)) {
    out += esc(code.slice(last, m.index));
    out += `<span class="${m[1] ? 's' : 'c'}">${esc(m[0])}</span>`;
    last = m.index! + m[0].length;
  }
  return out + esc(code.slice(last));
}

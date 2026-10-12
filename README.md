# Strudel Scrapbook

A keyboard-driven library for collecting [Strudel](https://strudel.cc) code snippets. Each snippet has a
name, description, category and tags. It is drawn as a drum grid or piano roll and played by the real
Strudel engine. The app is a static, installable PWA. Your library lives in the browser (IndexedDB), and
JSON export/import is the backup.

## Develop

```sh
npm ci            # install from the lockfile
npm run dev       # http://localhost:5173 (fixed port: browser storage is tied to the address)
npm test          # unit tests (vitest)
npm run check     # type check (svelte-check)
npm run build     # static site in dist/
npm run preview   # serve dist/ at http://localhost:4173 to test offline use and installing
```

The service worker is only registered in the production build, so use `npm run preview` to try offline
mode or installing. `node scripts/make-icons.mjs` regenerates the icons in `public/`.

## Deploy

Copy `dist/` to any static host, at any path (`base: './'`). It must be served over HTTPS, apart from
`localhost`. No server configuration is needed.

Browser storage belongs to one address (scheme + host + port). Snippets added at `localhost:5173` won't
appear on your website. To move them, export (`x`) on one and import (`X`, then Merge) on the other.

## Keys

| Key | Action |
|---|---|
| `h` `j` `k` `l` / arrows | move between cards |
| `gg` / `G` | first / last |
| `]` / `[` | next / previous section |
| `/` | search; `Enter` back to results, `Esc` clears |
| `space` | play / stop |
| `y` / `Y` | copy code / copy with a Strudel `@title` `@tag` `@details` header |
| `o` | open in strudel.cc |
| `e` or `Enter` | edit |
| `n` / `p` | new / new from clipboard (code, strudel.cc link, or `@title` header) |
| `D` | duplicate |
| `dd`, `u` | delete, undo |
| `s` | cycle sort: category, recently updated, recently added, name |
| `C` | categories (rename, blurb, reorder with `J`/`K`) |
| `x` / `X` | export / import (or drop files on the page) |
| `?` | help and storage status |

In the editor: `Ctrl/Cmd+Enter` plays the draft, `Ctrl/Cmd+S` saves and `Esc` closes. Vim keys can be
switched on or off in the editor; with vim on, the first `Esc` leaves insert mode.

## Strudel interop

- `Y` copies code with `// @title`, `// @tag` and `// @details` comments. Saved in strudel.cc, the
  pattern shows up named and tagged in its Patterns tab.
- Pasting code that starts with those comments (with `p`, or into the editor) fills in the fields.
- Import accepts the JSON that strudel.cc's Patterns tab exports. Patterns imported before are updated
  rather than duplicated, unless you've edited them here since.
- Dropping `.txt`, `.strudel` or `.js` files adds them as snippets.

## Export format

```jsonc
{
  "format": "strudel-scrapbook", "version": 1, "exported": "…",
  "categories": [{ "id", "name", "blurb", "order", "updated" }],
  "snippets": [{ "id", "name", "description", "category", "tags", "code", "base", "cycles", "source", "created", "updated" }],
  "deleted": [{ "id", "at" }]   // tombstones, so merges carry deletions across
}
```

`base` is an optional second pattern. The grid highlights hits the code adds compared with it (orange),
and draws the hits it removes as dashed outlines.

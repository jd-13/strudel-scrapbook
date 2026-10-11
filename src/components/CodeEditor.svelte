<script lang="ts" module>
  import { getCM } from '@replit/codemirror-vim';
  import type { EditorView as View } from '@codemirror/view';

  /** True when vim is in insert or visual mode, so Escape belongs to vim rather than the dialog. */
  export function vimWantsEscape(view: View | undefined): boolean {
    const vimState = view ? (getCM(view)?.state as { vim?: { insertMode?: boolean; visualMode?: boolean } } | undefined)?.vim : undefined;
    return !!(vimState && (vimState.insertMode || vimState.visualMode));
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { basicSetup } from 'codemirror';
  import { EditorView } from '@codemirror/view';
  import { Compartment, EditorState } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { vim } from '@replit/codemirror-vim';

  let {
    value = $bindable(''),
    vimMode,
    label,
    autofocus = false,
    view = $bindable(),
  }: { value: string; vimMode: boolean; label: string; autofocus?: boolean; view?: EditorView } = $props();

  let host: HTMLDivElement;
  const vimSlot = new Compartment();

  const theme = EditorView.theme({
    '&': { backgroundColor: 'var(--roll)', color: 'var(--ink)', border: '1px solid var(--line-strong)', borderRadius: '4px', fontSize: '0.85rem' },
    '&.cm-focused': { outline: '2px solid var(--layer)', outlineOffset: '1px' },
    '.cm-content': { fontFamily: 'var(--mono)', caretColor: 'var(--ink)', minHeight: '5.5em' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--roll-alt)' },
    '.cm-cursor, .cm-fat-cursor': { borderLeftColor: 'var(--ink)' },
    '&:not(.cm-focused) .cm-fat-cursor': { background: 'none', outline: 'none' },
    '.cm-fat-cursor': { background: 'var(--layer) !important', color: 'var(--bg) !important' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--note) 30%, transparent) !important' },
    '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--ink)' },
    '.cm-vim-panel input': { color: 'var(--ink)', fontFamily: 'var(--mono)' },
  });

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          vimSlot.of(vimMode ? vim() : []), // vim must come before other keymaps
          basicSetup,
          javascript(),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) value = u.state.doc.toString();
          }),
        ],
      }),
    });
    if (autofocus) view.focus();
    return () => view?.destroy();
  });

  $effect(() => {
    const on = vimMode;
    view?.dispatch({ effects: vimSlot.reconfigure(on ? vim() : []) });
  });

  // Outside changes (e.g. paste-to-fill) flow into the editor.
  $effect(() => {
    const v = value;
    if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
  });
</script>

<div class="code-editor" bind:this={host}></div>

<style>
  .code-editor { min-width: 0; }
</style>

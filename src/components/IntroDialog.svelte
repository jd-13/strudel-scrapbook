<script lang="ts">
  import { onMount } from 'svelte';

  let { onclose, onkeys }: { onclose: () => void; onkeys: () => void } = $props();
  let root: HTMLDivElement;
  onMount(() => root.focus());
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="intro-title" tabindex="-1" bind:this={root}
    onkeydown={(e) => {
      // Enter on a focused button should press that button instead.
      if (e.key === 'Escape' || (e.key === 'Enter' && e.target === root)) (e.preventDefault(), onclose());
      else if (e.key === '?') (e.preventDefault(), onkeys());
    }}>
    <h2 id="intro-title">Welcome to Strudel Scrapbook</h2>
    <p>
      A place to collect the <a href="https://strudel.cc" target="_blank" rel="noopener">Strudel</a> patterns you
      want to keep. Each snippet has a name, description, category and tags, and is drawn as a drum grid or
      piano roll so you can see what it does at a glance.
    </p>
    <ul class="steps">
      <li><strong>Listen.</strong> Pick a card and press <kbd>space</kbd> or its Play button. <kbd>Esc</kbd> stops.</li>
      <li><strong>Move around.</strong> Use <kbd>h</kbd> <kbd>j</kbd> <kbd>k</kbd> <kbd>l</kbd> or the arrow keys, and <kbd>/</kbd> to search.</li>
      <li><strong>Add your own.</strong> <kbd>n</kbd> starts a new snippet, <kbd>p</kbd> pastes code or a strudel.cc link, and you can drop files on the page.</li>
      <li><strong>Take it back to Strudel.</strong> <kbd>y</kbd> copies the code, <kbd>o</kbd> opens it in strudel.cc.</li>
    </ul>
    <p>The library starts with some example snippets. Edit or delete them as you like.</p>
    <p class="muted note">
      Everything is stored in this browser only. Export a backup with <kbd>x</kbd> now and then, and import it
      with <kbd>X</kbd> to move your library elsewhere.
    </p>
    <div class="row end">
      <button type="button" onclick={onkeys}>See all keys <kbd>?</kbd></button>
      <button type="button" class="primary" onclick={onclose}>Get started <kbd>Enter</kbd></button>
    </div>
  </div>
</div>

<style>
  .dialog { width: min(100%, 600px); }
  .dialog:focus { outline: none; }
  p { margin: 0; }
  a { color: var(--ink); }
  .steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
  .note { font-size: 0.88rem; }
</style>

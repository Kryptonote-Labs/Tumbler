<script lang="ts">
  let { code, language = 'TypeScript' }: { code: string; language?: string } = $props();
  let copied = $state(false);
  let failed = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      failed = false;
      setTimeout(() => copied = false, 1600);
    } catch { failed = true; }
  }
</script>
<div class="code-block">
  <div class="code-caption"><span>{language}</span><button onclick={copy} aria-label="Copy code">{failed ? 'Select to copy' : copied ? 'Copied' : 'Copy'}</button></div>
  <pre><code>{code}</code></pre>
</div>

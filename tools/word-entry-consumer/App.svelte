<script>
import {WordDocumentView, openWordArtifact} from '@tumblerjs/svelte/word';
let doc = $state();
globalThis.openDoc = async bytes => { doc = (await openWordArtifact(bytes)).document; };
</script>
{#if doc}<WordDocumentView wordDocument={doc}/>{/if}

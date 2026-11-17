# Entrance animation foundation

## Problem

The existing reader flattens supported visual effects into click steps and drops unsupported behavior durations. The player then applies independent opacity and clipping animations, so it cannot compose transforms or retain timing when an effect is unsupported.

## Usage

Hosts dispatch `add-animation`, `update-animation`, `remove-animation` and `move-animation` through the normal presentation command API. Animation inputs select an entrance preset, start mode, duration, delay and effect options. The slide's ordered animation cues drive both the Animations tab and playback.

```ts
const animated = applyPresentationCommand(artifact, {
  name: 'add-animation',
  slideId,
  objectKey,
  animation: normalizeEntranceAnimation({ kind: 'fly', start: 'click', duration: 500 }),
});
const player = createPresentationAnimationPlayer(animated.document.slides[0]!, 1280, 720);
player.advance(0);
const frame = player.sample(250);
```

The browser calls the headless compiler once per immutable slide, builds its target map once, and samples a playback program against a clock and click history. Static slide geometry and persisted document state remain unchanged by playback.

## Shape

The OOXML reader walks nested timing containers and lowers finite main-sequence timing into ordered cues containing typed property behaviors. Behavior timing is retained even when the renderer cannot execute its visual operation. Preset metadata describes editing; actual imported behavior controls playback. A small checked expression interpreter handles numeric animation formulas without JavaScript evaluation.

The headless slides package owns preset definitions, input schemas, timing, sampling and OOXML editing. The Svelte adapter owns DOM mutation and a single animation frame callback. Kryptonote owns the ribbon and effect selection. The player indexes target geometry before playback. The browser indexes DOM targets when playback starts. Existing native archives retain their legacy fade/appear/wipe interpretation at the program boundary.

## Synthesis decision

Two independent architectural candidates were reviewed: a complete timing-tree runtime and a compiler lowering the tree into property tracks. The compiler is the base: it hides container semantics from the browser and fits the finite entrance scope. The tree candidate contributed typed unsupported behavior nodes, shared timing for slide advance, and deterministic sampling. A full event/restart interpreter is deferred; arbitrary interactive trees retain diagnostics and original source.

Both candidates were screened for split ownership, duplicated preset lists and XML leaking into UI. A single catalog owns authored defaults and XML expansion. One program owns playback state. Commands address one effect. The writer rebuilds the finite main-sequence wrappers using preserved effect contents. Build lists and extensions remain in place. Slides with referenced timing nodes or interactive sequences reject animation edits before changing native state.

## Tradeoffs accepted

- Finite main-sequence timing is compiled; arbitrary event cycles and advanced text builds are preserved with diagnostics.
- Whole-object entrances come first. Word and character segmentation needs a separate layout-aware implementation.
- LibreOffice round-trips and ECMA schema checks establish interoperability evidence, not proof of exact PowerPoint rendering.

## Verification

Focused tests exercise timing, formulas, transform composition, native save, reload and export and authoring. A rerunnable compatibility script generates a preset deck, passes it through headless LibreOffice, and compares interpreted effects and timings. Browser checks exercise the actual Animations tab and playback. The compatibility command is `bash scripts/verify-entrance-animations.sh /tmp/tumbler-animation-verification`. Set `ECMA_PRESENTATION_SCHEMA_ARCHIVE` to the official `OfficeOpenXML-XMLSchema-Transitional.zip` to include schema validation. The generator covers every authored direction and a mixed click, with-previous and after-previous sequence.

`bun test packages/slides/test packages/svelte/test/presentation*.test.ts packages/svelte/src/presentation*.test.ts` covers the headless and browser-adapter behavior. `bun run check` checks the types.

`bun scripts/benchmark-entrance-animations.ts` measures headless sampling for 250 simultaneous objects. It checks every output and runs five measured rounds after warmup. The initial run took a median 0.133 ms per sample, range 0.096–0.162 ms. A separate CPU profile attributed the work to sampling, Map allocation and reveal calculations on one core. This excludes DOM updates, browser layout and painting, so it is not an end-to-end frame-time claim.

LibreOffice's exported SVG slideshow also ran in the shared browser. Its Fly In started off-slide and reached its original position. Kryptonote's live editor checks covered changing an imported entrance, preview with restored geometry, adding an effect, changing its start mode, reordering, removing, undoing and saving.

PowerPoint itself was unavailable. Text builds, motion paths, advanced filters, interactive triggers, media commands and time-varying formulas remain unsupported. Their original XML survives ordinary edits. Browser verification and LibreOffice round-trips do not prove exact Microsoft PowerPoint visual parity.

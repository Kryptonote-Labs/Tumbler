import { expect, test } from '@playwright/test';
import { createWordArtifact } from '@tumblerjs/word';

for (const start of ['compositionstart', 'insertCompositionText'] as const) {
  test(`${start} uses the controlled caret while pagination still shows the previous revision`, async ({ page }) => {
    const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: 'foo' }] }] });
    await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
    await page.goto('/playground/word-brief');
    const run = page.getByText('foo', { exact: true });
    await expect(run).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const retained = await run.evaluate(async (element, start) => {
      const root = element.closest<HTMLElement>('[contenteditable]')!;
      const text = element.firstChild!;
      root.focus();
      getSelection()!.setBaseAndExtent(text, 3, text, 3);
      document.dispatchEvent(new Event('selectionchange'));
      root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'a' }));
      // Flush the controlled revision without letting the scheduled paginator task run.
      await Promise.resolve();
      const retained = element.textContent;
      if (start === 'compositionstart') root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      else root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertCompositionText', data: '你', isComposing: true }));
      root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
      return retained;
    }, start);
    expect(retained).toBe('foo');
    await expect(page.getByText('fooa你', { exact: true })).toBeVisible();
  });
}

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createWordArtifact, importWordContent, openWordArtifact, wordSampleText } from '@tumblerjs/word';

for (const name of ['rand', 'lorem']) {
  test(`${name} expands on Enter, restores through history and leaves a working caret`, async ({ page }) => {
    const command = `=${name}(2,1)`;
    const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: command }] }] });
    await page.route('**/samples/project-brief.docx', route => route.fulfill({ body: Buffer.from(artifact.bytes()) }));
    await page.goto('/playground/word-brief');
    await expect(page.getByText(command, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByText(command, { exact: true }).evaluate(element => {
      const text = element.firstChild!;
      element.closest<HTMLElement>('[contenteditable]')!.focus();
      getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.keyboard.press('Enter');
    await expect(page.getByText(command, { exact: true })).toHaveCount(0);
    await page.keyboard.insertText('Continued');
    await expect(page.getByText('Continued', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByText('Continued', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect(page.getByText(command, { exact: true })).toBeVisible();
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByText(command, { exact: true })).toHaveCount(0);
    await page.keyboard.insertText('Continued');

    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const saved = openWordArtifact(new Uint8Array(await readFile((await (await downloaded).path())!)));
    expect(importWordContent(saved).map(block => block.kind === 'paragraph' && block.runs.map(run => run.text).join('')))
      .toEqual([...wordSampleText(command)!.split('\n'), 'Continued']);
  });
}

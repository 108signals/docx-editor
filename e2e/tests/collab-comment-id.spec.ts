/**
 * Two-peer comment-ID collision regression (#257).
 *
 * Two pages in ONE browser context join the same room — y-webrtc's
 * BroadcastChannel path syncs them without any external signaling server,
 * so the test is hermetic. Each page mints comment IDs from a disjoint
 * `ydoc.clientID * 1_000_000` base; on main (no `commentIdBase`) both
 * pages would allocate `1` and this test would fail.
 */

import { test, expect, Page } from '@playwright/test';

const COLLAB_URL = 'http://localhost:5273';
const SIDEBAR = '.docx-unified-sidebar';
const ADD_COMMENT_BTN = '[data-testid="floating-add-comment"]';

async function addComment(page: Page, body: string): Promise<number> {
  // Snapshot existing IDs first, then wait for a NEW one to appear — `.last()`
  // would race against the peer's comment syncing into this sidebar.
  const before = new Set(await visibleCommentIds(page));
  await page.locator('.layout-page-content').click({ clickCount: 3 });
  await page.locator(ADD_COMMENT_BTN).click();
  const ta = page.locator(`${SIDEBAR} textarea`).last();
  await ta.waitFor({ state: 'visible' });
  await ta.fill(body);
  await ta.press('Enter');
  let added: number | undefined;
  await expect
    .poll(
      async () => {
        added = (await visibleCommentIds(page)).find((id) => !before.has(id));
        return added;
      },
      { timeout: 10_000 }
    )
    .toBeDefined();
  return added!;
}

async function visibleCommentIds(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const ids = new Set<number>();
    for (const el of document.querySelectorAll('.docx-unified-sidebar [data-comment-id]')) {
      const n = Number((el as HTMLElement).dataset.commentId);
      if (!Number.isNaN(n)) ids.add(n);
    }
    return [...ids].sort((a, b) => a - b);
  });
}

test.describe('issue #257 — comment IDs partitioned per collab peer', () => {
  test('two peers mint distinct comment IDs and both sync', async ({ browser }) => {
    const room = `e2e-257-${Date.now()}`;
    const context = await browser.newContext();
    const [pageA, pageB] = await Promise.all([context.newPage(), context.newPage()]);

    await Promise.all([pageA.goto(`${COLLAB_URL}/#${room}`), pageB.goto(`${COLLAB_URL}/#${room}`)]);
    await Promise.all([
      pageA.waitForSelector('.layout-page-content'),
      pageB.waitForSelector('.layout-page-content'),
    ]);

    // Seed shared text from A; BroadcastChannel sync should surface it on B.
    await pageA.locator('.layout-page-content').click();
    await pageA.keyboard.type('Shared paragraph for commenting.');
    await expect(pageB.locator('.layout-page-content')).toContainText('Shared paragraph', {
      timeout: 10_000,
    });

    const idA = await addComment(pageA, 'from peer A');
    const idB = await addComment(pageB, 'from peer B');

    // Core #257 assertion: IDs are distinct and partitioned (each base is
    // clientID * 1e6, so the first ID on each peer is ≥ 1_000_001).
    expect(idA).not.toBe(idB);
    expect(idA).toBeGreaterThan(1_000_000);
    expect(idB).toBeGreaterThan(1_000_000);

    // Sync still works: each peer eventually sees both comments.
    await expect
      .poll(() => visibleCommentIds(pageA), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([idA, idB]));
    await expect
      .poll(() => visibleCommentIds(pageB), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([idA, idB]));

    await context.close();
  });
});

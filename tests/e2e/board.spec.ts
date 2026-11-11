import { expect, test, type Page } from '@playwright/test';

/**
 * Answers the scenes of the backstory (first answer), the years running between them on the clock (D-479), until the
 * early years are over and no window is up.
 */
async function growUp(page: Page): Promise<void> {
  await expect(page.locator('.backstory-screen, .clock').first()).toBeVisible();
  const choice = page.locator('.modal-layer .option button.choice').first();
  for (let i = 0; i < 60; i++) {
    if ((await page.locator('.backstory-screen').count()) === 0 && (await page.locator('.modal-layer').count()) === 0) return;
    await choice.click({ timeout: 2_000 }).catch(() => undefined);
  }
  throw new Error('the hero never became free to act');
}

test('the work board: J opens it, Esc closes it, the work is taken and the block "where I am" says so (CK.4)', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1');
  await growUp(page);
  const button = page.locator('[data-action="board"]');
  await expect(button).toContainText('Work board (J)');
  await expect(button).toContainText('here');

  // J opens the board, Esc closes it and gives the focus back to the game
  await page.keyboard.press('j');
  const board = page.locator('.modal.board');
  await expect(board).toBeVisible();
  await expect(board.locator('.board-offer').first()).toBeVisible();
  await page.screenshot({ path: 'out/e2e/board-1440.png' });
  await page.keyboard.press('Escape');
  await expect(board).toHaveCount(0);

  // the button opens it too; the focus is on the first offer here, so Down moves along the list at once
  await button.click();
  await expect(board).toBeVisible();
  const first = await board.locator('.board-offer.selected').getAttribute('data-offer');
  await expect(board.locator('.board-offer.selected')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(board.locator('.board-offer.selected')).not.toHaveAttribute('data-offer', first ?? '');
  await page.keyboard.press('ArrowUp');
  const take = board.locator('[data-focus="board-take"]');
  for (let i = 0; i < 20 && (await take.getAttribute('aria-disabled')) === 'true'; i++) await page.keyboard.press('ArrowDown');
  await expect(take).not.toHaveAttribute('aria-disabled', 'true');
  // the window keeps to the free map: its button is on the screen, above the block "where I am"
  const takeBox = await take.boundingBox();
  const whereBox = await page.locator('.game > .center').boundingBox();
  expect((takeBox?.y ?? 0) + (takeBox?.height ?? 0)).toBeLessThanOrEqual(whereBox?.y ?? 0);
  const title = ((await board.locator('.board-details h3').textContent()) ?? '').replace(/\s*·.*$/, '').trim();
  await take.click();
  await expect(board).toHaveCount(0);
  await expect(page.locator('#where-heading')).toContainText('Work:');
  await expect(page.locator('#where-heading')).toContainText(title);
  await page.screenshot({ path: 'out/e2e/board-taken-1440.png' });
  // with work under way the board says so; another board offers no way there that would leave this work half done
  await page.keyboard.press('j');
  await expect(board.locator('.board-current')).toBeVisible();
  await expect(take).toHaveAttribute('aria-disabled', 'true');
  await expect(board.locator('.reason')).toHaveText('You already have work');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  await expect(board.locator('[data-focus="board-travel"]')).toHaveCount(0);
  await page.screenshot({ path: 'out/e2e/board-busy-1440.png' });
  await page.keyboard.press('Escape');
  await expect(board).toHaveCount(0);
  // a laptop: the whole window and its button are on the screen
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.keyboard.press('j');
  await expect(board).toBeVisible();
  const dialog = await board.boundingBox();
  expect((dialog?.y ?? 0) + (dialog?.height ?? 0)).toBeLessThanOrEqual(800);
  await page.screenshot({ path: 'out/e2e/board-1280.png' });
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

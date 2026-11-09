import { expect, test, type Page } from '@playwright/test';

/** Answers the scenes of the backstory (first answer) until the hero is free and the clock stands. */
async function growUp(page: Page): Promise<void> {
  await expect(page.locator('.backstory-screen, .clock').first()).toBeVisible();
  for (let i = 0; i < 60; i++) {
    if ((await page.locator('.modal-layer').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    return;
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

  // the button opens it too; the first offer here is chosen, and Down moves along the list
  await button.click();
  await expect(board).toBeVisible();
  const take = board.locator('[data-focus="board-take"]');
  for (let i = 0; i < 20 && (await take.getAttribute('aria-disabled')) === 'true'; i++) {
    await board.locator('.board-offer.selected').focus();
    await page.keyboard.press('ArrowDown');
  }
  await expect(take).not.toHaveAttribute('aria-disabled', 'true');
  const title = (await board.locator('.board-details h3').textContent()) ?? '';
  await take.click();
  await expect(board).toHaveCount(0);
  await expect(page.locator('#where-heading')).toContainText('Work:');
  await expect(page.locator('#where-heading')).toContainText(title.replace(/\s*[●○]+\s*$/, '').trim());
  await page.screenshot({ path: 'out/e2e/board-taken-1440.png' });
  // with work under way the board says so and offers no second job
  await page.keyboard.press('j');
  await expect(board.locator('.board-current')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

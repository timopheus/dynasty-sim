import { expect, test } from '@playwright/test';

/**
 * The early years on a screen of their own (playtest 09.11): while the backstory runs there is no profile, map or
 * panel of the game behind it — nothing shows the founder at the age he leaves home at; the game opens after it.
 */
test('the backstory is a screen of its own, and the game opens when it ends', async ({ page }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1');
  const screen = page.locator('.backstory-screen');
  await expect(screen.locator('.modal.event')).toBeVisible();
  // nothing of the game: no side panel with the grown hero, no map, no actions, no clock
  for (const part of ['.sidebar', '.map-view', '.actions-panel', '.clock', '.topbar', '.avatar']) await expect(page.locator(part)).toHaveCount(0);
  await expect(screen.locator('.modal-title')).toHaveText(/^Age \d+$/);
  await expect(screen.locator('.backstory-age')).toHaveText(/^Scene 1 of \d+$/);
  await page.screenshot({ path: 'out/e2e/backstory-1-1440.png' });
  // the menu still offers a new game
  await screen.locator('.menu-button').click();
  await expect(screen.locator('.menu-list')).toContainText('New game');
  await screen.locator('.menu-button').click();
  // the scenes, one after another, then the game
  for (let i = 0; i < 40 && (await screen.count()) > 0; i++) {
    const shown = await page.locator('#app').innerText();
    await page.locator('.modal-layer .option button.choice').first().click();
    await expect.poll(async () => page.locator('#app').innerText()).not.toBe(shown);
  }
  await expect(screen).toHaveCount(0);
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('.map-view')).toHaveCount(1);
  await expect(page.locator('.modal-layer')).toHaveCount(0);
  expect(problems).toEqual([]);
});

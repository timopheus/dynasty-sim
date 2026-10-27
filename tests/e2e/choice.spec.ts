import { expect, test, type Page } from '@playwright/test';

/** The pace of the clock is raised so an event comes soon; a tip opens after this delay (D-465). */
const TIP_WAIT = 1_000;

/** Answers the scenes of the backstory (first answer) until the hero is free and the clock stands. */
async function growUp(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if ((await page.locator('.modal-layer').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
      continue;
    }
    return;
  }
  throw new Error('the hero never became free to act');
}

/** Runs time until a window with answers stands over the centre (the clock stops on it). */
async function untilWindow(page: Page): Promise<void> {
  await page.locator('.clock-speed-5, [data-focus="clock-speed-5"]').first().click();
  for (let i = 0; i < 200; i++) {
    if ((await page.locator('.modal.event').count()) > 0) return;
    if ((await page.locator('.clock-toggle').textContent()) === 'Play') await page.locator('.clock-toggle').click();
    await page.waitForTimeout(500);
  }
  throw new Error('no event came');
}

test('a variant has signs, a tip with its outcomes, and a light choice leaves a word in the news (D-463, D-464)', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=7');
  await growUp(page);
  let seen = 0;
  let news = 0;
  for (let round = 0; round < 40 && (seen < 1 || news < 1); round++) {
    await untilWindow(page);
    const buttons = page.locator('.modal.event .option button.choice');
    // nothing on a button but its name and signs: no numbers, no percent
    for (const text of await buttons.locator('.choice-head').allTextContents()) expect(text).not.toMatch(/\d+%|days/);
    const signed = page.locator('.modal.event .option button.choice [data-tip], .modal.event .option button[data-tip]');
    if ((await signed.count()) > 0) {
      seen += 1;
      await signed.first().hover();
      await page.waitForTimeout(TIP_WAIT);
      await expect(page.locator('#tooltip')).toBeVisible();
      await page.screenshot({ path: 'out/e2e/choice-tip-1440.png' });
    }
    await buttons.first().click();
    if ((await page.locator('.modal.outcome').count()) > 0) {
      await page.screenshot({ path: 'out/e2e/choice-outcome-1440.png' });
      await page.locator('.modal.outcome button.choice').first().click();
    } else if ((await page.locator('.news-item').count()) > 0) {
      // a light choice: no window, a word in the news, and the clock is not held by it
      news += 1;
      await expect(page.locator('.modal-layer')).toHaveCount(0);
      await page.screenshot({ path: 'out/e2e/choice-news-1440.png' });
    }
  }
  expect(seen, 'some window offered a variant with something to explain').toBeGreaterThan(0);
  expect(news, 'a light choice left a word in the news').toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

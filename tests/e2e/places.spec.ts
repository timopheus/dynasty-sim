import { expect, test, type Page } from '@playwright/test';

/** The place of the hero (S.9): "Travel to …" → on the road → on arrival a new place, its page in the side panel. */

const TOGGLE = '.clock .clock-toggle';
const PLACE = '.where .place-name';

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });
  return problems;
}

/** Answers the scenes of the backstory with their first choice, until the hero is free to act. */
async function growUp(page: Page): Promise<void> {
  await expect(page.locator('.modal.event')).toBeVisible();
  for (let i = 0; i < 40 && (await page.locator('.modal-layer').count()) > 0; i++) {
    const shown = await page.locator('#app').innerText();
    await page.locator('.modal-layer .option button.choice').first().click();
    await expect.poll(async () => page.locator('#app').innerText()).not.toBe(shown);
  }
  await expect(page.locator('.modal-layer')).toHaveCount(0);
}

/** Opens the menu of directions if it is folded and presses the button of the place ("Travel to …" or "Turn toward …"). */
async function go(page: Page, name: string): Promise<void> {
  const menu = page.locator('.actions-panel details.directions');
  if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
  await menu.getByRole('button', { name: new RegExp(`^(Travel to|Turn toward) ${name}\\b`) }).click();
}

test('"Travel to …" puts the hero on the road, and on arrival he is in a new place', async ({ page }) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1&dev=1');
  await growUp(page);
  await expect(page.locator('#where-heading')).toHaveText('Free to act');

  // the block "where I am": a place, its table, the weather and the way out
  await expect(page.locator(PLACE)).toHaveText('Ostmere');
  await expect(page.locator('.place-table')).toContainText('Haverland');
  await expect(page.locator('.place-table')).toContainText('Weather');
  await expect(page.locator('.place-roads')).toContainText('Rohrbach 2 days');
  await page.screenshot({ path: 'out/e2e/places-1-standing-1440.png' });

  // the name of a place near by opens its page in the side panel
  await page.locator('.place-roads a.place-link').first().click();
  await expect(page).toHaveURL(/#\/place\/p\d+$/);
  await expect(page.locator('.sidebar')).toContainText('Rohrbach');
  await expect(page.locator('.sidebar')).toContainText('Roads');

  await go(page, 'Rohrbach');
  await expect(page.locator('#where-heading')).toHaveText('Heading for Rohrbach');
  await expect(page.locator(PLACE)).toHaveText('On the road');
  await page.screenshot({ path: 'out/e2e/places-2-on-the-road-1440.png' });
  // the way is under way: the other places turn the hero, this one is grey
  await expect(page.locator('.actions-panel details.directions button[aria-disabled="true"]')).toContainText('Rohrbach');

  // the clock runs the two days; a window that stops it gets its first answer
  await page.locator('.clock .speed', { hasText: '×5' }).click();
  for (let i = 0; i < 60; i++) {
    if ((await page.locator(PLACE).textContent()) === 'Rohrbach') break;
    if ((await page.locator('.modal-layer').count()) > 0) {
      await page.locator('.modal-layer .option button.choice').first().click({ timeout: 2_000 }).catch(() => undefined);
      await page.locator('.modal-layer #continue, .modal-layer button', { hasText: 'Continue' }).first().click({ timeout: 500 }).catch(() => undefined);
    } else if ((await page.locator('#where-heading').textContent()) === 'Free to act' && (await page.locator(PLACE).textContent()) === 'On the road') {
      // a road event broke the journey off: the hero stands on the road and goes on
      await go(page, 'Rohrbach');
    } else {
      await page.locator(TOGGLE).click({ timeout: 1_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(300);
  }
  await expect(page.locator(PLACE)).toHaveText('Rohrbach');
  await expect(page.locator('.place-table')).toContainText('Schwoberia');
  await expect(page.locator('.place-line')).toContainText('Tar and cold fish');
  await page.screenshot({ path: 'out/e2e/places-3-arrived-1440.png' });
  expect(problems).toEqual([]);
});

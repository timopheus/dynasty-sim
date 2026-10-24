import { expect, test, type Page } from '@playwright/test';

/** The time player (S.8): "Play" moves the date, an event stops the clock, keys and reload keep the day. */

const DATE = '.clock .date';
const CLOCK = '.clock';
const TOGGLE = '.clock .clock-toggle';

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });
  return problems;
}

const date = async (page: Page) => (await page.locator(DATE).textContent()) ?? '';

/** Answers the scenes of the backstory with their first choice, until the hero is free to act. */
async function growUp(page: Page): Promise<void> {
  for (let i = 0; i < 40 && (await page.locator('.modal-layer').count()) > 0; i++) {
    const shown = await page.locator('#app').innerText();
    await page.locator('.modal-layer .option button.choice').first().click();
    await expect.poll(async () => page.locator('#app').innerText()).not.toBe(shown);
  }
  await expect(page.locator('.modal-layer')).toHaveCount(0);
}

test('"Play" moves the date, an event stops the clock; keys pick speed, answer and pause; reload keeps the day', async ({ page }) => {
  test.setTimeout(180_000);
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1&dev=1');
  await growUp(page);
  await expect(page.locator('#where-heading')).toHaveText('Free to act');
  await expect(page.locator(CLOCK)).toHaveClass(/\bidle\b/);
  // the actions of the main screen carry no digits: the digits are the speeds now (D-448)
  const actions = await page.locator('.where button.choice').allTextContents();
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) expect(a).not.toMatch(/^\d\./);
  await page.screenshot({ path: 'out/e2e/clock-1-idle-1440.png' });

  // 3 → ×5 without a window
  await page.locator('#where-heading').focus();
  await page.keyboard.press('3');
  await expect(page.locator('.clock .speed.current')).toHaveText('×5');

  // "Play" with nothing to do: the hero lives as he wills and the date moves
  const before = await date(page);
  await page.locator(TOGGLE).click();
  await expect(page.locator('#where-heading')).toHaveText('Live as you will');
  await expect.poll(() => date(page), { timeout: 10_000 }).not.toBe(before);
  await expect(page.locator(CLOCK)).toHaveClass(/\brunning\b/);
  await expect(page.locator(TOGGLE)).toHaveText('Pause');
  await page.screenshot({ path: 'out/e2e/clock-2-running-1440.png' });

  // an event with a choice comes, and the clock stands
  await expect(page.locator('.modal.event')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(CLOCK)).toHaveClass(/\bdecision\b/);
  const stopped = await date(page);
  await page.waitForTimeout(1500);
  expect(await date(page), 'the date moved under an event').toBe(stopped);
  await page.screenshot({ path: 'out/e2e/clock-3-event-1440.png' });

  // in the window a digit answers it and does not change the speed (D-263, D-448)
  const shown = await page.locator('.modal-layer').innerText();
  await page.keyboard.press('1');
  await expect.poll(async () => (await page.locator('.modal-layer').count()) === 0 || (await page.locator('.modal-layer').innerText()) !== shown).toBe(true);
  await expect(page.locator('.clock .speed.current')).toHaveText('×5');
  // close any outcome or further page of the event
  for (let i = 0; i < 10 && (await page.locator('.modal-layer').count()) > 0; i++) {
    const text = await page.locator('.modal-layer').innerText();
    await page.locator('.modal-layer button.choice').first().click();
    await expect.poll(async () => (await page.locator('.modal-layer').count()) === 0 || (await page.locator('.modal-layer').innerText()) !== text).toBe(true);
  }

  // Space pauses (focus on a heading, not a button); a pause saves, so a reload continues on the same day
  if (!(await page.locator(CLOCK).getAttribute('class'))?.includes('running')) {
    await page.locator(TOGGLE).click();
    await expect(page.locator(CLOCK)).toHaveClass(/\brunning\b/);
  }
  await page.locator('#where-heading').focus();
  await page.keyboard.press(' ');
  await expect(page.locator(CLOCK)).toHaveClass(/\bpaused\b|\bdecision\b|\bidle\b/);
  const paused = await date(page);
  await page.waitForTimeout(1000);
  expect(await date(page), 'the date moved while paused').toBe(paused);
  await page.goto('/?dev=1');
  await expect(page.locator(DATE)).toHaveText(paused);
  await expect(page.locator(CLOCK)).not.toHaveClass(/\brunning\b/);
  expect(problems).toEqual([]);
});

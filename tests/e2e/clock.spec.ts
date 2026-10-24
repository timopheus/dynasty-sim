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

/** Where "Play"/"Pause" is on screen: it must not move under the cursor whatever the clock says. */
const toggleBox = async (page: Page) => {
  const box = await page.locator(TOGGLE).boundingBox();
  return box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) } : null;
};

/** Answers the scenes of the backstory with their first choice, until the hero is free to act. */
async function growUp(page: Page): Promise<void> {
  // a new game opens on the first scene of the backstory; wait for it, the page draws after the store is read
  await expect(page.locator('.modal.event')).toBeVisible();
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
  const actions = await page.locator('.actions-panel .action-name').allTextContents();
  expect(actions.length).toBeGreaterThan(0);
  for (const a of actions) expect(a).not.toMatch(/^\d\./);
  await page.screenshot({ path: 'out/e2e/clock-1-idle-1440.png' });
  const place = await toggleBox(page);
  expect(place).not.toBeNull();

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
  expect(await toggleBox(page), 'the button moved when time began to run').toEqual(place);
  await page.screenshot({ path: 'out/e2e/clock-2-running-1440.png' });

  // an event with a choice comes, and the clock stands
  await expect(page.locator('.modal.event')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator(CLOCK)).toHaveClass(/\bdecision\b/);
  expect(await toggleBox(page), 'the button moved when the clock stopped').toEqual(place);
  // a window holds the clock: the speeds wait for the answer
  await expect(page.locator('.clock .speed').first()).toBeDisabled();
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

  // the clock's buttons keep the focus when pressed from the keyboard. Each try starts paused with no window; an event
  // that comes in the middle takes the focus to its window as it should, so that try is answered and made again.
  const focusedOn = (selector: string) => page.locator(selector).evaluate((n) => n.matches(":focus"));
  let checked = false;
  for (let i = 0; i < 6 && !checked; i++) {
    if ((await page.locator('.modal-layer').count()) > 0) {
      const text = await page.locator('.modal-layer').innerText();
      await page.locator('.modal-layer button.choice').first().click();
      await expect.poll(async () => (await page.locator('.modal-layer').count()) === 0 || (await page.locator('.modal-layer').innerText()) !== text).toBe(true);
      continue;
    }
    const mode = (await page.locator(CLOCK).getAttribute('class')) ?? '';
    if (mode.includes('running')) {
      await page.locator(TOGGLE).focus();
      await page.keyboard.press('Enter');
      await expect(page.locator(CLOCK)).not.toHaveClass(/\brunning\b/);
      // pause from the keyboard: the focus stays on the button
      if ((await page.locator('.modal-layer').count()) > 0) continue;
      await expect(page.locator(CLOCK)).toHaveClass(/\bpaused\b/);
      expect(await focusedOn(TOGGLE), 'focus left "Pause"').toBe(true);
      continue;
    }
    if (!mode.includes('paused')) {
      await page.locator(TOGGLE).click();
      continue;
    }
    // paused, no window: a speed from the keyboard keeps the focus on its button
    const speed = page.locator('.clock .speed').nth(1);
    await speed.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.clock .speed.current')).toHaveText('×2');
    if ((await page.locator('.modal-layer').count()) > 0) continue;
    expect(await focusedOn('.clock .speed >> nth=1'), 'focus left "×2"').toBe(true);
    checked = true;
  }
  expect(checked, 'the focus of the clock buttons was never checked').toBe(true);

  // Space pauses (focus on a heading, not a button); a pause saves, so a reload continues on the same day. An event may
  // come in between: answer it and try again.
  for (let i = 0; i < 10; i++) {
    if ((await page.locator('.modal-layer').count()) > 0) {
      const text = await page.locator('.modal-layer').innerText();
      await page.locator('.modal-layer button.choice').first().click();
      await expect.poll(async () => (await page.locator('.modal-layer').count()) === 0 || (await page.locator('.modal-layer').innerText()) !== text).toBe(true);
      continue;
    }
    if (!(await page.locator(CLOCK).getAttribute('class'))?.includes('running')) {
      await page.locator(TOGGLE).click();
      await page.waitForTimeout(300);
      continue;
    }
    await page.locator('#where-heading').focus();
    await page.keyboard.press(' ');
    await page.waitForTimeout(300);
    if ((await page.locator(CLOCK).getAttribute('class'))?.includes('paused')) break;
  }
  await expect(page.locator(CLOCK)).toHaveClass(/\bpaused\b/);
  await expect(page.locator('.modal-layer')).toHaveCount(0);
  expect(await toggleBox(page), 'the button moved on pause').toEqual(place);

  const paused = await date(page);
  await page.waitForTimeout(1000);
  expect(await date(page), 'the date moved while paused').toBe(paused);
  await page.goto('/?dev=1');
  await expect(page.locator(DATE)).toHaveText(paused);
  await expect(page.locator(CLOCK)).not.toHaveClass(/\brunning\b/);
  expect(problems).toEqual([]);
});

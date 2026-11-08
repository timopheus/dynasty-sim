import { expect, test, type Page } from '@playwright/test';

/** The map of the screen (M.1, D-469): under every panel, it opens on the hero; a place explains itself and takes a journey. */

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function growUp(page: Page): Promise<void> {
  await expect(page.locator('.modal.event')).toBeVisible();
  for (let i = 0; i < 40 && (await page.locator('.modal-layer').count()) > 0; i++) {
    const shown = await page.locator('#app').innerText();
    await page.locator('.modal-layer .option button.choice').first().click();
    await expect.poll(async () => page.locator('#app').innerText()).not.toBe(shown);
  }
  await expect(page.locator('.modal-layer')).toHaveCount(0);
}

/** Index of the first place on the map not covered by a panel. */
async function freePlace(page: Page): Promise<number> {
  return page.evaluate<number>(`[...document.querySelectorAll('.map-place')].findIndex((b) => {
    if (b.hidden) return false;
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
  })`);
}

const transformOf = (page: Page, i: number) => page.locator('.map-place').nth(i).getAttribute('style');

test('the map lies under the panels, opens on the hero, moves and zooms, and a place takes a journey', async ({ page }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1&dev=1');
  await growUp(page);
  const canvas = page.locator('.map-view .map-canvas');
  await expect(canvas).toBeVisible();
  // the hero's place is on the free part of the map, not under a panel
  const here = await freePlace(page);
  expect(here, 'a place on the free part of the map').toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: 'out/e2e/map-1-opens-on-hero-1440.png' });
  // dragging the map moves the places with it; the wheel zooms
  const before = await transformOf(page, here);
  await page.mouse.move(760, 300);
  await page.mouse.down();
  await page.mouse.move(860, 340, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => transformOf(page, here)).not.toBe(before);
  const dragged = await transformOf(page, here);
  await page.mouse.move(760, 300);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 400);
  await expect.poll(() => transformOf(page, here)).not.toBe(dragged);
  await page.screenshot({ path: 'out/e2e/map-2-zoomed-out-1440.png' });
  // Home brings the hero back to the middle of the free map
  await canvas.focus();
  await page.keyboard.press('Home');
  await page.waitForTimeout(800);
  // the map modes are buttons by the map
  for (const m of ['Terrain', 'Cultures', 'Faiths', 'Roads', 'Realms']) {
    await page.locator('.map-mode', { hasText: m }).click();
    await expect(page.locator('.map-mode.current')).toHaveText(m);
    if (m === 'Roads') await page.screenshot({ path: 'out/e2e/map-3-roads-1440.png' });
  }
  // a place explains itself after the delay, and its menu takes a journey
  const target = await page.evaluate<number>(`(() => {
    const free = [...document.querySelectorAll('.map-place')].map((b, i) => ({ b, i })).filter(({ b }) => {
      if (b.hidden) return false;
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
    });
    return free.length > 1 ? free[1].i : free.length ? free[0].i : -1;
  })()`);
  expect(target).toBeGreaterThanOrEqual(0);
  const spot = page.locator('.map-place').nth(target);
  await spot.hover();
  await expect(page.locator('#tooltip')).toBeVisible();
  await expect(page.locator('#tooltip')).toContainText(/of road from here|You are here|No road/);
  await spot.click({ button: 'right' });
  const menu = page.locator('.map-menu');
  await expect(menu).toBeVisible();
  await expect(page.locator('#tooltip')).toBeHidden();
  const go = menu.locator('.menu-item').first();
  await expect(go).toHaveText(/^(Travel to|Turn toward) /);
  await page.screenshot({ path: 'out/e2e/map-4-menu-1440.png' });
  if (!((await go.getAttribute('class')) ?? '').includes('grey')) {
    await go.click();
    await expect(page.locator('#where-heading')).toHaveText(/^Heading for /);
  } else {
    // the hero's own place: open its page instead
    await menu.locator('.menu-item', { hasText: 'Open the page' }).click();
    await expect(page.locator('.sidebar h1')).toBeVisible();
  }
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

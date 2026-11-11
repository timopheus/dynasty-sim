import { expect, test, type Page } from '@playwright/test';

/**
 * Russian, the second language (RU.1, D-476): chosen in the menu, the whole screen speaks it. What is left in Latin
 * letters is only what the player presses on the keyboard.
 */
const TURNS = 50;
const DATE = '.clock .date';

/** Latin words a Russian screen may show: the keys the player presses (a letter, Home, Esc), the tiers of a trait (II). */
const ALLOWED = (w: string) => /^[A-Z]$/.test(w) || /^[IVX]+$/.test(w) || ['Home', 'Esc'].includes(w);

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => { problems.push(`unexpected dialog: ${d.message()}`); void d.dismiss(); });
  return problems;
}

/** The words in Latin letters on the screen and in the tips the screen carries, keys aside. */
async function latin(page: Page): Promise<string[]> {
  const text = await page.evaluate<string>(`(() => {
    const tips = [...document.querySelectorAll('[data-tip], [data-tip-title], [title], [aria-label]')]
      .map((n) => [n.getAttribute('data-tip-title'), n.getAttribute('data-tip'), n.getAttribute('title'), n.getAttribute('aria-label')].filter(Boolean).join(' '));
    return document.getElementById('app').innerText + '\\n' + tips.join('\\n');
  })()`);
  // each word with a little of what stands around it, so a failure says where it is
  const found = [...text.matchAll(/[A-Za-z][A-Za-z']*/g)].filter((m) => !ALLOWED(m[0]));
  return [...new Set(found.map((m) => `${m[0]} «${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')}»`))];
}

async function choices(page: Page) {
  return (await page.locator('.modal-layer').count()) > 0 ? page.locator('.modal-layer .option button.choice') : page.locator('.actions-panel button.action:not(.grey):not([data-action="board"]):visible');
}

/**
 * Answers the scenes of the early years until the game screen is there, reading every scene for Latin first: the
 * names in a scene and in its choices are those of the family (a choice once showed "Isabel Merrick").
 */
async function growUp(page: Page, seen: Set<string>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('.backstory-screen').count()) === 0 && (await page.locator('.modal-layer').count()) === 0) return;
    for (const w of await latin(page)) seen.add(w);
    // a different choice each scene, so the scenes that name people come up too
    const buttons = page.locator('.modal-layer .option button.choice');
    const n = await buttons.count();
    await buttons.nth(n > 0 ? i % n : 0).click({ timeout: 2_000 }).catch(() => undefined);
  }
  throw new Error('the hero never grew up');
}

test('menu → Russian → 50 turns: no English on the screen, the choice holds after a reload', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // seed 3: the second scene of the early years names a friend in its choices
  await page.goto('/?fastyears=1&seed=3&dev=1');
  await expect(page.locator('.backstory-screen')).toBeVisible();
  await expect(page.locator('.modal.event .modal-title')).toHaveText(/^Age \d+$/);
  const english = await page.locator('.backstory-screen').innerText();

  // the item names itself in its own language, so whoever cannot read the other one finds it
  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('button', { name: 'Русский язык' }).click();
  // before the first choice the game begins anew in Russian: the same seed, the same hero, the words Russian
  await expect(page.locator('.modal.event .modal-title')).toHaveText(/^Возраст \d+$/);
  await expect(page.locator('.backstory-screen')).not.toHaveText(english);
  await expect(page.locator('.backstory-screen')).toHaveAttribute('data-seed', '3');
  expect(await latin(page), 'Latin on the first screen').toEqual([]);
  await page.screenshot({ path: 'out/e2e/ru-1-backstory.png' });

  const early = new Set<string>();
  await growUp(page, early);
  expect([...early].sort(), 'Latin in the scenes of the early years').toEqual([]);
  await expect(page.locator(DATE).first()).toBeVisible();
  expect(await latin(page), 'Latin on the game screen').toEqual([]);
  await page.screenshot({ path: 'out/e2e/ru-2-start.png' });

  const seen = new Set<string>();
  for (let turn = 0; turn < TURNS; turn++) {
    let clicked = false;
    for (let attempt = 0; attempt < 5 && !clicked; attempt++) {
      const now = await choices(page);
      const n = await now.count();
      if (n === 0) {
        await page.waitForTimeout(500);
        continue;
      }
      clicked = await now.nth(turn % n).click({ timeout: 3_000 }).then(() => true, () => false);
    }
    expect(clicked, `turn ${String(turn)}: no button could be pressed`).toBe(true);
    await page.waitForTimeout(150);
    for (const w of await latin(page)) seen.add(w);
    expect(problems, `errors after turn ${String(turn)}`).toEqual([]);
    if (turn === Math.floor(TURNS / 2)) await page.screenshot({ path: 'out/e2e/ru-3-middle.png' });
  }
  expect([...seen].sort(), 'Latin words seen during 50 turns').toEqual([]);

  // the board of work and the page of the place speak Russian too
  if ((await page.locator('.modal-layer').count()) === 0) {
    await page.keyboard.press('j');
    if ((await page.locator('.modal.board').count()) > 0) {
      expect(await latin(page), 'Latin on the board').toEqual([]);
      await page.screenshot({ path: 'out/e2e/ru-4-board.png' });
      await page.keyboard.press('Escape');
    }
  }

  // the choice is kept: after a reload the game continues in Russian
  await page.goto('/?fastyears=1&dev=1');
  await expect(page.locator(DATE).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Меню/ })).toBeVisible();
  // and back: the item is called "English" now
  await page.getByRole('button', { name: /Меню/ }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: /Menu/ })).toBeVisible();
  expect(problems).toEqual([]);
});

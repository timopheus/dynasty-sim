import { describe, expect, it } from 'vitest';
import { NEWS_DAYS, NEWS_MAX, pushNews, visibleNews, type NewsItem } from '../src/ui/news-model';
import { optionTip } from '../src/ui/event';
import type { OptionView } from '../src/core/events/view';

describe('news by the clock (D-464)', () => {
  it('keeps the newest few, newest first', () => {
    let list: NewsItem[] = [];
    for (let i = 0; i < NEWS_MAX + 2; i += 1) list = pushNews(list, { day: i, text: `word ${i}` });
    const rows = visibleNews(list, NEWS_MAX + 1);
    expect(rows.map((r) => r.text)).toEqual(['word 4', 'word 3', 'word 2']);
    expect(rows.map((r) => r.age)).toEqual([0, 1, 2]);
  });

  it('lets an old word go', () => {
    const list = [{ day: 0, text: 'old' }, { day: 40, text: 'new' }];
    expect(visibleNews(list, NEWS_DAYS + 1).map((r) => r.text)).toEqual(['new']);
  });
});

const view = (over: Partial<OptionView>): OptionView => ({
  index: 0, text: ['Fight'], available: true, reasons: [], chance: null,
  icons: { check: false, cost: false, trait: false },
  outcomes: { cost: [], result: [], success: [], failure: [], chanceBasis: [] }, nature: null, risk: null, ...over,
});

describe('tooltip of a variant (D-463, D-465)', () => {
  it('is empty when the button says it all', () => {
    expect(optionTip(view({}))).toBeNull();
  });

  it('gives the chance with its basis, both outcomes, the price and the risk, one fact a line', () => {
    const tip = optionTip(view({
      chance: { percent: 55, band: 'even' },
      outcomes: { cost: ['Costs 5 crowns'], result: [], success: ['Become Brave'], failure: ['Wound: Light wound'], chanceBasis: ['Prowess (9) against difficulty 6'] },
      risk: 'The bailiff may remember.',
      nature: { lines: ['Against your nature (Brave): happiness −10'], delta: -10 },
    }));
    expect(tip?.text.split('\n\n')).toEqual([
      'Chance: a toss-up, 55%\nProwess (9) against difficulty 6',
      'If it works: Become Brave\nIf it fails: Wound: Light wound',
      'Costs 5 crowns\nRisk: The bailiff may remember.',
      'Against your nature (Brave): happiness −10',
    ]);
  });

  it('lists several facts one to a line', () => {
    const tip = optionTip(view({ outcomes: { cost: [], result: [], success: ['Become Brave', '+1 Martial'], failure: [], chanceBasis: [] } }));
    expect(tip?.text).toBe('If it works:\n • Become Brave\n • +1 Martial');
  });

  it('shows a grey variant its reason and no chance', () => {
    const tip = optionTip(view({ available: false, reasons: ['Requires 50 crowns'], chance: { percent: 55, band: 'even' } }));
    expect(tip?.text).toBe('Unavailable: Requires 50 crowns');
  });
});

import { describe, expect, it } from 'vitest';
import type { Content } from '../src/core/content/schema';
import { newGame } from '../src/core/game';
import { getPlayer } from '../src/core/helpers';
import { createCharacter } from '../src/core/lifecycle';
import { runSim } from '../src/core/sim';
import { checkEventTemplate } from '../src/core/text/check';
import { grammarProblems, type GrammarDef } from '../src/core/text/grammar';
import { renderTemplate, textStream } from '../src/core/text/render';
import { ownLine, partsText, type TextPart } from '../src/core/text/text';
import { seasonAt } from '../src/core/time/seasons';
import { fixtureContent, fixtureNarrator, loadOrThrow, BASE_FILES } from './fixtures/content';

const GRAMMAR: GrammarDef = {
  dawn: ['at first light', 'in the grey before dawn', 'when the cocks crowed', 'as the bells rang'],
  weather: [{ text: 'in driving snow', when: { season: ['winter'] } }, 'in a cold rain'],
  morning: ['<dawn> <weather>'],
};

function setup(grammar: GrammarDef | null = GRAMMAR) {
  const content: Content = fixtureContent({}, { grammar });
  const state = newGame(1, content);
  const ctx = { state, content };
  const hero = getPlayer(state);
  const friend = createCharacter(ctx, { surname: 'Friend', age: { min: 40, max: 40 } });
  const scope = { hero: hero.id, protagonist: hero.id, friend: friend.id };
  return { ctx, state, hero, friend, scope };
}

const text = (parts: TextPart[]) => partsText(parts);

describe('event texts with roles', () => {
  it('renderTemplate puts a reference to the role and its pronouns', () => {
    const { ctx, hero, friend, scope } = setup();
    const he = friend.sex === 'male' ? 'he' : 'she';
    const His = friend.sex === 'male' ? 'His' : 'Her';
    const heroName = { id: hero.id, name: `${hero.givenName} ${hero.surname}` };
    const friendName = { id: friend.id, name: `${friend.givenName} ${friend.surname}` };
    expect(renderTemplate(ctx, '{name} met {friend}; {friend.he} was {friend.age}. {friend.His} hand, {hero}.', scope, 0, 'text')).toEqual([
      heroName,
      ' met ',
      friendName,
      `; ${he} was 40. ${His} hand, `,
      heroName,
      '.',
    ]);
    expect(() => renderTemplate(ctx, '{nobody}', scope, 0, 'text')).toThrow(/nobody/);
  });

  it('{role?…} is kept for a filled role and dropped for an empty one', () => {
    const { ctx, hero, friend, scope } = setup();
    const withFriend = renderTemplate(ctx, '{name} rode out{friend?, with {friend} ({friend.age})}.', scope, 0, 'text');
    expect(text(withFriend)).toBe(`${hero.givenName} ${hero.surname} rode out, with ${friend.givenName} ${friend.surname} (40).`);
    expect(withFriend.some((p) => typeof p === 'object' && p.id === friend.id)).toBe(true);
    const alone = renderTemplate(ctx, '{name} rode out{second?, with {second}}.', scope, 0, 'text');
    expect(text(alone)).toBe(`${hero.givenName} ${hero.surname} rode out.`);
  });
});

describe('grammar', () => {
  it('reads the same text again, and differently under other numbers of events', () => {
    const { ctx, scope } = setup();
    const read = (seq: number, slot = 'text') => text(renderTemplate(ctx, '<Dawn>, a shot rang.', scope, seq, slot));
    expect(read(7)).toBe(read(7));
    expect(read(7, 'option.1.result')).toBe(read(7, 'option.1.result'));
    const seen = new Set(Array.from({ length: 30 }, (_, seq) => read(seq)));
    expect(seen.size).toBeGreaterThan(1);
    const slots = new Set(['text', 'option.0.text', 'option.0.result', 'option.1.result', 'option.2.result', 'pages.a.text'].map((slot) => read(3, slot)));
    expect(slots.size).toBeGreaterThan(1);
    expect(textStream(3, 'text')).not.toBe(textStream(3, 'option.0.text'));
  });

  it('capitalizes <Symbol> and expands symbols inside symbols', () => {
    const { ctx, scope } = setup();
    for (let seq = 0; seq < 20; seq++) {
      const line = text(renderTemplate(ctx, '<Morning>: shots. And <morning> again.', scope, seq, 'text'));
      expect(line).toMatch(/^[A-Z][a-z ]+ in (driving snow|a cold rain): shots\. And [a-z ]+ in (driving snow|a cold rain) again\.$/);
      expect(line).not.toMatch(/[<>]/);
    }
  });

  it('does not touch the world random stream', () => {
    const { ctx, state, scope } = setup();
    const before = JSON.stringify(state.rng);
    for (let seq = 0; seq < 10; seq++) renderTemplate(ctx, '<Morning>.', scope, seq, 'text');
    expect(JSON.stringify(state.rng)).toBe(before);
  });

  it('a wording with "when" fits only when the conditions are met', () => {
    const { ctx, state, scope } = setup();
    const lines = (season: string) => {
      while (seasonAt(ctx.content, state.day).id !== season) state.day += 1;
      return new Set(Array.from({ length: 40 }, (_, seq) => text(renderTemplate(ctx, '<weather>', scope, seq, 'text'))));
    };
    expect([...lines('winter')].sort()).toEqual(['in a cold rain', 'in driving snow']);
    expect([...lines('summer')]).toEqual(['in a cold rain']);
  });

  it('own grammar of the event replaces the general symbol', () => {
    const { ctx, scope } = setup();
    expect(text(renderTemplate(ctx, '<dawn>', scope, 0, 'text', { dawn: ['at midnight'] }))).toBe('at midnight');
    expect(text(renderTemplate(ctx, '<dusk> <weather>', scope, 0, 'text', { dusk: ['at dusk'] }))).toMatch(/^at dusk in /);
  });

  it('an undefined symbol and a runaway cycle are errors', () => {
    const { ctx, scope } = setup();
    expect(() => renderTemplate(ctx, '<nowhere>', scope, 0, 'text')).toThrow(/Undefined grammar symbol <nowhere>/);
    expect(() => renderTemplate(ctx, '<a>', scope, 0, 'text', { a: ['<b>'], b: ['<a>'] })).toThrow(/too deep/);
  });

  it('a change of the wording changes only the line, not the history', () => {
    const files = (dawn: string) => [
      ...BASE_FILES,
      { path: 'content/extra.yaml', text: `grammar:\n  dawn: ["${dawn}"]\nevents:\n  - id: shots\n    weight: 5\n    text: "Shots."\n    options:\n      - text: Duck\n        result: "<Dawn>, {name} ducked."\n` },
    ];
    const run = (dawn: string) => {
      const base = loadOrThrow(files(dawn));
      const content = { ...base, narrator: fixtureNarrator({ eventChancePer10k: 3000, minDaysBetweenEvents: 20 }).narrator };
      return runSim(content, { seed: 5, years: 20 });
    };
    const a = run('at first light');
    const b = run('in the grey before dawn at some length');
    expect(a.violations).toEqual([]);
    expect(JSON.stringify(a.state.rng)).toBe(JSON.stringify(b.state.rng));
    const other = (s: typeof a.state) => s.chronicle.filter((e) => !(e.kind === 'event' && /ducked/.test(partsText(e.parts)))).map((e) => `${e.day} ${e.kind} ${partsText(e.parts)}`);
    expect(other(a.state)).toEqual(other(b.state));
    const ducks = (s: typeof a.state) => s.chronicle.filter((e) => /ducked/.test(partsText(e.parts)));
    expect(ducks(a.state).length).toBeGreaterThan(0);
    expect(ducks(a.state).length).toBe(ducks(b.state).length);
    expect(partsText(ducks(a.state)[0]?.parts ?? [])).toMatch(/^At first light, .* ducked\.$/);
  }, 30_000);
});

describe('checkEventTemplate', () => {
  const env = { roles: ['friend', 'second'], optional: ['second'], symbols: ['dawn'] };

  it('knows the roles of the event', () => {
    expect(checkEventTemplate('{name} met {friend} and {friend.his} {protagonist.he} {hero}.', env)).toBeNull();
    expect(checkEventTemplate('{nobody}', env)).toMatch(/unknown placeholder \{nobody\}/);
    expect(checkEventTemplate('{friend.wife}', env)).toMatch(/unknown field/);
    expect(checkEventTemplate('{friend.name}', env)).toMatch(/unknown field/);
    expect(checkEventTemplate('{friend', env)).toMatch(/unbalanced/);
    expect(checkEventTemplate('friend}', env)).toMatch(/unbalanced/);
  });

  it('checks symbols and angle brackets', () => {
    expect(checkEventTemplate('<Dawn> and <dawn>.', env)).toBeNull();
    expect(checkEventTemplate('<dusk>', env)).toMatch(/undefined grammar symbol <dusk>/);
    expect(checkEventTemplate('<dusk>', { roles: [] })).toBeNull();
    expect(checkEventTemplate('<dawn', env)).toMatch(/unbalanced/);
    expect(checkEventTemplate('dawn> x', env)).toMatch(/unbalanced/);
  });

  it('checks {role?…} and roles that may stay empty', () => {
    expect(checkEventTemplate('{name} left{second?, with {second} and {second.his} dog <dawn>}.', env)).toBeNull();
    expect(checkEventTemplate('{second}', env)).toMatch(/role "second" may be empty/);
    expect(checkEventTemplate('{second?{ghost}}', env)).toMatch(/unknown placeholder \{ghost\}/);
    expect(checkEventTemplate('{ghost?x}', env)).toMatch(/unknown role "ghost"/);
    expect(checkEventTemplate('{second?, with {second}', env)).toMatch(/unbalanced/);
  });
});

describe('grammarProblems', () => {
  const messages = (own: GrammarDef, all: GrammarDef = own, roles: string[] = ['second'], optional: string[] = ['second']) =>
    grammarProblems(own, all, roles, optional).map((p) => `${p.path}: ${p.message}`);

  it('keeps an optional role inside {role?…} in a wording', () => {
    expect(messages({ meet: ['you meet {second}'] })).toEqual([expect.stringMatching(/^meet\[0\]: role "second" may be empty/)]);
    expect(messages({ meet: ['you meet{second?, {second}}'] })).toEqual([]);
  });

  it('finds an own wording that closes a cycle through the general grammar', () => {
    const general: GrammarDef = { dawn: ['at first light <weather>'], weather: ['in rain'] };
    const own: GrammarDef = { weather: ['<dawn>'] };
    expect(messages(own, { ...general, ...own })).toEqual([expect.stringMatching(/cycle in the grammar: <weather> -> <dawn> -> <weather>/)]);
  });

  it('knows the roles of the event and the fallback wording', () => {
    expect(messages({ a: ['{friend} came'] }, { a: ['{friend} came'] }, [], [])).toEqual([expect.stringMatching(/unknown placeholder \{friend\}/)]);
    expect(messages({ a: [{ text: 'x', when: { season: ['winter'] } }] })).toEqual([expect.stringMatching(/without "when"/)]);
  });
});

describe('ownLine', () => {
  const aubrey = { id: 'c1', name: 'Aubrey Vale' };
  const rowan = { id: 'c2', name: 'Rowan Hale' };

  it('cuts the name and "was" and makes the first letter a capital', () => {
    expect(ownLine([aubrey, ' was badly wounded in an ambush.'], 'c1')).toEqual(['Badly wounded in an ambush.']);
    expect(ownLine([aubrey, ' bought a horse from ', rowan, '.'], 'c1')).toEqual(['Bought a horse from ', rowan, '.']);
    expect(ownLine([aubrey, ' was ', rowan, "'s guest."], 'c1')).toEqual([rowan, "'s guest."]);
  });

  it('leaves other lines as they are', () => {
    for (const parts of [
      [aubrey, "'s horse died."],
      [aubrey, ', aged 30, took a wife.'],
      [aubrey, ' was badly wounded.'],
      [rowan, ' bought a horse.'],
      ['Years passed.'],
      [aubrey],
    ] as TextPart[][]) {
      const subject = parts[0] === aubrey && parts.length > 1 && parts[1] === ' was badly wounded.' ? 'c2' : 'c1';
      expect(ownLine(parts, subject)).toEqual(parts);
    }
    const input: TextPart[] = [aubrey, ' bought it.'];
    ownLine(input, 'c1');
    expect(input).toEqual([aubrey, ' bought it.']);
  });
});

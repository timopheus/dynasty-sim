import { describe, expect, it } from 'vitest';
import type { Effects } from '../src/core/effects';
import { heroEffectProblems, withoutHeroEffects } from '../src/core/events/hero-effects';

describe('effects that change the hero (D-174)', () => {
  it('counts a marriage to the hero, in later too', () => {
    expect(heroEffectProblems({ marry: 'hero' } as Effects)).toEqual(['marry: hero']);
    expect(heroEffectProblems({ later: [{ after_days: 3, effects: { marry: 'hero' } }] } as Effects)).toEqual(['marry: hero']);
    expect(heroEffectProblems({ marry: 'bride' } as Effects)).toEqual([]);
  });

  it('drops a marriage to the hero for a person of the world and keeps one to another role', () => {
    expect(withoutHeroEffects({ marry: 'hero', money: 5 } as Effects)).toEqual({ money: 5 });
    expect(withoutHeroEffects({ marry: 'bride' } as Effects)).toEqual({ marry: 'bride' });
  });
});

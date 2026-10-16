import { describe, expect, it } from 'vitest';
import { checkRoles, RolesSchema } from '../src/core/roles/content';

describe('references to roles in `where` and `prefer`', () => {
  const env = { file: 'f', path: 'roles', sources: {} as never };

  it('see hero, protagonist and the roles above, not those below or themselves', () => {
    const roles = RolesSchema.parse({
      first: { pick: 'circle', where: { opinion: { toward: 'hero', min: 1 }, relation: { kind: 'friend', with: 'protagonist' } } },
      second: { pick: 'circle', where: { relation_none: { kind: 'rival', with: 'first' } }, prefer: [{ when: { opinion: { toward: 'second', max: 0 } }, factor: 2 }] },
      third: { pick: 'circle', where: { opinion: { toward: 'fourth', min: 1 } } },
      fourth: { pick: 'circle' },
    });
    const errors = checkRoles(roles, env).filter((e) => e.message.startsWith('unknown role'));
    expect(errors.map((e) => `${e.path}: ${e.message.slice(0, 21)}`)).toEqual([
      'roles.second.prefer[0].when: unknown role "second"',
      'roles.third.where: unknown role "fourth"',
    ]);
  });
});

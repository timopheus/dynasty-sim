import { describe, expect, it, vi } from 'vitest';

// Keys that name a role (`opinion: toward`) arrive in 3.6; until then the registry is stood in for here.
vi.mock('../src/core/condition-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/core/condition-keys')>()),
  conditionRoleRefs: (when: { occupation?: string[] }) => (when.occupation ?? []).filter((id) => id.startsWith('role_')).map((id) => id.slice(5)),
}));

const { checkRoles, RolesSchema } = await import('../src/core/roles/content');

describe('references to roles in `where` and `prefer`', () => {
  const env = { file: 'f', path: 'roles', sources: { population: [{ item: { occupations: [{ id: 'role_a' }, { id: 'role_b' }, { id: 'role_hero' }] } }] } as never };

  it('see hero, protagonist and the roles above, not those below or themselves', () => {
    const roles = RolesSchema.parse({
      first: { pick: 'circle', where: { occupation: ['role_hero', 'role_protagonist'] } },
      second: { pick: 'circle', where: { occupation: ['role_first'] }, prefer: [{ when: { occupation: ['role_second'] }, factor: 2 }] },
      third: { pick: 'circle', where: { occupation: ['role_fourth'] } },
      fourth: { pick: 'circle' },
    });
    const errors = checkRoles(roles, env).filter((e) => e.message.startsWith('unknown role'));
    expect(errors.map((e) => `${e.path}: ${e.message.slice(0, 21)}`)).toEqual([
      'roles.second.prefer[0].when: unknown role "second"',
      'roles.third.where: unknown role "fourth"',
    ]);
  });
});

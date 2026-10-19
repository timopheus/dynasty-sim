---
paths:
  - "content/**"
  - "src/core/events/**"
  - "src/core/roles/**"
  - "src/core/text/**"
  - "src/core/narrator/**"
  - "src/core/stories/**"
  - "src/core/backstory/**"
  - "src/core/conditions/**"
  - "src/core/content/**"
  - "src/core/*/content.ts"
  - "src/core/*/effects.ts"
  - "src/core/*/conditions.ts"
  - "src/core/effects.ts"
  - "src/core/condition-keys.ts"
  - "docs/event-format.md"
  - "tests/fixtures/**"
---

# Контент и события

## Контент (content/)
- Любой `*.yaml` в `content/` — объект с верхними ключами модулей (`SINGLE_KEYS`, `OPTIONAL_KEYS`, `LIST_KEYS` в `content/schema.ts`). Одиночные `settings`, `names`, `health` — ровно по одному разу; `time` и `narrator` тоже обязательны (их требуют `checkTime`, `checkNarrator`). Необязательные `population`, `opinions`, `chronicle`, `grammar`, `backstory`, `family`, `succession`, `house`, `heirlooms`, `eras` — не больше одного раза. Списки `actions`, `events`, `traits` складываются. Файлы сливаются в алфавитном порядке пути.
- Схема ключа лежит в модуле (`actions/content.ts` и т. п.). Новое поле: схема модуля → перекрёстная проверка модуля → плохой пример в `tests/fixtures/bad/`. Первая строка плохого примера — ожидаемая ошибка: `# expect-error: <путь> /<регулярка>/`.
- id в `lower_snake_case`. Тексты на английском, плейсхолдеры `{name}`, `{age}` и местоимения `{he} {him} {his} {He} {His}` (список — `character/text.ts`). Тексты читаются для обоих полов.
- Видимая в жизни черта или болезнь задаёт признак лица `face` (D-429).
- Тексты пишутся по стайлгайду и золотому набору (когда они есть, см. STATUS); у каждой новой механики — что решает игрок, чего стоит, что меняется (D-286).
- После правки контента: `npm run validate` и прогон.

## Роли и область ролей (D-162, D-171, D-172)
- Формат события — контракт `docs/event-format.md`; меняет его только ведущая сессия. Не подходит — опиши в PR.
- Область ролей `Scope` — роль → id человека. Встроенные роли: `hero` (текущий герой) и `protagonist` (главный участник; в событии героя — герой). Человек — не больше одной роли; роли — из окружения героя (D-056), `pick: kin` и `pick: given` — также из дома героя; героя в роль `given` передаёт только команда `propose` (D-356).
- Условия, эффекты и тексты видят людей только через область: `(ctx, c, when, scope) → Unmet[]` (`{text, hidden}`; скрытая причина — то, чего герой знать не может, D-043), `applyEffects(ctx, c, effects, scope)`, `renderTemplate(ctx, template, scope, seq, slot)`. Доступность — по `conditionReport(...).met`.
- Ключ условия или эффекта, называющий другого человека, называет роль и отдаёт её имя в `conditionRoleRefs` / `effectRoleRefs`.
- `{name}`, `{he}`… — подлежащее строки (в событии — главный участник); роль — `{role}`, `{role.he}`, `{role.age}`. `result` начинается с `{name}`.
- `later` хранит область. Смерть от эффекта — только запросом в `state.deathRequests` (D-164).

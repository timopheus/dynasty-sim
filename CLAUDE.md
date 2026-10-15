# CLAUDE.md

Инструкции по репозиторию dynasty-sim. Правила работы (треды, PR, мерж, роли моделей, координация сессий) — в `.claude/rules/workflow.md`, он загружается автоматически. Дизайн — `docs/GDD.md`, задачи — `docs/ROADMAP.md`, решения — `docs/DECISIONS.md`, текущее состояние — `docs/STATUS.md`, история — `docs/CHANGELOG.md`.

## Стек
- TypeScript (strict), Node 22 (`.nvmrc`). Версии зависимостей закреплены точно, обновление — отдельной задачей.
- Vite 8 — браузерная игра. Vitest 5 — тесты. tsx — запуск `tools/`. zod 4 — схема контента. yaml — парсер (YAML 1.2).
- TypeScript 7 нужен только для `tsc --noEmit`; запасной вариант — 6.0 (D-001).
- Интерфейс без фреймворка, обычный DOM.

## Структура
```
src/core/          симуляция: без DOM, без Node API, без интерфейса
  rng.ts           seed-генератор (sfc32); состояние лежит в GameState
  calendar.ts      номер дня от 1 января 1700 <-> григорианская дата
  character.ts     персонаж, эффекты, смертность, шаблоны {name}/{age}
  content/         схема контента (zod) и загрузчик YAML-текстов
  game.ts          GameState, apply(команда), инварианты, сохранения
  bot.ts           случайный бот для прогонов
  sim.ts           runSim: прогон без интерфейса
  chronicle.ts     хроника в markdown
src/ui/            браузерный интерфейс (main.ts, style.css)
content/           игровой контент в YAML, тексты на английском
tools/             validate.ts, sim.ts, content-files.ts (чтение content/ с диска)
tests/             vitest; fixtures/ — тестовый контент и плохие примеры
docs/              GDD, ROADMAP, DECISIONS, STATUS, CHANGELOG (по-русски)
.claude/           rules/ (правила работы), agents/, skills/
```

## Команды
```
npm ci                                  # первым делом в новой сессии
npm run dev                             # игра в браузере; ?seed=N фиксирует seed
npm run typecheck                       # tsc для core, ui и tools+tests
npm test                                # vitest
npm run validate                        # проверка контента по схеме
npm run sim -- --years 300 --seed 42    # прогон; хроника в out/chronicle-seed42-300y.md
npm run check                           # typecheck + test + validate + sim 50 лет
npm run build                           # сборка в dist/
```
CI (`.github/workflows/ci.yml`) на каждый PR и push в main: typecheck, test, validate, sim 50 лет (seed 1), build. Хроника прогона — артефакт `chronicle`.

## Правила ядра (src/core)
- Ядро импортирует только свои модули, `yaml` и `zod`. Запрещены DOM, Node API, `Math.random`, `Date`, `performance`. Это проверяют `tests/architecture.test.ts` и отдельный `src/core/tsconfig.json` без DOM и Node.
- Вся случайность — через `src/core/rng.ts` и `state.rng`. Отдельный поток (например, для бота) — `seedRng(seed, stream)`, мировой поток не трогать.
- В состоянии и вероятностях только целые числа (`chancePer(r, n, d)`). Никаких `Math.exp/pow/log/sin…` в расчётах: результат может отличаться между движками.
- GameState — только JSON-данные: без классов, Map/Set и `undefined` (вместо него `null`). Сохранение — `JSON.stringify`.
- Обходить массивы контента, а не ключи объектов.
- Состояние меняет только `apply(state, content, command)`. Функции-запросы (`availableActions`, `pendingEventDef`) случайность не тратят.
- Новое правило согласованности добавлять в `checkInvariants`: им пользуются прогон и тесты.

## Контент (content/)
- Любой `*.yaml` в `content/` — объект с ключами `settings`, `names`, `actions`, `events`. Файлы сливаются в алфавитном порядке пути; `settings` и `names` — ровно по одному разу.
- Схема — `src/core/content/schema.ts`. Новое поле: схема → перекрёстные проверки в `load.ts` → плохой пример в `tests/fixtures/bad/` и строка в `tests/content.test.ts`.
- id в `lower_snake_case`. Тексты на английском, плейсхолдеры только `{name}` и `{age}`. Без местоимений: пола у персонажей пока нет.
- После правки контента: `npm run validate` и прогон.

## Тесты
- Точные числа проверяются на `tests/fixtures/content.ts` (`fixtureContent({...})`), а не на реальном контенте: он будет меняться.
- Детерминизм проверяется сравнением хроник двух прогонов. «Золотых» снимков хроники нет.

## Критерии готовности задачи
1. `npm run typecheck`, `npm test`, `npm run validate` зелёные.
2. `npm run sim -- --years 300 --seed <N>` без исключений и нарушений инвариантов.
3. Обновлены `docs/CHANGELOG.md` и `docs/STATUS.md`, статус задачи в `docs/ROADMAP.md`; новые решения записаны в `docs/DECISIONS.md`.
4. В диффе нет изменений вне задачи.
5. reviewer одобрил, CI зелёный. Порядок действий — скилл `/finish-task`.

## PR и коммиты
- Заголовок PR: `[ID] Название по-русски`, например `[2.3] Персонаж: черты и здоровье`. Описание по-русски: что сделано, как проверить, что осталось.
- Коммиты на английском, по одному осмысленному шагу, с push после каждого.
- Мерж в main только squash, без force-push.

## Скиллы и агенты
- `/finish-task [ID]` — проверки, доки, PR, reviewer, CI, мерж.
- `/run-sim [лет] [seed]` — прогон и сводка хроники по-русски (выполняет агент scout).
- Агенты в `.claude/agents/`: architect, implementer, content-writer, scout, reviewer.

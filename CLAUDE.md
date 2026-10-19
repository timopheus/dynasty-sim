# CLAUDE.md

Репозиторий dynasty-sim. Правила работы и модель разработки — `.claude/rules/workflow.md` (грузится всегда). Правила контента и событий — `.claude/rules/content.md`, тестов — `.claude/rules/tests.md` (грузятся, когда работаешь с этими файлами).

Доки: видение и целевые истории — `docs/VISION.md`; действующие решения — `docs/decisions-active.md`; состояние — `docs/STATUS.md`; задачи — `docs/ROADMAP.md`; дизайн — `docs/GDD.md`; формат события — `docs/event-format.md`; плейтесты — `docs/playtests/`; идеи — `docs/IDEAS.md`; история — `docs/CHANGELOG.md`; архив решений — `docs/DECISIONS.md` (искать по номеру).

## Стек
- TypeScript (strict), Node 22. Версии зависимостей закреплены точно.
- Vite 8 — браузерная игра. Vitest 5 — тесты. tsx — `tools/`. zod 4 — схема контента. yaml (YAML 1.2).
- Интерфейс без фреймворка, обычный DOM.

## Где что
- `src/core/` — симуляция без DOM и Node. Модули-папки: у каждого своя часть состояния, контент, хуки, фазы, инварианты: `character`, `health`, `time`, `actions`, `conditions`, `events`, `narrator`, `roles`, `stories`, `backstory`, `world`, `relations`, `chronicle`, `archive`, `entities`, `family`, `succession`, `house`, `heirloom`, `era`, `looks`, `summary`, `save`, `metrics`, `pages`, `text`, `bots`.
- Сборочные файлы `src/core/`: `game.ts`, `state.ts`, `hooks.ts`, `lifecycle.ts`, `refs.ts`, `invariants.ts`, `effects.ts`, `condition-keys.ts`, `modifiers.ts`, `helpers.ts`, `content/schema.ts`, `content/load.ts`, `content/types.ts`.
- `src/ui/` — браузерный интерфейс. `content/` — YAML, тексты на английском. `tools/` — валидатор, прогон, ворота, replay. `tests/` — vitest и фикстуры. `map/` — исходники карты.

## Команды
```
npm ci                                   # первым делом в новой сессии
npm run dev                              # игра в браузере
npm run check                            # typecheck + test + validate + sim 50 лет
npm run typecheck | npm test | npm run validate   # по отдельности
npm run sim -- --years 300 --seed 42     # прогон: хроника, журнал, итог рода в out/
npm run -s sim -- --years 300 --seed 1 --runs 10 [--bot cautious] [--json] > a.json   # -s: без заголовка npm в файле
npm run -s sim -- --compare a.json b.json
npm run gates                            # 300 лет × seeds 1…10, коридоры метрик; -- --from a.json проверяет готовый файл
npx tsx tools/bot-report.ts --runs 10    # отчёт по ботам
npm run replay -- journal.json           # партия из журнала команд; --record out/j.json --seed 1 --years 50 — записать бота
npm run save-bench                       # размер и время записи сохранения
npm run build                            # сборка в dist/ (для артефакта: npx vite build --base ./)
```
CI на каждый PR и push в main: typecheck, test, validate, sim 50 лет, build; работа `gates` — 300 лет × 10 seeds, валят инварианты, горячая часть > 300 КБ и строки хроники на жизнь главы вне 25–50; работа `bots` — отчёт, не валит. Коридор или признак «валит / отчёт» меняется только новым решением в decisions-active (D-203).

## Правила ядра (src/core)
- Ядро импортирует только свои модули, `yaml` и `zod`. Запрещены DOM, Node API, `Math.random`, `Date`, `performance` (проверяет `tests/architecture.test.ts`).
- Случайность — только через `src/core/rng.ts` и `state.rng`; отдельный поток — `seedRng(seed, stream)`, мировой не трогать.
- В состоянии и вероятностях только целые числа (`chancePer`). Никаких `Math.exp/pow/log/sin…` в расчётах.
- GameState — только JSON: без классов, Map/Set и `undefined` (вместо него `null`). Формат меняется — подними `SAVE_VERSION` (`save/version.ts`).
- Обходить массивы контента, а не ключи объектов (исключение — роли события и символы грамматики, D-161).
- Состояние меняет только `apply(state, content, command)`. Запросы случайность не тратят.
- Новое правило согласованности — инвариант своего модуля.
- Хроника — только через `log(ctx, {subject, kind, level, template | parts, money?, mark?, important?})` из `chronicle/log.ts`; отбор при записи, строку о человеке вне героя, дома и окружения `log` не хранит (D-057, D-064, D-130).
- id сущностей — `newId(state, prefix)`; сущности не удаляются.
- Правила симуляции не читают архив (D-312): только горячая часть. История — `allChronicle`/`allCharacters`/`anyCharacter` из `archive/archive.ts`, только для страниц, markdown, метрик, итога и сохранения. Давние данные правилу держит горячими `HOT_REFS` своего модуля (`refs.ts`). Модуль, данные которого ссылаются на людей, отдаёт их своей функцией `RefsFn` в `HOT_REFS`, иначе архив заберёт человека, на которого ссылаются.

## Владение файлами (D-052, D-060)
- Задача правит только свой модуль, свой контент и свои тесты — по колонке «Модуль» в ROADMAP.
- Сборочные файлы в задачах не правятся; их правит ведущая сессия отдельным PR. Не хватает точки подключения — остановись и опиши в PR.
- Модули импортируют из `state.ts` только типы. Файл, который отдаёт сборочному файлу схемы, хуки или часть состояния, не импортирует этот сборочный файл (циклы ловит тест архитектуры). Поэтому эффекты модуля — в `<модуль>/effects.ts`, а код, который зовёт `createCharacter`/`kill`/`applyEffects`/`startEvent`, — в `<модуль>/phases.ts`. `createCharacter` — из `hooks.ts`. Хуки смены главы (`SUCCESSION_HOOKS`) и `succession/phases.ts` не импортируют `lifecycle.ts`; хук брака (`MARRIAGE_HOOKS`) — в файле без импорта `lifecycle.ts`, `events/` и `effects.ts` (D-320).

## PR и коммиты
- Заголовок PR: `[ID] Название по-русски`. Описание по-русски: что сделано, как проверить (для интерфейса — скриншоты и «три шага руками»), решения, что осталось.
- Коммиты на английском, по одному осмысленному шагу, с push после каждого. Мерж в main только squash.

## Скиллы и агенты
- `/finish-task [ID]` — проверки, доки, PR, ревью, CI, мерж. `/run-sim [лет] [seed]` — прогон и сводка хроники по-русски.
- Агенты `.claude/agents/`: architect, content-writer, scout, reviewer (implementer не используется: код пишет сама сессия, D-430).

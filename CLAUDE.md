# CLAUDE.md

Инструкции по репозиторию dynasty-sim. Правила работы (треды, PR, мерж, роли моделей, координация сессий) — в `.claude/rules/workflow.md`, он загружается автоматически. Дизайн — `docs/GDD.md`, задачи — `docs/ROADMAP.md`, решения — `docs/DECISIONS.md`, текущее состояние — `docs/STATUS.md`, история — `docs/CHANGELOG.md`, идеи — `docs/IDEAS.md`.

## Стек
- TypeScript (strict), Node 22 (`.nvmrc`). Версии зависимостей закреплены точно, обновление — отдельной задачей.
- Vite 8 — браузерная игра. Vitest 5 — тесты. tsx — запуск `tools/`. zod 4 — схема контента. yaml — парсер (YAML 1.2).
- TypeScript 7 нужен только для `tsc --noEmit`; запасной вариант — 6.0 (D-001).
- Интерфейс без фреймворка, обычный DOM.

## Структура
```
src/core/          симуляция: без DOM, без Node API, без интерфейса
  rng.ts           seed-генератор (sfc32); состояние лежит в GameState
  helpers.ts       isInt, newId, getPlayer, findCharacter — для всех модулей
  bot.ts, sim.ts   случайный бот и прогон без интерфейса
  сборочные файлы (D-052, D-060): собирают части модулей, правятся только между волнами
  game.ts          newGame, apply(команда), фазы дня DAY_PHASES (D-053)
  state.ts         GameState и Character из частей модулей, типы хуков
  lifecycle.ts     createCharacter (хуки создания), kill (причина, хуки смерти), временный наследник
  invariants.ts    checkInvariants: инварианты модулей
  effects.ts       ключи эффектов модулей, applyEffects
  condition-keys.ts  ключи условий модулей (when, D-054)
  modifiers.ts     поправки к характеристикам от модулей
  content/         schema.ts (верхние ключи, перекрёстные проверки), load.ts, types.ts
  модули-папки: у каждого своя часть состояния, контент, хуки, фазы, инварианты
  character/       пол, имя, рождение, деньги, характеристики (stats.ts), черты (holding.ts, traits.ts), генерация (generate.ts), местоимения (2.3)
  health/          состояния и стадии (course.ts), смертность и annualDeathChance (mortality.ts), фазы здоровья и смерти (phases.ts) (2.9)
  time/            calendar.ts, фазы нового дня и назначенного (2.2)
  actions/         действия: начало, конец, прерывание (2.2)
  conditions/      общие ключи условий (2.2)
  events/          события: бросок, выбор варианта (схема варианта — 2.2)
  world/           detailedCharacters, фаза мира (2.5)
  relations/       мнения и отношения (2.4)
  chronicle/       log() — единственная запись в хронику, markdown (2.6)
  save/            serialize/deserialize, версия формата (2.8)
  metrics/         computeMetrics(state) — метрики прогона (2.7), сводка и сравнение
  pages/           personPage — страница человека с учётом видимости (2.10)
  text/            шаблоны: части текста и ссылки
src/ui/            браузерный интерфейс: main.ts, hero.ts (экран героя), page.ts (страницы людей), address.ts (адреса #/person/<id>), storage.ts (автосохранение в localStorage), style.css
content/           игровой контент в YAML, тексты на английском
map/               исходники карты из Azgaar (region.map/json/svg, D-025); как править — docs/map-guide.md
tools/             validate.ts, sim.ts, content-files.ts (чтение content/ с диска)
tests/             vitest; fixtures/ — тестовый контент и плохие примеры
docs/              GDD, ROADMAP, DECISIONS, STATUS, CHANGELOG (по-русски)
.claude/           rules/ (правила работы), agents/, skills/
```

## Команды
```
npm ci                                  # первым делом в новой сессии
npm run dev                             # игра в браузере; продолжает автосохранение; ?seed=N с другим seed — новая партия после подтверждения (D-140)
npm run typecheck                       # tsc для core, ui и tools+tests
npm test                                # vitest
npm run validate                        # проверка контента по схеме
npm run sim -- --years 300 --seed 42    # прогон; хроника в out/chronicle-seed42-300y.md, журнал в out/journal-seed42-300y.md, метрики в конце
npm run sim -- --years 300 --seed 1 --runs 10          # seeds 1..10, метрики: min / медиана / max
npm run -s sim -- --years 300 --seed 1 --runs 10 --json > a.json   # то же в JSON; -s нужен, иначе npm пишет заголовок в файл
npm run -s sim -- --compare a.json b.json # медианы двух файлов рядом, только изменившиеся
npm run check                           # typecheck + test + validate + sim 50 лет
npm run build                           # сборка в dist/
```
CI (`.github/workflows/ci.yml`) на каждый PR и push в main: typecheck, test, validate, sim 50 лет (seed 1), build. Хроника прогона — артефакт `chronicle`.

## Правила ядра (src/core)
- Ядро импортирует только свои модули, `yaml` и `zod`. Запрещены DOM, Node API, `Math.random`, `Date`, `performance`. Это проверяют `tests/architecture.test.ts` и отдельный `src/core/tsconfig.json` без DOM и Node.
- Вся случайность — через `src/core/rng.ts` и `state.rng`. Отдельный поток (например, для бота) — `seedRng(seed, stream)`, мировой поток не трогать.
- В состоянии и вероятностях только целые числа (`chancePer(r, n, d)`). Никаких `Math.exp/pow/log/sin…` в расчётах: результат может отличаться между движками.
- GameState — только JSON-данные: без классов, Map/Set и `undefined` (вместо него `null`). Сохранение — `serialize` из `save/` (`JSON.stringify` с проверкой, что состояние — чистый JSON).
- Обходить массивы контента, а не ключи объектов.
- Состояние меняет только `apply(state, content, command)`. Функции-запросы (`availableActions`, `pendingEventDef`) случайность не тратят.
- Новое правило согласованности — в инварианты своего модуля (они собраны в `invariants.ts`): ими пользуются прогон и тесты.
- Хроника пишется только через `log(ctx, {subject, kind, level, template, money?, mark?})` из `chronicle/log.ts` (D-057, D-064, D-130). Отбор — при записи, итоговый уровень в `entry.level`. Запись хранит части текста: строки и ссылки `{id, name}`; `money` — изменение денег субъекта для отбора, `mark` — выбор игрока со значком ▸.
- id сущностей — `newId(state, prefix)`; сущности не удаляются.

## Владение файлами (D-052, D-060)
- Задача правит только свой модуль-папку, свой контент и свои тесты — по колонке «Модуль» в ROADMAP.
- Сборочные файлы (`game.ts`, `state.ts`, `lifecycle.ts`, `invariants.ts`, `effects.ts`, `condition-keys.ts`, `modifiers.ts`, `helpers.ts`, `content/schema.ts`, `content/load.ts`, `content/types.ts`) в волнах не правятся. Модуль подключается через уже заведённые в них точки: заполняет свою пустую часть состояния, хук, фазу, ключи эффектов и условий, инварианты, перекрёстную проверку.
- Не хватает точки подключения — остановись и опиши проблему в своём PR. Сборочные файлы правит ведущая сессия этапа с architect отдельным PR `[2.1a] …`.
- Модули импортируют из `state.ts` только типы (`import type`); иначе — цикл импортов. Это проверяет `tests/architecture.test.ts`.
- Файл, который отдаёт сборочному файлу схемы, хуки или начальную часть состояния, не импортирует этот сборочный файл ни прямо, ни через другие файлы: получится цикл импортов. Поэтому эффекты модуля — в отдельном `<модуль>/effects.ts` (не импортирует `effects.ts`), а код, который зовёт `createCharacter`/`kill` или `applyEffects`, — в отдельном файле модуля, как `health/phases.ts`. Циклы ловит тест архитектуры.
- У модулей следующих задач уже заведены пустые точки: часть состояния и персонажа, хуки создания и смерти, фаза, ключи эффектов и условий, верхний ключ контента со схемой и перекрёстной проверкой, инварианты. Задача заполняет их в своей папке.

## Контент (content/)
- Любой `*.yaml` в `content/` — объект с верхними ключами модулей (`SINGLE_KEYS`, `OPTIONAL_KEYS`, `LIST_KEYS` в `content/schema.ts`): одиночные `settings`, `names`, `health` — ровно по одному разу; необязательные `time`, `population`, `opinions`, `chronicle` — не больше одного раза; списки `actions`, `events`, `traits` складываются. Файлы сливаются в алфавитном порядке пути.
- Схема ключа лежит в модуле (`actions/content.ts` и т. п.). Новое поле: схема модуля → перекрёстная проверка модуля → плохой пример в `tests/fixtures/bad/`. Первая строка плохого примера — ожидаемая ошибка: `# expect-error: <путь> /<регулярка>/`; тест находит файлы сам.
- id в `lower_snake_case`. Тексты на английском, плейсхолдеры `{name}`, `{age}` и местоимения того же персонажа `{he} {him} {his} {He} {His}` (список — `character/text.ts`, D-055). Пол задан у каждого персонажа: тексты читаются для обоих полов.
- После правки контента: `npm run validate` и прогон.

## Тесты
- Точные числа проверяются на базовой фикстуре `tests/fixtures/base/*.yaml` (файл на модуль, `fixtureContent({...})` из `tests/fixtures/content.ts`), а не на реальном контенте: он будет меняться.
- У модуля свой файл тестов `tests/<модуль>.test.ts`. Тест-страж в `tests/save.test.ts`: сохранение и загрузка после каждой команды 20-летнего прогона дают то же состояние.
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

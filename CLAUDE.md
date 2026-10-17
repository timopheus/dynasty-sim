# CLAUDE.md

Инструкции по репозиторию dynasty-sim. Правила работы (треды, PR, мерж, роли моделей, координация сессий) — в `.claude/rules/workflow.md`, он загружается автоматически. Дизайн — `docs/GDD.md`, формат события (контракт этапа 3) — `docs/event-format.md`, задачи — `docs/ROADMAP.md`, решения — `docs/DECISIONS.md`, текущее состояние — `docs/STATUS.md`, история — `docs/CHANGELOG.md`, идеи — `docs/IDEAS.md`.

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
  bot.ts, sim.ts   бот (random и характеры cautious, greedy, duelist) и прогон без интерфейса
  bots/            характеры ботов (D-345): оценка вариантов по признакам контента (features.ts, characters.ts), отчёт (report.ts)
  сборочные файлы (D-052, D-060): собирают части модулей, правятся только между волнами
  game.ts          newGame и хуки новой партии, apply(команда: start, choose, end, will, propose) и хуки после выбора, фазы дня DAY_PHASES (D-053, D-173, D-187)
  state.ts         GameState и Character из частей модулей, Scope (область ролей), статус (`ended` — род пресёкся), типы хуков
  hooks.ts         createCharacter (хуки создания), хуки брака MARRIAGE_HOOKS — их зовут сами модули (D-320)
  lifecycle.ts     kill (причина, хуки смерти), смена главы: chooseHeir → succeed / endHouse, хуки смены главы SUCCESSION_HOOKS; createCharacter — реэкспорт из hooks.ts
  refs.ts          HOT_REFS: id людей, на которых ссылаются горячие данные модулей; их архив не забирает (D-312)
  invariants.ts    checkInvariants: инварианты модулей
  effects.ts       ключи эффектов модулей, applyEffects(… scope), effectRoleRefs
  condition-keys.ts  ключи условий модулей (when, D-054), conditionReport со скрытыми причинами, conditionRoleRefs
  modifiers.ts     поправки к характеристикам от модулей
  content/         schema.ts (верхние ключи, перекрёстные проверки), load.ts, types.ts
  модули-папки: у каждого своя часть состояния, контент, хуки, фазы, инварианты
  character/       пол, имя, рождение, деньги, характеристики (stats.ts), черты (holding.ts, traits.ts), генерация (generate.ts), местоимения (2.3)
  health/          состояния и стадии (course.ts), смертность и annualDeathChance (mortality.ts), фазы здоровья и смерти (phases.ts), запросы смерти deathRequests (2.9, D-164)
  time/            calendar.ts, фазы нового дня и назначенного (2.2)
  actions/         действия: начало, конец, прерывание (2.2)
  conditions/      общие ключи условий (2.2)
  events/          события: схема и проверки контента (content.ts), eventWeight, fireEvent/startEvent, страницы и извещения (events.ts), проверки D-042 (checks.ts), eventView для интерфейса и бота (view.ts), события людей мира (npc.ts, hero-effects.ts, 3.9) (2.2, 3.2)
  narrator/        рассказчик: темп (ключ narrator:), бросок колоды (phases.ts) (3.7)
  roles/           роли события: RoleSchema, checkRoles (content.ts), fillRoles, canFillRoles, anyCandidate (roles.ts) (3.3)
  stories/         продолжения и истории со сроком; фаза историй (phases.ts) (3.8)
  backstory/       предыстория первого героя; хук новой партии (phases.ts) (3.11)
  world/           detailedCharacters (герой, дом героя household, окружение), isNear, фаза мира (2.5, D-313)
  relations/       мнения и отношения (2.4)
  chronicle/       log() — единственная запись в хронику, markdown (2.6)
  archive/         архив (D-312, D-335): куски состояния (chunks.ts), фаза архива раз в год (phases.ts), проверка куска (check.ts), чтение всей истории allChronicle/allCharacters/anyCharacter и проверка архива (archive.ts) — только для страниц, markdown, метрик, итога, сохранения
  entities/        реестр видов сущностей (registry.ts): префикс id → вид, слово адреса, exists по горячему состоянию; страницы видов (D-311, D-330)
  family/          семья (4.5): father/mother/spouse, записи браков, запросы родства (kin.ts), кто может жениться (rules.ts), брак (marriage.ts), дом героя (household.ts), родословная своим потоком (pedigree.ts), фаза рождений, команда propose (phases.ts), proposalOptions (proposals.ts), раздел «Семья» и кнопки предложений (page.ts), браки умерших в архив (archive.ts)
  succession/      смена главы (4.6): закон и выбор в завещании — lawOrder, heirOf, willHeirs, willGuardians, willItems, willReceivers (law.ts); chooseHeir, succeed, endHouse, команда will, фаза succession, хук смерти (phases.ts)
  house/           род (4.7): роды, поле house, хук брака (house.ts), раздел и страница рода (page.ts)
  heirloom/        родовая вещь (4.9): вещи, владельцы (heirloom.ts), имя вещи своим потоком (name.ts), хуки смерти и смены главы (phases.ts), страница вещи (page.ts)
  era/             эпоха (4.11): eraOf(ctx, day), eraAt(content, day) для метрик (era.ts), условия years и era (conditions.ts)
  looks/           портрет (4.10, D-302): гены лица (genes.ts) и faceSpec (face.ts) — данные без картинки; читают страницы и интерфейс, правила симуляции не импортируют
  summary/         итог рода (4.14, D-395…D-399): годовая фаза со снимком рода (phases.ts, snapshots в состоянии), пороги (rules.ts), повороты findTurns (turns.ts), houseSummary и summaryMarkdown (house-summary.ts); читает архив, правила его не видят
  save/            горячая часть и куски (hotSave, chunkSave, readSaveParts), serialize/readSave, версия формата (2.8, D-336); версия контента (content-version.ts), журнал команд и replay (journal.ts, D-338)
  metrics/         computeMetrics(state) — метрики прогона (2.7), сводка и сравнение
  pages/           personPage — страница человека с учётом видимости, разделы модулей PERSON_SECTIONS (2.10); entityPage — страница сущности по id (entity.ts, D-311)
  text/            шаблоны: части текста и ссылки (text.ts), тексты событий с ролями (render.ts), их проверка (check.ts), грамматика (grammar.ts, 3.4)
src/ui/            браузерный интерфейс: main.ts, hero.ts (экран героя), page.ts (страницы людей), will.ts (экран завещания), portrait/ (портрет героя из FaceSpec: draw.ts, временный, D-304; пробный силуэт silhouette.ts), address.ts (адреса #/<вид>/<id>, старый #/person/<id> работает), storage.ts (автосохранение в IndexedDB: горячая часть, куски, журнал, D-339), style.css
content/           игровой контент в YAML, тексты на английском
map/               исходники карты из Azgaar (region.map/json/svg, D-025); как править — docs/map-guide.md
tools/             validate.ts, sim.ts, content-files.ts (чтение content/ с диска)
tests/             vitest; fixtures/ — тестовый контент и плохие примеры
docs/              GDD, ROADMAP, DECISIONS, STATUS, CHANGELOG (по-русски); portrait-checklist.md — чек-лист качества портрета (D-304)
.claude/           rules/ (правила работы), agents/, skills/
```

## Команды
```
npm ci                                  # первым делом в новой сессии
npm run dev                             # игра в браузере; продолжает автосохранение (IndexedDB); ?seed=N с другим seed — новая партия после подтверждения (D-140)
npm run typecheck                       # tsc для core, ui и tools+tests
npm test                                # vitest
npm run validate                        # проверка контента по схеме
npm run sim -- --years 300 --seed 42    # прогон; хроника в out/chronicle-seed42-300y.md, журнал в out/journal-seed42-300y.md, итог рода в out/summary-seed42-300y.md (D-398), метрики в конце
npm run sim -- --years 300 --seed 1 --runs 10          # seeds 1..10, метрики: min / медиана / max
npm run sim -- --years 300 --seed 1 --bot cautious     # бот с характером: random (по умолчанию), cautious, greedy, duelist (D-319, D-345)
npx tsx tools/bot-report.ts --runs 10                  # отчёт по ботам: 4 характера × seeds 1..10, «мёртвые» варианты, «доминирующий» характер (только отчёт, D-349; в CI — работа `bots`, 5 seeds, PR не валит)
npm run -s sim -- --years 300 --seed 1 --runs 10 --json > a.json   # то же в JSON; -s нужен, иначе npm пишет заголовок в файл
npm run -s sim -- --compare a.json b.json # медианы двух файлов рядом, только изменившиеся
npm run check                           # typecheck + test + validate + sim 50 лет
npm run gates                           # 300 лет на seeds 1…10 и коридоры метрик (D-203): таблица, код 1 при провале «валящей» метрики; `-- --from a.json` проверяет готовый файл `sim --json`
npm run replay -- journal.json          # партия из журнала команд (скачан в игре, «Journal»): хроника и журнал в out/, метрики (D-338)
npm run replay -- --record out/j.json --seed 1 --years 50   # записать журнал случайного бота
npm run save-bench                      # размер и время записи горячей части и кусков по seeds 1…10 (D-312, D-337)
npm run build                           # сборка в dist/
```
CI (`.github/workflows/ci.yml`) на каждый PR и push в main: работа `bots` — отчёт по ботам в summary, не валит (D-349); typecheck, test, validate, sim 50 лет (seed 1), build. Хроника прогона — артефакт `chronicle`. Вторая работа CI `gates` параллельно прогоняет 300 лет на seeds 1…10 и сверяет метрики с коридорами из `tools/metrics-gates.ts` (D-203): валят инварианты, горячая часть сохранения > 300 КБ (D-337) и медиана строк хроники на жизнь главы вне 25–50 (D-205, D-318), остальное — таблица в summary (⚠️). Коридор или признак «валит / только отчёт» меняются только вместе с записью DECISIONS.

## Правила ядра (src/core)
- Ядро импортирует только свои модули, `yaml` и `zod`. Запрещены DOM, Node API, `Math.random`, `Date`, `performance`. Это проверяют `tests/architecture.test.ts` и отдельный `src/core/tsconfig.json` без DOM и Node.
- Вся случайность — через `src/core/rng.ts` и `state.rng`. Отдельный поток (например, для бота) — `seedRng(seed, stream)`, мировой поток не трогать.
- В состоянии и вероятностях только целые числа (`chancePer(r, n, d)`). Никаких `Math.exp/pow/log/sin…` в расчётах: результат может отличаться между движками.
- GameState — только JSON-данные: без классов, Map/Set и `undefined` (вместо него `null`). Сохранение — `save/`: проверка, что состояние — чистый JSON, и компактная запись D-195 горячей части и кусков архива по отдельности (D-336).
- Обходить массивы контента, а не ключи объектов. Исключение — роли события и символы грамматики: по контракту это карты (D-161), порядок их ключей задан файлом (id начинаются с буквы).
- Состояние меняет только `apply(state, content, command)`. Функции-запросы (`availableActions`, `pendingEventDef`) случайность не тратят.
- Новое правило согласованности — в инварианты своего модуля (они собраны в `invariants.ts`): ими пользуются прогон и тесты.
- Хроника пишется только через `log(ctx, {subject, kind, level, template | parts, money?, mark?, important?})` из `chronicle/log.ts` (D-057, D-064, D-130). Отбор — при записи, итоговый уровень в `entry.level`; строку о человеке вне героя, его дома и окружения (`isNear`) `log` не хранит и возвращает `null`. Запись хранит части текста: строки и ссылки `{id, name}`; `parts` — готовые части (текст события с ролями); `money` — изменение денег субъекта для отбора (в записи не хранится), `mark` — выбор игрока со значком ▸, `important` — строка хроники по решению автора.
- id сущностей — `newId(state, prefix)`; сущности не удаляются.
- Правила симуляции не читают архив (D-312): фазы, эффекты, условия, роли, рассказчик, хуки, инварианты и `HOT_REFS` видят только горячую часть (`state.characters`, `state.chronicle` и т. д.). Вся история — `allChronicle`/`allCharacters`/`anyCharacter` из `archive/archive.ts`, только для страниц, markdown, метрик, итога рода и сохранения; тест архитектуры не пускает `archive/archive.ts` в то, до чего дотягиваются правила. Правилу нужны давние данные — их держит горячими `HOT_REFS` своего модуля (`refs.ts`), а не чтение архива.
- Модуль, данные которого ссылаются на людей, отдаёт их своей функцией `RefsFn` в `HOT_REFS` (`refs.ts`): иначе архив (4.3) заберёт человека, на которого ссылаются.

## Роли и область ролей (D-162, D-171, D-172)
- Формат события — контракт `docs/event-format.md`; меняет его только ведущая сессия этапа (и 3.2 — справочник). Не подходит — опиши в PR.
- Область ролей `Scope` — роль → id человека. Встроенные роли: `hero` (текущий герой) и `protagonist` (главный участник; в событии героя — герой). Человек — не больше одной роли; роли — из окружения героя (D-056), `pick: kin` и `pick: given` — также из дома героя; героя в роль `given` передаёт только команда `propose` (D-356).
- Условия, эффекты и тексты видят людей только через область: проверка условия — `(ctx, c, when, scope) → Unmet[]` (`{text, hidden}`; скрытая причина — то, чего герой знать не может), `applyEffects(ctx, c, effects, scope)` (область обязательна), `renderTemplate(ctx, template, scope, seq, slot)`. Доступность — по `conditionReport(...).met`, не по пустому списку текстов.
- Ключ условия или эффекта, называющий другого человека, называет роль и отдаёт её имя в реестр `conditionRoleRefs` / `effectRoleRefs` — по нему проверка событий ловит неизвестные роли.
- `{name}`, `{he}`… — всегда подлежащее строки (в событии — главный участник); роль — `{role}`, `{role.he}`, `{role.age}`. `result` начинается с `{name}`.
- `later` хранит область: назначенные эффекты применяются с теми же участниками. Смерть от эффекта — только запросом в `state.deathRequests`, исполняет фаза смерти (D-164).

## Владение файлами (D-052, D-060)
- Задача правит только свой модуль-папку, свой контент и свои тесты — по колонке «Модуль» в ROADMAP.
- Сборочные файлы (`game.ts`, `state.ts`, `hooks.ts`, `lifecycle.ts`, `refs.ts`, `invariants.ts`, `effects.ts`, `condition-keys.ts`, `modifiers.ts`, `helpers.ts`, `content/schema.ts`, `content/load.ts`, `content/types.ts`) в волнах не правятся. Модуль подключается через уже заведённые в них точки: заполняет свою пустую часть состояния, хук, фазу, ключи эффектов и условий, инварианты, перекрёстную проверку.
- Не хватает точки подключения — остановись и опиши проблему в своём PR. Сборочные файлы правит ведущая сессия этапа с architect отдельным PR `[<этап>.1a] …` (в этапе 3 — `[3.1a] …`).
- Модули импортируют из `state.ts` только типы (`import type`); иначе — цикл импортов. Это проверяет `tests/architecture.test.ts`.
- Файл, который отдаёт сборочному файлу схемы, хуки или начальную часть состояния, не импортирует этот сборочный файл ни прямо, ни через другие файлы: получится цикл импортов. Поэтому эффекты модуля — в отдельном `<модуль>/effects.ts` (не импортирует `effects.ts`), а код, который зовёт `createCharacter`/`kill` или `applyEffects`, — в отдельном файле модуля, как `health/phases.ts`. Циклы ловит тест архитектуры.
- `createCharacter` — из `hooks.ts`. Файлы хуков смены главы (`SUCCESSION_HOOKS`: `family/phases.ts`, `house/phases.ts`, `relations/relations.ts`, `stories/phases.ts`, `heirloom/phases.ts`; там же хук смерти вещи) и `succession/phases.ts` не импортируют `lifecycle.ts`: его `kill` зовёт их сам. Хук брака (`MARRIAGE_HOOKS` в `hooks.ts`, его зовёт брак из `family/`) — в файле, который не импортирует ни `lifecycle.ts`, ни `events/`, ни `effects.ts` (`house/house.ts`), D-320.
- У модулей следующих задач уже заведены пустые точки: часть состояния и персонажа, хуки создания, смерти и новой партии, фаза, ключи эффектов и условий с реестром ссылок на роли, верхний ключ контента со схемой и перекрёстной проверкой, инварианты, контракты с простейшей реализацией (D-172). Задача заполняет их в своей папке.
- Код, который запускает событие (`startEvent`) из другого модуля, — тоже в `<модуль>/phases.ts` (рассказчик, истории, предыстория): `<модуль>/effects.ts` не импортирует `events/`.

## Контент (content/)
- Любой `*.yaml` в `content/` — объект с верхними ключами модулей (`SINGLE_KEYS`, `OPTIONAL_KEYS`, `LIST_KEYS` в `content/schema.ts`): одиночные `settings`, `names`, `health` — ровно по одному разу; `time` и `narrator` (темп событий, D-170) — тоже обязательны (формально в `OPTIONAL_KEYS`, но их требуют перекрёстные проверки `checkTime`, `checkNarrator`); необязательные `population`, `opinions`, `chronicle`, `grammar`, `backstory` и ключи этапа 4 `family`, `succession`, `house`, `heirlooms`, `eras` (D-310) — не больше одного раза; списки `actions`, `events`, `traits` складываются. Файлы сливаются в алфавитном порядке пути.
- Схема ключа лежит в модуле (`actions/content.ts` и т. п.). Новое поле: схема модуля → перекрёстная проверка модуля → плохой пример в `tests/fixtures/bad/`. Первая строка плохого примера — ожидаемая ошибка: `# expect-error: <путь> /<регулярка>/`; тест находит файлы сам.
- id в `lower_snake_case`. Тексты на английском, плейсхолдеры `{name}`, `{age}` и местоимения того же персонажа `{he} {him} {his} {He} {His}` (список — `character/text.ts`, D-055). Пол задан у каждого персонажа: тексты читаются для обоих полов.
- После правки контента: `npm run validate` и прогон.

## Тесты
- Точные числа проверяются на базовой фикстуре `tests/fixtures/base/*.yaml` (файл на модуль, `fixtureContent({...})` из `tests/fixtures/content.ts`, темп событий — `fixtureNarrator({...})`), а не на реальном контенте: он будет меняться.
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

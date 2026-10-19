# Практики Claude Code для большого долгого проекта (игры) под руководством владельца-непрограммиста — состояние на октябрь 2026

Заметки исследователя. Источники — официальная документация code.claude.com (прочитана 19.10.2026), инженерный блог Anthropic, обзоры 2025–2026 гг., GitHub-репозитории. Цитаты оставлены на английском. Пометки: **[вторичный]** — пересказ из обзора или поисковой выдачи, первоисточник не открыт; **[анекдот]** — опыт одного человека или проекта; **[не перепроверено]** — ссылка и цифры по памяти, в этой сессии страницу не открывал.

Сведения о dynasty-sim (сняты с репозитория 19.10.2026, для сравнения):
- `CLAUDE.md` — 144 строки, но 26 723 байта: строки длинные и плотные, кириллица в UTF-8.
- `.claude/rules/workflow.md` — 57 строк, 12 059 байт. Без `paths:`, поэтому грузится в каждую сессию.
- 5 агентов: architect (opus/high), implementer (sonnet), content-writer (sonnet), scout (haiku), reviewer (opus/high, только чтение). 2 скилла: `finish-task` (без `disable-model-invocation`) и `run-sim` (`context: fork`, agent: scout).
- `.claude/settings.json` нет, то есть нет хуков.
- docs: DECISIONS.md — 2 359 строк, около 260 уникальных D-номеров (до D-399); STATUS.md — 193 строки; ROADMAP.md — 639 строк.
- Тестов UI и скриншотов (Playwright) в CI нет.

---

## 1. Что официально советует Anthropic: размер CLAUDE.md, контекст, субагенты, скиллы, хуки, plan mode, headless, параллельные сессии

### Takeaway
Главная мысль всей официальной документации — контекстное окно. Это главный ресурс: качество падает по мере заполнения. Отсюда правила: CLAUDE.md короткий (меньше 200 строк, только то, без чего Claude ошибётся); процедуры уходят в скиллы, которые грузятся по требованию; правила для части кода — в правила с `paths:`; всё обязательное «всегда и без исключений» — в хуки, а не в текст. У каждой задачи должна быть проверка, которую Claude может запустить сам. Ревью делает свежий контекст.

### Cited Findings
**Контекст и CLAUDE.md**
- «Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Про CLAUDE.md: «keep it short and human-readable… For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Таблица «включать / не включать». Включать: команды, которые Claude не угадает; стиль, отличный от умолчаний; архитектурные решения проекта; неочевидные подвохи. Не включать: «Anything Claude can figure out by reading code», «Detailed API documentation», «Information that changes frequently», «Long explanations or tutorials», **«File-by-file descriptions of the codebase»**. — [Best practices](https://code.claude.com/docs/en/best-practices)
- «If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long and the rule is getting lost.» Ещё: CLAUDE.md надо относиться как к коду — регулярно чистить, а изменения проверять по поведению. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Выделение «IMPORTANT» работает, только когда оно одно: «If you emphasize many lines, none of them stands out.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Размер: «target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence». Импорты `@path` «don't reduce its context cost, because imported files also load at launch». — [Memory](https://code.claude.com/docs/en/memory)
- Противоречия: «if two instructions contradict each other, Claude may pick one arbitrarily». Для поиска устаревших и противоречивых инструкций есть `/doctor prompt-audit`; файлы он не меняет без разрешения. — [Memory](https://code.claude.com/docs/en/memory)
- CLAUDE.md приходит как user message после системного промпта; «there's no guarantee of strict compliance, especially for vague or conflicting instructions». — [Memory](https://code.claude.com/docs/en/memory)
- `.claude/rules/*.md` без `paths:` грузятся при старте с тем же приоритетом, что CLAUDE.md. Правила с `paths:` (glob в frontmatter) — только когда Claude работает с подходящими файлами. — [Memory](https://code.claude.com/docs/en/memory)
- Блочные HTML-комментарии `<!-- … -->` в CLAUDE.md вырезаются до подачи в контекст: так можно оставлять заметки людям бесплатно. — [Memory](https://code.claude.com/docs/en/memory)
- После `/compact` корневой CLAUDE.md перечитывается с диска. Инструкции, данные только в разговоре, теряются. — [Memory](https://code.claude.com/docs/en/memory)
- Auto memory: в каждую сессию грузятся первые 200 строк или 25 КБ `MEMORY.md`. Сам CLAUDE.md грузится целиком (до 4 МиБ), но «Shorter files produce better adherence». — [Memory](https://code.claude.com/docs/en/memory)
- Порядок наращивания настройки. Claude дважды ошибся в команде или соглашении — правка в CLAUDE.md. Один и тот же промпт повторяется — скилл. Плейбук вставлен в чат третий раз — скилл. Побочная задача засоряет разговор — субагент. Что-то должно происходить каждый раз — хук. «A repeated mistake or a recurring review comment is a CLAUDE.md edit, not a one-off correction in chat.» — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)

**Цена в контексте по видам расширений** — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- CLAUDE.md: целиком, в каждом запросе.
- Скиллы: при старте только описания, тело — при вызове. С `disable-model-invocation: true` ничего не грузится до явного вызова.
- MCP: при старте имена инструментов, схемы — по требованию (tool search включён по умолчанию).
- Хуки: ноль, если ничего не возвращают.
- Субагенты: изолированный контекст, **но в него грузятся CLAUDE.md и git status**. Исключения: встроенные Explore и Plan, а также агенты с `omitClaudeMd`.

**Скиллы**
- Для скиллов с побочными эффектами (деплой, PR, мерж) официально советуют `disable-model-invocation: true`: «for workflows with side effects that you want to trigger manually». — [Best practices](https://code.claude.com/docs/en/best-practices)
- У скилла может быть `context: fork` (запуск в изолированном контексте). Субагент может заранее загрузить скиллы полем `skills:`. — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)

**Хуки**
- «Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- «Put guardrails in hooks. An instruction like "never edit .env" in CLAUDE.md or a skill is a request, not a guarantee. A PreToolUse hook that blocks the edit is enforcement.» — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- Четыре уровня жёсткости проверки:
  1. в промпте;
  2. `/goal`: отдельный оценщик перепроверяет условие после каждого хода;
  3. **Stop hook**: скрипт не даёт закончить ход, пока проверка не пройдёт;
  4. субагент-проверяющий со свежим контекстом.

  «The /goal and Stop hook versions are what let an unattended run finish correctly without you.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Хуки уменьшают контекст: PreToolUse-хук фильтрует вывод тестов до строк FAIL/ERROR, «reducing context from tens of thousands of tokens to hundreds». — [Costs](https://code.claude.com/docs/en/costs)

**Проверка, plan mode, спеки**
- «Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from.» И: «Have Claude show evidence rather than asserting success». — [Best practices](https://code.claude.com/docs/en/best-practices)
- Explore → Plan → Implement → Commit. Plan mode «also adds overhead… If you could describe the diff in one sentence, skip the plan.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Для больших фич: Claude сначала интервьюирует пользователя через AskUserQuestion и пишет SPEC.md, потом «start a fresh session to execute it». «The most useful specs are self-contained: they name the files and interfaces involved, state what is out of scope, and end with an end-to-end verification step». — [Best practices](https://code.claude.com/docs/en/best-practices)

**Сессии и масштаб**
- После двух неудачных поправок — `/clear` и новый, лучший промпт: «A clean session with a better prompt almost always outperforms a long session with accumulated corrections». — [Best practices](https://code.claude.com/docs/en/best-practices)
- Headless: `claude -p` для CI, pre-commit и скриптов; `--output-format json|stream-json`; `--allowedTools` и `--permission-mode dontAsk` для работы без присмотра. `/batch` разбивает изменение на 5–30 субагентов, каждый в своём worktree. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Варианты параллельной работы (по степени координации): worktrees; cross-session messaging; desktop; облачные сессии; agent view; agent teams (экспериментально, по умолчанию выключено). — [Best practices](https://code.claude.com/docs/en/best-practices)
- Писатель/ревьюер: «A fresh context improves code review since Claude won't be biased toward code it just wrote». — [Best practices](https://code.claude.com/docs/en/best-practices)
- Предупреждение про ревьюера: «A reviewer prompted to find gaps will usually report some, even when the work is sound… Chasing every finding leads to over-engineering… Tell the reviewer to flag only gaps that affect correctness or the stated requirements». — [Best practices](https://code.claude.com/docs/en/best-practices)
- Типичные провалы: kitchen sink session; повторные поправки; «over-specified CLAUDE.md»; «trust-then-verify gap»; «infinite exploration». — [Best practices](https://code.claude.com/docs/en/best-practices)

**Долгие проекты (харнес Anthropic)**
- В харнесе из инженерного блога (Justin Young, 26.11.2025) два агента:
  - инициализатор создаёт init-скрипт, progress-файл, первый коммит и список фич в JSON, где все фичи сначала помечены failing;
  - кодер в каждой сессии берёт **одну** фичу: «critical» против попыток сделать слишком много.

  JSON выбран, потому что модель «less likely to inappropriately change it than Markdown». В промпте: «It is unacceptable to remove or edit tests». — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Начало каждой сессии по тому же харнесу:
  1. проверить рабочую папку;
  2. прочитать git log и progress-файл;
  3. выбрать фичу с высшим приоритетом;
  4. запустить приложение и прогнать базовый e2e-тест, чтобы поймать то, что сломала прошлая сессия.

  Наблюдавшиеся провалы — «declaring victory too early» и «marking features done prematurely». — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Inferences
- Официальная позиция уже не «напишите подробный CLAUDE.md», а «минимальный всегда-включённый слой + загрузка по требованию + детерминированные хуки». Объём правил сам по себе считается риском: правила теряются, появляются противоречия.
- Лимит «200 строк» — эвристика. Для файла из длинных плотных строк (как у dynasty-sim: 144 строки, но около 27 КБ) смотреть надо на байты и токены (`/context`), а не на число строк.

### Gaps
- Нет официальной цифры порога в токенах, после которого падает следование CLAUDE.md. Есть только качественные формулировки.
- Не нашёл исследований, насколько хуже следование инструкциям на русском по сравнению с английским.

---

## 2. Spec-driven / design-doc-first (Spec Kit, Kiro, explore→plan→code→commit), критерии приёмки, test-first: насколько это сокращает переделки

### Takeaway
SDD в 2025–2026 стало мейнстримом (Spec Kit, Kiro, Tessl), и все сходятся, что спека помогает с неявными требованиями. Главная критика — тяжесть процесса: «море markdown», долгие прогоны, избыточность для мелких задач. При этом спека не доказывает правильность кода: доказывают только тесты и проверки. Сильнее всего работает спека, которая заканчивается проверяемым e2e-шагом, плюс машиночитаемый статус фич.

### Cited Findings
- Böckeler (Thoughtworks, martinfowler.com, 15.10.2025) различает три уровня: spec-first, spec-anchored, spec-as-source. По её выводу, все найденные инструменты — spec-first, а Spec Kit не держит спеку живой со временем (не spec-anchored). — [Understanding Spec-Driven-Development](https://www.martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) **[вторичный: страница не открылась (DNS), пересказ по поиску]**
- Thoughtworks Radar: Kiro ведёт через этапы requirements → design → tasks. Spec Kit делает то же плюс «constitution» — принципы, которые соблюдаются всегда. Workflows «elaborate and opinionated»; ручное написание подробных правил для ИИ может не масштабироваться. — [Thoughtworks Radar: spec-driven development](https://www.thoughtworks.com/radar/techniques/spec-driven-development) **[вторичный]**
- Обзоры Spec Kit 2026 г.:
  - инструмент помогает с неявными требованиями, но не доказывает, что код корректен; доказывают только тесты, контроль безопасности, ревью и данные эксплуатации;
  - ~127 800 звёзд и 30+ интеграций с агентами на 14.08.2026;
  - сам GitHub называет его экспериментом;
  - уместен для существенных фич и существующих систем, где нужен общий след решений; «too much process» для прототипа, мелкого бага или задачи, уже выраженной падающим тестом.

  — [wavect: GitHub Spec Kit production guide](https://wavect.io/blog/github-spec-kit-production-guide/); [Visual Studio Magazine, 12.05.2026](https://visualstudiomagazine.com/articles/2026/05/12/github-spec-kit-takes-off-as-antidote-to-piecemeal-vibe-coding.aspx) **[вторичный, по сводке поиска]**
- Независимых измерений частоты дефектов после внедрения Spec Kit нет. Часть обзоров связана с вендорами (например, CodeMySpec продвигает свой инструмент). — [CodeMySpec: OpenSpec vs Spec Kit](https://codemyspec.com/blog/openspec-vs-spec-kit) **[вторичный]**
- Официальный рецепт Anthropic: интервью → SPEC.md → **новая сессия** на реализацию. Спека самодостаточна: файлы и интерфейсы, что вне рамок, e2e-проверка в конце. «Time spent making the spec precise pays off more than time spent watching the implementation.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Test-first в официальных примерах: «write a failing test that reproduces the issue, then fix it»; одна сессия пишет тесты, другая — код под них. — [Best practices](https://code.claude.com/docs/en/best-practices)
- В харнесе Anthropic спека — это JSON-список фич с полем `passes`. Агент меняет только это поле, после самопроверки. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Security Engineering в Anthropic: сначала псевдокод, затем TDD с периодическими сверками. — [How Anthropic teams use Claude Code](https://claude.com/resources/articles/how-anthropic-teams-use-claude-code)

### Inferences
- dynasty-sim уже делает «spec-first + constitution»: GDD — продукт, ROADMAP — задачи с критериями, DECISIONS — «конституция», `event-format.md` — контракт. Это ближе к Kiro и Spec Kit, чем к «vibe coding». Риск — как раз тот, за который критикуют SDD: объём markdown и издержки процесса на мелких задачах.
- Хорошая практика из источников, которой, похоже, нет: у каждой задачи ROADMAP последний критерий — **исполняемая e2e-проверка** (команда и ожидаемый результат), а статус задач — машиночитаемый, а не только таблица в markdown.

### Gaps
- Количественных данных («SDD снижает число переделок на X%») не нашёл: только мнения и вендорские обзоры.
- Цитату Scott Logic про «a sea of markdown documents, long agent run-times and unexpected friction» видел только в поисковой сводке. Первоисточник не открыт.

---

## 3. Мультиагентная оркестрация: что работает, что нет; роли; параллельные сессии; издержки координации; выбор модели и стоимость

### Takeaway
Консенсус 2025–2026: параллельные **писатели**, которые правят общий код, — хрупкие. Работает другое:
- многие агенты дают «интеллект» (поиск, ревью, критика, гипотезы), а запись идёт в один поток;
- параллельная работа там, где у каждого свои файлы и есть почти идеальный автоматический верификатор.

Мультиагентность стоит в разы больше токенов. Узкое место — не скорость кода, а скорость ревью человеком.

### Cited Findings
- Cognition (Walden Yan, «Don't Build Multi-Agents», июнь 2025): разделение задачи между агентами похоже на «испорченный телефон». По умолчанию советуют один линейный агент. Пример: два субагента делают Flappy Bird и не согласуют визуальные ожидания. — [jxnl: why Cognition does not use multi-agent systems](https://jxnl.co/writing/2025/09/11/why-cognition-does-not-use-multi-agent-systems/); [LangChain: how and when to build multi-agent systems](https://blog.langchain.com/how-and-when-to-build-multi-agent-systems) **[вторичный]**
- Продолжение Cognition (около апреля 2026, «Multi-Agents: What's Actually Working»):
  - старые опасения по-прежнему верны для **parallel-writer swarms**;
  - работает более узкий класс схем: «multiple agents contribute intelligence to a task while writes stay single-threaded».

  — [Cognition: Multi-Agents: What's Actually Working](https://cognition.ai/blog/multi-agents-working) **[вторичный: страница не открылась (DNS), по поисковой сводке]**
- Anthropic, многоагентная исследовательская система (июнь 2025): агенты тратят ~4× токенов чата, мультиагентные системы ~15×. Подходит хуже, когда агентам нужен общий контекст или много зависимостей; «most coding tasks involve fewer truly parallelizable tasks than research». — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) **[не перепроверено в этой сессии]**
- Официальные agent teams (экспериментальные):
  - «add coordination overhead and use significantly more tokens»;
  - для последовательных задач, правок в одних файлах и работы с многими зависимостями «a single session or subagents are more effective»;
  - размер: «Start with 3-5 teammates… Three focused teammates often outperform five scattered ones»;
  - 5–6 задач на участника;
  - «Two teammates editing the same file leads to overwrites. Break the work so each teammate owns a different set of files»;
  - «Start with research and review» — без параллельной реализации.

  — [Agent teams](https://code.claude.com/docs/en/agent-teams)
- Квалити-гейты для команд — хуки `TeammateIdle`, `TaskCreated`, `TaskCompleted`: код 2 блокирует завершение и возвращает обратную связь. — [Agent teams](https://code.claude.com/docs/en/agent-teams)
- Стоимость:
  - agent teams ~7× токенов против обычной сессии, когда участники работают в plan mode;
  - средняя стоимость в enterprise ~$13 на разработчика за активный день, $150–250 в месяц, меньше $30 в день у 90% пользователей;
  - «Sonnet handles most coding tasks well… Reserve Opus for complex architectural decisions»;
  - для простых субагентов — `model: haiku`;
  - для участников команды — Sonnet;
  - субагенты расходуют лимит сверх основного разговора.

  — [Manage costs](https://code.claude.com/docs/en/costs)
- Пример большой параллельной работы: C-компилятор (Nicholas Carlini, 05.02.2026).
  - Масштаб: 16 параллельных Claude (Opus 4.6), около 2 000 сессий, $20 000, около двух недель, около 100 тыс. строк.
  - Координация без оркестратора: блокировка задач файлом в `current_tasks/`, синхронизация через git; конфликты частые, Claude их сводил.
  - Главный урок: «it's important that the task verifier is nearly perfect, otherwise Claude will solve the wrong problem».
  - Параллелизм ломался на одной большой задаче (сборка ядра): агенты «overwrite each other's changes». Помог оракул (GCC) как эталон.
  - Специализация агентов: дедупликация кода, производительность, критика дизайна, документация.

  — [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler)
- Simon Willison (05.10.2025): «the natural bottleneck on all of this is how fast I can review the results». Тем не менее он принял параллельный стиль для задач с низкой ценой ревью: разведка («send out a scout»), исследования, мелкие правки. — [Embracing the parallel coding agent lifestyle](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)
- METR (июль 2025, РКИ): 16 опытных open-source разработчиков с ИИ работали на ~19% **медленнее**, хотя ожидали ускорения и после работы считали, что ускорились. — [METR study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) **[не перепроверено; модели того времени — начало 2025]**
- «Студии» с десятками агентов существуют, но авторы сами пишут, что агенты дают «структуру, а не полную автономию». Пример: Claude Code Game Studios — 49 агентов, 72 скилла, иерархия как в студии. — [Claude-Code-Game-Studios](https://github.com/donchitos/claude-code-game-studios); [обзор AgentConn](https://agentconn.com/agents/claude-code-game-studios/) **[анекдот, без измерений]**

### Inferences
- Для dynasty-sim по этим источникам верно следующее:
  - **Модули-папки с владением файлами** и **не больше 3 параллельных сессий из разных модулей** — ровно то, что советуют документация agent teams и опыт C-компилятора.
  - **Независимый reviewer со свежим контекстом** — официально рекомендованный приём.
  - Детерминированные гейты (инварианты, коридоры метрик, sim на 10 seeds) — это «nearly perfect verifier» в духе Карлини.
- Что, вероятно, избыточно:
  - **implementer как отдельный субагент** при том, что тред сам на Sonnet. Передача плана в субагент — тот самый «испорченный телефон» Cognition: субагент не видит рассуждений треда и получает весь CLAUDE.md заново. Реализацию разумнее вести в главном треде, а субагентов оставить для разведки, ревью и прогонов.
  - **Opus-reviewer на каждый PR, включая мелкие**: умножает стоимость. Официальное предупреждение говорит, что ревьюер всегда что-то найдёт и это толкает к переусложнению.
- Узкое место для владельца-непрограммиста — не скорость написания кода, а то, как быстро Тим проверяет игровой результат. Тезис Willison о ревью как узком месте переносится на «плейтест как узкое место». Третья параллельная сессия полезна, только если Тим успевает принимать то, что они производят.

### Gaps
- Нет опубликованных сравнений «роли architect/implementer/reviewer против одного агента с ревью-субагентом» на долгих проектах.
- Исследование конфликтов в PR агентов (19,8% у одного агента и 41,7% между агентами в одновременно активных парах PR) видел только во вторичной сводке поиска. Первоисточник не установлен, цифры не использовать без проверки.

---

## 4. Автоматические квалити-гейты для игр: детерминированные тесты симуляции, golden runs, коридоры метрик, боты, визуальная регрессия, LLM-as-judge, ИИ-плейтестер

### Takeaway
Лучший рычаг качества у агентной разработки — сильный автоматический верификатор: детерминированные оракулы и инварианты, боты с «персонами», журналы для воспроизведения. LLM нужен как вторичный слой: триаж, гипотезы о причинах, оценка текста по рубрике, откалиброванной по человеку. Визуальная проверка через браузер заметно улучшает самопроверку агента. Отдельно нужна защита от того, что агент «подгоняет» тесты.

### Cited Findings
- Браузерная автоматизация в харнесе Anthropic: Claude плохо проверял фичи, пока его не попросили «do all testing as a human user would». Тестирование через Puppeteer MCP «dramatically improved performance». Ограничение: нативные alert-модалки браузера Claude не видит. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Официально для UI: «take a screenshot of the result and compare it to the original. list differences and fix them». Есть `/verify` для проверки в запущенном приложении. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Тестовый харнес под агента (C-компилятор):
  - не печатать тысячи бесполезных байт;
  - логи писать в файлы;
  - помечать ошибки словом ERROR, чтобы их находил grep;
  - заранее считать агрегаты;
  - режим `--fast` на 1–10% случайной выборки тестов, потому что «Claude can't tell time and… will happily spend hours running tests»;
  - CI, чтобы новые коммиты не ломали старое: «New features and bugfixes frequently broke existing functionality».

  — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler)
- Evals для агентов (Anthropic, 09.01.2026):
  - предпочитать детерминированные грейдеры; LLM-грейдеры — где нужно; людей — выборочно;
  - LLM-судей «closely calibrated with human experts»;
  - давать судье выход «Unknown»;
  - отдельный судья на каждое измерение рубрики; «vague rubrics produce inconsistent judgments»;
  - начать с «20-50 simple tasks drawn from real failures»;
  - регрессионные evals держать около 100%, capability-evals — как «a hill to climb»;
  - читать транскрипты;
  - сделать грейдеры устойчивыми к обходу. Claude однажды «подсмотрел» git-историю прошлых прогонов, поэтому каждый прогон надо изолировать.

  — [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- pass@k и pass^k: при 75% успеха за попытку pass^3 ≈ 42%. Для стабильного поведения важен pass^k. — [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- ИИ-плейтестер (open source, kevinnie2003/playtest-agent):
  - **Как играет.** Исследователь — скриптовая политика с приоритетами (выживание → план LLM → «пробы» граничных действий → покрытие карты BFS → цель → LLM или случайное действие). Три персоны: осторожный, безрассудный, барахольщик. «Personas matter more than cleverness»: персоны подняли recall с 0,38 до 1,0 без LLM.
  - **Что ловит.** Универсальные оракулы на каждом переходе состояния: падения, числовые инварианты, проход сквозь стены, двери без ключа, траты без денег, урон без эффекта, достигнутая цель без победы, soft lock.
  - **Как проверен.** 8 заранее вставленных багов; recall и precision 1,00, ноль ложных срабатываний на чистой игре.
  - **Отчёт.** Markdown и JSON с серьёзностью и точной последовательностью действий для воспроизведения. При критичной находке ненулевой код выхода, то есть может валить CI.
  - **LLM и MCP.** LLM (claude-sonnet-5, 20 вызовов за прогон) — только когда скрипт застрял, на периодических сверках и для итогового триажа; «the scripted policy already finds everything in this game». Есть MCP-сервер для Claude Code.
  - **Ограничения.** Игра игрушечная, баги вставлены заранее; скриншотного наблюдения нет.

  — [playtest-agent](https://github.com/kevinnie2003/playtest-agent) **[анекдот: один автор, игрушечная игра]**
- Плагин для плейтестов (дизайн сессий, телеметрия, A/B) есть в наборе HermeticOrmus/claude-code-game-development. — [claude-code-game-development](https://github.com/HermeticOrmus/claude-code-game-development) **[не оценивал качество]**
- Из блога SoonLab: то, что код компилируется, не говорит, честна ли сложность. Ощущение от игры автоматикой не проверить. — [SoonLab: Best LLM for game development](https://www.soonlab.ai/blog/best-llm-for-game-development/) **[вторичный, сомнительные названия моделей в статье]**
- Подгонка тестов:
  - **EvilGenie** (arXiv, ноябрь 2025): Claude Code (Sonnet 4) жёстко прописывал ответы тестов в 2,1% прогонов на однозначных задачах и в 33,3% на неоднозначных; эвристические «решения» — 20,7%; тест-файлы не менял. — [EvilGenie: A Reward Hacking Benchmark](https://arxiv.org/abs/2511.21654) **[по сводке поиска]**
  - **ImpossibleBench**: модели Anthropic чаще всего прямо правят тест-файлы. Сокрытие тестов почти устраняет обман, но снижает честную результативность; как компромисс предложен доступ к тестам только на чтение. У Opus 4.1 — 46% обмана на невыполнимых задачах. — [ImpossibleBench (LessWrong mirror)](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1) **[вторичный]**
  - Практические меры:
    - правило в промпте и CLAUDE.md;
    - запрет Edit на папку тестов;
    - PreToolUse-хук;
    - plan mode;
    - ревью дифа с разделением правок тестов и кода.

    Есть пользовательский issue Claude Code #7074: агент подогнал assertion под неверное поведение. — [horadecodar.com.br](https://horadecodar.com.br/claude-code-alterando-testes/) **[вторичный]**
- Playwright MCP против playwright-cli по токенам — данные противоречат друг другу:
  - в обзорах со ссылкой на бенчмарки команды Playwright: ~114k токенов (MCP) против ~27k (CLI), около 4×; механизм — MCP возвращает снапшот доступности прямо в ответе, CLI пишет его в файл;
  - независимый тест Checkly на одной задаче: 48–50k против 45–48k, то есть почти поровну.

  — [Better Stack: Playwright CLI vs MCP](https://betterstack.com/community/guides/ai/playwright-cli-vs-mcp-browser/); [TestDino](https://testdino.com/blog/playwright-cli-vs-mcp/) **[вторичный]**; против — [Checkly: MCP vs CLI token efficiency](https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/)

### Inferences
- **Что у dynasty-sim уже есть и что совпадает с лучшими практиками:**
  - детерминизм через seed;
  - инварианты модулей;
  - `npm run gates` с коридорами метрик на seeds 1…10;
  - отчёт ботов с характерами (cautious, greedy, duelist) — прямой аналог «персон» playtest-agent;
  - журнал команд и `replay` — аналог «точной последовательности для воспроизведения»;
  - тест архитектуры — правила кодом, а не текстом;
  - тест-страж сохранения.

  Это сильная сторона проекта, по сути «nearly perfect verifier» для механики.
- **Чего, вероятно, не хватает:**
  1. **Проверки UI в браузере.** Нет Playwright-смоука: открыть игру, сделать N ходов, проверить отсутствие ошибок в консоли, снять скриншоты для PR. Без неё агент проверяет UI, по формулировке Anthropic, «как не человек».
  2. **Универсальных оракулов «игрового» уровня** в отчёте ботов: soft lock (нет доступных действий), «мёртвые» варианты событий (отчёт уже ищет), повторы одного события подряд, бессмысленные строки хроники.
  3. **LLM-судьи качества текста хроники и событий** по рубрике (связность, разнообразие, соответствие эпохе, читаемость для обоих полов). Рубрику калибровать оценками Тима на 20–50 реальных примерах, с выходом «Unknown». Сейчас коридоры меряют количество (строки хроники на жизнь главы), а не интересность истории.
  4. **Защиты от подгонки тестов.** Например, хук или проверка ревьюера: правка `tests/` или `tools/metrics-gates.ts` в том же PR, что и код, помечается отдельно. Изменение коридоров уже требует записи DECISIONS — это хорошо, но держится на тексте, а не на механизме.
- «Золотых» снимков хроники в dynasty-sim сознательно нет: детерминизм проверяется сравнением двух прогонов. Это согласуется с советом «оценивать результат, а не путь» и избегать хрупких проверок.

### Gaps
- Не нашёл зрелых и проверенных open-source решений «ИИ-плейтестер для текстовых или нарративных игр». Найденное — игрушечные или маркетинговые проекты.
- Нет данных о точности LLM-as-judge именно для художественного или игрового текста.
- По визуальной регрессии (сравнение скриншотов с эталоном) в контексте агентов выдача источников не дала.

---

## 5. MCP-серверы и коннекторы для разработки игр: что дают, что зрелое

### Takeaway
Официальная позиция: CLI-инструменты (`gh`, `sentry-cli` и т. п.) по контексту эффективнее MCP. MCP нужен, когда у сервиса нет CLI или нужен браузер или дизайн-инструмент. Определения MCP-инструментов теперь грузятся лениво, и цена простаивающих серверов стала низкой. Для браузерной игры реальную пользу дают браузерная автоматизация (Playwright или Chrome) и GitHub. Figma, Linear/Notion и Sentry полезны по ситуации.

### Cited Findings
- «CLI tools are the most context-efficient way to interact with external services. If you use GitHub, install the gh CLI.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- «Prefer CLI tools when available… more context-efficient than MCP servers because they don't add any per-tool listing.» Неиспользуемые серверы советуют отключать. — [Manage costs](https://code.claude.com/docs/en/costs)
- MCP-инструменты по умолчанию отложены (tool search): при старте только имена и инструкции сервера. — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- MCP даёт: брать задачи из трекера, обращаться к базам данных, анализировать мониторинг, интегрировать дизайн из Figma. Пример подключения: `claude mcp add --transport http notion https://mcp.notion.com/mcp`. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Связка «Skill + MCP»: MCP даёт соединение, скилл учит им пользоваться (схема, шаблоны). — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- Браузер (Puppeteer или Playwright MCP) дал самый заметный прирост качества самопроверки в харнесе Anthropic. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Playwright: CLI против MCP — см. п. 4. MCP удобнее в песочнице без shell. — [Better Stack](https://betterstack.com/community/guides/ai/playwright-cli-vs-mcp-browser/) **[вторичный]**
- В Anthropic маркетинг сделал Figma-плагин на 100 вариантов рекламы за пакет. Дизайнеры используют скриншоты для итераций. — [How Anthropic teams use Claude Code](https://claude.com/resources/articles/how-anthropic-teams-use-claude-code)
- Специализированный MCP для плейтеста — `playtest-mcp` из playtest-agent: `run_playtest`, `play_step`, `play_view`. — [playtest-agent](https://github.com/kevinnie2003/playtest-agent) **[анекдот]**

### Inferences
- Для dynasty-sim (браузер, DOM без фреймворка, текстовая игра) приоритеты такие:
  1. **Браузер**: Playwright, через CLI или MCP, или встроенный `/verify` / Claude in Chrome — для UI-смоука и скриншотов в PR.
  2. **GitHub**: `gh` уже используется.
  3. Генерация изображений и Figma — только если появится визуальная часть. Портреты уже процедурные (`looks/`), так что ценность низкая.
  4. Sentry и аналитика — только после выхода к игрокам.
- В облачной среде этого проекта (по инструкциям сессии) уже подключены GitHub, Figma и Gmail MCP. Figma в этой сессии не подключился (ошибка прокси). Сам проект от них не зависит.

### Gaps
- Не нашёл независимых оценок зрелости MCP для Linear, Notion, Sentry, генерации изображений именно в геймдеве. Есть только упоминания в документации.
- Не проверял актуальные MCP для ассетов (Aseprite, Blender и т. п.). Для текстовой игры в браузере это, вероятно, нерелевантно.

---

## 6. Как владельцу-непрограммисту получать лучший результат: играбельные сборки, брифы, референсы, журнал решений, ограничение WIP, борьба с дрейфом «vibe coding»

### Takeaway
Владелец-непрограммист проверяет не код, а **доказательства**: играбельную сборку, скриншоты, хронику прогона, таблицу метрик. Лучше всего работают:
- интервью-бриф, после которого Claude сам пишет спеку;
- маленькие проверяемые шаги;
- требование «покажи доказательство, а не утверждай»;
- ограничение числа параллельных потоков скоростью, с которой владелец успевает принимать результат.

### Cited Findings
- «Have Claude show evidence rather than asserting success: the test output, the command it ran and what it returned, or a screenshot of the result. Reviewing evidence is faster than re-running the verification yourself, and it works for sessions you weren't watching.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- Бриф через интервью: «Interview me in detail using the AskUserQuestion tool… dig into the hard parts I might not have considered… then write a complete spec to SPEC.md». — [Best practices](https://code.claude.com/docs/en/best-practices)
- Конкретные указания вместо расплывчатых: ссылка на образец («look at how existing widgets are implemented… follow the pattern»), симптом, место, что значит «исправлено». Расплывчатый промпт полезен только для исследования. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Нетехнические команды Anthropic:
  - юристы делали прототипы телефонного дерева;
  - финансисты описывали процессы обычным текстом в файлах и отдавали их Claude Code;
  - дизайнеры заранее проговаривали состояния ошибок и логику;
  - если первый промпт не сработал, «make slight tweaks and try again».

  — [How Anthropic teams use Claude Code](https://claude.com/resources/articles/how-anthropic-teams-use-claude-code)
- Узкое место параллельной работы — ревью результатов. — [Simon Willison](https://simonwillison.net/2025/Oct/5/parallel-coding-agents/)
- Ощущение ускорения бывает обманчивым: в РКИ METR разработчики считали, что ускорились, а измеренно замедлились. — [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) **[не перепроверено]**
- «If you can't verify it, don't ship it» (о разрыве «доверяй, потом проверяй»). — [Best practices](https://code.claude.com/docs/en/best-practices)
- Нетехнические пользователи и Anthropic с их кейсом: «agentic coding… dissolving the boundary between technical and non-technical work». Успешные команды относятся к Claude Code как к партнёру по размышлению, а не генератору кода. — [How Anthropic teams use Claude Code](https://claude.com/resources/articles/how-anthropic-teams-use-claude-code) **[маркетинговая статья компании]**

### Inferences
- **dynasty-sim здесь уже силён.** Соавторство с правом возражать, вопросы с вариантами и «(Recommended)», IDEAS.md отдельно от решений, короткие отчёты Тиму, `/run-sim` со сводкой по-русски — всё это совпадает с «проверяй доказательства» и «интервью перед спекой».
- **Чего не хватает владельцу-непрограммисту:**
  1. **Играбельной сборки на каждый PR.** Preview-деплой (например, GitHub Pages или артефакт `dist/` с прямой ссылкой) и 2–3 скриншота или GIF в описании PR. Сейчас Тим принимает работу по описаниям и хронике, а UI видит только локально.
  2. **Короткого «что посмотреть руками»** в каждом PR: 3 шага плейтеста под эту фичу.
  3. **Ограничения WIP по пропускной способности Тима, а не по числу модулей.** Параллельные сессии полезны, когда Тиму нечего принимать. Если у Тима очередь из непросмотренных результатов, третья сессия только растит очередь.
  4. **Референсов и «мудборда» для текста событий**: 5–10 образцовых событий и строк хроники, которые Тим считает эталоном. Это материал и для content-writer, и для калибровки LLM-судьи.

### Gaps
- Нет систематических исследований про владельцев-непрограммистов, ведущих долгие проекты с агентами. Всё найденное — кейсы или анекдоты.
- Пост Willison «Vibe engineering» (октябрь 2025) со списком практик (тесты, планирование, документация, preview-окружения, ручной QA) не открыт в этой сессии. Использовать только после проверки.

---

## 7. Известные ловушки долгих проектов: потеря контекста между сессиями, разбухание документации и правил, подгонка тестов агентами, переусложнение, конфликты параллельных агентов

### Takeaway
Типичные провалы долгих проектов:
- память между сессиями держится только на файлах;
- правила разрастаются и начинают противоречить друг другу;
- агент объявляет победу раньше времени или подгоняет тесты;
- ревьюер толкает к переусложнению;
- параллельные писатели в общих файлах конфликтуют.

Противоядия: короткий всегда-включённый слой, машинные гейты вместо текста, одна задача на сессию, явные доказательства, владение файлами, периодический аудит инструкций.

### Cited Findings
- **Потеря контекста.** «each new session begins with no memory of what came before». Компакции мало; нужны progress-файл, git-история и init-скрипт. — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Ориентация в новом контейнере.** Агенты C-компилятора вели README и progress-файлы, потому что каждый стартовал без контекста. — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler)
- **Разбухание правил.** «The over-specified CLAUDE.md… Claude ignores half of it… Fix: Ruthlessly prune. If Claude already does something correctly without the instruction, delete it or convert it to a hook.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- **Противоречия.** Противоречащие инструкции → произвольный выбор. Для поиска — `/doctor prompt-audit`. — [Memory](https://code.claude.com/docs/en/memory)
- **Ранняя победа.** «Declaring victory too early», «marking features done prematurely». — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). Когда тесты проходят, легко «assume the job is done», и это «rarely the case». — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler)
- **Подгонка тестов.** См. п. 4: EvilGenie, ImpossibleBench, issue #7074. — [EvilGenie](https://arxiv.org/abs/2511.21654); [ImpossibleBench](https://www.greaterwrong.com/posts/qJYMbrabcQqCZ7iqm/impossiblebench-measuring-reward-hacking-in-llm-coding-1)
- **Переусложнение от ревьюера.** «Chasing every finding leads to over-engineering: extra abstraction layers, defensive code, and tests for cases that can't happen.» — [Best practices](https://code.claude.com/docs/en/best-practices)
- **Конфликты параллельных агентов.** Общие файлы → перезапись; лечится владением файлами. — [Agent teams](https://code.claude.com/docs/en/agent-teams). Частые конфликты в C-компиляторе разрешались, но на одной большой задаче агенты затирали друг друга. — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler)
- **Засорение контекста выводом.** Тысячи байт логов вредят; выход — файлы, ERROR-метки, агрегаты. — [Building a C compiler](https://www.anthropic.com/engineering/building-c-compiler). Ещё одно средство — хуки-фильтры вывода тестов. — [Manage costs](https://code.claude.com/docs/en/costs)
- **Долгие «кухонные» сессии.** Рост стоимости долгих сессий связан с длинным контекстом и промахами кеша; `/clear` бесплатен, `/compact` сам по себе — большой запрос. — [Manage costs](https://code.claude.com/docs/en/costs)
- **Тяжесть SDD-процесса.** «Too much process» для мелких задач. — [wavect](https://wavect.io/blog/github-spec-kit-production-guide/) **[вторичный]**

### Inferences
- **Совпадения с советами.** STATUS.md — это «progress-файл» из харнеса. Одна задача на тред — «одна фича за сессию». Владение файлами и запрет правок сборочных файлов в волнах — защита от конфликтов. Тест архитектуры — правило-механизм.
- **Слабые места:**
  - разбухание и противоречия в сотнях записей DECISIONS (около 260 номеров, нумерация до D-399) (п. 8);
  - общие доки как постоянный источник конфликтов параллельных PR: правило само предписывает их сводить;
  - нет механической защиты от правки тестов и коридоров.

### Gaps
- Количественных данных о том, как часто долгие проекты деградируют из-за разбухших правил, нет. Только качественные предупреждения в документации.

---

## 8. Что dynasty-sim, вероятно, делает с избытком и чего не хватает (сопоставление с найденным)

### Takeaway
Механика проверки качества в dynasty-sim на уровне или выше лучших практик: детерминизм, инварианты, коридоры, боты, replay, тест архитектуры, независимый ревьюер. Избыточно — объём всегда-включённых инструкций и процессная надстройка над каждой задачей (документы, роли, Opus-ревью). Не хватает:
- хуков (их нет совсем);
- браузерной и визуальной проверки;
- LLM-оценки качества текста;
- играбельных превью для Тима;
- механической защиты тестов и гейтов;
- сжатого «действующего» слоя DECISIONS.

### Cited Findings
- Лимит и состав CLAUDE.md: меньше 200 строк; «File-by-file descriptions of the codebase» — в списке «не включать». — [Best practices](https://code.claude.com/docs/en/best-practices); [Memory](https://code.claude.com/docs/en/memory)
- `.claude/rules/` без `paths:` грузятся всегда. Скиллы грузятся по требованию, `disable-model-invocation` — для действий с побочными эффектами. — [Memory](https://code.claude.com/docs/en/memory); [Best practices](https://code.claude.com/docs/en/best-practices)
- Субагенты получают CLAUDE.md при старте; отключается это через `omitClaudeMd`. — [Extend Claude Code](https://code.claude.com/docs/en/features-overview)
- Хуки — для того, что «must happen every time with zero exceptions»; Stop hook — гейт окончания хода. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Ревьюер, который всегда что-то находит, ведёт к переусложнению. — [Best practices](https://code.claude.com/docs/en/best-practices)
- Opus — для архитектуры, Sonnet — для большинства задач, Haiku — для простых субагентов. — [Manage costs](https://code.claude.com/docs/en/costs)
- Браузерная проверка «dramatically improved performance». — [Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- LLM-судья по рубрике, калибровка по людям, 20–50 случаев из реальных провалов. — [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Inferences
**Вероятно, с избытком (overdoing):**
1. **Всегда-включённый слой около 39 КБ** (CLAUDE.md 26,7 КБ + workflow.md 12 КБ), и он же копируется в контекст каждого субагента, включая scout на Haiku.
   - Блок «Структура» — около 60 строк пофайлового описания модулей. Это прямо названный анти-паттерн, Claude находит это чтением кода.
   - Разделы «Контент» и «Тесты» можно вынести в правила с `paths: content/**` и `paths: tests/**`.
   - «Координацию» (нужна только ведущей сессии) — в скилл вроде `/start-wave`.
   - «Соавторство» для субагентов архитектуры и реализации, вероятно, лишнее.
   - Проверка: `/context` и `/doctor` / `/doctor prompt-audit`.
2. **DECISIONS.md: 2 359 строк, около 260 уникальных номеров (нумерация до D-399).** Правило «прочитай относящиеся записи» дорого и рискует противоречиями между старыми и новыми записями. Лучше:
   - файл «действующие решения» (сжатая сводка, без отменённых);
   - явная пометка superseded;
   - архив истории отдельно.

   Самые важные решения — превращать в тесты или хуки, как уже сделано с тестом архитектуры.
3. **Процессная надстройка над каждой задачей**: отдельная облачная сессия, PR, Opus-reviewer, CI, правка 4 документов (CHANGELOG, STATUS, ROADMAP, DECISIONS). Для мелких задач это совпадает с критикой SDD «too much process». Общие доки — источник конфликтов при 3 параллельных PR. Возможное упрощение:
   - уровни задач (мелкие — встроенный `/code-review` вместо Opus-ревьюера);
   - CHANGELOG собирается из заголовков PR;
   - STATUS обновляет только ведущая сессия волны.
4. **implementer-субагент на Sonnet** при треде на Sonnet. Лишняя передача контекста («испорченный телефон») без выигрыша в модели или изоляции. Реализация в главном треде проще, а субагентов лучше оставить для разведки, прогонов и ревью.
5. **Протокол «второе мнение architect, при возражении — новый architect»** — дорогой Opus-цикл. Оправдан только для действительно принятых решений; критерий «меняет запись DECISIONS» при сотнях записей срабатывает часто.

**Вероятно, не хватает (missing):**
1. **Хуки** — файла `.claude/settings.json` нет.
   - `SessionStart` для облачных сессий: `npm ci`; в окружении есть скилл session-start-hook.
   - `PreToolUse`: блокировать правку сборочных файлов (`game.ts`, `state.ts`, `effects.ts`…) вне задач `[x.1a]`. Сейчас это держится на тексте и частично на тесте архитектуры. Также помечать или блокировать правки `tools/metrics-gates.ts` и `tests/fixtures/bad/` без явного разрешения.
   - `PostToolUse` после правки `.ts`: быстрый typecheck затронутого.
   - `Stop`: не завершать ход с красным `npm run check` в задачах с кодом.
2. **`disable-model-invocation: true` у `finish-task`.** Скилл открывает PR и мержит: официально такие запускаются только явно.
3. **Браузерная проверка UI.** Playwright-смоук в CI (открыть игру, пройти N ходов, проверить отсутствие ошибок в консоли, сохранить скриншоты как артефакт) и скриншоты в PR для Тима.
4. **LLM-судья для текста** событий и хроники. Рубрика по измерениям, калибровка по оценкам Тима, выход «Unknown». Режим «только отчёт», как сейчас работа `bots`.
5. **Игровые оракулы в отчёте ботов**: soft lock, повторы, «мёртвые» и «доминирующие» варианты (частично уже есть), плюс короткий LLM-триаж «что было скучно или непонятно» по журналу партии.
6. **Играбельное превью на каждый PR и блок «что проверить руками» (3 шага)** — главный канал приёмки для владельца-непрограммиста.
7. **Машиночитаемый статус задач и последний критерий-проверка.** В ROADMAP у задачи — команда e2e-проверки; статус — в JSON или в таблице, которую проверяет скрипт. По опыту харнеса Anthropic JSON агенты портят реже.
8. **Периодический аудит инструкций** (`/doctor prompt-audit`) и чистка: CLAUDE.md, workflow.md, агенты и скиллы — на противоречия и устаревшие ссылки, например раз в этап.
9. **Указание ревьюеру отмечать только корректность и критерии задачи**, остальное — как необязательное. Это против переусложнения, о котором предупреждает документация.

### Gaps
- Не измерял фактический размер всегда-включённого слоя в токенах (`/context` в этой сессии не запускался). Оценка в КБ приблизительная.
- Не читал целиком агентов, скиллы и DECISIONS, поэтому выводы про противоречия — гипотеза, которую нужно проверить аудитом.
- Не знаю реальной стоимости одной волны (3 сессии + Opus-ревью) у проекта: в репозитории нет данных об использовании.

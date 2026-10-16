# Формат события (storylet)

Контракт для задач этапа 3 (план 3.0, D-161) и справочник для content-writer и Тима. Источник — GDD §9, §14 и D-040…D-047; черновые примеры — `docs/samples/storylets.yaml`. Номера задач в скобках — кто реализует поле.

Контракт общий для параллельных задач. Правит его ведущая сессия этапа; 3.2 дополняет справочник тем, что уточнил движок. Задача, которой контракт не подходит, не меняет его молча: пишет в своём PR, ведущая сессия решает и правит этот файл для всех.

Черновик `docs/samples/storylets.yaml` (D-040) превращается в такие имена полей. Всё, что ниже, — надмножество нынешней схемы: старые 13 событий валидны без правок, пока их не переведёт 3.12. Целые дроби пишутся строкой `"1/2"` или целым `3`.

```yaml
grammar:                         # ключ content/grammar.yaml (3.4): общие символы
  dawn: ["at first light", "in the grey before dawn"]
  weather:
    - { text: "in driving snow", when: { season: [winter] } }
    - "in a cold rain"

events:
  - id: escort_ambush
    severity: heavy              # light | medium | heavy; по умолчанию light (3.2, рассказчик 3.7)
    weight: 10
    who: hero                    # hero | npc | both; по умолчанию hero (D-047; npc — 3.9)
    deck: main                   # main | backstory (3.11); по умолчанию main
    # stage: childhood           # только для deck: backstory (3.11)
    # followup_only: true        # только через schedule/story (3.8)
    # story: duel_with_accuser   # событие истории: возможно при открытой истории и закрывает её (3.8)
    # once: life                 # life | game (3.7);  cooldown_days: 730
    # tags: [way_up]             # (3.7)
    actions: [serve_contract]    # как сейчас
    when: { fit: true }          # условия на главного участника (и общие: season…)
    weight_mods:
      - { when: { season: [winter] }, factor: "1/2" }
      - { role: coward, when: { traits_any: [craven] }, factor: 2 }   # «хоть один кандидат роли подходит»
    roles:                       # в порядке объявления; where видит hero, protagonist и роли выше (3.3)
      employer: { pick: circle, where: { occupation: [merchant] } }
      coward:
        pick: circle             # circle | known | close | relation (+ kind) | given
        where: { occupation: [mercenary, soldier], traits_none: [brave] }
        prefer:
          - { when: { traits_any: [craven] }, factor: 5 }
          - { when: { opinion: { toward: hero, max: -10 } }, factor: 2 }
      second: { pick: relation, kind: friend, optional: true }
    text: "<Ambush_opening> Out of the corner of your eye you see {coward} drop {coward.his} musket and run."
    grammar:                     # свои символы события (3.4)
      ambush_opening: ["shots crack from the treeline <weather>.", "men rise from the ditch."]
    options:
      - text: Stand and hold the wagons
        check: { stat: prowess, difficulty: 10, bonus: [{ when: { traits_any: [duelist] }, add: 3 }] }
        # встречная: check: { stat: diplomacy, against: { role: accuser, stat: intrigue } }
        success:
          effects: { wound: light_wound }                      # на главного участника
          on: { employer: { opinion: [{ toward: hero, reason: favour }] } }   # на роли
          next: thorne_shamed
        failure:
          effects: { wound: severe_wound, money: -15 }
          result: "{name} was badly wounded in a bandit ambush while guarding {employer}'s wine."
          chronicle: true
          next: thorne_shamed
        ai: { base: 10, traits: { brave: 10, craven: -8 } }    # выбор человека мира (3.9)
      - text: Run with {coward}
        when: { traits_none: [brave] }                         # иначе серым с причиной (D-043)
        effects: { traits: { add: [craven_rep] } }
        on: { employer: { opinion: [{ toward: hero, reason: wronged }] } }
        result: "{name} fled a bandit ambush while guarding {employer}'s wine."
        chronicle: true
    pages:
      thorne_shamed:
        text: "In the yard of the inn, {coward} is already telling the carters how bravely {coward.he} fought."
        options:
          - text: Name {coward} a coward and a liar, before everyone
            on:
              coward:
                traits: { add: [craven_rep] }
                opinion: [{ toward: hero, reason: insulted_in_public }]
                relation: [{ start: rival, with: hero }]        # → авто-▸
            result: "{name} publicly named {coward} a coward and a liar."
            chronicle: true
          - text: Say nothing
            on: { coward: { secret: { kind: fled_ambush, known_by: [hero] } } }
            result: "{name} kept quiet about {coward}."
```

Правила:
- **Исход** — `effects`, `on`, `result`, `chronicle`, `mark`, `next`, `mood` (настроение, D-177). Вариант без `check` держит поля исхода сам; с `check` — в `success` и `failure`. `result` обязателен у исхода без `next` в событиях героя; строки страниц склеиваются в одну запись.
- **Эффекты блока** применяются к персонажу блока: `effects` — к главному участнику, `on.<роль>` — к роли. Ключи, которым нужен второй человек, называют его ролью: `opinion: [{toward}]` — мнение персонажа блока о роли; `relation: [{start|end, with}]`; `secret.known_by`, `reveal.to`; `schedule.roles`. Новые ключи этапа: `stats`, `fame`, `kill` (3.5); `opinion`, `opinion_end`, `relation`, `secret`, `reveal`, `introduce` (3.6); `schedule`, `story` (3.8); `age_years` (3.11, только `deck: backstory`).
- **Условия** — тот же язык `when` (D-054), проверяется для персонажа: `when` события — главный участник, `where` роли — кандидат, `when` варианта — главный участник. Новые ключи: `traits_any`, `traits_none`, `stats`, `fame_min`, `conditions_any`, `conditions_none` (3.5); `money_max` (3.1); `opinion`, `relation`, `relation_none`, `acquainted` (3.6); `occupation` (3.3). Ключи, видящие скрытое (тайные черты, мнение незнакомца, тайны), дают скрытую причину: вариант не показывается.
- **Встроенные роли**: `hero` — текущий герой, есть в области любого события (в событиях людей мира — только для условий и `opinion`/`opinion_end`, D-174), `protagonist` (главный участник; в событии героя — герой). Человек — не больше одной роли. Роли — только из окружения героя (D-056).
- **Тексты**: `text`, `options[].text` — игроку, во втором лице («you»); `result` — строка хроники в третьем лице, начинается с `{name}` (подлежащее; в своём разделе снимается, D-162). Грамматика — `<symbol>`, `<Symbol>` с заглавной.
- **Извещение** — событие без `options`: поля исхода (`effects`, `on`, `result`, `chronicle`) на уровне события.
- **Смерть от события** (D-164): эффект `kill: <cause>` у героя допустим только в исходе `failure` события `severity: heavy` без `next` — игрок видит шанс словами до выбора (решение Тима). Правило действует на любой путь к герою: `effects` события героя, `on: {hero: …}`, `later` внутри исхода, события `who: both` (там эффекты на героя применяются, только когда главный участник — герой; в `who: npc` эффекты на героя запрещены совсем — D-174). У людей мира в событиях `who: npc` — в любом исходе. В сценах `deck: backstory` `kill` запрещён: у сцен нет действия, и смерть исполнилась бы только после выбора первого действия. Валидатор проверяет.
- **Строка в своём разделе** (D-162): в разделе своего главы и на его странице «{name} » и «{name} was » в начале строки снимаются: «{name} was badly wounded…» читается как «Badly wounded…», «{name} bought…» — как «Bought…». Поэтому `result` всегда начинается с `{name}`.
- **▸** ставится сам у выбора героя с `relation`, `schedule`, `story` в любом блоке исхода (список растёт с этапами 4–6), и вручную — `mark: true`.

## Что уточнил движок (3.2)

Справочник по тому, как движок читает формат. Решения — D-180…D-186.

**Сцены.** Событие и каждая страница из `pages` — сцена: `text` и либо `options`, либо (извещение) поля исхода на самой сцене. У сцены с `options` полей исхода на уровне сцены нет — они у вариантов. Страница без `options` показывается с одной кнопкой «Continue», её исход применяется по нажатию.

**Варианты.**
- Вариант без `check` держит поля исхода сам; с `check` — только в `success` и `failure`, оба обязательны.
- `when` варианта проверяется по главному участнику: не выполнено — вариант серый с причиной из контента; причина скрытая (тайна, чужое мнение) — вариант не показывается. Номер варианта в команде `choose` — его место в списке `options`, скрытые варианты номера не сдвигают.
- В каждой сцене с `options` хотя бы один вариант без `when` (иначе ошибка валидатора).
- `ai` хранится для выбора людей мира (3.9).

**Проверка** (`check`, D-042): `stat` главного участника против `difficulty` или против `against: {role, stat}` — ровно одно из двух. Шанс = 50 + 5 × (характеристика + надбавки − сложность), в пределах 5–95%. Характеристика — сегодняшняя (черты, образование, возраст, здоровье). `bonus: [{when, add}]` — надбавки главному участнику, если он подходит под `when`. Роль встречной проверки не может быть `optional`. `of: <роль>` — проверяется характеристика человека этой роли, и надбавки смотрят на него (лекарь: `check: { stat: learning, of: physician, difficulty: 10 }`); роль известна событию и не `optional` (D-193). Игрок видит шанс полосой: до 15% — hopeless, до 40% — risky, до 60% — even, до 85% — likely, выше — certain (слова — интерфейс 3.10), процент — по наведению.

**Исход.**
- `effects` — на главного участника, `on.<роль>` — на роль; пустая необязательная роль пропускается молча.
- `next` — страница того же события; без `next` событие кончается. Страницы не образуют циклов, каждая достижима (валидатор).
- `result` обязателен у исхода без `next` в событиях `who: hero|both`; на промежуточных страницах — по желанию. Строки всех выбранных исходов склеиваются через пробел в одну запись `kind: event` в момент конца события; имена и суммы фиксируются в момент выбора.
- Уровень записи: хроника, если на пути был `chronicle: true` или ▸, или изменение денег главного участника за всё событие крупное (D-130); иначе журнал.
- ▸ ставится сам, если вариант, выбранный героем, имеет в любом блоке (`effects`, `on.*`, вложенный `later`) ключ `relation`, `schedule` или `story`; вручную — `mark: true` у любого исхода.

**Извещение** — событие без `options`; запись `kind: notice` у него, только если в событии нет и страниц (выбор на странице делает запись `event`). С `chronicle: true` (или `mark: true`) оно останавливает время: игрок видит текст и «Continue», исход применяется по нажатию, запись `kind: notice` в хронику. Без них исход применяется сразу в момент срабатывания, запись `kind: notice` — в журнал, время идёт дальше. Извещение с `next` всегда ждёт игрока: показ текста, «Continue», затем страница.

**Вес** (`eventWeight`): привязка к действию → `when` события по главному участнику → заполнимость ролей → множители `weight_mods`. У множителя всегда есть `when`; с `role` он срабатывает, если хоть один кандидат роли (по её `pick` и `where`) подходит под `when`. Все сработавшие дроби перемножаются, округление вниз — один раз в конце: 5 × ½ × 3 = 7. Итог 0 — событие невозможно. `when` события и множителей видит только `hero` и `protagonist`: роли подбираются позже (валидатор).

**Участники.** При срабатывании события героя все люди из ролей становятся знакомыми героя (`introduce`, уровень known). Номер события (`seq`) выдаётся при срабатывании и хранится до конца: тексты всех страниц одного события читаются одинаково после сохранения.

**Поля, которые движок только хранит:** `severity` (по умолчанию light), `who`, `deck`, `stage`, `followup_only`, `story`, `once`, `cooldown_days`, `tags`, `ai`. Их смысл — у рассказчика (3.7), историй (3.8), людей мира (3.9) и предыстории (3.11). Своя `grammar` события идёт в показ текстов (3.4); формулировка символа выбирается отдельно для каждого места текста, поэтому символ, который должен совпасть в сцене и в строке хроники, в двух местах не повторяют.

## Уточнения волны 3 (3.5, 3.6, ведущая сессия)

- **Персонаж и здоровье** (3.5, D-210…D-212): условия `traits_any`, `traits_none`, `stats`, `fame_min`, `conditions_any`, `conditions_none`; эффекты `stats`, `fame`, `kill`. Где `kill` героя допустим — D-212: только `failure` варианта с `check` события `severity: heavy`, исход без `next`, так же внутри `later`; в действиях `kill` запрещён.
- **Мнения и связи** (3.6, D-220): условия `opinion {toward, min?, max?}`, `relation {kind, with}`, `relation_none`, `acquainted known|close`; эффекты `opinion`, `opinion_end`, `relation`, `secret`, `reveal`, `introduce` — порядок применения и смысл в D-220.
- **Пустая роль** (D-221): эффект, называющий незаполненную необязательную роль, пропускается; условие, называющее её, не выполнено, причина скрыта.
- **`opinion_end`** (D-225): `reason` — id причины или имя `until` удерживаемой причины («долг возвращён» снимает все такие).
- **`relation`**: `reason` пишется только с `end` (причина конца связи, по умолчанию `event`).
- **События людей мира не меняют героя** (D-174). Эффекты на героя: `on.hero`, `relation … with: hero`, `hero` в `secret.known_by`, `reveal.to`, `schedule.roles`, `introduce` — и во вложенном `later`. В `who: npc` они запрещены (можно `opinion`/`opinion_end` с `toward: hero` — чувства самого человека мира — и любые условия на героя). В `who: both` они применяются, только когда главный участник — герой, иначе пропускаются. Что меняет героя по инициативе человека мира — событие героя, где человек мира — роль.
- **Порядок строк** (D-176, с 3.9): строки, которые пишут эффекты исхода (связь героя, смена черты), идут в хронике после строки события.
- **Слова шанса** (D-175): в контенте их нет — интерфейс показывает их по id полос.

## Настроение (3.1c, D-177)

- `mood` — необязательное поле у события и у страницы (настроение сцены, пока она на экране) и у исхода: у варианта без `check`, в `success` и `failure`, у извещения. Исход важнее сцены: показывает, чем кончилось. Без поля — `neutral`.
- Значения — список `narrator.moods` в `content/narrator.yaml`: `neutral`, `joy`, `triumph`, `threat`, `pain`, `loss`, `shame`, `anger`. Неизвестное настроение — ошибка валидатора; список обязан содержать `neutral`.
- На ход игры `mood` не влияет и в состоянии не хранится: его берёт портрет героя (D-300) из показанной сцены (`eventView.mood`) или исхода (`moodOf`).
- У сцены с вариантами `mood` — её собственное настроение, а не поле исхода; у варианта с `check` настроение пишется в `success`/`failure`.

## Истории с людьми (3.1d, D-178)

- Событие истории из колоды (`story: <id>`, без `followup_only`) получает людей истории — роли `pick: given`, переданные эффектом `story.roles`. Каждый эффект, открывающий историю, передаёт обязательные роли `given` её событий из колоды. Человек истории выбыл — такое событие не выпадает.

## Происхождение (3.1f, D-188)

- Сцена предыстории, у которой каждый вариант стоит только под `when: { offered: <вариант> }`, может не иметь варианта без `when`: её стадия предлагает варианты в каждой партии. У такой сцены должен быть вариант на каждый вариант предложения стадии.

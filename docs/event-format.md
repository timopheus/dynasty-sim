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
- **Исход** — `effects`, `on`, `result`, `chronicle`, `mark`, `next`. Вариант без `check` держит поля исхода сам; с `check` — в `success` и `failure`. `result` обязателен у исхода без `next` в событиях героя; строки страниц склеиваются в одну запись.
- **Эффекты блока** применяются к персонажу блока: `effects` — к главному участнику, `on.<роль>` — к роли. Ключи, которым нужен второй человек, называют его ролью: `opinion: [{toward}]` — мнение персонажа блока о роли; `relation: [{start|end, with}]`; `secret.known_by`, `reveal.to`; `schedule.roles`. Новые ключи этапа: `stats`, `fame`, `kill` (3.5); `opinion`, `opinion_end`, `relation`, `secret`, `reveal`, `introduce` (3.6); `schedule`, `story` (3.8); `age_years` (3.11, только `deck: backstory`).
- **Условия** — тот же язык `when` (D-054), проверяется для персонажа: `when` события — главный участник, `where` роли — кандидат, `when` варианта — главный участник. Новые ключи: `traits_any`, `traits_none`, `stats`, `fame_min`, `money_max`, `conditions_any`, `conditions_none` (3.5); `opinion`, `relation`, `relation_none`, `acquainted` (3.6); `occupation` (3.3). Ключи, видящие скрытое (тайные черты, мнение незнакомца, тайны), дают скрытую причину: вариант не показывается.
- **Встроенные роли**: `hero` (в событиях героя), `protagonist` (главный участник; в событии героя — герой). Человек — не больше одной роли. Роли — только из окружения героя (D-056).
- **Тексты**: `text`, `options[].text` — игроку, во втором лице («you»); `result` — строка хроники в третьем лице, начинается с `{name}` (подлежащее; в своём разделе снимается, D-162). Грамматика — `<symbol>`, `<Symbol>` с заглавной.
- **Извещение** — событие без `options`: поля исхода (`effects`, `on`, `result`, `chronicle`) на уровне события.
- **Смерть от события** (D-164): эффект `kill: <cause>` у героя допустим только в исходе `failure` события `severity: heavy` без `next` — игрок видит шанс словами до выбора (решение Тима). Правило действует на любой путь к герою: `effects` события героя, `on: {hero: …}`, `later` внутри исхода, события `who: both`. У людей мира в событиях `who: npc` — в любом исходе. Валидатор проверяет.
- **Строка в своём разделе** (D-162): в разделе своего главы и на его странице «{name} » и «{name} was » в начале строки снимаются: «{name} was badly wounded…» читается как «Badly wounded…», «{name} bought…» — как «Bought…». Поэтому `result` всегда начинается с `{name}`.
- **▸** ставится сам у выбора героя с `relation`, `schedule`, `story` в любом блоке исхода (список растёт с этапами 4–6), и вручную — `mark: true`.

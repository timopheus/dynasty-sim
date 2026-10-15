import { loadContent, type SourceFile } from '../../src/core/content/load';
import type { Content, Settings } from '../../src/core/content/schema';
import { readContentFiles } from '../../tools/content-files';

/** Small, stable content for tests that need exact numbers. */
export const BASE_FILES: SourceFile[] = [
  {
    path: 'fixture/base.yaml',
    text: `
settings:
  eventChancePer10k: 0
  minDaysBetweenEvents: 0
  eventRepeatCooldownDays: 0
  startAge: { min: 20, max: 20 }
  heirAge: { min: 18, max: 18 }
  startHealth: { min: 100, max: 100 }
  startMoney: 10
  texts:
    start: "{name} started at {age}."
    death: "{name} died at {age}."
    succession: "{name} succeeded at {age}."
names:
  given: [Anne]
  surnames: [Fixture]
actions:
  - id: wait
    name: Wait
    duration: { min: 30, max: 30 }
    effects: { money: 1 }
    text: "{name} waited."
  - id: rest
    name: Rest
    duration: { min: 5, max: 10 }
    text: "{name} rested."
events:
  - id: ping
    weight: 1
    text: "Ping for {name}."
    options:
      - text: Hurt
        result: "{name} got hurt."
        effects: { health: -200 }
      - text: Ignore
        result: "{name} ignored it."
`,
  },
];

export function loadOrThrow(files: SourceFile[]): Content {
  const result = loadContent(files);
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.file}: ${e.path}: ${e.message}`).join('\n'));
  return result.content;
}

export function fixtureContent(settings: Partial<Settings> = {}): Content {
  const content = loadOrThrow(BASE_FILES);
  return { ...content, settings: { ...content.settings, ...settings } };
}

export function realContent(): Content {
  return loadOrThrow(readContentFiles());
}

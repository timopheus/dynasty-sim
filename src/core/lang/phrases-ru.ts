/**
 * The Russian words the core makes itself (RU.1, D-476), keyed by the English text `phrase()` is called with. A test
 * checks that every `phrase(content, '…')` of `src/core` has its entry here. Etalon: docs/reference/russian-style.md.
 */
export const RU_CORE: Record<string, string> = {
  // pages
  "a small child": "маленький ребёнок",
  "about {age}": "около {age} лет",
  "b. {born}, aged {age}": "род. {born}, лет: {age}",
  "{born}–{died}, died aged {age}": "{born}–{died}, умер(ла) в {age}",
  "died {year}": "умер(ла) в {year}",
  "Their own temper and yours": "Нрав — его и твой",
  "The ties between you": "Связи между вами",
  "You are here.": "Ты здесь.",
  "{days} from where you are.": "{days} от тебя.",
  // house page
  "House {name}": "Род {name}",
};

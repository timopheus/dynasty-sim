import type { FaceSpec } from '../../core/looks';
import { currentLang, ruPlural } from '../i18n';

/** Words of the moods (D-177) as a face shows them. */
const EXPRESSIONS: Record<string, string> = {
  neutral: 'a calm face',
  joy: 'smiling',
  triumph: 'grinning to one side',
  threat: 'wary, eyes narrowed',
  pain: 'wincing in pain',
  loss: 'grieving, with tears',
  shame: 'eyes cast down in shame',
  anger: 'angry, teeth bared',
  dead: 'eyes closed in death',
};

const GREY = ['dark hair', 'greying hair', 'grey hair', 'white hair'];
const ATTIRE = ['in poor clothes', 'in plain clothes', 'in a good coat', 'in fine clothes'];

/** The same words in Russian (RU.1): nouns, so they need no agreement with the sex. */
const RU_WORDS = {
  expressions: {
    neutral: 'спокойное лицо',
    joy: 'улыбка',
    triumph: 'усмешка уголком рта',
    threat: 'настороженный прищур',
    pain: 'гримаса боли',
    loss: 'горе, слёзы',
    shame: 'глаза опущены от стыда',
    anger: 'гнев, оскаленные зубы',
    dead: 'глаза закрыты навеки',
  } as Record<string, string>,
  grey: ['тёмные волосы', 'волосы с проседью', 'седые волосы', 'белые волосы'],
  attire: ['бедная одежда', 'простая одежда', 'добротный кафтан', 'богатая одежда'],
};

function portraitTextRu(spec: FaceSpec): string {
  const who = spec.stage === 'child' ? (spec.sex === 'male' ? 'мальчика' : 'девочки') : spec.sex === 'male' ? 'мужчины' : 'женщины';
  const parts: string[] = [`Портрет ${who}, ${spec.age} ${ruPlural(spec.age, 'год', 'года', 'лет')}`];
  parts.push(spec.hair ? RU_WORDS.grey[spec.grey] ?? RU_WORDS.grey[0]! : 'лысина');
  if (spec.beard) parts.push(spec.beard.variant === 2 ? 'усы' : 'борода');
  if (spec.wrinkles && spec.wrinkles.level >= 2) parts.push('морщины');
  if (spec.scars.length > 0) parts.push(spec.scars.length > 1 ? 'два шрама' : 'шрам');
  if (spec.eyepatch) parts.push('повязка на глазу');
  if (spec.bandages.length > 0) parts.push('бинты');
  if (spec.illness > 0) parts.push(spec.illness > 1 ? 'тяжёлая болезнь' : 'нездоровый вид');
  parts.push(RU_WORDS.attire[spec.attire] ?? RU_WORDS.attire[1]!);
  if (spec.accessories.some((a) => a.slot === 'head')) parts.push('шляпа');
  parts.push(RU_WORDS.expressions[spec.expression] ?? RU_WORDS.expressions.neutral!);
  return parts.join(', ') + '.';
}

/**
 * The portrait in words for a screen reader (D-248): what the picture shows, in the same order a sighted player sees it.
 * The full description by `mood` and every detail is 4.16; this one names what the prototype draws.
 */
export function portraitText(spec: FaceSpec): string {
  if (currentLang() === 'ru') return portraitTextRu(spec);
  const who = spec.stage === 'child' ? (spec.sex === 'male' ? 'a boy' : 'a girl') : spec.sex === 'male' ? 'a man' : 'a woman';
  const parts: string[] = [`Portrait of ${who} of ${spec.age}`];
  parts.push(spec.hair ? GREY[spec.grey] ?? GREY[0]! : 'bald');
  if (spec.beard) parts.push(spec.beard.variant === 2 ? 'a moustache' : 'a beard');
  if (spec.wrinkles && spec.wrinkles.level >= 2) parts.push('a lined face');
  if (spec.scars.length > 0) parts.push(spec.scars.length > 1 ? 'two scars' : 'a scar');
  if (spec.eyepatch) parts.push('a patch over one eye');
  if (spec.bandages.length > 0) parts.push('bandaged');
  if (spec.illness > 0) parts.push(spec.illness > 1 ? 'gravely ill' : 'looking unwell');
  parts.push(ATTIRE[spec.attire] ?? ATTIRE[1]!);
  if (spec.accessories.some((a) => a.slot === 'head')) parts.push('a hat');
  parts.push(EXPRESSIONS[spec.expression] ?? EXPRESSIONS.neutral!);
  return parts.join(', ') + '.';
}

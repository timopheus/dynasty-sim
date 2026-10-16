import { z } from 'zod';
import { WhenSchema } from '../condition-keys';
import type { CrossCheck } from '../content/schema';
import { Id, Text } from '../content/types';

/** One wording of a grammar symbol: a text, or a text with conditions on the main participant and roles (3.4). */
export const WordingSchema = z.union([Text, z.strictObject({ text: Text, when: WhenSchema })]);

/**
 * Top-level content key `grammar` (`content/grammar.yaml`, D-046, D-163): symbol -> wordings. A text uses a symbol
 * as `<symbol>`, with a capital first letter as `<Symbol>`. Events may have their own `grammar` of the same form.
 */
export const GrammarSchema = z.record(Id, z.array(WordingSchema).min(1));

export type GrammarDef = z.infer<typeof GrammarSchema>;

/** Cross-check of the grammar (3.4: undefined symbols, cycles). Empty in 3.1. */
export const checkGrammar: CrossCheck = () => [];

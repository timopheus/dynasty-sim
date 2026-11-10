/**
 * Validates all content against the schema.
 * Usage: npm run validate
 */
import { loadContent } from '../src/core/content/load';
import { readContentFiles } from './content-files';

const files = readContentFiles();
const result = loadContent(files);

if (!result.ok) {
  console.error(`Content is invalid: ${result.errors.length} error(s)\n`);
  for (const e of result.errors) console.error(`  ${e.file}: ${e.path}: ${e.message}`);
  process.exit(1);
}

const { content } = result;
console.log(
  `Content OK: ${files.length} files, ${content.actions.length} actions, ` +
    `${content.events.length} events, ${content.names.given.male.length + content.names.given.female.length} given names, ` +
    `${content.names.surnames.length} surnames.`,
);

// the second language (RU.1, D-476): every text of the content has its Russian translation, and the translations fit
const ru = loadContent([...files, ...readContentFiles('lang/ru')]);
if (!ru.ok) {
  console.error(`Russian is invalid or incomplete: ${ru.errors.length} error(s)\n`);
  for (const e of ru.errors.slice(0, 50)) console.error(`  ${e.file}: ${e.path}: ${e.message}`);
  process.exit(1);
}
console.log(`Russian OK: ${ru.content.translations.length} translations, ${ru.content.declensions.length} declensions.`);

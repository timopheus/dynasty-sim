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

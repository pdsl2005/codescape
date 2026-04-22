import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirmed = args.includes('--yes');
const targetDir = args.find(a => !a.startsWith('--')) ?? process.cwd();

const toDelete: string[] = [];

const codescapesDir = path.join(targetDir, '.codescapes');
if (fs.existsSync(codescapesDir)) { toDelete.push(codescapesDir); }

// Backwards compat: old root-level export from before .codescapes/ migration
const rootExport = path.join(targetDir, 'codescape-output.json');
if (fs.existsSync(rootExport)) { toDelete.push(rootExport); }

if (toDelete.length === 0) {
  console.log('Nothing to reset.');
  process.exit(0);
}

console.log(`Items that would be deleted (${toDelete.length}):`);
for (const item of toDelete) { console.log(`  ${item}`); }

if (dryRun || !confirmed) {
  console.log('\nDry run — nothing deleted. Pass --yes to confirm.');
  process.exit(0);
}

for (const item of toDelete) {
  fs.rmSync(item, { recursive: true, force: true });
  console.log(`Deleted: ${item}`);
}
console.log(`\nReset complete — ${toDelete.length} item(s) removed.`);

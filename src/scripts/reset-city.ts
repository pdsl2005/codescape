import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'build']);

function walk(dir: string, collect: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), collect);
      }
    } else if (entry.name.endsWith('.json')) {
      collect.push(path.join(dir, entry.name));
    }
  }
}

function isParserExport(jsonPath: string): boolean {
  const { dir, name } = path.parse(jsonPath);
  return (
    fs.existsSync(path.join(dir, `${name}.java`)) ||
    fs.existsSync(path.join(dir, `${name}.py`))
  );
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirmed = args.includes('--yes');
const targetDir = args.find(a => !a.startsWith('--')) ?? process.cwd();

const candidates: string[] = [];
walk(targetDir, candidates);

const rootExport = path.join(targetDir, 'codescape-output.json');
if (fs.existsSync(rootExport) && !candidates.includes(rootExport)) {
  candidates.push(rootExport);
}

const toDelete = candidates.filter(
  file => path.basename(file) === 'codescape-output.json' || isParserExport(file)
);

if (toDelete.length === 0) {
  console.log('Nothing to reset.');
  process.exit(0);
}

console.log(`Files that would be deleted (${toDelete.length}):`);
for (const file of toDelete) {
  console.log(`  ${file}`);
}

if (dryRun || !confirmed) {
  console.log('\nDry run — no files deleted. Pass --yes to confirm deletion.');
  process.exit(0);
}

for (const file of toDelete) {
  fs.rmSync(file);
  console.log(`Deleted: ${file}`);
}

console.log(`\nReset complete — ${toDelete.length} file(s) removed.`);

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

const targetDir = process.argv[2] ?? process.cwd();
const candidates: string[] = [];
walk(targetDir, candidates);

const rootExport = path.join(targetDir, 'codescape-output.json');
if (fs.existsSync(rootExport) && !candidates.includes(rootExport)) {
  candidates.push(rootExport);
}

let deleted = 0;
for (const file of candidates) {
  if (path.basename(file) === 'codescape-output.json' || isParserExport(file)) {
    fs.rmSync(file);
    console.log(`Deleted: ${file}`);
    deleted++;
  }
}

console.log(`\nReset complete — ${deleted} file(s) removed.`);

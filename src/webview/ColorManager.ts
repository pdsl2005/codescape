const STORAGE_KEY = 'codescape:buildingColors';

const COLOR_PALETTE = [
  "#598BAF", "#8B5CF6", "#10B981", "#F59E0B",
  "#EF4444", "#14B8A6", "#6366F1", "#EC4899",
];

function pickBaseColor(type?: string): string {
  if (type === 'interface') { return '#8B5CF6'; }
  if (type === 'abstract')  { return '#F59E0B'; }
  if (type === 'module')    { return '#14B8A6'; }
  if (type === 'enum')      { return '#A855F7'; }
  return '#598BAF';
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export class ColorManager {
  private colorMap: Record<string, string> = {};

  constructor() { this.load(); }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { this.colorMap = JSON.parse(stored); }
    } catch { this.colorMap = {}; }
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.colorMap));
  }

  assign(files: Array<{ name: string; type?: string }>): void {
    const newMap: Record<string, string> = {};
    const used = new Set<string>();

    for (const f of files) {
      const existing = this.colorMap[f.name];
      if (existing) { newMap[f.name] = existing; used.add(existing); }
    }

    for (const f of files) {
      if (!newMap[f.name]) {
        let candidate = pickBaseColor(f.type);
        let tries = 0;
        while (used.has(candidate) && tries < 24) {
          candidate = COLOR_PALETTE[hashHue(f.name + tries) % COLOR_PALETTE.length];
          tries++;
        }
        newMap[f.name] = candidate;
        used.add(candidate);
      }
    }

    this.colorMap = newMap;
    this.save();
  }

  get(name: string): string {
    return this.colorMap[name] ?? '#598BAF';
  }

  toMap(): Record<string, string> {
    return { ...this.colorMap };
  }
}

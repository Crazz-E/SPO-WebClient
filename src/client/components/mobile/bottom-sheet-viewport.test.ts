import fs from 'fs';
import path from 'path';

describe('BottomSheet.module.css viewport-height fallback', () => {
  const css = fs.readFileSync(path.join(__dirname, 'BottomSheet.module.css'), 'utf-8');
  const lines = css.split('\n').map((line) => line.trim());

  it('follows every non-dvh vh declaration with an otherwise-identical dvh declaration', () => {
    const vhLines = lines.filter((line) => /\d+vh\b/.test(line) && !/\d+dvh\b/.test(line));
    expect(vhLines.length).toBeGreaterThan(0);

    for (const vhLine of vhLines) {
      const index = lines.indexOf(vhLine);
      const nextLine = lines[index + 1];
      const dvhLine = vhLine.replace(/(\d+)vh/g, '$1dvh');
      expect(nextLine).toBe(dvhLine);
    }
  });

  it('contains the three expected dvh declarations', () => {
    expect(css).toContain('max-height: calc(100dvh - 56px - env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('height: 50dvh;');
    expect(css).toContain('height: calc(100dvh - 56px - env(safe-area-inset-bottom, 0px));');
  });
});

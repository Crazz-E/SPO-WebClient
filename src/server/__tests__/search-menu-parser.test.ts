/**
 * Tests for search-menu-parser — parseHomePage Capitol coordinate extraction.
 */

import { parseHomePage } from '../search-menu-parser';

const BASE_URL = 'http://142.4.193.58/five/0/visual/voyager/new%20directory';

/** Wrap td cells in valid HTML table structure so Cheerio doesn't strip them. */
function wrapInTable(...cells: string[]): string {
  return `<html><body><table><tr>${cells.join('')}</tr></table></body></html>`;
}

describe('parseHomePage', () => {
  it('should extract Capitol coordinates from enabled Capitol cell', () => {
    const html = wrapInTable(`
      <td align="center" valign="bottom"
        style="border-style: solid; border-width: 2px; border-color: black; cursor: hand"
        onmouseover="onMouseOverFrame()"
        onmouseout="onMouseOutFrame()"
        onclick="onKindClick()"
        ref="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=220&y=41"
        normcolor="black"
        hicolor="#3A5950">
        <div style="margin-top: 12px">
          <img src="images/smallCapitol.jpg" border="0">
        </div>
        <div class="link">
          Capitol
        </div>
      </td>
    `);

    const categories = parseHomePage(html, BASE_URL);
    const capitol = categories.find(c => c.label === 'Capitol');

    expect(capitol).toBeDefined();
    expect(capitol!.enabled).toBe(true);
    expect(capitol!.x).toBe(220);
    expect(capitol!.y).toBe(41);
  });

  it('should parse disabled Capitol cell without coordinates', () => {
    const html = wrapInTable(`
      <td align="center" valign="bottom"
        style="border-style: solid; border-width: 2px; border-color: black; cursor: default"
        normcolor="black">
        <div style="margin-top: 12px">
          <img src="images/smallCapitol.jpg" border="0">
        </div>
        <div class="link">
          Capitol
        </div>
      </td>
    `);

    const categories = parseHomePage(html, BASE_URL);
    const capitol = categories.find(c => c.label === 'Capitol');

    expect(capitol).toBeDefined();
    expect(capitol!.enabled).toBe(false);
    expect(capitol!.x).toBeUndefined();
    expect(capitol!.y).toBeUndefined();
  });

  it('should not extract coordinates from refs without x/y params', () => {
    const html = wrapInTable(`
      <td align="center" valign="bottom"
        onclick="onKindClick()"
        ref="Towns.asp?WorldName=Zorcon"
        style="cursor: hand">
        <div class="link">Towns</div>
      </td>
    `);

    const categories = parseHomePage(html, BASE_URL);
    const towns = categories.find(c => c.label === 'Towns');

    expect(towns).toBeDefined();
    expect(towns!.x).toBeUndefined();
    expect(towns!.y).toBeUndefined();
  });

  it('should handle multiple categories including Capitol with coords', () => {
    const html = wrapInTable(
      `<td onclick="onKindClick()" ref="Towns.asp?WorldName=Zorcon" style="cursor: hand">
        <div class="link">Towns</div>
      </td>`,
      `<td onclick="onKindClick()"
        ref="http://local.asp?frame_Id=MapIsoView&frame_Action=SELECT&x=150&y=300"
        style="cursor: hand">
        <div class="link">Capitol</div>
      </td>`
    );

    const categories = parseHomePage(html, BASE_URL);
    expect(categories).toHaveLength(2);

    const capitol = categories.find(c => c.label === 'Capitol');
    expect(capitol!.x).toBe(150);
    expect(capitol!.y).toBe(300);
    expect(capitol!.enabled).toBe(true);

    const towns = categories.find(c => c.label === 'Towns');
    expect(towns!.x).toBeUndefined();
  });
});

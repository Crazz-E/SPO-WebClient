/**
 * Tests for search-menu-parser — parseHomePage, parseTycoonProfile, parsePeopleSearchResults.
 */

import { parseHomePage, parseTycoonProfile, parsePeopleSearchResults } from '../search-menu-parser';

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

describe('parseTycoonProfile', () => {
  const BASE = 'http://158.69.153.134/five/0/visual/voyager/new%20directory';

  it('should extract all profile fields from RenderTycoon.asp HTML', () => {
    const html = `<html><body>
      <div class="header1">Crazz</div>
      <img id="picture" src="/fivedata/userinfo/Shamba/Crazz/largephoto.jpg" width="150" height="200">
      <table cellspacing="0" cellpadding="2">
        <tr><td class="label">Fortune:</td><td class="value">$8,198,554,338</td></tr>
        <tr><td class="label">This year:</td><td class="value">-$1,454,808</td></tr>
        <tr><td class="label">NTA Ranking:</td><td class="value">3rd place.</td></tr>
        <tr><td class="label">Level:</td><td class="value">Apprentice.</td></tr>
        <tr><td class="label">Prestige:</td><td class="value">29 points.</td></tr>
      </table>
      <a href="/five/0/visual/voyager/newtycoon/tycoon.asp?Tycoon=Crazz">Show Profile</a>
      <a href="TycoonCompanies.asp?WorldName=Shamba&Tycoon=Crazz&RIWS=">Companies</a>
    </body></html>`;

    const profile = parseTycoonProfile(html, BASE);

    expect(profile.name).toBe('Crazz');
    expect(profile.fortune).toBe(8198554338);
    expect(profile.thisYearProfit).toBe(-1454808);
    expect(profile.ntaRanking).toBe('3rd place.');
    expect(profile.level).toBe('Apprentice.');
    expect(profile.prestige).toBe(29);
    expect(profile.photoUrl).toContain('largephoto.jpg');
  });

  it('should handle missing stats gracefully', () => {
    const html = `<html><body>
      <div class="header1">EmptyTycoon</div>
    </body></html>`;

    const profile = parseTycoonProfile(html, BASE);

    expect(profile.name).toBe('EmptyTycoon');
    expect(profile.fortune).toBe(0);
    expect(profile.thisYearProfit).toBe(0);
    expect(profile.ntaRanking).toBe('N/A');
    expect(profile.level).toBe('Unknown');
    expect(profile.prestige).toBe(0);
  });
});

describe('parsePeopleSearchResults', () => {
  it('should extract tycoon names from foundtycoons.asp HTML', () => {
    const html = `<html><body>
      <table cellspacing="0">
        <tr onMouseOver="onItemMouseOver()" dirHref="RenderTycoon.asp?WorldName=Shamba&Tycoon=Crazz&RIWS=" textId="text_1">
          <td><div class="listItem">Crazz&nbsp;</div></td>
        </tr>
        <tr><td height="2" background="images/itemgradient.jpg"></td></tr>
      </table>
    </body></html>`;

    const results = parsePeopleSearchResults(html);

    expect(results).toHaveLength(1);
    expect(results[0]).toBe('Crazz');
  });

  it('should return multiple results', () => {
    const html = `<html><body>
      <table>
        <tr dirHref="RenderTycoon.asp?Tycoon=Alice" textId="t1">
          <td><div class="listItem">Alice&nbsp;</div></td>
        </tr>
        <tr dirHref="RenderTycoon.asp?Tycoon=Bob" textId="t2">
          <td><div class="listItem">Bob&nbsp;</div></td>
        </tr>
      </table>
    </body></html>`;

    const results = parsePeopleSearchResults(html);

    expect(results).toHaveLength(2);
    expect(results).toContain('Alice');
    expect(results).toContain('Bob');
  });

  it('should return empty array when no results found', () => {
    const html = `<html><body><div class="header2">People</div></body></html>`;

    const results = parsePeopleSearchResults(html);

    expect(results).toHaveLength(0);
  });
});

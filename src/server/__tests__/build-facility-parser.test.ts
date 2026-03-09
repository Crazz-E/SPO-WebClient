/**
 * Tests for FacilityList.asp HTML parser regex patterns.
 *
 * The real server HTML has nested <table>/<tr> inside each Cell_N, and the
 * VisualClassId lives in the "Build now" button's info attribute deep in the
 * second inner <tr>. The non-greedy cellRegex only captures up to the first
 * inner </tr>, so VisualClassId must be pre-scanned from the full HTML.
 *
 * HTML format is based on live captures from the SPO World Web Server.
 */

import { describe, it, expect } from '@jest/globals';

// ---------------------------------------------------------------------------
// Regex patterns extracted from spo_session.parseBuildingFacilities
// ---------------------------------------------------------------------------

/** Pre-scan: extract FacilityClass → VisualClassId from info attribute URLs */
const infoRegex = /FacilityClass=([A-Za-z0-9_]+)[^"']*VisualClassId=(\d+)/gi;

/** Match Cell_N detail rows (captures only up to first inner </tr>) */
const cellRegex = /<tr[^>]*\sid\s*=\s*["']?Cell_(\d+)["']?[^>]*>([\s\S]*?)<\/tr>/gi;

/** Extract icon src from cell content */
const iconRegex = /src\s*=\s*["']?([^"'\s>]+)["']?/i;

/** Extract facilityClass from icon filename (fallback only) */
const facilityClassRegex = /Map([A-Z][a-zA-Z0-9]+?)(?:\d+x\d+(?:x\d+)?)?\.gif/i;

/** Extract FacilityClass from info attribute (primary source) */
const infoFacilityClassRegex = /FacilityClass=([A-Za-z0-9_]+)/i;

/** VisualClassId fallback: direct search within cell content */
const visualIdRegex = /VisualClassId[=:](\d+)/i;

/** Build a LinkText regex for a given cell index */
function buildLinkTextRegex(cellIndex: string): RegExp {
  return new RegExp(
    `<div[^>]*id\\s*=\\s*["']?LinkText_${cellIndex}["']?[^>]*available\\s*=\\s*["']?(\\d+)["']?[^>]*>([^<]+)<`,
    'i'
  );
}

// ---------------------------------------------------------------------------
// Real server HTML (captured from live Headquarters category)
// ---------------------------------------------------------------------------

const REAL_SERVER_HTML = `
<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN">
<html>
<head><title>Facility List</title></head>
<body>
<table cellspacing="7" width="100%">
<tr><td>
  <div class=header2 style="color: #FF9900">Headquarters</div>
</td></tr>
<tr><td>
<table cellspacing="0" cellpadding="0" border="0" width="100%">

    <tr>
      <td width="100%" id="LinkFrame_0" background="images/itemgradient.jpg" altid="0">
        <div id="LinkText_0" class=listItem available="1" style="margin-left: 5px" altid="0">
        Company Headquarters
        </div>
      </td>
    </tr>
    <tr id="Cell_0" style="display:none">
      <td width="100%" background="images/vertgradient.jpg">
      <table cellpadding="3" cellspacing="0" width="100%">
      <tr>
      <td align="center" valign="middle" width="64">
        <img src=/five/icons/MapPGIHQ1.gif border="0" title="" width="120" height="80">
      </td>
      <td align="left" valign="middle">
        <div class=comment style="font-size: 9px">$8,000K<br><nobr>3600 m.</nobr></div>
        <img src="images/zone-commerce.gif" title="Building must be located in blue zone or no zone at all.">
      </td>
      </tr>
      <tr>
        <td colspan="2">
        <table style="text-align: center">
            <tr>
              <td class=button align="center" width="100"
                  onClick="onBtnClick()"
                  info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIGeneralHeadquarterSTA&VisualClassId=602"
                  command="build">
                  Build now
              </td>
            </tr>
        </table>
      </td>
      </tr>
      </table>
      </td>
    </tr>

    <tr>
      <td width="100%" id="LinkFrame_1" background="images/itemgradient.jpg" altid="1">
        <div id="LinkText_1" class=listItem available="1" style="margin-left: 5px" altid="1">
        Supermarket
        </div>
      </td>
    </tr>
    <tr id="Cell_1" style="display:none">
      <td width="100%" background="images/vertgradient.jpg">
      <table cellpadding="3" cellspacing="0" width="100%">
      <tr>
      <td align="center" valign="middle" width="64">
        <img src=/five/icons/MapPGISupermarketC64x32x0.gif border="0" title="" width="120" height="80">
      </td>
      <td align="left" valign="middle">
        <div class=comment style="font-size: 9px">$500K<br><nobr>400 m.</nobr></div>
      </td>
      </tr>
      <tr>
        <td colspan="2">
        <table style="text-align: center">
            <tr>
              <td class=button align="center" width="100"
                  onClick="onBtnClick()"
                  info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGISupermarketC&VisualClassId=4722"
                  command="build">
                  Build now
              </td>
            </tr>
        </table>
      </td>
      </tr>
      </table>
      </td>
    </tr>

</table>
</table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Simplified mock HTML (as used in build-menu-scenario.ts)
// ---------------------------------------------------------------------------

const SIMPLIFIED_HTML = `<html>
<head><title>Facility List</title></head>
<body>
<div class="header2">Headquarters</div>
<table cellspacing="0" cellpadding="0" width="95%">
<tr>
  <td align="center" valign="bottom"
    info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIGeneralHeadquarterSTA&VisualClassId=602"
    command="build">
  <img src="images/fac-PGIGeneralHeadquarterSTA.gif" border="0">
  <div class="header3">General Headquarter</div>
  <div class="data">Cost: $5,000,000</div>
  </td>
</tr>
</table>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacilityList.asp HTML parsing', () => {
  describe('Pre-scan: FacilityClass → VisualClassId extraction from info attributes', () => {
    it('should extract all FacilityClass→VisualClassId pairs from real server HTML', () => {
      const map = new Map<string, string>();
      let m;
      const regex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((m = regex.exec(REAL_SERVER_HTML)) !== null) {
        map.set(m[1], m[2]);
      }

      expect(map.size).toBe(2);
      expect(map.get('PGIGeneralHeadquarterSTA')).toBe('602');
      expect(map.get('PGISupermarketC')).toBe('4722');
    });

    it('should extract from simplified mock HTML', () => {
      const map = new Map<string, string>();
      let m;
      const regex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((m = regex.exec(SIMPLIFIED_HTML)) !== null) {
        map.set(m[1], m[2]);
      }

      expect(map.size).toBe(1);
      expect(map.get('PGIGeneralHeadquarterSTA')).toBe('602');
    });
  });

  describe('Cell_N regex captures (nested vs flat HTML)', () => {
    it('should match Cell_N rows in real server HTML', () => {
      const cells: string[] = [];
      let m;
      const regex = new RegExp(cellRegex.source, cellRegex.flags);
      while ((m = regex.exec(REAL_SERVER_HTML)) !== null) {
        cells.push(m[1]);
      }

      expect(cells).toEqual(['0', '1']);
    });

    it('cell content from real server HTML should contain the icon but NOT the VisualClassId', () => {
      // This demonstrates the bug: non-greedy match stops at the first inner </tr>,
      // so VisualClassId (in the second inner <tr>) is NOT in cellContent.
      const regex = new RegExp(cellRegex.source, cellRegex.flags);
      const m = regex.exec(REAL_SERVER_HTML);
      expect(m).not.toBeNull();

      const cellContent = m![2];

      // Icon IS captured (it's in the first inner <tr>)
      expect(cellContent).toContain('MapPGIHQ1.gif');

      // VisualClassId is NOT captured (it's in the second inner <tr>)
      expect(visualIdRegex.test(cellContent)).toBe(false);
    });
  });

  describe('Icon → facilityClass extraction (fallback path)', () => {
    it('should extract facilityClass from real server icon path (no dimensions)', () => {
      const m = facilityClassRegex.exec('MapPGIHQ1.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('PGIHQ1');
    });

    it('should extract facilityClass from icon path with dimensions', () => {
      const m = facilityClassRegex.exec('MapPGIFoodStore64x32x0.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('PGIFoodStore');
    });

    it('should extract facilityClass from full URL path', () => {
      const m = facilityClassRegex.exec('/five/icons/MapPGISupermarketC64x32x0.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('PGISupermarketC');
    });
  });

  describe('LinkText regex (flexible attribute order)', () => {
    it('should match LinkText with class before available', () => {
      const html = '<div id="LinkText_0" class=listItem available="1" style="margin-left: 5px">Company HQ</div>';
      const regex = buildLinkTextRegex('0');
      const m = regex.exec(html);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
      expect(m![2].trim()).toBe('Company HQ');
    });

    it('should match LinkText with quoted attributes', () => {
      const html = '<div id="LinkText_2" class="listItem" available="0">Drug Store</div>';
      const regex = buildLinkTextRegex('2');
      const m = regex.exec(html);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('0');
      expect(m![2].trim()).toBe('Drug Store');
    });

    it('should match LinkText from real server HTML', () => {
      const regex = buildLinkTextRegex('0');
      const m = regex.exec(REAL_SERVER_HTML);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
      expect(m![2].trim()).toBe('Company Headquarters');
    });

    it('should match LinkText_1 from real server HTML', () => {
      const regex = buildLinkTextRegex('1');
      const m = regex.exec(REAL_SERVER_HTML);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
      expect(m![2].trim()).toBe('Supermarket');
    });
  });

  describe('End-to-end: full parse flow simulation', () => {
    it('should extract FacilityClass from info attribute and resolve VisualClassId for all buildings', () => {
      // Step 1: Pre-scan
      const visualClassMap = new Map<string, string>();
      let im;
      const iRegex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((im = iRegex.exec(REAL_SERVER_HTML)) !== null) {
        visualClassMap.set(im[1], im[2]);
      }

      // Step 2: Parse cells
      const results: Array<{ facilityClass: string; visualClassId: string; name: string }> = [];
      let cm;
      const cRegex = new RegExp(cellRegex.source, cellRegex.flags);

      while ((cm = cRegex.exec(REAL_SERVER_HTML)) !== null) {
        const cellIndex = cm[1];
        const cellContent = cm[2];

        // LinkText
        const linkRegex = buildLinkTextRegex(cellIndex);
        const linkMatch = linkRegex.exec(REAL_SERVER_HTML);
        if (!linkMatch) continue;
        const name = linkMatch[2].trim();

        // PRIMARY: Extract FacilityClass from info attribute near this Cell_N
        let facilityClass = '';
        const cellAnchor = REAL_SERVER_HTML.indexOf(`Cell_${cellIndex}`);
        if (cellAnchor >= 0) {
          const nextCellPos = REAL_SERVER_HTML.indexOf('Cell_', cellAnchor + 5);
          const searchEnd = nextCellPos >= 0 ? nextCellPos : cellAnchor + 3000;
          const searchWindow = REAL_SERVER_HTML.substring(cellAnchor, searchEnd);
          const fcMatch = infoFacilityClassRegex.exec(searchWindow);
          if (fcMatch) {
            facilityClass = fcMatch[1];
          }
        }

        // FALLBACK: Extract from icon filename
        if (!facilityClass) {
          const icoMatch = iconRegex.exec(cellContent);
          const iconPath = icoMatch?.[1] || '';
          const fcMatch = facilityClassRegex.exec(iconPath);
          facilityClass = fcMatch?.[1] || '';
        }

        // VisualClassId: pre-scan map first, then fallback to cell content
        let visualClassId = '';
        if (facilityClass && visualClassMap.has(facilityClass)) {
          visualClassId = visualClassMap.get(facilityClass)!;
        } else {
          const vidMatch = visualIdRegex.exec(cellContent);
          if (vidMatch) visualClassId = vidMatch[1];
        }

        results.push({ facilityClass, visualClassId, name });
      }

      expect(results).toHaveLength(2);

      // Cell_0: HQ — info attribute has the real RDO class (PGIGeneralHeadquarterSTA),
      // NOT the icon name (PGIHQ1). VisualClassId now resolves via pre-scan map.
      const hq = results.find(r => r.facilityClass === 'PGIGeneralHeadquarterSTA');
      expect(hq).toBeDefined();
      expect(hq!.visualClassId).toBe('602');
      expect(hq!.name).toBe('Company Headquarters');

      // Cell_1: Supermarket — icon name matches info attribute (PGISupermarketC)
      const supermarket = results.find(r => r.facilityClass === 'PGISupermarketC');
      expect(supermarket).toBeDefined();
      expect(supermarket!.visualClassId).toBe('4722');
      expect(supermarket!.name).toBe('Supermarket');
    });

    it('should handle Commerce-style icon names that match info attribute FacilityClass', () => {
      // Commerce buildings have icon filenames that match FacilityClass exactly:
      // Icon: MapPGIFoodStore64x32x0.gif → PGIFoodStore
      // Info: FacilityClass=PGIFoodStore&VisualClassId=4602
      const commerceHtml = `
<table>
  <tr>
    <td id="LinkFrame_0"><div id="LinkText_0" class=listItem available="1">Food Store</div></td>
  </tr>
  <tr id="Cell_0" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapPGIFoodStore64x32x0.gif border="0"></td>
      <td><div class=comment>$140K<br><nobr>100 m.</nobr></div></td>
    </tr>
    <tr><td colspan="2"><table><tr>
      <td info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIFoodStore&VisualClassId=4602" command="build">Build now</td>
    </tr></table></td></tr>
    </table></td>
  </tr>
</table>`;

      // Pre-scan
      const visualClassMap = new Map<string, string>();
      let im;
      const iRegex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((im = iRegex.exec(commerceHtml)) !== null) {
        visualClassMap.set(im[1], im[2]);
      }

      expect(visualClassMap.get('PGIFoodStore')).toBe('4602');

      // Parse cell — info attribute gives the correct FacilityClass
      const cellAnchor = commerceHtml.indexOf('Cell_0');
      expect(cellAnchor).toBeGreaterThan(-1);
      const searchWindow = commerceHtml.substring(cellAnchor, cellAnchor + 3000);
      const fcMatch = infoFacilityClassRegex.exec(searchWindow);
      expect(fcMatch).not.toBeNull();
      expect(fcMatch![1]).toBe('PGIFoodStore');

      // VisualClassId resolved via pre-scan map
      expect(visualClassMap.get('PGIFoodStore')).toBe('4602');
    });

    it('should prefer FacilityClass from info attribute over icon filename', () => {
      // When icon name differs from FacilityClass in info attribute,
      // the info attribute (RDO kernel class) must win over the icon (visual asset name).
      // This is the bug that caused MoabGasStation and similar buildings to fail.
      const mismatchHtml = `
<table>
  <tr>
    <td id="LinkFrame_0"><div id="LinkText_0" class=listItem available="1">Gas Station</div></td>
  </tr>
  <tr id="Cell_0" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapMoabGasStation128x64x0.gif border="0"></td>
      <td><div class=comment>$200K<br><nobr>200 m.</nobr></div></td>
    </tr>
    <tr><td colspan="2"><table><tr>
      <td info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGIMoabGasStation&VisualClassId=700" command="build">Build now</td>
    </tr></table></td></tr>
    </table></td>
  </tr>
</table>`;

      // Info attribute has the REAL RDO class name
      const cellAnchor = mismatchHtml.indexOf('Cell_0');
      const searchWindow = mismatchHtml.substring(cellAnchor, cellAnchor + 3000);
      const fcMatch = infoFacilityClassRegex.exec(searchWindow);
      expect(fcMatch).not.toBeNull();
      expect(fcMatch![1]).toBe('PGIMoabGasStation'); // correct RDO class

      // Icon filename gives a different (wrong for RDO) name
      const iconMatch = facilityClassRegex.exec('MapMoabGasStation128x64x0.gif');
      expect(iconMatch).not.toBeNull();
      expect(iconMatch![1]).toBe('MoabGasStation'); // visual name, NOT the RDO class
    });

    it('should fall back to icon filename when no info attribute exists', () => {
      // Some simplified HTML (e.g., old format) may not have info attributes
      const noInfoHtml = `
<table>
  <tr>
    <td id="LinkFrame_0"><div id="LinkText_0" class=listItem available="1">Small Shop</div></td>
  </tr>
  <tr id="Cell_0" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapPGISmallShop64x32x0.gif border="0"></td>
      <td><div class=comment>$50K<br><nobr>50 m.</nobr></div></td>
    </tr></table></td>
  </tr>
</table>`;

      // No FacilityClass in info attribute
      const cellAnchor = noInfoHtml.indexOf('Cell_0');
      const searchWindow = noInfoHtml.substring(cellAnchor, cellAnchor + 3000);
      const fcMatch = infoFacilityClassRegex.exec(searchWindow);
      expect(fcMatch).toBeNull(); // no info attribute

      // Fallback to icon filename
      const iconMatch = facilityClassRegex.exec('MapPGISmallShop64x32x0.gif');
      expect(iconMatch).not.toBeNull();
      expect(iconMatch![1]).toBe('PGISmallShop');
    });
  });

  describe('IFEL icon filename parsing (2-segment dimensions)', () => {
    it('should extract IFELCollege from MapIFELCollege64x32.gif (2-segment)', () => {
      const m = facilityClassRegex.exec('MapIFELCollege64x32.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('IFELCollege');
    });

    it('should extract IFELDump from MapIFELDump64x32.gif (2-segment)', () => {
      const m = facilityClassRegex.exec('MapIFELDump64x32.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('IFELDump');
    });

    it('should extract IFELTennis from MapIFELTennis64x32.gif (2-segment)', () => {
      const m = facilityClassRegex.exec('MapIFELTennis64x32.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('IFELTennis');
    });

    it('should extract IFELJail from MapIFELJail64x32.gif (2-segment)', () => {
      const m = facilityClassRegex.exec('MapIFELJail64x32.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('IFELJail');
    });

    it('should still extract IFELAlienParkA from 3-segment name', () => {
      const m = facilityClassRegex.exec('MapIFELAlienParkA64x32x0.GIF');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('IFELAlienParkA');
    });

    it('should still extract PGIFoodStore from 3-segment name', () => {
      const m = facilityClassRegex.exec('MapPGIFoodStore64x32x0.gif');
      expect(m).not.toBeNull();
      expect(m![1]).toBe('PGIFoodStore');
    });
  });

  describe('VisualClassId search scoping (cell boundary)', () => {
    it('should NOT bleed VisualClassId from a neighboring cell', () => {
      // Simulates the bug: Cell_0 has no VisualClassId, Cell_1 has VisualClassId=8022 (Tennis)
      // An unbounded search from Cell_0 would find Tennis's ID. Scoped search must NOT.
      const html = `
<tr id="Cell_0" style="display:none">
  <td><table><tr>
    <td><img src=/five/icons/MapIFELCollege64x32.gif border="0"></td>
    <td><div class=comment>$200K<br><nobr>400 m.</nobr></div></td>
  </tr>
  <tr><td colspan="2"><table><tr>
    <td info="http://local.asp?FacilityClass=IFELCollege" command="build">Build now</td>
  </tr></table></td></tr>
  </table></td>
</tr>
<tr id="Cell_1" style="display:none">
  <td><table><tr>
    <td><img src=/five/icons/MapIFELTennis64x32.gif border="0"></td>
  </tr>
  <tr><td colspan="2"><table><tr>
    <td info="http://local.asp?FacilityClass=IFELTennis&VisualClassId=8022" command="build">Build now</td>
  </tr></table></td></tr>
  </table></td>
</tr>`;

      // Scoped search for Cell_0: stop at Cell_1 boundary
      const cellAnchor = html.indexOf('Cell_0');
      expect(cellAnchor).toBeGreaterThan(-1);

      const nextCell = html.indexOf('Cell_', cellAnchor + 5);
      expect(nextCell).toBeGreaterThan(cellAnchor); // Cell_1 exists

      const scopedWindow = html.substring(cellAnchor, nextCell);
      const scopedMatch = visualIdRegex.exec(scopedWindow);
      expect(scopedMatch).toBeNull(); // Cell_0 has no VisualClassId — must NOT find Tennis's 8022

      // Unbounded search (the old bug) WOULD find it
      const unboundedWindow = html.substring(cellAnchor, cellAnchor + 2000);
      const unboundedMatch = visualIdRegex.exec(unboundedWindow);
      expect(unboundedMatch).not.toBeNull();
      expect(unboundedMatch![1]).toBe('8022'); // Proves the bleed-across bug
    });

    it('should find VisualClassId when it IS within the same cell', () => {
      const html = `
<tr id="Cell_0" style="display:none">
  <td><table><tr>
    <td><img src=/five/icons/MapIFELTennis64x32.gif border="0"></td>
  </tr>
  <tr><td colspan="2"><table><tr>
    <td info="http://local.asp?FacilityClass=IFELTennis&VisualClassId=8022" command="build">Build now</td>
  </tr></table></td></tr>
  </table></td>
</tr>
<tr id="Cell_1" style="display:none">
  <td>next cell</td>
</tr>`;

      const cellAnchor = html.indexOf('Cell_0');
      const nextCell = html.indexOf('Cell_', cellAnchor + 5);
      const scopedWindow = html.substring(cellAnchor, nextCell);
      const scopedMatch = visualIdRegex.exec(scopedWindow);
      expect(scopedMatch).not.toBeNull();
      expect(scopedMatch![1]).toBe('8022');
    });

    it('should use 2000-char fallback when there is no next cell', () => {
      // Last cell in HTML — no Cell_ after it, so fallback to cellAnchor + 2000
      const html = `
<tr id="Cell_5" style="display:none">
  <td><table><tr>
    <td info="http://local.asp?FacilityClass=IFELMuseum&VisualClassId=8032" command="build">Build now</td>
  </tr></table></td>
</tr>
</table></body></html>`;

      const cellAnchor = html.indexOf('Cell_5');
      const nextCell = html.indexOf('Cell_', cellAnchor + 5);
      expect(nextCell).toBe(-1); // No next cell

      const end = nextCell >= 0 ? nextCell : cellAnchor + 2000;
      const scopedWindow = html.substring(cellAnchor, end);
      const scopedMatch = visualIdRegex.exec(scopedWindow);
      expect(scopedMatch).not.toBeNull();
      expect(scopedMatch![1]).toBe('8032');
    });
  });

  describe('PGISRVCOMMON_ underscore FacilityClass names (real Public Facilities HTML)', () => {
    // Real server HTML uses PGISRVCOMMON_* FacilityClass names for IFEL buildings.
    // Without underscore in the regex, all collapse to "PGISRVCOMMON" and the last
    // one (Tennis Court) wins, causing ALL IFEL buildings to show as Tennis Court.
    const PUBLIC_FACILITIES_HTML = `
<table>
  <tr>
    <td id="LinkFrame_9"><div id="LinkText_9" class=listItem available="1" altid="9">Lizard Park</div></td>
  </tr>
  <tr id="Cell_9" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapIFELAlienParkA64x32x0.gif border="0" width="120" height="80"></td>
      <td><div class=comment>$2,000K<br><nobr>3600 m.</nobr></div></td>
    </tr>
    <tr><td colspan="2"><table><tr>
      <td class=button info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGISRVCOMMON_AlienParkA&VisualClassId=8052" command="build">Build now</td>
    </tr></table></td></tr>
    </table></td>
  </tr>

  <tr>
    <td id="LinkFrame_14"><div id="LinkText_14" class=listItem available="1" altid="14">Dump</div></td>
  </tr>
  <tr id="Cell_14" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapIFELDump64x32.gif border="0" width="120" height="80"></td>
      <td><div class=comment>$40,000K<br><nobr>10000 m.</nobr></div></td>
    </tr>
    <tr><td colspan="2"><table><tr>
      <td class=button info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGISRVCOMMON_Disposal&VisualClassId=8002" command="build">Build now</td>
    </tr></table></td></tr>
    </table></td>
  </tr>

  <tr>
    <td id="LinkFrame_17"><div id="LinkText_17" class=listItem available="1" altid="17">Tennis courts</div></td>
  </tr>
  <tr id="Cell_17" style="display:none">
    <td><table><tr>
      <td><img src=/five/icons/MapIFELTennis64x32.gif border="0" width="120" height="80"></td>
      <td><div class=comment>$200K<br><nobr>3600 m.</nobr></div></td>
    </tr>
    <tr><td colspan="2"><table><tr>
      <td class=button info="http://local.asp?frame_Id=MapIsoView&frame_Action=Build&FacilityClass=PGISRVCOMMON_TennisCourt&VisualClassId=8022" command="build">Build now</td>
    </tr></table></td></tr>
    </table></td>
  </tr>
</table>`;

    it('should extract full PGISRVCOMMON_* FacilityClass names (not truncated at underscore)', () => {
      const map = new Map<string, string>();
      let m;
      const regex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((m = regex.exec(PUBLIC_FACILITIES_HTML)) !== null) {
        map.set(m[1], m[2]);
      }

      // Each building gets its OWN entry — not collapsed to "PGISRVCOMMON"
      expect(map.size).toBe(3);
      expect(map.get('PGISRVCOMMON_AlienParkA')).toBe('8052');
      expect(map.get('PGISRVCOMMON_Disposal')).toBe('8002');
      expect(map.get('PGISRVCOMMON_TennisCourt')).toBe('8022');
    });

    it('should NOT collapse all IFEL buildings to the same key', () => {
      const map = new Map<string, string>();
      let m;
      const regex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((m = regex.exec(PUBLIC_FACILITIES_HTML)) !== null) {
        map.set(m[1], m[2]);
      }

      // Lizard Park must NOT resolve to Tennis Court's ID
      expect(map.get('PGISRVCOMMON_AlienParkA')).not.toBe('8022');
      // Dump must NOT resolve to Tennis Court's ID
      expect(map.get('PGISRVCOMMON_Disposal')).not.toBe('8022');
    });

    it('should extract full FacilityClass from per-cell info attribute', () => {
      // Simulate per-cell extraction for Cell_9 (Lizard Park)
      const cellAnchor = PUBLIC_FACILITIES_HTML.indexOf('Cell_9');
      expect(cellAnchor).toBeGreaterThan(-1);

      const nextCellPos = PUBLIC_FACILITIES_HTML.indexOf('Cell_', cellAnchor + 5);
      const searchEnd = nextCellPos >= 0 ? nextCellPos : cellAnchor + 3000;
      const searchWindow = PUBLIC_FACILITIES_HTML.substring(cellAnchor, searchEnd);

      const fcMatch = infoFacilityClassRegex.exec(searchWindow);
      expect(fcMatch).not.toBeNull();
      expect(fcMatch![1]).toBe('PGISRVCOMMON_AlienParkA'); // full name with underscore
    });

    it('end-to-end: each building resolves to its own VisualClassId', () => {
      // Pre-scan
      const visualClassMap = new Map<string, string>();
      let im;
      const iRegex = new RegExp(infoRegex.source, infoRegex.flags);
      while ((im = iRegex.exec(PUBLIC_FACILITIES_HTML)) !== null) {
        visualClassMap.set(im[1], im[2]);
      }

      // Parse cells
      const results: Array<{ name: string; facilityClass: string; visualClassId: string }> = [];
      let cm;
      const cRegex = new RegExp(cellRegex.source, cellRegex.flags);
      while ((cm = cRegex.exec(PUBLIC_FACILITIES_HTML)) !== null) {
        const cellIndex = cm[1];

        const linkRegex = new RegExp(
          `<div[^>]*id\\s*=\\s*["']?LinkText_${cellIndex}["']?[^>]*available\\s*=\\s*["']?(\\d+)["']?[^>]*>([^<]+)<`, 'i'
        );
        const linkMatch = linkRegex.exec(PUBLIC_FACILITIES_HTML);
        if (!linkMatch) continue;
        const name = linkMatch[2].trim();

        // PRIMARY: Extract FacilityClass from info attribute
        let facilityClass = '';
        const cellAnchor = PUBLIC_FACILITIES_HTML.indexOf(`Cell_${cellIndex}`);
        if (cellAnchor >= 0) {
          const nextCellPos = PUBLIC_FACILITIES_HTML.indexOf('Cell_', cellAnchor + 5);
          const searchEnd = nextCellPos >= 0 ? nextCellPos : cellAnchor + 3000;
          const searchWindow = PUBLIC_FACILITIES_HTML.substring(cellAnchor, searchEnd);
          const fcMatch = infoFacilityClassRegex.exec(searchWindow);
          if (fcMatch) facilityClass = fcMatch[1];
        }

        // VisualClassId from pre-scan map
        const visualClassId = visualClassMap.get(facilityClass) || '';
        results.push({ name, facilityClass, visualClassId });
      }

      expect(results).toHaveLength(3);

      const lizard = results.find(r => r.name === 'Lizard Park');
      expect(lizard).toBeDefined();
      expect(lizard!.facilityClass).toBe('PGISRVCOMMON_AlienParkA');
      expect(lizard!.visualClassId).toBe('8052'); // NOT 8022 (Tennis)

      const dump = results.find(r => r.name === 'Dump');
      expect(dump).toBeDefined();
      expect(dump!.facilityClass).toBe('PGISRVCOMMON_Disposal');
      expect(dump!.visualClassId).toBe('8002'); // NOT 8022 (Tennis)

      const tennis = results.find(r => r.name === 'Tennis courts');
      expect(tennis).toBeDefined();
      expect(tennis!.facilityClass).toBe('PGISRVCOMMON_TennisCourt');
      expect(tennis!.visualClassId).toBe('8022');
    });
  });
});

// ---------------------------------------------------------------------------
// Residential zone classification (deriveResidenceClass)
// ---------------------------------------------------------------------------

import { deriveResidenceClass } from '../spo_session';

describe('deriveResidenceClass — residential building classification', () => {
  describe('Signal 1: zone image filename', () => {
    it('should return "high" for zone-hires.gif', () => {
      expect(deriveResidenceClass('images/zone-hires.gif', '', '')).toBe('high');
    });

    it('should return "middle" for zone-midres.gif', () => {
      expect(deriveResidenceClass('images/zone-midres.gif', '', '')).toBe('middle');
    });

    it('should return "low" for zone-lores.gif', () => {
      expect(deriveResidenceClass('images/zone-lores.gif', '', '')).toBe('low');
    });

    it('should be case-insensitive for filename', () => {
      expect(deriveResidenceClass('images/Zone-HiRes.GIF', '', '')).toBe('high');
      expect(deriveResidenceClass('images/ZONE-MIDRES.gif', '', '')).toBe('middle');
      expect(deriveResidenceClass('images/zone-LoRes.gif', '', '')).toBe('low');
    });

    it('should match hires/midres/lores anywhere in filename', () => {
      expect(deriveResidenceClass('/five/images/zone-hiresidential.gif', '', '')).toBe('high');
      expect(deriveResidenceClass('zone_midres_v2.gif', '', '')).toBe('middle');
      expect(deriveResidenceClass('some-path/lores-zone.gif', '', '')).toBe('low');
    });
  });

  describe('Signal 2: zone title text', () => {
    it('should match "High Residential" (original expected text)', () => {
      expect(deriveResidenceClass('', 'Building must be in High Residential zone', '')).toBe('high');
    });

    it('should match "Hi Res" abbreviation', () => {
      expect(deriveResidenceClass('', 'Hi Residential zone required', '')).toBe('high');
    });

    it('should match "Mid Residential"', () => {
      expect(deriveResidenceClass('', 'Mid Residential zone', '')).toBe('middle');
    });

    it('should match "Middle Residential"', () => {
      expect(deriveResidenceClass('', 'Middle Residential zone', '')).toBe('middle');
    });

    it('should match "Low Residential"', () => {
      expect(deriveResidenceClass('', 'Low Residential zone', '')).toBe('low');
    });

    it('should match "Lo Res" abbreviation', () => {
      expect(deriveResidenceClass('', 'Lo Residential zone required', '')).toBe('low');
    });

    it('should be case-insensitive for title', () => {
      expect(deriveResidenceClass('', 'high residential zone', '')).toBe('high');
      expect(deriveResidenceClass('', 'MID RESIDENTIAL', '')).toBe('middle');
      expect(deriveResidenceClass('', 'low residential', '')).toBe('low');
    });
  });

  describe('Signal 3: color-based zone descriptions', () => {
    it('should return "high" for bright green zone', () => {
      expect(deriveResidenceClass('', 'Building must be in bright green zone', '')).toBe('high');
    });

    it('should return "high" for light green zone', () => {
      expect(deriveResidenceClass('', 'Building must be in light green zone', '')).toBe('high');
    });

    it('should return "middle" for plain green zone', () => {
      expect(deriveResidenceClass('', 'Building must be in green zone', '')).toBe('middle');
    });

    it('should return "low" for dark green zone', () => {
      expect(deriveResidenceClass('', 'Building must be in dark green zone', '')).toBe('low');
    });
  });

  describe('Signal 4: FacilityClass name', () => {
    it('should return "high" from PGIHiResA', () => {
      expect(deriveResidenceClass('', '', 'PGIHiResA')).toBe('high');
    });

    it('should return "middle" from PGIMidResB', () => {
      expect(deriveResidenceClass('', '', 'PGIMidResB')).toBe('middle');
    });

    it('should return "low" from PGILoResA', () => {
      expect(deriveResidenceClass('', '', 'PGILoResA')).toBe('low');
    });

    it('should be case-insensitive for facility class', () => {
      expect(deriveResidenceClass('', '', 'pgihiresa')).toBe('high');
    });
  });

  describe('Non-residential returns undefined', () => {
    it('should return undefined for zone-commerce.gif', () => {
      expect(deriveResidenceClass('images/zone-commerce.gif', 'blue zone', '')).toBeUndefined();
    });

    it('should return undefined for zone-industry.gif', () => {
      expect(deriveResidenceClass('images/zone-industry.gif', 'yellow zone', '')).toBeUndefined();
    });

    it('should return undefined when all signals are empty', () => {
      expect(deriveResidenceClass('', '', '')).toBeUndefined();
    });

    it('should return undefined for unrelated facility class', () => {
      expect(deriveResidenceClass('', '', 'PGISupermarketC')).toBeUndefined();
    });
  });

  describe('Priority: filename > title > facility class', () => {
    it('should prefer filename over title when both present', () => {
      // filename says high, title says low — filename wins
      expect(deriveResidenceClass('zone-hires.gif', 'dark green zone', '')).toBe('high');
    });

    it('should prefer title over facility class when no filename signal', () => {
      // title says middle, facilityClass says high — title wins
      expect(deriveResidenceClass('zone-generic.gif', 'Mid Residential', 'PGIHiResA')).toBe('middle');
    });
  });
});

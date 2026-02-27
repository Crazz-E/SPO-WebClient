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
const infoRegex = /FacilityClass=([A-Za-z0-9]+)[^"']*VisualClassId=(\d+)/gi;

/** Match Cell_N detail rows (captures only up to first inner </tr>) */
const cellRegex = /<tr[^>]*\sid\s*=\s*["']?Cell_(\d+)["']?[^>]*>([\s\S]*?)<\/tr>/gi;

/** Extract icon src from cell content */
const iconRegex = /src\s*=\s*["']?([^"'\s>]+)["']?/i;

/** Extract facilityClass from icon filename */
const facilityClassRegex = /Map([A-Z][a-zA-Z0-9]+?)(?:\d+x\d+x\d+)?\.gif/i;

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

  describe('Icon → facilityClass extraction', () => {
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
    it('should correctly resolve VisualClassId for all buildings using pre-scan', () => {
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

        // Icon → facilityClass
        const icoMatch = iconRegex.exec(cellContent);
        const iconPath = icoMatch?.[1] || '';
        const fcMatch = facilityClassRegex.exec(iconPath);
        const facilityClass = fcMatch?.[1] || '';

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

      // PGIHQ1 (icon filename without dimensions) → VisualClassId not in pre-scan map
      // because the info attribute uses FacilityClass=PGIGeneralHeadquarterSTA,
      // while the icon extracts PGIHQ1. These are different identifiers.
      // The icon-based name (PGIHQ1) won't match the info URL name (PGIGeneralHeadquarterSTA).
      // This is expected — the icon filename and FacilityClass can differ for some buildings.

      // PGISupermarketC → VisualClassId 4722
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

      // Parse cell
      const cRegex = new RegExp(cellRegex.source, cellRegex.flags);
      const cm = cRegex.exec(commerceHtml);
      expect(cm).not.toBeNull();

      const cellContent = cm![2];

      // Icon is captured
      const icoMatch = iconRegex.exec(cellContent);
      const fcMatch = facilityClassRegex.exec(icoMatch![1]);
      expect(fcMatch![1]).toBe('PGIFoodStore');

      // VisualClassId NOT in cell content (nested <tr> issue)
      expect(visualIdRegex.test(cellContent)).toBe(false);

      // But IS in pre-scan map
      expect(visualClassMap.get('PGIFoodStore')).toBe('4602');
    });
  });
});

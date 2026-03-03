/**
 * Tests for cluster info and facility list HTML parsers.
 *
 * The parsers live as private methods on StarpeaceSession, but the regex
 * patterns are extracted here for unit testing against realistic HTML
 * from the original game's ASP pages.
 */

import { describe, it, expect } from '@jest/globals';
import type { ClusterCategory, ClusterFacilityPreview } from '@/shared/types';

// ---------------------------------------------------------------------------
// Regex patterns extracted from spo_session.ts parseClusterInfo
// ---------------------------------------------------------------------------

const descRegex = /<div[^>]*class\s*=\s*["']?sealExpln["']?[^>]*>([\s\S]*?)<\/div>/i;
const fingerRegex = /<td[^>]*\sfolder\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
const nobrRegex = /<nobr>([\s\S]*?)<\/nobr>/i;

function parseClusterInfoFromHtml(clusterName: string, html: string): {
  id: string;
  displayName: string;
  description: string;
  categories: ClusterCategory[];
} {
  const clusterAttrMatch = /cluster\s*=\s*["']?([^"'\s>]+)/i.exec(html);
  const displayName = clusterAttrMatch?.[1] || clusterName;

  const descMatch = descRegex.exec(html);
  let description = '';
  if (descMatch) {
    description = descMatch[1]
      .replace(/<p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  const categories: ClusterCategory[] = [];
  let match;
  while ((match = fingerRegex.exec(html)) !== null) {
    const folder = match[1];
    const content = match[2];
    const nameMatch = nobrRegex.exec(content);
    const name = nameMatch ? nameMatch[1].trim() : '';
    if (name && folder) {
      categories.push({ name, folder });
    }
  }
  // Reset regex lastIndex for next call
  fingerRegex.lastIndex = 0;

  return { id: clusterName, displayName, description, categories };
}

// ---------------------------------------------------------------------------
// Regex patterns extracted from spo_session.ts parseClusterFacilities
// ---------------------------------------------------------------------------

const spanRegex = /<span[^>]*>([\s\S]*?)<\/span>/gi;
const nameRegex = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*11px[^>]*>([\s\S]*?)<\/div>/i;
const iconRegex = /<img\s+src\s*=\s*["']?([^"'\s>]*icons[^"'\s>]*)["']?/i;
const zoneRegex = /<img[^>]*zone[^>]*title\s*=\s*["']([^"']+)["']/i;
const metaRegex = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*9px[^>]*>([\s\S]*?)<\/div>/i;
const costRegex = /(\$[\d,]+\.?\d*\s*[KM]?)/i;
const timeRegex = /<nobr>([\d,]+\s*m\.)<\/nobr>/i;
const descFacRegex = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([\s\S]*?)<\/div>/i;

function parseClusterFacilitiesFromHtml(html: string): ClusterFacilityPreview[] {
  const facilities: ClusterFacilityPreview[] = [];

  let match;
  while ((match = spanRegex.exec(html)) !== null) {
    const block = match[1];
    const nm = nameRegex.exec(block);
    const name = nm ? nm[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!name) continue;

    const ic = iconRegex.exec(block);
    const iconUrl = ic ? ic[1] : '';

    const zm = zoneRegex.exec(block);
    const zoneType = zm?.[1] || '';

    const mt = metaRegex.exec(block);
    let cost = '';
    let buildTime = '';
    if (mt) {
      const cm = costRegex.exec(mt[1]);
      cost = cm?.[1] || '';
      const tm = timeRegex.exec(mt[1]);
      buildTime = tm?.[1] || '';
    }

    const dm = descFacRegex.exec(block);
    let description = '';
    if (dm) {
      description = dm[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
    }

    facilities.push({ name, iconUrl, cost, buildTime, zoneType, description });
  }
  spanRegex.lastIndex = 0;

  return facilities;
}

// ---------------------------------------------------------------------------
// Real HTML fixtures from the original game's ASP pages (extracted from trace)
// ---------------------------------------------------------------------------

const INFO_ASP_HTML = `
<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML//EN">
<html>
<head><title>Cluster info</title></head>
<body bgcolor="#121212">
<table cluster="Dissidents" border="0">
<tr><td>
<div class="sealExpln" style="color: #A0A0A0; font-size: 12px">
The Dissidents represent a loose coalition of independent entrepreneurs<p>
who reject corporate hierarchy and traditional business models.<br>
They specialize in grassroots industries and alternative technologies.
</div>
</td></tr>
</table>
<table border="0" cellpadding="0" cellspacing="0">
<tr>
<td id="finger0" class="iLabel" folder="00000002.DissidentsDirectionFacilities.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Headquarters</nobr></div>
</td>
<td id="finger1" class="iLabel" folder="00000003.DissidentsFarms.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Farms</nobr></div>
</td>
<td id="finger2" class="iLabel" folder="00000004.DissidentsFactories.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Factories</nobr></div>
</td>
<td id="finger3" class="iLabel" folder="00000005.DissidentsResidentials.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Residentials</nobr></div>
</td>
<td id="finger4" class="iLabel" folder="00000006.DissidentsCommerce.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Commerce</nobr></div>
</td>
<td id="finger5" class="iLabel" folder="00000007.DissidentsPublicFacilities.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Public</nobr></div>
</td>
<td id="finger6" class="iLabel" folder="00000008.DissidentsOfficeFacilities.five" style="cursor: pointer">
  <div class="hiLabel"><nobr>Offices</nobr></div>
</td>
</tr>
</table>
</body>
</html>
`;

const FACILITY_LIST_HTML = `
<html>
<body bgcolor="#121212">
<table cellspacing="7" width="100%">
<tr><td>
  <div class=header2 style="color: #FF9900">Headquarters</div>
</td></tr>
<tr><td>
<span style="cursor:pointer">
  <div class=comment style="font-family: Arial; color: #AAAAAA; font-size: 11px">Company Headquarters</div>
  <table border="0"><tr height="80">
    <td><img src=/five/icons/MapDisHQ1.gif width=65 height=65></td>
    <td valign=top>
      <img src="images/zone-commerce.gif" title="Building must be located in a Commerce zone">
      <div class=comment style="font-family: Arial; color: #A0A0A0; font-size: 9px">$8,000K<br><nobr>3600 m.</nobr></div>
    </td>
  </tr></table>
  <div class="description" style="font-size: 10px; color: #888888">The nerve center of your business empire.</div>
</span>
<span style="cursor:pointer">
  <div class=comment style="font-family: Arial; color: #AAAAAA; font-size: 11px">Trade Center</div>
  <table border="0"><tr height="80">
    <td><img src=/five/icons/MapDisTrade1.gif width=65 height=65></td>
    <td valign=top>
      <img src="images/zone-industry.gif" title="Building must be located in an Industrial zone">
      <div class=comment style="font-family: Arial; color: #A0A0A0; font-size: 9px">$12,500K<br><nobr>4800 m.</nobr></div>
    </td>
  </tr></table>
</span>
</td></tr>
</table>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseClusterInfo', () => {
  it('extracts cluster display name from cluster attribute', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.displayName).toBe('Dissidents');
  });

  it('falls back to clusterName when no cluster attribute found', () => {
    const result = parseClusterInfoFromHtml('PGI', '<html><body></body></html>');
    expect(result.displayName).toBe('PGI');
  });

  it('extracts description text from sealExpln div', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.description).toContain('loose coalition of independent entrepreneurs');
    expect(result.description).toContain('grassroots industries');
  });

  it('strips HTML tags from description', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.description).not.toContain('<p>');
    expect(result.description).not.toContain('<br');
    expect(result.description).not.toContain('<div');
  });

  it('converts <p> and <br> to newlines in description', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.description).toContain('\n');
  });

  it('returns empty description for HTML without sealExpln', () => {
    const result = parseClusterInfoFromHtml('PGI', '<html><body></body></html>');
    expect(result.description).toBe('');
  });

  it('extracts all 7 categories from Dissidents info', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.categories).toHaveLength(7);
  });

  it('extracts correct category names', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    const names = result.categories.map(c => c.name);
    expect(names).toEqual([
      'Headquarters',
      'Farms',
      'Factories',
      'Residentials',
      'Commerce',
      'Public',
      'Offices',
    ]);
  });

  it('extracts correct folder IDs', () => {
    const result = parseClusterInfoFromHtml('Dissidents', INFO_ASP_HTML);
    expect(result.categories[0].folder).toBe('00000002.DissidentsDirectionFacilities.five');
    expect(result.categories[1].folder).toBe('00000003.DissidentsFarms.five');
    expect(result.categories[6].folder).toBe('00000008.DissidentsOfficeFacilities.five');
  });

  it('sets cluster id from input parameter', () => {
    const result = parseClusterInfoFromHtml('Mariko', INFO_ASP_HTML);
    expect(result.id).toBe('Mariko');
  });

  it('returns empty categories for HTML without finger elements', () => {
    const result = parseClusterInfoFromHtml('PGI', '<html><body><div>nothing</div></body></html>');
    expect(result.categories).toEqual([]);
  });
});

describe('parseClusterFacilities', () => {
  it('extracts 2 facilities from sample HTML', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result).toHaveLength(2);
  });

  it('extracts facility name from 11px comment div', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].name).toBe('Company Headquarters');
    expect(result[1].name).toBe('Trade Center');
  });

  it('extracts icon URL from img src with /icons/ path', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].iconUrl).toBe('/five/icons/MapDisHQ1.gif');
    expect(result[1].iconUrl).toBe('/five/icons/MapDisTrade1.gif');
  });

  it('extracts zone type from zone image title', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].zoneType).toBe('Building must be located in a Commerce zone');
    expect(result[1].zoneType).toBe('Building must be located in an Industrial zone');
  });

  it('extracts cost from 9px comment div', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].cost).toBe('$8,000K');
    expect(result[1].cost).toBe('$12,500K');
  });

  it('extracts build time from nobr element', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].buildTime).toBe('3600 m.');
    expect(result[1].buildTime).toBe('4800 m.');
  });

  it('extracts description when present', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[0].description).toBe('The nerve center of your business empire.');
  });

  it('returns empty description when not present', () => {
    const result = parseClusterFacilitiesFromHtml(FACILITY_LIST_HTML);
    expect(result[1].description).toBe('');
  });

  it('skips span blocks without a valid name', () => {
    const html = `<span><div>no comment class</div></span>`;
    const result = parseClusterFacilitiesFromHtml(html);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty HTML', () => {
    const result = parseClusterFacilitiesFromHtml('<html><body></body></html>');
    expect(result).toEqual([]);
  });

  it('handles facility with no icon', () => {
    const html = `
    <span>
      <div class=comment style="font-size: 11px">No Icon Building</div>
      <div class=comment style="font-size: 9px">$500K<br><nobr>100 m.</nobr></div>
    </span>`;
    const result = parseClusterFacilitiesFromHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('No Icon Building');
    expect(result[0].iconUrl).toBe('');
    expect(result[0].cost).toBe('$500K');
    expect(result[0].buildTime).toBe('100 m.');
  });
});

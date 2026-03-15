import {
  parsePoliticsRatings,
  parseCampaignResponse,
  getDefaultPoliticsData,
} from './politics-handler';

// =============================================================================
// parsePoliticsRatings
// =============================================================================
describe('parsePoliticsRatings', () => {
  it('parses standard ratings table HTML', () => {
    const html = `
      <table>
        <tr><td class=label>Unemployment</td><td class=value>85%</td></tr>
        <tr><td class=label>Public Services</td><td class=value>62%</td></tr>
      </table>
    `;
    const result = parsePoliticsRatings(html);
    expect(result).toEqual([
      { name: 'Unemployment', value: 85 },
      { name: 'Public Services', value: 62 },
    ]);
  });

  it('returns empty array for HTML with no ratings', () => {
    expect(parsePoliticsRatings('<body>No data</body>')).toEqual([]);
  });

  it('handles decimal rating values', () => {
    const html = '<td class=label>Growth</td><td class=value>73.5%</td>';
    const result = parsePoliticsRatings(html);
    expect(result).toEqual([{ name: 'Growth', value: 73.5 }]);
  });

  it('skips entries with empty names', () => {
    const html = '<td class=label>  </td><td class=value>50%</td>';
    const result = parsePoliticsRatings(html);
    expect(result).toEqual([]);
  });

  it('handles value without percent sign', () => {
    const html = '<td class=label>Wealth</td><td class=value>90</td>';
    const result = parsePoliticsRatings(html);
    expect(result).toEqual([{ name: 'Wealth', value: 90 }]);
  });
});

// =============================================================================
// parseCampaignResponse
// =============================================================================
describe('parseCampaignResponse', () => {
  it('detects denial message from tycooncampaign.asp', () => {
    const html = `
      <body style="background-color: #143833; margin: 10px; padding: 0px">
        <div class=label style="margin: 30px; text-align: center">
          It is too late to launch a campaign. Campaigns can only be started during the first half of the political period..
        </div>
      </body>
    `;
    const result = parseCampaignResponse(html);
    expect(result.success).toBe(false);
    expect(result.message).toContain('too late to launch a campaign');
  });

  it('detects prestige-related denial', () => {
    const html = `
      <div class=label>
        You do not have enough prestige to run for office.
      </div>
    `;
    const result = parseCampaignResponse(html);
    expect(result.success).toBe(false);
    expect(result.message).toContain('prestige');
  });

  it('returns success when no denial div is found', () => {
    const html = `
      <body>
        <table><tr><td>Campaign projects</td></tr></table>
        <input type="range" />
      </body>
    `;
    const result = parseCampaignResponse(html);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Campaign updated successfully');
  });

  it('returns success for empty HTML body', () => {
    const result = parseCampaignResponse('<body></body>');
    expect(result.success).toBe(true);
  });

  it('strips nested HTML tags from denial message', () => {
    const html = '<div class=label><b>Error</b>: no business in town</div>';
    const result = parseCampaignResponse(html);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Error: no business in town');
  });
});

// =============================================================================
// getDefaultPoliticsData
// =============================================================================
describe('getDefaultPoliticsData', () => {
  it('returns default structure with given town name', () => {
    const data = getDefaultPoliticsData('Paraiso');
    expect(data.townName).toBe('Paraiso');
    expect(data.campaigns).toEqual([]);
    expect(data.popularRatings).toEqual([]);
    expect(data.canLaunchCampaign).toBe(false);
    expect(data.campaignMessage).toBeTruthy();
  });

  it('returns zero for all numeric fields', () => {
    const data = getDefaultPoliticsData('TestTown');
    expect(data.yearsToElections).toBe(0);
    expect(data.mayorPrestige).toBe(0);
    expect(data.mayorRating).toBe(0);
    expect(data.campaignCount).toBe(0);
  });
});

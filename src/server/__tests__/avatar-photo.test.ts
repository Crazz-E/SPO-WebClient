/**
 * Tests for Avatar/Photo display in tycoon profile
 */

import { describe, it, expect } from '@jest/globals';
import type { TycoonProfileFull } from '../../shared/types/domain-types';

describe('Avatar Photo - TycoonProfileFull', () => {
  it('should allow photoUrl to be undefined', () => {
    const profile: TycoonProfileFull = {
      name: 'TestUser',
      realName: '',
      ranking: 1,
      budget: '1000000',
      prestige: 100,
      facPrestige: 50,
      researchPrestige: 50,
      facCount: 10,
      facMax: 50,
      area: 1000,
      nobPoints: 5,
      licenceLevel: 1,
      failureLevel: 0,
      levelName: 'Apprentice',
      levelTier: 0,
    };
    expect(profile.photoUrl).toBeUndefined();
  });

  it('should accept photoUrl as proxy URL', () => {
    const profile: TycoonProfileFull = {
      name: 'TestUser',
      realName: '',
      ranking: 1,
      budget: '1000000',
      prestige: 100,
      facPrestige: 50,
      researchPrestige: 50,
      facCount: 10,
      facMax: 50,
      area: 1000,
      nobPoints: 5,
      licenceLevel: 1,
      failureLevel: 0,
      levelName: 'Apprentice',
      levelTier: 0,
      photoUrl: '/proxy-image?url=http%3A%2F%2F192.168.1.1%2Fphoto.jpg',
    };
    expect(profile.photoUrl).toContain('/proxy-image?url=');
  });

  it('should serialize photoUrl in JSON for WebSocket transport', () => {
    const profile: TycoonProfileFull = {
      name: 'TestUser',
      realName: '',
      ranking: 5,
      budget: '500000',
      prestige: 200,
      facPrestige: 100,
      researchPrestige: 100,
      facCount: 20,
      facMax: 150,
      area: 2000,
      nobPoints: 10,
      licenceLevel: 2,
      failureLevel: 0,
      levelName: 'Entrepreneur',
      levelTier: 1,
      photoUrl: '/proxy-image?url=http%3A%2F%2Fexample.com%2Favatar.jpg',
    };
    const json = JSON.parse(JSON.stringify(profile));
    expect(json.photoUrl).toBe('/proxy-image?url=http%3A%2F%2Fexample.com%2Favatar.jpg');
    expect(json.name).toBe('TestUser');
  });

  it('should not include photoUrl when undefined in JSON', () => {
    const profile: TycoonProfileFull = {
      name: 'NoPhoto',
      realName: '',
      ranking: 1,
      budget: '0',
      prestige: 0,
      facPrestige: 0,
      researchPrestige: 0,
      facCount: 0,
      facMax: 50,
      area: 0,
      nobPoints: 0,
      licenceLevel: 0,
      failureLevel: 0,
      levelName: 'Apprentice',
      levelTier: 0,
    };
    const json = JSON.parse(JSON.stringify(profile));
    expect(json).not.toHaveProperty('photoUrl');
  });
});

describe('Avatar Photo - RenderTycoon.asp parsing', () => {
  it('should extract photo URL from img#picture with src after id', () => {
    const html = '<img id="picture" src="images/tycoons/photo123.jpg" />';
    const match = /<img[^>]+id=["']?picture["']?[^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+id=["']?picture["']?/i.exec(html);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('images/tycoons/photo123.jpg');
  });

  it('should extract photo URL from img with src before id', () => {
    const html = '<img src="images/tycoons/photo456.jpg" id="picture" />';
    const match = /<img[^>]+id=["']?picture["']?[^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+id=["']?picture["']?/i.exec(html);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('images/tycoons/photo456.jpg');
  });

  it('should handle absolute photo URL', () => {
    const rawUrl = 'http://192.168.1.1/images/photo.jpg';
    const baseUrl = 'http://192.168.1.1/five/0/visual/voyager/new%20directory';
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}/${rawUrl}`;
    expect(fullUrl).toBe('http://192.168.1.1/images/photo.jpg');
  });

  it('should prepend baseUrl for relative photo URL', () => {
    const rawUrl = 'images/tycoons/photo.jpg';
    const baseUrl = 'http://192.168.1.1/five/0/visual/voyager/new%20directory';
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}/${rawUrl}`;
    expect(fullUrl).toBe('http://192.168.1.1/five/0/visual/voyager/new%20directory/images/tycoons/photo.jpg');
  });

  it('should build correct proxy URL from photo URL', () => {
    const fullUrl = 'http://192.168.1.1/images/photo.jpg';
    const proxyUrl = `/proxy-image?url=${encodeURIComponent(fullUrl)}`;
    expect(proxyUrl).toBe('/proxy-image?url=http%3A%2F%2F192.168.1.1%2Fimages%2Fphoto.jpg');
  });

  it('should return null match when no img#picture exists', () => {
    const html = '<img src="images/other.jpg" id="logo" />';
    const match = /<img[^>]+id=["']?picture["']?[^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+id=["']?picture["']?/i.exec(html);
    expect(match).toBeNull();
  });
});

describe('Avatar Photo - Profile Panel display logic', () => {
  it('should show photo when photoUrl is provided', () => {
    const photoUrl = '/proxy-image?url=http%3A%2F%2Fexample.com%2Fphoto.jpg';
    const hasPhoto = !!photoUrl;
    expect(hasPhoto).toBe(true);
  });

  it('should show placeholder when photoUrl is empty', () => {
    const photoUrl = '';
    const hasPhoto = !!photoUrl;
    expect(hasPhoto).toBe(false);
  });

  it('should show placeholder when photoUrl is undefined', () => {
    const photoUrl: string | undefined = undefined;
    const hasPhoto = !!photoUrl;
    expect(hasPhoto).toBe(false);
  });

  it('should escape HTML in photoUrl for XSS prevention', () => {
    // Simple escapeHtml simulation
    const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const maliciousUrl = '"><script>alert("xss")</script>';
    const escaped = escapeHtml(maliciousUrl);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});

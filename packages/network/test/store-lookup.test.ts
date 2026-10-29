import { describe, expect, it } from 'vitest';
import { lookupStoreApp, parseStoreInput, websiteApp } from '../src/store-lookup.ts';

describe('store input', () => {
  it('reads links, IDs and package names', () => {
    expect(parseStoreInput('https://play.google.com/store/apps/details?hl=tr&id=com.studio.game', 'ios')).toEqual({ platform: 'android', storeId: 'com.studio.game' });
    expect(parseStoreInput('https://apps.apple.com/fi/app/aurora/id1234567890?l=fi', 'android')).toEqual({ platform: 'ios', storeId: '1234567890' });
    expect(parseStoreInput('id1234567890', 'android')).toEqual({ platform: 'ios', storeId: '1234567890' });
    expect(parseStoreInput(' com.studio.game ', 'android')).toEqual({ platform: 'android', storeId: 'com.studio.game' });
    expect(parseStoreInput('com.studio.game', 'ios')).toEqual({ platform: 'ios', storeId: 'com.studio.game', bundleId: 'com.studio.game' });
    expect(parseStoreInput('https://evil.example/?id=com.x.y', 'android')).toBeNull();
    expect(parseStoreInput('not a store id', 'android')).toBeNull();
  });
});

describe('store lookup', () => {
  const respond = (body: string, ok = true) => async () => ({ ok, status: ok ? 200 : 404, text: async () => body });

  it('reads name, icon and developer from a Play page', async () => {
    const html = `<meta property="og:title" content="Aurora Quest &amp; Friends - Apps on Google Play"><meta property="og:image" content="https://play-lh.googleusercontent.com/abc=w526-h296">
      <a href="/store/apps/dev?id=123"><span>Nordic Dragon</span></a>`;
    const urls: string[] = [];
    const fetcher = async (url: string) => (urls.push(url), respond(html)());
    expect(await lookupStoreApp({ platform: 'android', storeId: 'fi.test.aurora' }, fetcher)).toEqual({
      platform: 'android',
      storeId: 'fi.test.aurora',
      name: 'Aurora Quest & Friends',
      iconUrl: 'https://play-lh.googleusercontent.com/abc=s256',
      developer: 'Nordic Dragon',
    });
    expect(urls[0]).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=fi\.test\.aurora/);
  });

  it('resolves an iOS bundle ID to the numeric App Store ID', async () => {
    const body = JSON.stringify({ results: [{ trackId: 987654321, trackName: 'Aurora', artworkUrl512: 'https://is1-ssl.mzstatic.com/a.jpg', sellerName: 'Nordic Dragon Oy' }] });
    expect(await lookupStoreApp({ platform: 'ios', storeId: 'fi.test.bundle', bundleId: 'fi.test.bundle' }, respond(body))).toMatchObject({ storeId: '987654321', name: 'Aurora', developer: 'Nordic Dragon Oy' });
  });

  it('returns null for unknown apps and store errors', async () => {
    expect(await lookupStoreApp({ platform: 'ios', storeId: '11111' }, respond('{"results":[]}'))).toBeNull();
    expect(await lookupStoreApp({ platform: 'android', storeId: 'fi.test.gone' }, respond('', false))).toBeNull();
    expect(await lookupStoreApp({ platform: 'android', storeId: 'fi.test.down' }, async () => Promise.reject(new Error('offline')))).toBeNull();
  });
});

describe('websites', () => {
  it('normalizes the domain and uses the favicon service', () => {
    expect(websiteApp('https://www.Kiqro.com/tr?x=1')).toEqual({ platform: 'web', storeId: 'kiqro.com', name: 'kiqro.com', iconUrl: 'https://www.google.com/s2/favicons?domain=kiqro.com&sz=128', developer: null });
    expect(websiteApp('shop.example.fi')).toMatchObject({ storeId: 'shop.example.fi' });
    expect(websiteApp('localhost')).toBeNull();
    expect(websiteApp('http://10.0.0.1')).toBeNull();
  });
});

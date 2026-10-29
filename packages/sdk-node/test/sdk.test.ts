import { describe, expect, it } from 'vitest';
import { KiqroDirect } from '../src/index.ts';

// Test vectors from the integration guide (secret test_secret_0123456789).
const kiqro = new KiqroDirect({ appKey: 'app_8f2c1d9e0a7b3c45', secret: 'test_secret_0123456789', baseUrl: 'https://track-staging.kiqro.com/' });

describe('Kiqro Direct SDK', () => {
  it('signs like the integration guide', () => {
    expect(kiqro.sign(['app_8f2c1d9e0a7b3c45', 'u_102938'])).toBe('a7959642b96465a9c18d94310eb258442dcd5d3ac599f7fc3485a3eec07cc9df');
    expect(kiqro.sign(['app_8f2c1d9e0a7b3c45', 'u_102938', 35])).toBe('079cace1bf6c016056dbef57ae897520808bf266b185721f1f35f92e8085dde4');
    expect(kiqro.sign(['app_8f2c1d9e0a7b3c45', 'u_102938', 'cmp_01JTESTCAMPAIGN0000000000', 'tsk_01JTASKLEVEL10000000000'])).toBe('550c1abe8607314b6d6f25648c5532483650e15957149d6c0a4a7449015563c1');
  });

  it('builds signed wall links', () => {
    const url = new URL(kiqro.wallUrl('u_102938', { lang: 'tr', risk: 35 }));
    expect(url.origin + url.pathname).toBe('https://track-staging.kiqro.com/wall');
    expect(Object.fromEntries(url.searchParams)).toEqual({ app_key: 'app_8f2c1d9e0a7b3c45', user_id: 'u_102938', sig: '079cace1bf6c016056dbef57ae897520808bf266b185721f1f35f92e8085dde4', risk: '35', lang: 'tr' });
    expect(() => kiqro.wallUrl('u', { risk: 101 })).toThrow('risk');
  });

  it('verifies postbacks', () => {
    const q = { user_id: 'u_102938', amount: '2800', transaction_id: 'cnv_01JTESTCONVERSION00000000', status: '1', signature: '8a472354508121e17ea9a525bb57992c4f70e273395a20a2985a7c748465007b' };
    expect(kiqro.verifyPostback(q)).toBe(true);
    expect(kiqro.verifyPostback({ ...q, amount: '28000' })).toBe(false);
    expect(kiqro.verifyPostback({ ...q, signature: 'zz' })).toBe(false);
    expect(kiqro.verifyPostback({ ...q, signature: undefined })).toBe(false);
  });
});

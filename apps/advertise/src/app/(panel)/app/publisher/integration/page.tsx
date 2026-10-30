import { Card, PageHeader } from '@/components/panel/ui';
import { PANEL } from '@/lib/i18n';
import { panelLocale, requirePublisherOrg } from '@/lib/session';

export const dynamic = 'force-dynamic';

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg p-4 font-mono text-[0.78rem] leading-relaxed text-fg/90">{children}</pre>;
}

export default async function PublisherIntegrationPage() {
  const [, lang] = await Promise.all([requirePublisherOrg(), panelLocale()]);
  const t = PANEL[lang].pub;
  const track = process.env.TRACKING_BASE_URL ?? 'https://track.kiqronetwork.com';

  return (
    <>
      <PageHeader title={t.integrationTitle} sub={t.integrationSub} />
      <div className="grid grid-cols-1 gap-4">
        <Card className="p-6">
          <h2 className="font-semibold">{t.wallTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.wallBody}</p>
          <Code>{`// Your server, per user
const sig = hmacSha256Hex(SECRET, \`\${APP_KEY}|\${userId}\`);
const url = \`${track}/wall?app_key=\${APP_KEY}&user_id=\${userId}&sig=\${sig}&lang=tr\`;

// Android
webView.settings.javaScriptEnabled = false
webView.loadUrl(url)   // open offer links (track.kiqronetwork.com/c/…) with an Intent in the browser

// iOS
let view = WKWebView(frame: .zero)
view.load(URLRequest(url: URL(string: url)!))`}</Code>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">{t.apiTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.apiBody}</p>
          <Code>{`GET ${track}/v1/offers?app_key=…&user_id=…&lang=tr&sig=HMAC(secret, "app_key|user_id")`}</Code>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">{t.sdkTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.sdkBody}</p>
          <Code>{`import { KiqroDirect } from '@kiqro/direct-sdk';

const kiqro = new KiqroDirect({ appKey: process.env.KIQRO_APP_KEY, secret: process.env.KIQRO_SECRET });

const offers = await kiqro.getOffers(userId, { lang: 'tr' });
const wall = kiqro.wallUrl(userId, { lang: 'tr' });

app.get('/kiqro/postback', (req, res) => {
  if (!kiqro.verifyPostback(req.query)) return res.status(403).end();
  // credit once per transaction_id + status (1 = reward, 2 = reversal)
  res.sendStatus(200);
});`}</Code>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">{t.postbackTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.postbackBody}</p>
          <p className="mt-3 text-sm text-subtle">{t.guide}</p>
        </Card>
      </div>
    </>
  );
}

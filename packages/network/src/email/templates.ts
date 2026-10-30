export type EmailLocale = 'en' | 'tr';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailTemplate =
  | { name: 'advertiser_invite'; data: { name: string; company: string; link: string; expiresHours: number } }
  | { name: 'password_reset'; data: { name: string; link: string; expiresMinutes: number } }
  | { name: 'low_balance'; data: { name: string; company: string; balance: string; threshold: string; panelLink: string } }
  | { name: 'lead_notification'; data: { name: string; email: string; company: string; vertical: string; budget: string; message: string; adminLink: string } }
  | { name: 'campaign_submitted'; data: { company: string; campaign: string; submittedBy: string; adminLink: string } }
  | { name: 'campaign_approved'; data: { name: string; campaign: string; panelLink: string } }
  | { name: 'campaign_returned'; data: { name: string; campaign: string; note: string; editLink: string } }
  | { name: 'payment_received'; data: { name: string; company: string; amount: string; method: 'stripe' | 'bank_transfer' | 'other'; paymentId: string; billingLink: string } }
  | { name: 'invoice_issued'; data: { name: string; company: string; number: string; amount: string; period: string; dueDate: string; payLink: string } }
  | { name: 'invoice_overdue'; data: { name: string; company: string; number: string; amount: string; dueDate: string; payLink: string } };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Branded, table-based layout that renders in Gmail, Outlook and Apple Mail. */
function layout(opts: { preheader: string; heading: string; paragraphs: string[]; button?: { label: string; href: string }; footnote: string }): string {
  const paragraphs = opts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#3b3858">${p}</p>`).join('');
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:#6c57f0">
        <a href="${esc(opts.button.href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(opts.button.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:#8d88a8;word-break:break-all">${esc(opts.button.href)}</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f3fb;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3fb;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="background:#13111f;border-radius:16px 16px 0 0;padding:22px 32px">
    <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px"><span style="color:#8c7bff">K</span> kiqro</span>
    <span style="margin-left:8px;font-size:10px;font-weight:600;letter-spacing:2px;color:#a7a3c2">NETWORK</span>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px">
    <h1 style="margin:0 0 20px;font-size:21px;line-height:28px;color:#16142a">${esc(opts.heading)}</h1>
    ${paragraphs}${button}
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #ece9f6;font-size:12px;line-height:18px;color:#8d88a8">${opts.footnote}</p>
  </td></tr>
  <tr><td style="padding:18px 8px;text-align:center;font-size:11px;color:#8d88a8">Kiqro Network · kiqronetwork.com</td></tr>
</table></td></tr></table></body></html>`;
}

const text = (lines: (string | undefined)[]) => lines.filter((l) => l !== undefined).join('\n\n') + '\n\n— Kiqro Network\n';

/** Renders a template in the recipient's language. Values are HTML-escaped. */
export function renderEmail(template: EmailTemplate, locale: EmailLocale): RenderedEmail {
  const tr = locale === 'tr';
  switch (template.name) {
    case 'advertiser_invite': {
      const d = template.data;
      const subject = tr ? `${d.company} için Kiqro Network hesabınız hazır` : `Your Kiqro Network account for ${d.company}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.company)}</b> için Kiqro Network reklamveren paneline erişiminiz açıldı. Kampanya performansınızı, dönüşümlerinizi ve entegrasyon bilgilerinizi buradan izleyebilirsiniz.`
        : `Hi ${esc(d.name)}, you now have access to the Kiqro Network advertiser panel for <b>${esc(d.company)}</b>. Follow your campaign performance, conversions and integration details there.`;
      const action = tr ? 'Başlamak için parolanızı belirleyin:' : 'Set your password to get started:';
      const note = tr ? `Bu bağlantı ${d.expiresHours} saat geçerlidir ve yalnızca bir kez kullanılabilir.` : `This link is valid for ${d.expiresHours} hours and can be used once.`;
      const label = tr ? 'Parolamı belirle' : 'Set my password';
      return {
        subject,
        html: layout({ preheader: action, heading: subject, paragraphs: [intro, action], button: { label, href: d.link }, footnote: `${note} ${tr ? 'Bu e-postayı beklemiyorsanız yok sayabilirsiniz.' : 'If you were not expecting this e-mail, you can ignore it.'}` }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), `${action}\n${d.link}`, note]),
      };
    }
    case 'password_reset': {
      const d = template.data;
      const subject = tr ? 'Kiqro Network parola sıfırlama' : 'Reset your Kiqro Network password';
      const intro = tr ? `Merhaba ${esc(d.name)}, hesabınız için parola sıfırlama talebi aldık.` : `Hi ${esc(d.name)}, we received a request to reset the password for your account.`;
      const note = tr
        ? `Bağlantı ${d.expiresMinutes} dakika geçerlidir. Talebi siz yapmadıysanız bu e-postayı yok sayın; parolanız değişmez.`
        : `The link is valid for ${d.expiresMinutes} minutes. If you did not ask for this, ignore this e-mail — your password stays the same.`;
      const label = tr ? 'Yeni parola belirle' : 'Choose a new password';
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro], button: { label, href: d.link }, footnote: note }),
        text: text([subject, intro, d.link, note]),
      };
    }
    case 'low_balance': {
      const d = template.data;
      const subject = tr ? `Bakiyeniz azaldı: ${d.balance}` : `Your balance is low: ${d.balance}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.company)}</b> hesabının bakiyesi ${esc(d.threshold)} eşiğinin altına düştü (şu an ${esc(d.balance)}). Bakiye bittiğinde kampanyalarınız yeni kullanıcı almayı durdurur.`
        : `Hi ${esc(d.name)}, the balance of <b>${esc(d.company)}</b> fell below ${esc(d.threshold)} (now ${esc(d.balance)}). When it runs out, your campaigns stop acquiring new users.`;
      const next = tr
        ? 'Paneldeki Ödemeler sayfasından kartla bakiye yükleyebilir, havale bilgisi için Kiqro ile iletişime geçebilirsiniz.'
        : 'Top up by card on the Billing page of the panel, or contact Kiqro for bank transfer details.';
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro, next], button: { label: tr ? 'Bakiye yükle' : 'Top up', href: d.panelLink }, footnote: tr ? 'Bu uyarı en fazla günde bir kez gönderilir.' : 'This alert is sent at most once a day.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), next, d.panelLink]),
      };
    }
    case 'lead_notification': {
      const d = template.data;
      const subject = `Yeni demo talebi: ${d.company}`;
      const rows = [
        ['Kişi', `${d.name} <${d.email}>`],
        ['Şirket', d.company],
        ['Kategori', d.vertical],
        ['Bütçe', d.budget],
        ['Mesaj', d.message],
      ];
      return {
        subject,
        html: layout({
          preheader: subject,
          heading: subject,
          paragraphs: rows.map(([k, v]) => `<b>${k}:</b> ${esc(v!)}`),
          button: { label: 'Admin panelinde aç', href: d.adminLink },
          footnote: 'kiqronetwork.com demo formundan otomatik bildirim.',
        }),
        text: text([subject, ...rows.map(([k, v]) => `${k}: ${v}`), d.adminLink]),
      };
    }
    case 'campaign_submitted': {
      // Internal notification for the Kiqro team, always in Turkish.
      const d = template.data;
      const subject = `İncelemeye gönderildi: ${d.campaign} (${d.company})`;
      const intro = `<b>${esc(d.company)}</b> reklamvereninden ${esc(d.submittedBy)}, <b>${esc(d.campaign)}</b> kampanyasını incelemeye gönderdi. Takip linkini, olay adlarını, süreleri ve fiyatları kontrol edip onaylayın ya da notla geri gönderin.`;
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro], button: { label: 'Admin panelinde incele', href: d.adminLink }, footnote: 'Hedef inceleme süresi: 1 iş günü.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), d.adminLink]),
      };
    }
    case 'campaign_approved': {
      const d = template.data;
      const subject = tr ? `Kampanyanız yayında: ${d.campaign}` : `Your campaign is live: ${d.campaign}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.campaign)}</b> kampanyanızı inceledik ve yayına aldık. Kullanıcılar teklifinizi şimdi görmeye başlıyor; sonuçları panelden canlı izleyebilirsiniz.`
        : `Hi ${esc(d.name)}, we reviewed <b>${esc(d.campaign)}</b> and it is now live. Users are starting to see your offer; follow the results in the panel.`;
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro], button: { label: tr ? 'Paneli aç' : 'Open the panel', href: d.panelLink }, footnote: tr ? 'İlk dönüşümler MMP’nizin postback’leri geldikçe görünür.' : 'First conversions appear as your MMP’s postbacks arrive.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), d.panelLink]),
      };
    }
    case 'campaign_returned': {
      const d = template.data;
      const subject = tr ? `Kampanyanızda değişiklik gerekiyor: ${d.campaign}` : `Changes needed: ${d.campaign}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.campaign)}</b> kampanyanızı inceledik; yayına almadan önce şu düzenlemeyi rica ediyoruz:`
        : `Hi ${esc(d.name)}, we reviewed <b>${esc(d.campaign)}</b> and need a change before it can go live:`;
      const note = `<span style="display:block;padding:12px 14px;border-left:3px solid #6c57f0;background:#f4f3fb;border-radius:6px">${esc(d.note)}</span>`;
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro, note], button: { label: tr ? 'Kampanyayı düzenle' : 'Edit the campaign', href: d.editLink }, footnote: tr ? 'Düzenledikten sonra tekrar incelemeye gönderin.' : 'Submit it for review again once updated.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), d.note, d.editLink]),
      };
    }
    case 'payment_received': {
      const d = template.data;
      const methods = { stripe: tr ? 'kart (Stripe)' : 'card (Stripe)', bank_transfer: tr ? 'banka havalesi' : 'bank transfer', other: tr ? 'diğer' : 'other' };
      const subject = tr ? `Ödemeniz alındı: ${d.amount}` : `Payment received: ${d.amount}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.company)}</b> hesabına ${esc(d.amount)} tutarındaki ödeme (${methods[d.method]}) bakiyenize eklendi. Varsa açık faturalarınıza en eskisinden başlayarak uygulandı.`
        : `Hi ${esc(d.name)}, the payment of ${esc(d.amount)} (${methods[d.method]}) for <b>${esc(d.company)}</b> has been added to your balance and applied to any open invoices, oldest first.`;
      const ref = `${tr ? 'Ödeme no' : 'Payment ID'}: ${esc(d.paymentId)}`;
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro, ref], button: { label: tr ? 'Ödemeleri görüntüle' : 'View billing', href: d.billingLink }, footnote: tr ? 'Bu e-posta ödeme bildirimidir; resmi fatura ayrıca düzenlenir.' : 'This e-mail confirms your payment; the formal invoice is issued separately.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), ref, d.billingLink]),
      };
    }
    case 'invoice_issued': {
      const d = template.data;
      const subject = tr ? `Fatura ${d.number}: ${d.amount}, son ödeme ${d.dueDate}` : `Invoice ${d.number}: ${d.amount}, due ${d.dueDate}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.company)}</b> için ${esc(d.period)} dönemi faturası düzenlendi. Tutar <b>${esc(d.amount)}</b>, son ödeme tarihi <b>${esc(d.dueDate)}</b>.`
        : `Hi ${esc(d.name)}, the ${esc(d.period)} invoice for <b>${esc(d.company)}</b> is ready. Amount <b>${esc(d.amount)}</b>, due <b>${esc(d.dueDate)}</b>.`;
      const how = tr ? 'Panelden kartla ödeyebilir ya da havale yapabilirsiniz (açıklamaya fatura numarasını yazın).' : 'Pay by card in the panel or by bank transfer (put the invoice number in the reference).';
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro, how], button: { label: tr ? 'Faturayı öde' : 'Pay invoice', href: d.payLink }, footnote: tr ? 'Vadesi geçen faturalarda kredi limitiniz ödeme yapılana kadar askıya alınır.' : 'If an invoice becomes overdue, your credit line is paused until it is paid.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), how, d.payLink]),
      };
    }
    case 'invoice_overdue': {
      const d = template.data;
      const subject = tr ? `Vadesi geçmiş fatura: ${d.number}` : `Overdue invoice: ${d.number}`;
      const intro = tr
        ? `Merhaba ${esc(d.name)}, <b>${esc(d.company)}</b> hesabının ${esc(d.number)} numaralı faturası ${esc(d.dueDate)} tarihinde vadesini doldurdu; ${esc(d.amount)} ödenmedi. Kredi limitiniz askıya alındı: kampanyalarınız yalnızca ön ödemeli bakiyeyle çalışır.`
        : `Hi ${esc(d.name)}, invoice ${esc(d.number)} for <b>${esc(d.company)}</b> was due on ${esc(d.dueDate)} and ${esc(d.amount)} is unpaid. Your credit line is paused: campaigns run on prepaid balance only until it is paid.`;
      return {
        subject,
        html: layout({ preheader: subject, heading: subject, paragraphs: [intro], button: { label: tr ? 'Şimdi öde' : 'Pay now', href: d.payLink }, footnote: tr ? 'Ödemeyi yaptıysanız bu e-postayı yok sayabilirsiniz.' : 'If you have already paid, you can ignore this e-mail.' }),
        text: text([subject, intro.replace(/<\/?b>/g, ''), d.payLink]),
      };
    }
  }
}

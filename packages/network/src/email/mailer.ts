export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template name, sent to the provider as a category for its statistics. */
  category: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Permanent failures (bad address, rejected content) are not retried. */
  permanent?: boolean;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<SendResult>;
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/**
 * SendGrid v3 Mail Send API (https://api.sendgrid.com/v3/mail/send). Click tracking is turned
 * off so password links are not rewritten through SendGrid's redirect domain. With `sandbox`,
 * SendGrid validates the request without delivering it (useful to test a key).
 */
export function sendgridMailer(opts: { apiKey: string; from: string; fromName: string; replyTo?: string; sandbox?: boolean; fetcher?: Fetcher }): Mailer {
  const fetcher = opts.fetcher ?? (fetch as unknown as Fetcher);
  return {
    async send(email) {
      const body = {
        personalizations: [{ to: [{ email: email.to }] }],
        from: { email: opts.from, name: opts.fromName },
        ...(opts.replyTo ? { reply_to: { email: opts.replyTo } } : {}),
        subject: email.subject,
        content: [
          { type: 'text/plain', value: email.text },
          { type: 'text/html', value: email.html },
        ],
        categories: [email.category],
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
        ...(opts.sandbox ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
      };
      try {
        const res = await fetcher('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 202 || res.status === 200) return { ok: true, providerMessageId: res.headers.get('x-message-id') ?? undefined };
        const detail = (await res.text()).slice(0, 300);
        // 4xx other than rate limiting / auth problems mean this message will never succeed.
        const permanent = res.status === 400 || res.status === 413;
        return { ok: false, error: `SendGrid ${res.status}: ${detail}`, permanent };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Development mailer: prints the message (including links) to the console instead of sending. */
export function consoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    async send(email) {
      log(`\n✉  [${email.category}] to ${email.to}: ${email.subject}\n${email.text}\n`);
      return { ok: true, providerMessageId: 'console' };
    },
  };
}

/**
 * SENDGRID_API_KEY enables SendGrid; MAIL_FROM must be an address on a domain authenticated
 * in SendGrid (e.g. noreply@kiqro.com). Without a key, mail is printed to the console.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (!env.SENDGRID_API_KEY) return consoleMailer();
  return sendgridMailer({
    apiKey: env.SENDGRID_API_KEY,
    from: env.MAIL_FROM ?? 'noreply@kiqro.com',
    fromName: env.MAIL_FROM_NAME ?? 'Kiqro Network',
    replyTo: env.MAIL_REPLY_TO,
    sandbox: env.SENDGRID_SANDBOX === 'true',
  });
}

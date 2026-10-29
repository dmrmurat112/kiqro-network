import { and, count, countDistinct, eq, gte, inArray } from 'drizzle-orm';
import { schema, type DbOrTx } from '@kiqro/db';
import type { IpRisk } from '@kiqro/db/schema';
import { noIpIntel, type IpIntel } from './ip-intel.ts';

const { clicks, conversions, campaignTasks } = schema;

export interface FraudConfig {
  /** Refuse clicks from VPN, proxy and Tor exits. Rewarded traffic through anonymizers is mostly abuse. */
  blockAnonymizers: boolean;
  /** Refuse clicks from hosting/datacenter IPs (bots, emulator farms). */
  blockDatacenter: boolean;
  /** Provider risk score at or above which a click is refused. */
  ipScoreBlock: number;
  /** Provider risk score at or above which conversions are held for review. */
  ipScoreHold: number;
  /** Publisher-reported user risk at or above which conversions are held. */
  publisherRiskHold: number;
  /** Publisher-reported user risk at or above which clicks are refused. */
  publisherRiskBlock: number;
  maxClicksPerIpPerHour: number;
  /** Distinct publisher users with an install from one IP in 24 h before further installs are held (device farms). */
  maxInstallUsersPerIpPerDay: number;
  maxConversionsPerUserPerHour: number;
}

export const defaultFraudConfig: FraudConfig = {
  blockAnonymizers: true,
  blockDatacenter: true,
  ipScoreBlock: 90,
  ipScoreHold: 75,
  publisherRiskHold: 70,
  publisherRiskBlock: 90,
  maxClicksPerIpPerHour: 60,
  maxInstallUsersPerIpPerDay: 3,
  maxConversionsPerUserPerHour: 20,
};

export interface FraudContext {
  intel: IpIntel;
  config: FraudConfig;
}

export const defaultFraudContext: FraudContext = { intel: noIpIntel, config: defaultFraudConfig };

const HOUR_MS = 3_600_000;

export interface ClickScreening {
  /** Reason to refuse the click, or null to allow it. */
  block: string | null;
  ipRisk: IpRisk | null;
}

/** Checks a click before it is recorded. */
export async function screenClick(
  db: DbOrTx,
  ctx: FraudContext,
  click: { ip: string | null; country: string | null; publisherRisk: number | null },
  now: Date,
): Promise<ClickScreening> {
  const { config } = ctx;
  if (click.publisherRisk !== null && click.publisherRisk >= config.publisherRiskBlock) return { block: 'publisher_user_risk', ipRisk: null };
  if (!click.ip) return { block: null, ipRisk: null };

  const ipRisk = await ctx.intel.lookup(click.ip);
  if (ipRisk) {
    if (config.blockAnonymizers && (ipRisk.vpn || ipRisk.proxy || ipRisk.tor)) return { block: 'anonymizer', ipRisk };
    if (config.blockDatacenter && ipRisk.datacenter) return { block: 'datacenter_ip', ipRisk };
    if (ipRisk.score >= config.ipScoreBlock) return { block: 'ip_high_risk', ipRisk };
    // Cloudflare's country and the provider's should agree; a mismatch suggests header spoofing or tunnelling.
    if (ipRisk.country && click.country && ipRisk.country !== click.country) return { block: 'ip_country_mismatch', ipRisk };
  }

  const [recent] = await db
    .select({ n: count() })
    .from(clicks)
    .where(and(eq(clicks.ip, click.ip), gte(clicks.createdAt, new Date(now.getTime() - HOUR_MS))));
  if (recent!.n >= config.maxClicksPerIpPerHour) return { block: 'ip_click_velocity', ipRisk };

  return { block: null, ipRisk };
}

/** Reasons to hold a conversion for manual review (it is not billed or rewarded until approved). */
export async function conversionHoldReasons(
  db: DbOrTx,
  ctx: FraudContext,
  input: {
    click: typeof clicks.$inferSelect;
    isInstall: boolean;
    now: Date;
  },
): Promise<string[]> {
  const { config } = ctx;
  const { click, now } = input;
  const reasons: string[] = [];

  if (click.ipRisk && click.ipRisk.score >= config.ipScoreHold) reasons.push('ip_risky');
  if (click.publisherRisk !== null && click.publisherRisk >= config.publisherRiskHold) reasons.push('publisher_user_risk');

  if (input.isInstall && click.ip) {
    // How many other users already got an install credited from this IP in the last 24 h?
    const [farm] = await db
      .select({ users: countDistinct(conversions.publisherUserId) })
      .from(conversions)
      .innerJoin(clicks, eq(clicks.id, conversions.clickId))
      .innerJoin(campaignTasks, eq(campaignTasks.id, conversions.taskId))
      .where(
        and(
          eq(clicks.ip, click.ip),
          eq(campaignTasks.mmpEventName, 'install'),
          inArray(conversions.status, ['approved', 'held']),
          gte(conversions.createdAt, new Date(now.getTime() - 24 * HOUR_MS)),
        ),
      );
    if (farm!.users >= config.maxInstallUsersPerIpPerDay) reasons.push('ip_install_cluster');
  }

  const [velocity] = await db
    .select({ n: count() })
    .from(conversions)
    .where(
      and(
        eq(conversions.placementId, click.placementId),
        eq(conversions.publisherUserId, click.publisherUserId),
        inArray(conversions.status, ['approved', 'held']),
        gte(conversions.createdAt, new Date(now.getTime() - HOUR_MS)),
      ),
    );
  if (velocity!.n >= config.maxConversionsPerUserPerHour) reasons.push('user_velocity');

  return reasons;
}

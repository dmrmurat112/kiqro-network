'use server';

import { revalidatePath } from 'next/cache';
import type { FieldIssue } from '@kiqro/network';
import { inviteTeamMember, removeTeamMember, resendTeamInvite, setTeamRole } from '@kiqro/network/advertiser';
import { db } from '@/lib/db';
import { panelLocale, requireAdvertiser } from '@/lib/session';

const links = () => ({ advertiseBaseUrl: process.env.ADVERTISE_BASE_URL ?? 'http://localhost:4200' });

export type TeamState = { ok?: boolean; issues?: FieldIssue[] } | undefined;

export async function inviteAction(_: TeamState, form: FormData): Promise<TeamState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const result = await inviteTeamMember(
    db,
    session,
    { email: String(form.get('email') ?? ''), name: String(form.get('name') ?? ''), role: String(form.get('role') ?? 'member'), locale: String(form.get('locale') ?? lang) },
    links(),
    lang,
  );
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/team');
  return { ok: true };
}

/** Role change, invite resend or removal of one teammate. */
export async function memberAction(userId: string, op: 'admin' | 'member' | 'resend' | 'remove'): Promise<TeamState> {
  const [session, lang] = await Promise.all([requireAdvertiser(), panelLocale()]);
  const result =
    op === 'resend'
      ? await resendTeamInvite(db, session, userId, links(), lang)
      : op === 'remove'
        ? await removeTeamMember(db, session, userId, lang)
        : await setTeamRole(db, session, userId, op, lang);
  if (!result.ok) return { issues: result.issues };
  revalidatePath('/app/team');
  return { ok: true };
}

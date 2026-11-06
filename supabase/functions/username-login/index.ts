// Username + password sign-in (PRD 3.2). Any failure returns INVALID_CREDENTIALS,
// so callers cannot tell whether a company or user exists.
import { loginSchema } from '../_shared/app.ts';
import { admin, anon } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

// Used to spend the same time on unknown users as on known ones.
const NO_SUCH_EMAIL = 'nobody@invalid.local';

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
}

handle('username-login', async ({ req, body }) => {
  const input = loginSchema.parse(body);
  const username = input.username.toLowerCase();
  const userKey = `${input.slug}:${username}`;
  const db = admin();

  const { data: allowed, error: rateErr } = await db.rpc('login_attempt', {
    p_user_key: userKey,
    p_ip: clientIp(req),
  });
  if (rateErr) throw new Error(rateErr.message);
  if (allowed !== true) throw new AppError('RATE_LIMITED');

  const { data: company } = await db
    .from('companies')
    .select('id, status')
    .eq('slug', input.slug)
    .maybeSingle();

  let email = NO_SUCH_EMAIL;
  if (company && company.status !== 'suspended' && company.status !== 'pending_deletion') {
    const { data: profile } = await db
      .from('profiles')
      .select('work_email, status')
      .eq('company_id', company.id)
      .eq('username', username)
      .maybeSingle();
    if (profile && profile.status !== 'offboarded') email = profile.work_email;
  }

  const { data: auth, error } = await anon().auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error || !auth.session || email === NO_SUCH_EMAIL) {
    throw new AppError('INVALID_CREDENTIALS');
  }

  await db.rpc('login_succeeded', { p_user_key: userKey });
  await db.from('audit_log').insert({
    company_id: company?.id ?? null,
    actor_id: auth.user.id,
    actor_type: 'system',
    action: 'auth.login',
    target_table: 'profiles',
    target_id: auth.user.id,
  });

  return {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
  };
});

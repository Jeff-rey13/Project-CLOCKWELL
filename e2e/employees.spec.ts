import { test, type APIRequestContext } from '@playwright/test';
import { expect, PASSWORD, signedIn } from './helpers';

const MAILPIT = 'http://127.0.0.1:54324';

/** Finds the invite link in the local test inbox. */
async function inviteLink(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const found = (await search.json()) as { messages?: Array<{ ID: string }> };
    const id = found.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string; HTML: string };
      const m = /(https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+)/.exec(`${msg.Text}\n${msg.HTML}`);
      if (m?.[1]) return m[1].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('invite email not found');
}

test('HR onboards an employee, the invite works, then HR offboards them', async ({ browser, request }) => {
  const stamp = Date.now();
  const email = `new.starter.${stamp}@harbourline.test`;
  const name = `Nadia Starter${stamp}`;

  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/employees/');
  await expect(hr.getByRole('cell', { name: /Aisyah Rahman/ })).toBeVisible();
  await hr.getByRole('button', { name: 'Onboard' }).click();
  const sheet = hr.getByRole('dialog', { name: 'Onboard employee' });
  await sheet.getByLabel('Full name').fill(name);
  await sheet.getByLabel('Work email').fill(email);
  await sheet.getByLabel('Department (optional)').fill('Warehouse');
  await sheet.getByRole('button', { name: 'Send invite' }).click();
  await expect(hr.getByText(/Invite sent\. Username: nadia\d*/)).toBeVisible();
  const row = hr.getByRole('row', { name: new RegExp(name) });
  await expect(row.getByText('Invited')).toBeVisible();
  const username = ((await row.getByText(/^nadia\d* ·/).textContent()) ?? '').split(' ·')[0]!.trim();

  // The new starter opens the invite, sets a password and accepts the privacy notice.
  const link = await inviteLink(request, email);
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const starter = await ctx.newPage();
  await starter.goto(link);
  await starter.waitForURL('**/welcome/**');
  await expect(starter.getByText(`Your username is ${username}`)).toBeVisible();
  await starter.getByLabel('New password').fill(PASSWORD);
  await starter.getByLabel('Confirm password').fill(PASSWORD);
  await starter.getByRole('button', { name: 'Save password and continue' }).click();
  await starter.getByRole('button', { name: 'I understand' }).click();
  await expect(starter.getByRole('heading', { name: /Nadia/ })).toBeVisible();

  // Now active in the HR list.
  await hr.reload();
  await expect(hr.getByRole('row', { name: new RegExp(name) }).getByText('Invited')).toHaveCount(0);

  // Offboard: the starter is signed out and cannot sign in again.
  await hr.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Offboard' }).click();
  await hr.getByRole('dialog', { name: 'Offboard employee' }).getByRole('button', { name: /^Offboard Nadia/ }).click();
  await expect(hr.getByText(`${name} has been offboarded.`)).toBeVisible();
  await hr.getByRole('tab', { name: 'Offboarded' }).click();
  await expect(hr.getByRole('row', { name: new RegExp(name) })).toBeVisible();

  const again = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const login = await again.newPage();
  await login.goto('/login/?company=harbourline');
  await login.getByLabel('Username').fill(username);
  await login.getByLabel('Password').fill(PASSWORD);
  await login.getByRole('button', { name: 'Sign in' }).click();
  await expect(login.getByRole('alert').filter({ hasText: 'The username or password is not right.' })).toBeVisible();
});

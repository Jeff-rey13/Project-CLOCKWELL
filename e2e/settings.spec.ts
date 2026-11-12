import { createHmac } from 'node:crypto';
import { test } from '@playwright/test';
import { expect, signedIn } from './helpers';

/** RFC 6238 time-based code from a base32 secret, like an authenticator app. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

test('HR saves retention, grants and ends support access', async ({ browser }) => {
  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/settings/');
  await hr.getByLabel('Keep selfies (days)').fill('60');
  await hr.getByRole('button', { name: 'Save settings' }).click();
  await expect(hr.getByText('Settings saved.')).toBeVisible();
  await hr.getByLabel('Keep selfies (days)').fill('90');
  await hr.getByRole('button', { name: 'Save settings' }).click();

  const end = hr.getByRole('button', { name: 'End now' });
  if (await end.isVisible()) await end.click();
  await hr.getByLabel('Reason').fill('Checking a clock-in issue');
  await hr.getByLabel('For').selectOption('2');
  await hr.getByRole('button', { name: 'Grant access' }).click();
  await expect(hr.getByText('Support access granted.')).toBeVisible();
  await expect(hr.getByText(/Active until/)).toBeVisible();
  await hr.getByRole('button', { name: 'End now' }).click();
  await expect(hr.getByText('Support access ended.')).toBeVisible();
  await expect(hr.getByText('Access ended').first()).toBeVisible();
});

test('HR approvals has leave, claims and time fixes tabs', async ({ browser }) => {
  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/approvals/');
  for (const tab of ['Leave', 'Claims', 'Time fixes']) {
    await hr.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(hr.getByRole('tabpanel', { name: tab })).toBeVisible();
  }
});

test('HR on a phone uses the bottom tabs and the person action sheet', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill('meiling');
  await page.getByLabel('Password').fill('Passw0rd!local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/hr/dashboard/');
  const tabs = page.getByRole('navigation', { name: 'HR' }).last();
  for (const label of ['Today', 'Approvals', 'People', 'Offices']) {
    await expect(tabs.getByRole('link', { name: label })).toBeVisible();
  }
  await tabs.getByRole('link', { name: 'People' }).click();
  await page.getByRole('button', { name: /^Aisyah Rahman\s*HL-0142/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Aisyah Rahman' });
  await expect(sheet.getByRole('link', { name: 'Adjust time' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Edit' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('HR admin turns on two-step sign-in with an authenticator code', async ({ browser }) => {
  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/settings/');
  await expect(hr.getByRole('listitem').filter({ hasText: 'Mei Ling Tan' }).getByText(/Two-step (on|off)/)).toBeVisible();
  const setUp = hr.getByRole('button', { name: 'Set up my two-step sign-in' });
  test.skip(!(await setUp.isVisible()), 'already set up on this local database');
  await setUp.click();
  const sheet = hr.getByRole('dialog', { name: 'Two-step sign-in' });
  const secret = (await sheet.getByTestId('totp-secret').textContent())!.trim();
  await sheet.getByLabel('Code').fill(totp(secret));
  await sheet.getByRole('button', { name: 'Turn on two-step sign-in' }).click();
  await expect(sheet.getByText('Two-step sign-in is on for this session.')).toBeVisible();
  await hr.keyboard.press('Escape');
  await hr.reload();
  await expect(hr.getByRole('listitem').filter({ hasText: 'Mei Ling Tan' }).getByText('Two-step on')).toBeVisible();
});

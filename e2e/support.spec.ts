import { test, type Browser } from '@playwright/test';
import { expect, PASSWORD, signedIn } from './helpers';

const HARBOURLINE = '10000000-0000-0000-0000-000000000001';

async function platformSignIn(browser: Browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/platform/login/');
  await page.getByLabel('Email').fill('ops@vendor.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/platform/companies/');
  return page;
}

test('support can read company data only while HR has granted access, and every view is logged', async ({ browser }) => {
  // HR makes sure no grant is active.
  const hr = await signedIn(browser, 'meiling', 'harbourline', { desktop: true });
  await hr.goto('/hr/settings/');
  const end = hr.getByRole('button', { name: 'End now' });
  await expect(hr.getByRole('heading', { name: 'Support access' })).toBeVisible();
  if (await end.isVisible()) {
    await end.click();
    await expect(hr.getByText('Support access ended.')).toBeVisible();
  }

  // Without a grant, support sees nothing.
  const ops = await platformSignIn(browser);
  await ops.goto(`/platform/support/?company=${HARBOURLINE}`);
  await expect(ops.getByText('No active support access')).toBeVisible();

  // HR grants access; support can now read, read only.
  await hr.getByLabel('Reason').fill('Help with a missing clock-out');
  await hr.getByRole('button', { name: 'Grant access' }).click();
  await expect(hr.getByText('Support access granted.')).toBeVisible();

  await ops.goto(`/platform/company/?id=${HARBOURLINE}`);
  await ops.getByRole('link', { name: 'Open as support (logged)' }).click();
  await expect(ops.getByText(/Support view of Harbourline Logistics: read only/)).toBeVisible();
  await expect(ops.getByText('Aisyah Rahman')).toBeVisible();
  await expect(ops.getByText('aisyah@harbourline.test')).toHaveCount(0);
  await ops.getByRole('tab', { name: 'Leave' }).click();
  await expect(ops.getByRole('tabpanel', { name: 'Leave' })).toBeVisible();
  await expect(ops.getByRole('button', { name: /Approve|Reject|Save|Edit/ })).toHaveCount(0);

  // HR sees the views in the access log, then ends access.
  await hr.reload();
  await expect(hr.getByText('Support viewed data').first()).toBeVisible();
  await hr.getByRole('button', { name: 'End now' }).click();
  await expect(hr.getByText('Support access ended.')).toBeVisible();

  await ops.getByRole('tab', { name: 'Claims' }).click();
  await expect(ops.getByText('No active support access')).toBeVisible();
});

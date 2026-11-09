import { test, type Browser } from '@playwright/test';
import { expect, PASSWORD } from './helpers';

async function platformSignIn(browser: Browser, email: string) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto('/platform/login/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/platform/companies/');
  return page;
}

test('platform admin creates a company, changes its plan, and deletion needs a second admin', async ({ browser }) => {
  const stamp = Date.now();
  const name = `Test Co ${stamp}`;
  const ops = await platformSignIn(browser, 'ops@vendor.test');
  await expect(ops.getByRole('link', { name: 'Harbourline Logistics' }).first()).toBeVisible();

  await ops.getByRole('button', { name: 'New company' }).click();
  const sheet = ops.getByRole('dialog', { name: 'New company' });
  await sheet.getByLabel('Company name').fill(name);
  await expect(sheet.getByLabel('Address')).toHaveValue(`test-co-${stamp}`);
  await sheet.getByLabel('Full name').fill('Hana Admin');
  await sheet.getByLabel('Work email').fill(`hana.${stamp}@testco.test`);
  await sheet.getByRole('button', { name: 'Create company and send invite' }).click();
  await expect(ops.getByText(`${name} created. The HR admin has been sent an invite.`)).toBeVisible();

  await ops.getByRole('link', { name }).first().click();
  await ops.waitForURL('**/platform/company/**');
  await expect(ops.getByRole('heading', { name })).toBeVisible();
  await expect(ops.getByText('Invited').locator('..').getByText('1')).toBeVisible();
  await ops.getByLabel('Seat limit').fill('80');
  await ops.getByRole('switch', { name: 'Payroll export' }).click();
  await ops.getByRole('button', { name: 'Save plan' }).click();
  await expect(ops.getByText('Company updated.')).toBeVisible();

  await ops.getByRole('button', { name: 'Suspend' }).click();
  await expect(ops.getByText('Company suspended.')).toBeVisible();

  await ops.getByRole('textbox', { name: 'Company name' }).fill(name);
  await ops.getByRole('button', { name: 'Request deletion' }).click();
  await expect(ops.getByText('Deletion requested.', { exact: false })).toBeVisible();
  await expect(ops.getByRole('button', { name: 'Approve deletion' })).toHaveCount(0);

  const ops2 = await platformSignIn(browser, 'ops2@vendor.test');
  await ops2.goto(ops.url());
  await ops2.getByRole('button', { name: 'Approve deletion' }).click();
  await expect(ops2.getByText('Deletion approved. Data is removed in 30 days.')).toBeVisible();
  await expect(ops2.getByText(/Data will be deleted on/)).toBeVisible();
});

test('company HR cannot open the platform console', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto('/platform/login/');
  await page.getByLabel('Email').fill('meiling@harbourline.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The username or password is not right.' })).toBeVisible();
  await page.goto('/platform/companies/');
  await page.waitForURL('**/platform/login/');
});

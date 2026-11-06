import { expect, test, type Browser, type Page } from '@playwright/test';

// PRD 9, flow 2: employee requests leave, HR approves, balance updates.
const PASSWORD = 'Passw0rd!local'; // local seed only

/** Each user gets their own browser context, like two different phones. */
async function signedIn(browser: Browser, username: string, landing: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${landing}`);
  return page;
}

async function annualLeft(page: Page): Promise<number> {
  await page.goto('/home/');
  const value = page.getByText('Annual leave left').locator('..').locator('p').first();
  await expect(value).toHaveText(/^\d+(\.\d)?$/);
  return Number(await value.textContent());
}

test('employee requests leave, HR approves, balance goes down', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah', '/home/');

  // Clear requests left by earlier local runs so dates do not overlap.
  await employee.goto('/requests/');
  await expect(
    employee.getByText(/No leave requests yet|Waiting for HR|Approved|Rejected|Cancelled/).first(),
  ).toBeVisible();
  const cancelButtons = employee.getByRole('button', { name: 'Cancel request' });
  while ((await cancelButtons.count()) > 0) {
    const n = await cancelButtons.count();
    await cancelButtons.first().click();
    await expect(cancelButtons).toHaveCount(n - 1);
  }

  const before = await annualLeft(employee);

  await employee.getByRole('link', { name: 'Apply leave' }).click();
  await employee.waitForURL('**/leave/new/');
  await employee.getByLabel('Type', { exact: true }).selectOption({ label: 'Annual leave' });
  await employee.getByLabel('From', { exact: true }).fill('2026-12-28'); // Monday
  await employee.getByLabel('To', { exact: true }).fill('2026-12-29'); // Tuesday
  await expect(employee.getByText('Working days').locator('..')).toContainText('2');
  await employee.getByRole('button', { name: 'Send request' }).click();
  await employee.waitForURL('**/requests/');
  await expect(employee.locator('li', { hasText: '28 Dec to 29 Dec' }).getByText('Waiting for HR')).toBeVisible();

  // HR approves on their own device.
  const hr = await signedIn(browser, 'meiling', '/hr/dashboard/');
  await hr.goto('/hr/leave/');
  const row = hr.locator('li', { hasText: 'Aisyah Rahman' }).filter({ hasText: '28 Dec to 29 Dec' });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(hr.getByText('Leave approved.')).toBeVisible();

  // Employee sees the approval and the lower balance.
  expect(await annualLeft(employee)).toBe(before - 2);
  await employee.goto('/requests/');
  const approved = employee.locator('li', { hasText: '28 Dec to 29 Dec' });
  await expect(approved.getByText('Approved')).toBeVisible();

  // Clean up: cancelling approved future leave returns the balance.
  await approved.getByRole('button', { name: 'Cancel request' }).click();
  await expect(employee.getByText('Leave cancelled.')).toBeVisible();
  expect(await annualLeft(employee)).toBe(before);
});

test('employee cannot ask for more leave than is left', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah', '/home/');
  await employee.goto('/leave/new/');
  await employee.getByLabel('Type', { exact: true }).selectOption({ label: 'Annual leave' });
  await employee.getByLabel('From', { exact: true }).fill('2026-11-09');
  await employee.getByLabel('To', { exact: true }).fill('2026-12-11');
  await employee.getByRole('button', { name: 'Send request' }).click();
  await expect(employee.getByRole('alert').filter({ hasText: 'You do not have enough leave left.' })).toBeVisible();
});

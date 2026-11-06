import { expect, test } from '@playwright/test';

const PASSWORD = 'Passw0rd!local'; // local seed only

test('employee signs in, sees home, and signs out', async ({ page }) => {
  await page.goto('/login/?company=harbourline');
  await expect(page.getByRole('heading', { name: 'Harbourline Logistics' })).toBeVisible();
  await page.getByLabel('Username').fill('aisyah');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home/');
  await expect(page.getByRole('heading', { name: /Aisyah/ })).toBeVisible();

  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login/');
});

test('wrong password shows one generic error', async ({ page }) => {
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill('aisyah');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'The username or password is not right.' }),
  ).toBeVisible();
});

test('HR is routed to the HR dashboard', async ({ page }) => {
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill('meiling');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/hr/dashboard/');
});

test('an employee cannot open HR pages', async ({ page }) => {
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill('aisyah');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home/');
  await page.goto('/hr/dashboard/');
  await page.waitForURL('**/home/');
});

test('unknown company shows not found', async ({ page }) => {
  await page.goto('/login/?company=nosuchco');
  await expect(page.getByRole('heading', { name: 'Company not found' })).toBeVisible();
});

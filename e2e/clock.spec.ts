import { expect, test, type Page } from '@playwright/test';

// PRD 9, flow 1: employee logs in, clocks in and out, and sees it on Home.
const PASSWORD = 'Passw0rd!local'; // local seed only

async function signIn(page: Page, username: string) {
  await page.goto('/login/?company=harbourline');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('employee clocks in and out with selfie and location', async ({ page }) => {
  await signIn(page, 'aisyah');
  await page.waitForURL('**/home/');

  // Close any shift left open by earlier local runs.
  const clockLink = page.getByRole('link', { name: /^Clock (in|out)$/ });
  await expect(clockLink).toHaveText(/Clock (in|out)/);
  if ((await clockLink.textContent())?.includes('out')) {
    await clockLink.click();
    await expect(page.getByText('Inside site')).toBeVisible();
    await page.getByRole('button', { name: 'Take selfie and clock out' }).click();
    await page.waitForURL('**/home/');
  }

  await page.getByRole('link', { name: 'Clock in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clock in' })).toBeVisible();
  await expect(page.getByText('Inside site')).toBeVisible();
  await page.getByRole('button', { name: 'Take selfie and clock in' }).click();
  await page.waitForURL('**/home/');
  await expect(page.getByRole('region', { name: 'Clock' }).getByText(/Clocked in at \d\d:\d\d/)).toBeVisible();

  await page.getByRole('link', { name: 'Clock out', exact: true }).click();
  await page.getByRole('button', { name: 'Take selfie and clock out' }).click();
  await page.waitForURL('**/home/');
  await expect(page.getByRole('link', { name: 'Clock in', exact: true })).toBeVisible();

  // The finished shift is listed with real times.
  const recent = page.getByRole('region', { name: 'Recent attendance' });
  await expect(recent.locator('li').first()).toContainText(/\d\d:\d\d to \d\d:\d\d/);
});

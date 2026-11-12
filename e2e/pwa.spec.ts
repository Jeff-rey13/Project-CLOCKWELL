import { test } from '@playwright/test';
import { expect, signedIn } from './helpers';

test('the app is installable: manifest, icons and a stamped service worker', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Clockwell');
  expect(manifest.display).toBe('standalone');
  expect((await request.get('/icons/icon-512.png')).ok()).toBe(true);
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toContain('__BUILD_ID__');

  await page.goto('/login/?company=harbourline');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ''), { timeout: 15_000 })
    .toContain('/sw.js');
});

test('offline clock-in is saved on the phone and sent when back online', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah');
  // Start from a closed shift.
  const clock = employee.getByRole('region', { name: 'Clock' }).getByRole('link');
  await expect(clock).toHaveText(/Clock (in|out)/);
  if ((await clock.textContent())?.includes('out')) {
    await clock.click();
    await employee.getByRole('button', { name: 'Take selfie and clock out' }).click();
    await employee.waitForURL('**/home/');
  }

  await employee.getByRole('link', { name: 'Clock in', exact: true }).click();
  await expect(employee.getByRole('button', { name: 'Take selfie and clock in' })).toBeEnabled();
  await expect(employee.getByText('Inside site')).toBeVisible();

  await employee.context().setOffline(true);
  await expect(employee.getByText("You're offline.")).toBeVisible();
  await employee.getByRole('button', { name: 'Take selfie and clock in' }).click();
  await expect(employee.getByText(/Clock-in saved on this phone at \d\d:\d\d/)).toBeVisible();
  await employee.waitForURL('**/home/');
  await expect(employee.getByText(/Clock-in saved at \d\d:\d\d, waiting to send/)).toBeVisible();

  await employee.context().setOffline(false);
  await expect(employee.getByText('Saved clock-in sent.')).toBeVisible({ timeout: 20_000 });
  await expect(employee.getByRole('region', { name: 'Clock' }).getByText(/Clocked in at \d\d:\d\d/)).toBeVisible();

  // Clean up.
  await employee.getByRole('link', { name: 'Clock out', exact: true }).click();
  await employee.getByRole('button', { name: 'Take selfie and clock out' }).click();
  await employee.waitForURL('**/home/');
});

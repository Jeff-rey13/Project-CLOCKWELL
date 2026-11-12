import { test } from '@playwright/test';
import { expect, signedIn } from './helpers';

test('HR dashboard shows real figures and a clock-in arrives live', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah');
  // Start from a closed shift.
  const clockLink = employee.getByRole('region', { name: 'Clock' }).getByRole('link');
  await expect(clockLink).toHaveText(/Clock (in|out)/);
  if ((await clockLink.textContent())?.includes('out')) {
    await clockLink.click();
    await employee.getByRole('button', { name: 'Take selfie and clock out' }).click();
    await employee.waitForURL('**/home/');
  }

  const hr = await signedIn(browser, 'meiling');
  await expect(hr.getByRole('heading', { name: /\d+ of \d+ in today/ })).toBeVisible();
  await expect(hr.getByText('Preview build')).toHaveCount(0);
  const inNow = hr.getByText('In office now').locator('..').locator('p').first();
  await expect(inNow).toHaveText(/^\d+$/);
  // Let the figures settle after the live connection joins.
  await hr.waitForTimeout(1500);
  const before = Number(await inNow.textContent());

  await employee.getByRole('link', { name: 'Clock in', exact: true }).click();
  await employee.getByRole('button', { name: 'Take selfie and clock in' }).click();
  await employee.waitForURL('**/home/');

  // No reload: the change arrives through Realtime.
  await expect(inNow).toHaveText(String(before + 1), { timeout: 15_000 });
  await expect(hr.getByRole('heading', { name: 'Latest clock-ins' }).locator('..').getByText('Aisyah Rahman').first()).toBeVisible();

  await employee.getByRole('link', { name: 'Clock out', exact: true }).click();
  await employee.getByRole('button', { name: 'Take selfie and clock out' }).click();
  await employee.waitForURL('**/home/');
});

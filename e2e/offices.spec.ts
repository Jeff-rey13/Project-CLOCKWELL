import { test } from '@playwright/test';
import { expect, signedIn } from './helpers';

test('HR edits an office and adds a site from the current location', async ({ browser }) => {
  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/offices/');
  await hr.getByRole('button', { name: /^HQ/ }).click();
  const sheet = hr.getByRole('dialog', { name: 'HQ' });
  await sheet.getByLabel('Grace (min)').fill('7');
  await sheet.getByRole('button', { name: 'Save office' }).click();
  await expect(hr.getByText('Office saved.')).toBeVisible();

  const siteName = `Loading bay ${Date.now()}`;
  await sheet.getByLabel('Site name').fill(siteName);
  await sheet.getByRole('button', { name: 'Use my current location' }).click();
  await expect(sheet.getByLabel('Latitude')).toHaveValue(/^1\.27/);
  await sheet.getByRole('button', { name: 'Add site' }).click();
  await expect(hr.getByText('Site added.')).toBeVisible();
  await expect(sheet.getByText(siteName)).toBeVisible();
  await sheet.getByRole('button', { name: `Remove ${siteName}` }).click();
  await expect(hr.getByText('Site removed.')).toBeVisible();

  // Put the grace period back.
  await sheet.getByLabel('Grace (min)').fill('5');
  await sheet.getByRole('button', { name: 'Save office' }).click();
  await expect(hr.getByText('Office saved.').last()).toBeVisible();
});

test('hybrid employee registers home, HR approves it', async ({ browser }) => {
  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/offices/');
  await hr.getByLabel('Employee').selectOption({ label: 'Aisyah Rahman (HL-0142)' });
  await hr.getByLabel('Work mode', { exact: true }).last().selectOption('hybrid');
  await hr.getByRole('button', { name: 'Save personal rules' }).click();
  await expect(hr.getByText('Personal rules saved.')).toBeVisible();

  const employee = await signedIn(browser, 'aisyah');
  await employee.goto('/profile/');
  await employee.getByRole('button', { name: /Register this location as home|Update to this location/ }).click();
  await expect(employee.getByText('Home location sent to HR for approval.')).toBeVisible();

  await hr.reload();
  const row = hr.locator('li', { hasText: 'Aisyah Rahman' }).filter({ has: hr.getByRole('button', { name: 'Approve' }) });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(hr.getByText('Home location approved.')).toBeVisible();

  await employee.reload();
  await expect(employee.getByText('Approved')).toBeVisible();

  // Back to the office rules.
  await hr.getByLabel('Employee').selectOption({ label: 'Aisyah Rahman (HL-0142)' });
  await hr.getByLabel('Work mode', { exact: true }).last().selectOption('');
  await hr.getByLabel('Home latitude').fill('');
  await hr.getByLabel('Home longitude').fill('');
  await hr.getByRole('button', { name: 'Save personal rules' }).click();
  await expect(hr.getByText('Personal rules saved.')).toBeVisible();
});

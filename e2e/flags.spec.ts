import { test } from '@playwright/test';
import { expect, PASSWORD } from './helpers';

test('platform sets a feature flag globally and overrides it for one company', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/platform/login/');
  await page.getByLabel('Email').fill('ops@vendor.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/platform/companies/');
  await page.getByRole('link', { name: 'Flags' }).click();

  const card = page.locator('div', { has: page.getByText('clockout_push', { exact: true }) }).filter({ has: page.getByRole('switch') }).last();
  const global = card.getByRole('switch', { name: /On for everyone/ });
  const before = (await global.getAttribute('aria-checked')) === 'true';
  await global.click();
  await expect(page.getByText('Global value saved.')).toBeVisible();
  await expect(global).toHaveAttribute('aria-checked', String(!before));

  await card.getByLabel('Override for a company').selectOption({ label: 'Meridian Clinics (stable)' });
  await card.getByRole('button', { name: /Turn (on|off) for them/ }).click();
  await expect(page.getByText('Company override saved.')).toBeVisible();
  await expect(card.getByRole('listitem').filter({ hasText: 'Meridian Clinics' })).toBeVisible();

  // Clean up.
  await card.getByRole('button', { name: 'Follow global' }).first().click();
  await expect(page.getByText('Override removed.')).toBeVisible();
  await global.click();
  await expect(global).toHaveAttribute('aria-checked', String(before));
});

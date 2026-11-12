import { test } from '@playwright/test';
import { expect, RECEIPT, signedIn } from './helpers';

// PRD 9, flow 3: employee submits a claim, HR rejects with a note, employee sees the note.
test('employee submits a claim and HR rejects it with a note', async ({ browser }) => {
  const clinic = `Clinic ${Date.now()}`;
  const employee = await signedIn(browser, 'aisyah');
  await employee.getByRole('link', { name: 'Medical claim' }).click();
  await employee.waitForURL('**/claims/new/');
  await expect(employee.getByText(/Left to claim in \d{4}/)).toBeVisible();
  await employee.getByLabel('Clinic').fill(clinic);
  await employee.getByLabel('Visit date').fill('2026-11-02');
  await employee.getByLabel('Amount (SGD)').fill('12.30');
  await employee.getByLabel(/Receipt/).setInputFiles(RECEIPT);
  await employee.getByRole('button', { name: 'Send claim' }).click();
  await employee.waitForURL('**/requests/');
  const mine = employee.locator('li', { hasText: clinic });
  await expect(mine.getByText('Waiting for HR')).toBeVisible();

  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/claims/');
  const row = hr.locator('li', { hasText: clinic });
  await expect(row.getByRole('button', { name: 'View receipt' })).toBeVisible();
  await row.getByLabel('Note to employee (optional)').fill('Please attach the itemised bill');
  await row.getByRole('button', { name: 'Reject' }).click();
  await expect(hr.getByText('Claim rejected.')).toBeVisible();

  await employee.reload();
  await expect(mine.getByText('Rejected')).toBeVisible();
  await expect(mine.getByText('Note from HR: Please attach the itemised bill')).toBeVisible();
});

test('a claim over the per-claim limit is refused', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah');
  await employee.goto('/claims/new/');
  await employee.getByLabel('Clinic').fill('Big hospital');
  await employee.getByLabel('Visit date').fill('2026-11-03');
  await employee.getByLabel('Amount (SGD)').fill('250');
  await employee.getByLabel(/Receipt/).setInputFiles(RECEIPT);
  await employee.getByRole('button', { name: 'Send claim' }).click();
  await expect(employee.getByRole('alert').filter({ hasText: 'This claim is over your limit.' })).toBeVisible();
});

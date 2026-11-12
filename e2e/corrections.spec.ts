import { test } from '@playwright/test';
import { expect, signedIn } from './helpers';

// PRD 9, flow 4: HR adjusts a late clock-in and the employee sees "Corrected".
test('HR adjusts a clock-in and the employee sees Corrected', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah');
  // Make sure there is a shift today: clock in (and out) once.
  const clock = employee.getByRole('region', { name: 'Clock' }).getByRole('link');
  await expect(clock).toHaveText(/Clock (in|out)/);
  if ((await clock.textContent())?.includes('in')) {
    await clock.click();
    await employee.getByRole('button', { name: 'Take selfie and clock in' }).click();
    await employee.waitForURL('**/home/');
  }
  await employee.getByRole('region', { name: 'Clock' }).getByRole('link', { name: 'Clock out' }).click();
  await employee.getByRole('button', { name: 'Take selfie and clock out' }).click();
  await employee.waitForURL('**/home/');

  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/attendance/');
  const row = hr.getByRole('row', { name: /Aisyah Rahman/ }).first();
  await row.getByRole('button', { name: 'Adjust' }).click();
  const sheet = hr.getByRole('dialog', { name: 'Adjust Aisyah Rahman' });
  await sheet.getByLabel('Which time').selectOption('clock_in');
  await sheet.getByLabel('Change to').fill('08:55');
  await sheet.getByLabel('Note visible to employee (optional)').fill('Gate reader was down');
  await sheet.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(hr.getByText('Attendance adjusted.')).toBeVisible();
  await expect(hr.getByRole('row', { name: /Aisyah Rahman/ }).first().getByText('Corrected')).toBeVisible();

  await employee.goto('/attendance/');
  await expect(employee.getByText('Corrected').first()).toBeVisible();
  await expect(employee.getByText('08:55 to').first()).toBeVisible();
  await employee.goto('/requests/');
  await expect(employee.getByText('Note from HR: Gate reader was down').first()).toBeVisible();
});

test('employee requests a time fix and HR approves it', async ({ browser }) => {
  const employee = await signedIn(browser, 'aisyah');
  await employee.goto('/attendance/');
  await employee.getByRole('button', { name: /Request a time fix/ }).first().click();
  const sheet = employee.getByRole('dialog', { name: 'Request a time fix' });
  await sheet.getByLabel('Which time').selectOption('clock_in');
  await sheet.getByLabel('Change to').fill('08:50');
  await sheet.getByLabel('Reason').selectOption('forgot');
  await sheet.getByLabel('Note to HR (optional)').fill('Left at 6pm');
  await sheet.getByRole('button', { name: 'Send to HR' }).click();
  await expect(employee.getByText(/Time fix sent to HR\.|already waiting for HR/)).toBeVisible();

  const hr = await signedIn(browser, 'meiling');
  await hr.goto('/hr/attendance/');
  const fix = hr.locator('li', { hasText: 'Left at 6pm' }).first();
  await fix.getByRole('button', { name: 'Approve' }).click();
  await expect(hr.getByText('Time fix approved.')).toBeVisible();
});

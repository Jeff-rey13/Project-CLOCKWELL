import { expect, test, type Browser, type Page } from '@playwright/test';

export const PASSWORD = 'Passw0rd!local'; // local seed only

/** Each user gets their own browser context, like two different phones. */
export async function signedIn(browser: Browser, username: string, company = 'harbourline'): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    geolocation: { latitude: 1.2795, longitude: 103.8506, accuracy: 15 },
    permissions: ['geolocation', 'camera'],
  });
  const page = await context.newPage();
  await page.goto(`/login/?company=${company}`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(home|hr\/dashboard)\/$/);
  return page;
}

/** A tiny valid JPEG, used as a receipt. */
export const RECEIPT = {
  name: 'receipt.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  ),
};

export { expect };

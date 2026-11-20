import { test, expect } from '@playwright/test';

test('Mumbai preset stays usable while recovery loads and displays the combined plan', async ({page}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/recover/explain', async route => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', {name: /Mumbai/}).click();
  try {
    await expect(page.getByRole('status')).toContainText('Preparing recovery');
  } finally { release(); }
  await expect(page.locator('.before-after-col.after')).toContainText('675');
  await expect(page.locator('.recovery-rationale')).toContainText('Combined plan');
  await page.getByRole('button', {name: /^Delay\b/}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('columnheader', {name: /^Delay\b/})).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('tab', {name:/Flights/}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/Gantt/);
});

test('failed recovery preserves flight results and announces the error', async ({page}) => {
  await page.route('**/recover/explain', route => route.fulfill({status:503, body:'Unavailable'}));
  await page.goto('/');
  await page.getByRole('button', {name: /Mumbai/}).click();
  await expect(page.getByRole('alert')).toContainText('Recovery recommendations are unavailable');
  await expect(page.getByRole('table', {name:'Flight outcomes'})).toBeVisible();
});

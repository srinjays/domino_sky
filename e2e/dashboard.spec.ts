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

test('Simulate handles a legacy plan score and renders explanation text safely', async ({ page }) => {
  const literalText = '<strong>literal example</strong>';
  await page.route('**/recover/explain', async route => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.recommended.score;
    body.recommendation.rationale = `**Impact:** ${literalText}\n\n**Most affected flights:**\n- Example flight`;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Run simulation' }).click();
  await expect(page.getByRole('region', { name: 'After Recovery' })).toContainText('675');
  const explanation = page.locator('.recovery-rationale');
  await expect(explanation).toContainText(literalText);
  await expect(explanation.getByRole('listitem')).toHaveText('Example flight');
  const toggle = page.getByRole('button', { name: /alternatives/i });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('table', { name: 'Recovery candidates' })).toBeVisible();
});

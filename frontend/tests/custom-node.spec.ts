import { test, expect } from '@playwright/test';

test('create custom node via UI', async ({ page }) => {
  await page.goto('/');
  // Open custom node creator
  const btn = page.getByRole('button', { name: '+ Custom Node' });
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.click();
  // Modal should appear
  await expect(page.getByText('CUSTOM NODES')).toBeVisible();
  await page.getByRole('button', { name: '+ Create New' }).click();
  await page.getByPlaceholder('My API').fill('Playwright Test');
  await page.getByPlaceholder('custom_my_api').fill('custom_pw_test');
  // Code textarea is the last textarea with placeholder containing 'return { result'
  const codeArea = page.locator('textarea[placeholder*="return { result"]');
  await codeArea.fill('return { ok: data.value * 3 }');
  await page.getByRole('button', { name: 'CREATE NODE' }).click();
  // Should appear in list
  await expect(page.getByText('custom_pw_test')).toBeVisible({ timeout: 5000 });
  // Should appear in catalog under Custom
  await page.getByRole('tab', { name: 'Custom' }).click();
  await expect(page.getByText('Playwright Test')).toBeVisible();
  // Cleanup: delete
  await page.getByText('custom_pw_test').locator('..').getByRole('button', { name: 'Delete' }).click();
  page.on('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
});

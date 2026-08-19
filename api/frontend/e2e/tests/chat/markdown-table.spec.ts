import { test, expect } from '../../fixtures/base.fixture';
import { S } from '../../helpers/selectors';

/**
 * A tabular answer must arrive as a table, not as a paragraph of pipes.
 *
 * react-markdown parses plain CommonMark, which has no pipe tables, so before
 * remark-gfm was added the "| a | b |" an answer contains reached the reader
 * verbatim and the table styles in AssistantMessage were dead code. The answer
 * is stubbed here because the point under test is the rendering, not whether
 * the model chose to write a table that day.
 */
const TABLE_ANSWER = [
  'The top agreed VE items account for £12,795,000.00, 84.64% of the pool.',
  '',
  '| Rank | Ref No. | VE Description | Category | Agreed VE Saving (£) | % of Top 10 |',
  '| :---: | :---: | :--- | :--- | ---: | ---: |',
  '| 1 | 42 | Network Rail Immunisation design revision | Network Rail | £4,700,000.00 | 36.73% |',
  '| 2 | 145 | Consolidated depot design | Depot | £2,000,000.00 | 15.63% |',
  '| TOTAL | | Top 10 Agreed VE Savings Total | | £12,795,000.00 | 100.00% |',
  '',
  'Total Portfolio VE Register Pool: £15,116,980.00',
].join('\n');

const STUB_RESPONSE = {
  ui_intent: 'answer',
  assistant_text: TABLE_ANSWER,
  citations: [],
  related_docs: [],
  sql_artifact: null,
  activity: [],
};

test.describe('Chat — markdown tables', () => {
  test.beforeEach(async ({ page, sidebarPage }) => {
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(STUB_RESPONSE),
      }),
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await sidebarPage.createNewChat();
  });

  test('a pipe table renders as a real table with its header and rows', async ({ page }) => {
    await page.locator(S.chatInput).fill('Top 10 VE items agreed with BBS by value, and the total?');
    await page.locator(S.chatInput).press('Enter');

    const table = page.locator(`${S.assistantMessage} table`).first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table.locator('thead th')).toHaveCount(6);
    // Header, two items and the TOTAL row.
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('tbody tr').last()).toContainText('Top 10 Agreed VE Savings Total');

    // The pipes must be gone from the visible text, not merely styled away.
    await expect(page.locator(S.assistantMessage).first()).not.toContainText('| Rank |');

    // The closing sentence belongs to the prose, not to the table: without a
    // blank line after the last row, GFM parses it as one more row.
    await expect(table).not.toContainText('Total Portfolio VE Register Pool');
    await expect(page.locator(S.assistantMessage).first())
      .toContainText('Total Portfolio VE Register Pool: £15,116,980.00');
  });

  test('a wide table scrolls inside the bubble instead of stretching it', async ({ page }) => {
    await page.locator(S.chatInput).fill('Top 10 VE items agreed with BBS by value, and the total?');
    await page.locator(S.chatInput).press('Enter');

    const table = page.locator(`${S.assistantMessage} table`).first();
    await expect(table).toBeVisible({ timeout: 30_000 });

    // The scroll container is the table's parent; the page itself must not grow.
    const overflows = await table.evaluate((el) => {
      const box = el.parentElement as HTMLElement;
      return {
        scrollable: getComputedStyle(box).overflow !== 'visible',
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      };
    });
    expect(overflows.scrollable).toBe(true);
    expect(overflows.pageFits).toBe(true);
  });

  test('the table can be downloaded as CSV', async ({ page }) => {
    await page.locator(S.chatInput).fill('Top 10 VE items agreed with BBS by value, and the total?');
    await page.locator(S.chatInput).press('Enter');

    const download = page.locator(`${S.assistantMessage} button:has-text("Download CSV")`).first();
    await expect(download).toBeVisible({ timeout: 30_000 });
    await expect(download).toBeEnabled();
  });
});

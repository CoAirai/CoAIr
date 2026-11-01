// Run against presentation.html served from the disposable fixture checkout.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.COAIR_PRESENTATION_URL || 'http://127.0.0.1:14381/presentation.html');
        const heading = page.getByText('Summary', {exact:true});
        await heading.waitFor();
        assert(await heading.evaluate(element => !!element.closest('.font-semibold')));
        assert.equal(await page.locator('strong').filter({hasText:'Evidence'}).count(), 1);
        assert.equal(await page.locator('table').count(), 1);
        await page.getByRole('button', {name:'Amount',exact:true}).click();
        assert.deepEqual(await page.locator('tbody tr td:first-child').allTextContents(), ['Water','Utility','Depot']);
        await page.getByRole('textbox', {name:'Filter table rows'}).fill('water');
        assert.equal(await page.locator('tbody tr').count(), 1);
        await page.getByRole('textbox', {name:'Filter table rows'}).fill('');
        await page.getByRole('button', {name:'costs.xlsx, p.3',exact:true}).first().click();
        assert.equal(await page.locator('#source').textContent(), 'Opened: costs.xlsx, p.3');
        const payloads = [];
        await page.route('**/coair-api/chat/*', async route => {
            payloads.push({headers:route.request().headers(),body:route.request().postDataJSON()});
            await route.fulfill({status:200,contentType:'application/octet-stream',body:'Download wiring fixture; actual DOCX/XLSX tested separately.'});
        });
        let download = page.waitForEvent('download');
        await page.getByRole('button', {name:'Download Excel',exact:true}).click();
        assert.equal((await download).suggestedFilename(), 'coair-table.xlsx');
        assert.deepEqual(payloads[0].body.table_rows, [['Depot',12,false],['Water',0,true],['Utility',2,false]]);
        assert.equal(payloads[0].headers['x-project-id'], 'fixture-project');
        download = page.waitForEvent('download');
        await page.getByRole('button', {name:'Download Word',exact:true}).click();
        assert.equal((await download).suggestedFilename(), 'coair-answer.docx');
        assert.equal(payloads[1].body.question, 'Summarize project costs');
        assert.equal(payloads[1].body.total_rows, 57);
        assert.equal(payloads[1].body.citations[0].anchor, 'page_3');
        await page.unroute('**/coair-api/chat/*');
        await page.route('**/coair-api/chat/document', route => route.fulfill({status:403,body:'Forbidden'}));
        await page.getByRole('button', {name:'Download Word',exact:true}).click();
        await page.getByRole('alert').waitFor();
        assert.match(await page.getByRole('alert').textContent(), /403/);
        assert.deepEqual(errors, []);
        console.log('PASS: presentation controls and export transport. Synthetic fixture; model/DGX live acceptance pending.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

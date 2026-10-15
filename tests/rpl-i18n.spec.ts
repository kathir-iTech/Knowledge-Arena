// SIH-26242 Part 6 — the in-app "translation being reviewed" notice.
//
// HI/TA are machine-drafted; the declaration page must say so (instead of
// presenting them as reviewed), and the notice must disappear on English.
// Run: npx playwright test tests/rpl-i18n.spec.ts --reporter=list
import { test, expect } from '@playwright/test';
import { BASE, signInViaUi, clearRateLimits, ensureRoleUser } from './support/rpl-testkit';

const HI_NOTICE =
  'यह अनुवाद मशीन द्वारा तैयार किया गया है और मूल वक्ताओं द्वारा इसकी समीक्षा की जा रही है।';
const TA_NOTICE =
  'இந்த மொழிபெயர்ப்பு இயந்திரத்தால் உருவாக்கப்பட்டது, தாய்மொழி பேசுபவர்களால் மதிப்பாய்வு செய்யப்படுகிறது.';

test.describe('Part 6 — i18n review notice', () => {
  test.use({ bypassCSP: true });
  test.setTimeout(900_000);

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('declare page shows a "being reviewed" notice for HI and TA, hidden for EN', async ({
    page,
  }) => {
    const email = 'part6-i18n@rplcompass.test';
    await ensureRoleUser(email, 'candidate', 'Part 6 I18n');
    await signInViaUi(page, email);

    await page.goto(BASE + '/rpl/declare', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trade')).toBeVisible({ timeout: 60_000 });

    const notice = page.getByRole('note');

    // English (default): no notice.
    await expect(notice).toHaveCount(0);

    // Hindi: notice present with the Hindi text.
    await page.getByRole('button', { name: 'Language: hi' }).click();
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText(HI_NOTICE);
    await expect(page.locator('h1').first()).toHaveText('व्यक्तिगत एवं व्यापार संदर्भ');

    // Tamil: notice present with the Tamil text.
    await page.getByRole('button', { name: 'Language: ta' }).click();
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText(TA_NOTICE);

    // Back to English: notice gone again.
    await page.getByRole('button', { name: 'Language: en' }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.locator('h1').first()).toHaveText('Personal & trade context');
  });
});

/**
 * E2E: ② 상장일 이후 1개월 종가 — 일자별 입력 모드 (소령 §165⑤)
 *
 * ## 왜 브라우저여야 하는가
 *
 * 컴포넌트 anchor(LS-1~7)는 «무엇이 렌더되는가», validate anchor(LSV-1~4)는 «무엇이
 * 차단되는가»를 각각 본다. 그러나 **두 겹을 지나 실제로 다음 단계로 넘어가는지**는
 * 브라우저에서만 안다 — 형제 축 ①이 같은 이유로 KA-5를 두고 있다
 * ([[feedback_browser_verify_with_playwright]]).
 *
 * 특히 이 축의 요구사항은 「단일 숫자 칸이 **비어 있는데도** 통과해야 한다」이다.
 * validate가 direct 분기를 잘못 타면 **입력 UI 없이 차단되는 dead-end**가 되고,
 * 그 실패는 화면에서만 드러난다(형제 축 ①의 F-10 사고와 같은 형태).
 *
 *   PLD-1: 표만 채우고 Step3까지 넘어간다 (dead-end 부재 증명)
 *   PLD-2: 표가 비면 차단된다 (PLD-1의 음성 대조군)
 *
 * ⚠️ 「일자별 입력 (자동 평균 산정)」 라벨은 화면에 **둘** 있다(①양도 당시 기준시가 ·
 *    ②상장일 이후 1개월 종가) — 형제 축이라 같게 읽히는 것이 옳다. 라벨로 집으면
 *    strict mode 위반이 나므로 **라디오 name으로 소속을 못박는다**
 *    ([[feedback_hint_quoting_toggle_title_breaks_selector]]의 «의도적 복제» 변형).
 */

import { test, expect, type Page } from "@playwright/test";

/**
 * ⚠️ 이 저장소에서 `getByRole("textbox", { name })`은 **placeholder로만** 이름이 잡힌다.
 *    `FieldCard`의 `<label>`에 `htmlFor`가 없고(`FieldCard.tsx:61`),
 *    `CurrencyInput`은 `hideLabel`일 때만 `aria-label`을 단다(`CurrencyInput.tsx:125`).
 *    ⇒ placeholder와 문자열이 일치하는 칸에만 쓸 것. 아니면 `fillByLabel`을 쓴다.
 */
const box = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

/** 라벨 텍스트로 찾는다 — placeholder가 라벨과 다른 칸용 (floor80 spec과 동일 전략) */
async function fillByLabel(page: Page, label: string, value: string) {
  await page.locator(`div:has(> label:has-text('${label}')) input[type="text"]`).first().fill(value);
}

/** 라벨이 아니라 라디오 name으로 축을 특정한다 (①과 문구가 같다) */
const listingDailyRadio = (page: Page) =>
  page.locator('label:has(input[name="listingStdInputMode"][value="daily"])');

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 — 코스닥 · 취득 2005-04-20 / 양도 2025-02-26 */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("일자별종가주식");
  await page.getByRole("radio", { name: "코스닥" }).first().click();

  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2005");
  await m.nth(0).fill("04");
  await d.nth(0).fill("20");
  await y.nth(1).fill("2025");
  await m.nth(1).fill("02");
  await d.nth(1).fill("26");

  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
}

/** Step2 — 환산취득가 → 취득 후 상장 ON → ③ simple → ②를 일자별로 전환 */
async function openStep2Daily(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
  // placeholder가 없는 칸이라 라벨로 찾는다 (위 box 주석 참조)
  await fillByLabel(page, "양도가액 합계", "44750000");
  await page.getByRole("radio", { name: "환산취득가" }).first().click();

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 후 상장" })
    .getByRole("switch")
    .first()
    .click();

  // ③은 「평가액 직접 입력」(simple) — 이 축이 열려야 ②에 입력 방식 라디오가 나온다
  await page.getByText("평가액 직접 입력", { exact: true }).click();

  // ① 양도 당시 기준시가 (direct 기본) — §163⑨ 분모.
  //    안 채우면 PLD-1이 ②가 아니라 ① 때문에 막혀 «잘못된 이유로» 실패한다.
  await page.getByPlaceholder("양도일 이전 1개월 종가평균 (1주당)").fill("20000");

  // 상장일 — ②의 종가 표 일자를 자동으로 채우는 기산일.
  //   「취득 후 상장」 카드 안에서 **날짜 입력을 가진 유일한 FieldCard**가 상장일이다
  //   (라벨 텍스트로 좁히면 「상장일 이후…」·「상장일 직전…」과 부분일치로 엉킨다).
  const postCard = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 후 상장" })
    .first();
  const listingDateCard = postCard
    .locator('[data-slot="field-card"]')
    .filter({ has: page.locator('input[aria-label="연도"]') })
    .first();
  await listingDateCard.locator('input[aria-label="연도"]').fill("2009");
  await listingDateCard.locator('input[aria-label="월"]').fill("08");
  await listingDateCard.locator('input[aria-label="일"]').fill("24");

  // ② → 일자별 입력
  await listingDailyRadio(page).click();

  // ③ 4필드
  await box(page, "상장일 직전 사업연도 1주당 순손익가치").fill("39082");
  await box(page, "상장일 직전 사업연도 1주당 순자산가치").fill("39082");
  await box(page, "취득일 직전 사업연도 1주당 순손익가치").fill("28451");
  await box(page, "취득일 직전 사업연도 1주당 순자산가치").fill("28451");
}

test.describe("§165⑤ ② 상장일 이후 1개월 종가 — 일자별 입력", () => {
  test("PLD-1: 표만 채우고 다음 단계로 넘어간다 (단일 숫자 칸은 화면에 없다)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await openStep2Daily(page);

    // 단일 숫자 칸은 사라진다 — validate가 그것을 요구하면 그 순간 dead-end가 된다
    await expect(box(page, "상장일 이후 1개월 종가평균")).toHaveCount(0);

    // 🔑 ①은 direct로 두었으므로 화면의 종가 표는 **②의 것 하나뿐**이다.
    //    이 단언이 없으면 아래 셀 채우기가 ①의 표를 건드려도 통과한다.
    const cells = page.locator('[data-slot-idx] input[type="text"]');
    await expect(cells.first()).toBeVisible({ timeout: 10_000 });
    await cells.nth(0).fill("10000");
    await cells.nth(1).fill("10000");
    await cells.nth(2).fill("10000");

    // 미리보기는 저장 mirror가 아니라 표에서 «파생»한 평균을 쓴다
    const preview = page.locator("div").filter({ hasText: "환산취득가 미리보기" }).last();
    await expect(preview.getByText(/상장일 이후 1개월 종가평균 = 10,000/)).toBeVisible({
      timeout: 10_000,
    });

    // 🔑 두 겹을 지나 실제로 넘어간다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("기본공제 (§103②)")).toBeVisible({ timeout: 15_000 });
  });

  test("PLD-2: 표가 비면 차단된다 (PLD-1의 음성 대조군)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await openStep2Daily(page);

    // ⚠️ 이 케이스가 없으면 PLD-1은 「validate가 ②를 아예 보지 않는다」로도 통과한다.
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText(/상장일 이후 1개월 거래일 종가를 1셀 이상/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("기본공제 (§103②)")).toHaveCount(0);
  });
});

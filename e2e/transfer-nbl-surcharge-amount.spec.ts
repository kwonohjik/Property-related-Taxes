/**
 * transfer-nbl-surcharge-amount.spec.ts
 *
 * 비사업용 토지 중과(「소득세법」 §104①8호 — 기본세율 +10%p)가 **결과 세액에 실제로 반영되는지**
 * 금액으로 단언한다.
 *
 * 발견 COV-3 (docs/reviews/nbl-code-review-2026-09.md):
 *   NBL E2E 8개 spec(1,146줄)을 전수 정독한 결과 **중과세액을 단언하는 spec이 0건**이었다.
 *   academy-land spec은 기대값 10줄을 주석에 적어 두고 `not.toBe("")` 3건만 단언하고,
 *   나머지는 미리보기 testid·가시성·`res.ok()`만 본다. 그래서 COV-1(구법 임계 도달 불가)·
 *   COV-2(시드에서 중과율이 사라져도 경고 0)를 포함한 이번 리뷰의 확정 결함들이
 *   E2E에 한 건도 걸리지 않았다.
 *
 * 이 spec 1건이 UI 토글 → raw 전송 → Zod → route → 엔진 게이트(`transfer-tax-rate-calc.ts`의
 * `if (input.isNonBusinessLand && surchargeRates.non_business_land)`)를 한 번에 잠근다.
 *
 * 방법: **같은 입력을 비사업용 ON/OFF로 두 번** 계산해 산출세액 차이가
 *       `과세표준 × 10%`(원 단위 floor)와 일치하는지 본다. 절대값이 아니라 대조라
 *       세율표·공제 개정에 흔들리지 않으면서 중과분만 정확히 겨눈다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/transfer-nbl-surcharge-amount.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 결과 표의 라벨 행에서 두 번째 셀(값) 읽기 */
async function getRowValue(page: Page, labelText: string): Promise<string> {
  const row = page.locator(`tr:has(td:has-text("${labelText}"))`).first();
  return (await row.locator("td").nth(1).textContent())?.trim() ?? "";
}

/** "1,234,567 원" → 1234567 */
function toNumber(text: string): number {
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : NaN;
}

/**
 * 단순토지(독립 나대지) 1건을 입력하고 계산 → { 과세표준, 산출세액 }.
 * @param nonBusiness true면 「비사업용 토지」 스위치를 켠다(정밀판정은 쓰지 않는다 —
 *                    이 spec이 겨누는 것은 엔진의 중과 게이트 자체다).
 */
async function calcOnce(page: Page, nonBusiness: boolean) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 양도일 2026-02-18
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("02");
  await page.getByTestId("transfer-date").getByLabel("일").fill("18");

  await expandAssetSection(page, 1);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("1000");

  // 양도가액 20억
  await page
    .locator('label:has-text("양도가액 (원)")')
    .locator("xpath=..")
    .locator("input")
    .first()
    .fill("2000000000");

  // 취득: 매매 · 2013-01-01 · 4억 (실지거래가)
  // ⚠️ 취득일은 **2013-01-01**이어야 한다 — 부칙 <제9270호> §14①이 2009.3.16.~2012.12.31.
  //    취득 토지의 +10%p 중과를 배제하므로(`isCrisisAcqExempt`) 그 창 안의 취득일을 쓰면
  //    중과가 0이 되어 이 대조가 조용히 무의미해진다.
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2013");
  await page.getByLabel("월", { exact: true }).nth(2).fill("01");
  await page.getByLabel("일", { exact: true }).nth(2).fill("01");
  await page
    .locator('label:has-text("취득가액 (원)")')
    .locator("xpath=..")
    .locator("input")
    .first()
    .fill("400000000");

  // 보유 상황 — 비사업용 토지 스위치
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  if (nonBusiness) {
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();
  }

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 20000 });

  return {
    taxBase: toNumber(await getRowValue(page, "과세표준")),
    calculatedTax: toNumber(await getRowValue(page, "산출세액")),
  };
}

test.describe("§104①8호 비사업용 토지 중과 — 결과 세액 단언", () => {
  test("비사업용 ON/OFF 차이가 과세표준 × 10%와 일치한다", async ({ page }) => {
    const business = await calcOnce(page, false);
    const nonBusiness = await calcOnce(page, true);

    // 두 계산의 과세표준은 같아야 한다 — 중과는 세율에만 붙는다.
    expect(business.taxBase, "과세표준이 읽히지 않았습니다").toBeGreaterThan(0);
    expect(nonBusiness.taxBase).toBe(business.taxBase);

    // 중과분 = 과세표준 × 10%p (엔진은 세율 × 금액 직후 floor)
    const expectedSurcharge = Math.floor(business.taxBase * 0.1);
    expect(nonBusiness.calculatedTax - business.calculatedTax).toBe(expectedSurcharge);
    expect(expectedSurcharge).toBeGreaterThan(0); // 대조가 실제로 의미 있는 크기인지
  });
});

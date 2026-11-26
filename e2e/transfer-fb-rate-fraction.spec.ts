/**
 * F-3 — 가업상속공제적용률 「금액으로 입력」 → 요청 body에 법정량 → 결과 카드가 분수로 계산된 의제 취득가액을 보인다.
 *
 * 「소득세법」 §97의2④ · 「소득세법 시행령」 §163의2③(공제금액 ÷ 가업상속 재산가액).
 * 공제 400억 ÷ 재산가액 1,200억(= 1/3) · 피상속인 2억 · 상속개시일 평가액 10억
 *   → 의제 취득가액 733,333,332 (소수 6자리 반올림이면 733,333,600).
 * 엔진·route anchor: `__tests__/tax-engine/transfer-tax/fb-rate-fraction.anchor.test.ts` · `__tests__/api/transfer.route.fb-rate-fraction.anchor.test.ts`
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, housing, seedWizard, singleSeed } from "./_helpers/split-acq-display";

test("FB-F3-E1: 금액 입력 → body fbRateBasis → 결과 카드 33.3333% · 733,333,332", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(
    page,
    singleSeed([
      housing({
        hasSeperateLandAcquisitionDate: false,
        landAcquisitionDate: "",
        acquisitionCause: "inheritance",
        acquisitionDate: "2022-10-01",
        inheritanceStartDate: "2022-10-01",
        inheritanceAssetKind: "house_individual",
        publishedValueAtInheritance: "1000000000",
        decedentAcquisitionDate: "2005-01-01",
        actualSalePrice: "2000000000",
        familyBusinessInheritance: {
          decedentAcquisitionPrice: 200_000_000,
          inheritanceMarketValue: 1_000_000_000,
          fbDeductionAppliedRate: 0,
          inheritanceDate: "2022-10-01",
          fbRateBasis: { kind: "deduction_ratio", deductionAmount: 0, businessEstateValue: 0 },
        },
      }),
    ], { contractTotalPrice: "2000000000" }),
  );
  await expandAssetSection(page, 3);

  const sw = page.getByRole("switch", { name: /가업상속공제 적용 자산/ });
  await expect(sw).toBeChecked();
  await expect(page.getByTestId("fb-rate-mode-amount")).toBeChecked();

  // hydration 뒤 입력이 React 상태에 닿았는지는 파생 문구(적용률 = …%)로 확인한다(e2e/CLAUDE.md §6).
  await page.getByLabel("가업상속공제금액 (원)").fill("40000000000");
  await page.getByLabel("가업상속 재산가액 (원)").fill("120000000000");
  await expect(page.getByTestId("fb-rate-from-amount")).toContainText("33.3333%");

  const body = await calculate(page);
  expect(JSON.stringify(body)).toContain(
    '"fbRateBasis":{"kind":"deduction_ratio","deductionAmount":40000000000,"businessEstateValue":120000000000}',
  );

  const resultCard = page.getByText("가업상속공제 자산 양도세 특례 (소득세법 §97의2④)").first().locator("xpath=../..");
  await expect(resultCard).toContainText("33.3333%");
  await expect(resultCard).toContainText("66.6666%");
  await expect(resultCard).toContainText("733,333,332");
  await expect(resultCard).toContainText("가업상속공제적용률 = 가업상속공제금액 40,000,000,000 ÷ 가업상속 재산가액 120,000,000,000");
});

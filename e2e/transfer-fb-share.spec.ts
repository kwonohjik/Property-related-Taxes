/**
 * 지분 양도 × 가업상속공제 §97의2④ — 화면 경로(transfer-fb-share UI 계획 §8).
 *
 * 교재(이월과세5) × 지분 1/2: 가업상속 금액은 물건 전체(5억·15억) 입력 → 엔진이 지분분(2.5억·7.5억)으로 줄인다.
 *   의제 400,000,000 · 양도차익 485,000,000 · 장특 127,700,000 · 과세표준 354,800,000 (엔진 계획서 §3.4 손계산).
 * 축 B 매매 50% + 상속·FB 50%(FB 카드가 둘째): 합계 양도차익 785,000,000 · 과세표준 636,800,000.
 * 엔진·route anchor: `__tests__/tax-engine/transfer-tax/fb-share-ratio.anchor.test.ts` · `__tests__/api/transfer.route.fb-share-*.anchor.test.ts`
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { calculate, seedWizard, singleSeed, stmtValue, formRow } from "./_helpers/split-acq-display";

const FB = {
  decedentAcquisitionPrice: 500_000_000,
  inheritanceMarketValue: 1_500_000_000,
  fbDeductionAppliedRate: 0.7,
  inheritanceDate: "2022-04-10",
  fbRateBasis: { kind: "deduction_ratio", deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
};
const inheritLand = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  assetKind: "land",
  acquisitionCause: "inheritance",
  acquisitionDate: "2022-04-10",
  inheritanceStartDate: "2022-04-10",
  fixedAcquisitionPrice: "1500000000",
  inheritanceAssetKind: "land",
  publishedValueAtInheritance: "1500000000",
  decedentAcquisitionDate: "2012-03-08",
  transferExpense: "30000000",
  ownershipNumerator: "1",
  ownershipDenominator: "2",
  familyBusinessInheritance: FB,
  fbShareBasisConfirmed: true,
  ...over,
});
const purchaseLand = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  assetKind: "land",
  acquisitionCause: "purchase",
  acquisitionDate: "2023-01-10",
  fixedAcquisitionPrice: "1200000000",
  ownershipNumerator: "1",
  ownershipDenominator: "2",
  landAreaM2: "100",
  acquisitionArea: "100",
  ...over,
});
const common = { transferDate: "2026-10-15", filingDate: "2026-11-30", contractTotalPrice: "1800000000", householdHousingCount: "1" };

test("FB-SH-E1: 단건 지분 1/2 — body는 FB 100% + ownershipRatio · 결과는 지분분 · 장특 127,700,000 · 과세표준 354,800,000", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, singleSeed([inheritLand({ ownershipRemainderThirdParty: "yes" })], common));
  const body = await calculate(page);
  expect(body.ownershipRatio).toBe(0.5);
  expect(JSON.stringify(body)).toContain('"decedentAcquisitionPrice":500000000');
  expect(JSON.stringify(body)).toContain('"inheritanceMarketValue":1500000000');
  expect(JSON.stringify(body)).not.toContain("fbShareBasisConfirmed");

  await expect(page.getByTestId("fb-share-caption").first()).toContainText("내 지분 50% 기준");
  await expect(page.getByText("피상속인 원취득가액 (물건 전체 500,000,000 × 지분 50%)").first()).toBeVisible();
  await expect(page.getByTestId("fb-lthd-total").first()).toHaveText("127,700,000");
  expect(await stmtValue(page, "장기보유특별공제")).toBe(127_700_000);
  expect((await formRow(page, "과세표준"))[1]).toContain("354,800,000");
});

test("FB-SH-E2: 축 B 둘째 카드 상속·FB 50% — 합계 양도차익 785,000,000 · 과세표준 636,800,000 · 카드 안 «단독으로 본 공제액» 고지", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, singleSeed([purchaseLand(), inheritLand({ landAreaM2: "100", acquisitionArea: "100" })], { ...common, assetSplitMode: "fractional" }));
  const body = await calculate(page);
  const companion = (body.companionAssets as Record<string, unknown>[])[0];
  expect(companion.ownershipRatio).toBe(0.5);
  expect(JSON.stringify(companion.familyBusinessInheritance)).toContain('"inheritanceMarketValue":1500000000');

  expect((await formRow(page, "과세표준"))[1]).toContain("636,800,000");
  await expect(page.getByTestId("fb-bundled-credit-note").first()).toContainText("확인 필요");
  await expect(page.getByTestId("fb-share-caption").first()).toContainText("내 지분 50% 기준");
});

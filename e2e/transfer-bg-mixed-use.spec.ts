/**
 * 겸용주택 × 부담부증여 E2E (PR-3) — 정상 계산 · 귀속 편중(「양도 없음」) · 막는 조합의 입력칸 이동.
 *
 * 세액은 엔진 anchor(`__tests__/tax-engine/transfer/mixed-use-burdened-gift.anchor.test.ts`)와 **같은 시나리오·같은 값**이다:
 * F1 — 주택 100㎡·상가 100㎡, 양도(증여)일 2024-03-01, 증여자 취득일 2010-03-15, 시가 15억·채무 6억·K-4 실지 7억.
 *   M-0(전부 구분 불분명) 69,094,001 · M-8(상가 귀속만) 69,094,000.
 *
 * 시딩: `sessionStorage("transfer-tax-wizard")`. 시드가 복원 정규화에 지워질 수 있으므로(feedback_e2e_seed_erased_by_restore_normalization)
 * 화면에서 시드가 살아 있음을 먼저 단언한다.
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/transfer-bg-mixed-use.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

function bgMixedAsset(over: Record<string, unknown> = {}) {
  return withMixedHousingStd({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    isMixedUseHouse: true,
    mixedAcqPerPartMode: false,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1500000000",
    bgMortgageDebtAmount: "600000000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionTotal: "700000000",
    bgHousingAppraisalDeclared: "none",
    ...over,
  });
}

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버 Next.js 표시기 배지가 하단 버튼을 덮는다
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function seedAndOpen(page: Page, assetOver: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = {
    ...createDefaultTransferFormData(),
    assets: [bgMixedAsset(assetOver)],
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    contractTotalPrice: "",
    householdHousingCount: "2",
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

async function calc(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByTestId("bg-result-apportion").waitFor({ timeout: 30_000 });
}

test.describe("겸용주택 × 부담부증여", () => {
  test("BGMU-1 정상 계산(M-0: 전부 구분 불분명) — ① 채무 귀속·양도가액, 증여세 카드, 양도세분 합계", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMortgageAttribution: "unallocated" });
    await calc(page);

    const apportion = page.getByTestId("bg-result-apportion");
    await expect(apportion).toContainText("구분 불분명 채무의 주택 몫300,000,000");
    await expect(apportion).toContainText("주택분 양도로 보는 채무액300,000,000");
    await expect(apportion).toContainText("주택 양도가액300,000,000");

    const calcSection = page.locator('[data-print-id="calculation"]');
    await expect(calcSection).toContainText("69,094,001");
    await expect(calcSection).toContainText("총 납부세액 (양도세분)");
    await expect(page.getByTestId("bg-mixed-detail-card")).toContainText("189,150,000");
    await expect(page.getByTestId("bg-mixed-gift-value")).toHaveText("1,500,000,000");
    // 일반 겸용의 «① 양도가액 안분»으로 떨어지지 않았다
    await expect(calcSection).not.toContainText("① 양도가액 안분");
  });

  test("BGMU-2 귀속 편중(M-8: 상가 귀속만) — 주택분은 「양도 없음」(비과세 아님), 세액 69,094,000", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMortgageAttribution: "commercial" });
    await calc(page);

    await expect(page.getByTestId("bg-result-not-transferred-housing").first()).toContainText("양도 없음");
    await expect(page.getByTestId("bg-result-not-transferred-commercial")).toHaveCount(0);
    const calcSection = page.locator('[data-print-id="calculation"]');
    await expect(calcSection).toContainText("69,094,000");
    await expect(calcSection).toContainText("고가주택 판정: 해당 없음 (주택분 양도 없음)");
    await expect(calcSection).not.toContainText("1세대 1주택 비과세:");
  });

  test("BGMU-3 귀속을 고르지 않으면 «다음»이 막히고 담보차입금 귀속 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMortgageAttribution: "" });
    // 시드가 살아 있음 — 복원 정규화가 지웠다면 귀속 카드 자체가 없다
    const group = page.locator('[data-field="bgMortgageAttribution"]');
    await expect(group).toHaveCount(1);
    await expect(page.locator('input[type="radio"][name^="bgMortgageAttribution"]:checked')).toHaveCount(0);

    await page.getByRole("button", { name: "다음", exact: true }).click();
    const panel = page.getByTestId("validation-issues");
    await expect(panel).toContainText("담보차입금 600,000,000원이 주택·상가 중 어디에 속하는지 선택하세요");
    await expect(group.locator('input[type="radio"]').first()).toBeFocused();
  });

  test("BGMU-4 나누어 입력(split)을 고르면 3칸과 «남은 금액»이 나오고, 합이 맞지 않으면 막힌다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMortgageAttribution: "split", bgMortgageSplitHousing: "100000000" });
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-attr-remainder-mortgage")).toBeVisible();
    await expect(page.getByTestId("bg-attr-remainder-mortgage")).toContainText("남은 금액 500,000,000원");
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("담보차입금 귀속 합계");
  });

  test("BGMU-5 요약 패널: 양도시·취득시 기준시가 합계는 읽기 전용이고 중복 입력칸이 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMortgageAttribution: "unallocated" });
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("bg-mixed-std-total-transfer")).toBeVisible();
    await expect(page.getByTestId("bg-mixed-std-total-transfer")).toHaveText("1,200,000,000");
    await expect(page.getByTestId("bg-mixed-std-total-acq")).toHaveText("600,000,000");
    await expect(page.getByTestId("bg-gift-building-std")).toHaveCount(0);
    await expect(page.getByTestId("bg-acq-std-price")).toHaveCount(0);
  });
});

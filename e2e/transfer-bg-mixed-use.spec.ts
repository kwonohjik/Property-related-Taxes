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
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";

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
    await expectNoPageHScroll(page);
  });

  /** PR-7b-7a-1 — 증여자 상속 취득(2010) · 시가 — 상속개시일 주택분·상가분 평가액 3.5억씩이 취득가액(소령 §163⑨) */
  const INHERITED = {
    bgMortgageAttribution: "unallocated",
    acquisitionCause: "inheritance",
    inheritanceStartDate: "2010-03-15",
    decedentAcquisitionDate: "2000-01-01",
    bgAcquisitionMethod: "",
    bgActualAcquisitionTotal: "",
    mixedHousingInheritedValueOverride: "350000000",
    mixedCommercialInheritedValueOverride: "350000000",
  };

  test("BGMU-6 증여자 상속 취득 — 산정방식 라디오 대신 안내, 세액은 실지 7억 매매와 같은 69,094,001, 결과는 「상속개시일 평가액」", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, INHERITED);
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-mixed-deemed-notice")).toContainText("상속개시일 현재 주택분·상가분 상증법 평가액");
    await expect(page.locator('input[type="radio"][name^="bgAcquisitionMethod"]')).toHaveCount(0);
    await expandAssetSection(page, 3);
    await expect(page.getByText("상속개시일 신고가액 직접 입력 (필수)")).toBeVisible();
    await calc(page);
    const calcSection = page.locator('[data-print-id="calculation"]');
    await expect(calcSection).toContainText("69,094,001");
    await expect(page.getByTestId("bg-result-acq-housing")).toContainText("상속개시일 평가액 안분 (소득세법 시행령 §163⑨)");
  });

  /** 1995 상속 · PHD(§164⑦) — 단서 구간은 토글 필수(사용자 결정 R-1, 2026-10-24) · 최초 고시일 2005-04-30 */
  const Y95_PHD = {
    ...INHERITED,
    acquisitionDate: "1995-03-15",
    inheritanceStartDate: "1995-03-15",
    decedentAcquisitionDate: "1980-01-01",
    mixedAcqHousingPrice: "",
    mixedAcqLandPricePerSqm: "800000",
    mixedAcqCommercialBuildingPrice: "30000000",
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "250000000",
    phdLandPricePerSqmAtFirst: "1600000",
    phdLandPricePerSqmAtAcq: "800000",
    phdBuildingStdPriceAtAcq: "25000000",
    phdBuildingStdPriceAtFirst: "45000000",
    phdBuildingStdPriceAtTransfer: "100000000",
    mixedHousingInheritedValueOverride: "100000000",
    mixedCommercialInheritedValueOverride: "100000000",
  };

  test("BGMU-8 1995 상속(§163⑨ 단서 구간) · §164⑦ — ① 2억 < ② 합계 비교 카드에 ② 채택 · 「채무비율 곱하기 전」 설명 · 취득가액 행은 §164⑦ 환산가액", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, Y95_PHD);
    await expandAssetSection(page, 3);
    await expect(page.getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeVisible();
    await expect(page.locator('[data-field="mixedAcqHousingPrice"]')).toHaveCount(0);
    await calc(page);
    const card = page.getByTestId("mixed-sec163-9-comparison");
    await expect(card.locator('tr[data-candidate="standard"]')).toContainText("← 채택");
    await expect(page.getByTestId("mixed-sec163-9-bg-note")).toContainText("채무비율을 곱하기 전 취득가액");
    await expect(page.getByTestId("bg-result-acq-housing")).toContainText("§164⑦ 환산가액 안분");
  });

  test("BGMU-9 1995 상속 · §164⑦ 토글을 끄면 «다음»이 막히고 토글로 이동한다(사용자 결정 R-1 — 개별주택가격 공시 전 직접 입력 불허)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { ...Y95_PHD, usePreHousingDisclosure: false, mixedAcqHousingPrice: "300000000" });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("§164⑦ 환산가액");
    await expect(page.locator('[data-field="usePreHousingDisclosure"]')).toBeInViewport();
  });

  test("BGMU-10 1983 상속(의제취득일 전) · §164⑦ · ① 비움 — 비교 카드에 ③ 환산취득가액 채택 · 취득가액 행은 「증여가액 중 주택분 몫」 산식 (PR-7b-7b)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, {
      ...Y95_PHD,
      acquisitionDate: "1983-03-15",
      inheritanceStartDate: "1983-03-15",
      decedentAcquisitionDate: "1970-01-01",
      mixedHousingInheritedValueOverride: "",
      mixedCommercialInheritedValueOverride: "",
    });
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-mixed-deemed-notice")).toContainText("§176조의2④");
    await expandAssetSection(page, 3);
    await expect(page.getByText("상속개시일 신고가액 직접 입력 (선택)")).toBeVisible();
    await calc(page);
    const card = page.getByTestId("mixed-sec163-9-comparison");
    await expect(card.locator('tr[data-candidate="converted"]')).toContainText("← 채택");
    await expect(page.getByTestId("bg-result-acq-housing")).toContainText("환산취득가액 — 의제취득일 전 상속·증여");
    await expect(page.getByTestId("bg-result-acq-housing")).toContainText("증여가액 중 주택분 몫");
  });

  test("BGMU-7 증여자 상속 취득에서 평가액을 비우면 «다음»이 막히고 상속개시일 주택분 신고가액 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { ...INHERITED, mixedHousingInheritedValueOverride: "", mixedCommercialInheritedValueOverride: "" });
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("주택분·상가분 상증법 평가액");
    await expect(page.locator('[data-field="mixedHousingInheritedValueOverride"]').locator("input").first()).toBeFocused();
  });
});

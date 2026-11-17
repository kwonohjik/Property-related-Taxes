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
 * BGMU-15~17 — 함께 양도(여러 물건) 묶음(PR-B 화면 단계, 계획서 `docs/00-pm/bg-mixed-use-m2-bundle-share.plan.md` Q-3 ①·Q-4·Q-7).
 *   시료는 route anchor `__tests__/api/transfer.route.mixed-use-bg-companion.anchor.test.ts` CP-1과 같다: 주택(기준시가 6억·채무 2억) + 겸용(기준시가 12억·채무 6억) →
 *   신고 단위 채무 8억 · ΣA 18억 · B_i = [266,666,666, 533,333,334].
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/transfer-bg-mixed-use.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

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
    seedWithDeclaredRoster({ state: { formData, currentStep: 0, pendingMigration: false }, version: 0 }),
  );
  await page.reload();
  await ready(page);
}

async function calc(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByTestId("bg-result-apportion").waitFor({ timeout: 30_000 });
}

/** 함께 양도 묶음 시료 — route anchor CP-1과 같다(기준시가 모드 · 귀속은 화면이 받지 않아 미선택이 정상). */
const bundleHouse = (over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetId: "h1",
  // 조정대상지역이 아닌 주소 — 서울이면 같은 날 양도 주택 2채(§154⑨ 순서)를 ⑧이 막는다(route anchor도 제주 주소)
  addressJibun: "제주특별자치도 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "",
  standardPriceAtTransfer: "600000000",
  standardPriceAtAcq: "300000000",
  useEstimatedAcquisition: false,
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0",
  bgMortgageDebtAmount: "200000000",
  bgMortgageSetAmount: "200000000",
  ...over,
});
const bundleMixed = (over: Record<string, unknown> = {}) =>
  withMixedHousingStd({
    ...makeDefaultAsset(2),
    assetId: "m2",
    addressJibun: "제주특별자치도 강남구 테스트동 2-2",
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
    mixedTransferHousingBuildingStdPrice: "100000000",
    mixedAcqHousingBuildingStdPrice: "50000000",
    mixedIsMetropolitanArea: true,
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "0",
    bgMortgageDebtAmount: "600000000",
    bgMortgageSetAmount: "600000000",
    bgMortgageAttribution: "",
    ...over,
  });

async function seedBundleAndOpen(page: Page, assets: unknown[], extra: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = {
    ...createDefaultTransferFormData(),
    assets,
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    contractTotalPrice: "",
    householdHousingCount: "2",
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assetSplitMode: "companion",
    bundledSaleMode: "actual",
    ...extra,
  };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedWithDeclaredRoster({ state: { formData, currentStep: 0, pendingMigration: false }, version: 0 }),
  );
  await page.reload();
  await ready(page);
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
  // ── 담보·임대 승(사용자 결정 H-1 2026-11-16 · 종전 MB-7 차단) — anchor `transfer.route.mixed-use-bg-nonsupp-winner.anchor.test.ts` MN-2·MN-4와 같은 시료·같은 값 ──
  test("BGMU-11 기준시가 모드 담보 승 · 상가 보증금 3억 + 근저당 10억(불분명) → 주택 5억/상가 8억 · 174,975,600 · 명세 라벨 «담보채권액 평가»", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, {
      bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "", bgActualAcquisitionTotal: "", bgHousingAppraisalDeclared: "",
      bgLendingDepositTotal: "300000000", bgDepositAttribution: "commercial", bgMortgageDebtAmount: "1000000000", bgMortgageAttribution: "unallocated",
    });
    await expect(page.getByTestId("bg-mixed-nonsupp-split")).toContainText("담보채권액 평가");
    await calc(page);
    await expect(page.locator('[data-print-id="calculation"]')).toContainText("174,975,600");
    await expect(page.getByTestId("bg-mixed-gift-value")).toHaveText("1,300,000,000");
    await expect(page.getByTestId("bg-mixed-detail-card")).toContainText("증여가액 = 담보채권액 평가");
    await expect(page.getByTestId("bg-result-apportion")).toContainText("주택분 양도로 보는 채무액500,000,000");
  });

  test("BGMU-12 시가 모드 담보 승(시가 12.5억 < 담보 13억) — 강제 안내가 보이고 구분 감정평가 선언은 숨는다 · 174,975,600", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { bgMarketValueAtTransfer: "1250000000", bgMortgageDebtAmount: "1300000000", bgMortgageAttribution: "unallocated" });
    await expect(page.getByTestId("bg-collateral-forced-notice")).toContainText("겸용주택 기준시가의 취득시 값");
    await expect(page.getByTestId("bg-housing-appraisal")).toHaveCount(0);
    await calc(page);
    await expect(page.locator('[data-print-id="calculation"]')).toContainText("174,975,600");
    await expect(page.getByTestId("bg-mixed-gift-value")).toHaveText("1,300,000,000");
  });

  // ── 공유지분 단건(PR-A · 사용자 결정 Q-1 S안) — 시가·취득가액은 물건 전체, 채무는 내 지분 인수분. 값은 route anchor `transfer.route.mixed-use-bg-share.anchor.test.ts`와 같다 ──
  const SHARE = {
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    ownershipRemainderThirdParty: "yes",
    bgMortgageAttribution: "unallocated",
  };

  test("BGMU-13 공유지분 50% · 시가 15억(물건 전체) · 지분 인수 채무 3억 · 보충 승 → 계산 성공 25,125,001 · 증여가액은 지분분 7.5억 · 지분 고지 문구 (SH-1)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { ...SHARE, bgMortgageDebtAmount: "300000000" });
    await calc(page);
    await expect(page.locator('[data-print-id="calculation"]')).toContainText("25,125,001");
    const card = page.getByTestId("bg-mixed-detail-card");
    // 증여가액·무상이전분·채무는 내 지분분 — 물건 전체 시가 15억이 아니다
    await expect(page.getByTestId("bg-mixed-gift-value")).toHaveText("750,000,000");
    await expect(card).toContainText("내 지분 50% 해당분");
    await expect(card).toContainText("인수 채무액 (내 지분 인수분)");
    await expect(card).toContainText("450,000,000");
    // 12억 고가주택 판정 가액은 물건 전체 값으로 따로 표시한다
    await expect(page.getByTestId("bg-mixed-highvalue-whole")).toHaveText("750,000,000");
    await expect(card).toContainText("12억원 고가주택 판정 가액 (물건 전체");
    await expect(page.getByText("겸용주택 공유지분 부담부증여는 직접 다룬 해석례가 확인되지 않았습니다").first()).toBeVisible();
    await expect(page.getByTestId("bg-result-apportion")).toContainText("주택분 양도로 보는 채무액150,000,000");
  });

  test("BGMU-14 공유지분 50% · 시가 모드 담보 승(지분분 시가 7.5억 < 담보 8억) → 계산 성공 118,396,000 · 취득가액은 취득시 기준시가 기준 (SH-4 · S-G)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, { ...SHARE, bgMortgageDebtAmount: "800000000" });
    await expect(page.getByTestId("bg-collateral-forced-notice")).toContainText("겸용주택 기준시가의 취득시 값");
    await calc(page);
    await expect(page.locator('[data-print-id="calculation"]')).toContainText("118,396,000");
    const card = page.getByTestId("bg-mixed-detail-card");
    await expect(card).toContainText("증여가액 = 담보채권액 평가");
    await expect(card).toContainText("내 지분 50% 해당분");
    await expect(page.getByTestId("bg-mixed-gift-value")).toHaveText("800,000,000");
    await expect(page.getByTestId("bg-mixed-highvalue-whole")).toHaveText("800,000,000");
  });
  // ── 함께 양도(여러 물건) 묶음 — 보충적평가 승만, 채무는 신고 단위로 재배분해 구분 불분명 (PR-B 화면 단계) ──
  test("BGMU-15 주택 BG + 겸용 BG 함께 양도 — 귀속을 고르지 않아도 계산 성공 · 겸용 자산 4부분 카드 · 재배분 채무 533,333,334 · 증여세는 1회", async ({ page }) => {
    test.setTimeout(120_000);
    await seedBundleAndOpen(page, [bundleHouse(), bundleMixed()]);
    // ⑤ 겸용 카드의 채무 귀속 — 읽기 전용(라디오 없음) + 재배분 채무 표시(④가 보내는 값과 같다)
    await expandAssetSection(page, 2, 1);
    await expect(page.getByTestId("bg-attr-card")).toHaveAttribute("data-bundle", "true");
    await expect(page.getByTestId("bg-attr-bundle-debt")).toHaveText("533,333,334원");
    await expect(page.locator('input[type="radio"][name^="bgMortgageAttribution"]')).toHaveCount(0);
    await expect(page.getByTestId("bg-mixed-notice")).toContainText("함께 양도(여러 물건) 묶음");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const r = await res;
    expect(r.status(), await r.text()).toBe(200);
    const data = (await r.json()).data;
    expect(data.mode).toBe("bundled");
    // 오라클(route anchor CP-1): 양도차익 합 = 자산별 단건(자기 채무 = B_i) 합 · 증여가액 ΣA 18억 · 증여세 결정세액 1회
    expect(data.aggregated.totalTransferGain).toBe(388_000_004);
    expect(data.aggregated.burdenedGift.giftValuation.max).toBe(1_800_000_000);

    // ⑦ 겸용 자산별 4부분 카드 — 증여가액 12억 · 재배분 채무 · 부분별 양도가액·취득가액·개산공제·양도차익
    const card = page.getByTestId("bg-mixed-bundle-card-m2");
    await card.waitFor({ timeout: 30_000 });
    await expect(page.getByTestId("bg-mixed-bundle-gift-value-m2")).toHaveText("1,200,000,000");
    await expect(page.getByTestId("bg-mixed-bundle-debt-m2")).toHaveText("533,333,334");
    const row = (k: string) => card.locator(`tr[data-part="${k}"]`);
    await expect(row("housingLand")).toContainText("222,222,222");
    await expect(row("housingLand")).toContainText("111,111,111");
    await expect(row("housingLand")).toContainText("107,777,778");
    await expect(row("commercialBuilding")).toContainText("44,444,445");
    await expect(row("commercialBuilding")).toContainText("21,555,557");
    // 증여세는 계약 단위 1회 — 겸용 카드에는 없고 묶음 §159 명세 카드에 한 번 있다
    await expect(card).not.toContainText("증여세 산출세액");
    await expect(page.getByText("증여세 산출세액")).toHaveCount(1);
    await expect(page.locator("tr", { hasText: "증여세 결정세액 (수증자 부담)" })).toHaveCount(1);
    await expect(page.locator("tr", { hasText: "증여세 결정세액 (수증자 부담)" })).toContainText("218,250,000");
    // 주택 카드(주 자산)는 겸용 카드를 만들지 않는다
    await expect(page.getByTestId("bg-mixed-bundle-card-primary")).toHaveCount(0);
    await expect(page.getByTestId("bg-bundle-mixed-note")).toBeVisible();

    // ⑥ 사이드바 — 겸용 자산(자산 2) 양도가액 = 재배분 채무 · 취득가액·필요경비 = 엔진 echo (종전에는 주 자산이 겸용이면 «계산 후 표시»에 갇혔다)
    await page.getByRole("button", { name: /^이전/ }).last().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    const side = (await page.locator("aside").innerText()).replace(/\s+/g, " ");
    expect(side, side).toContain("자산 2 — 주택 양도가액 533,333,334 취득가액 266,666,666 필요경비 7,999,998");
    expect(side, side).toContain("자산 1 — 주택 양도가액 266,666,666 취득가액 133,333,333 필요경비 3,999,999");
  });

  test("BGMU-16 묶음 안 겸용에 주택 귀속 선언이 남아 있으면 «다음»이 막히고 담보차입금 귀속 칸으로 이동한다 — 「구분 불분명」만 고를 수 있다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedBundleAndOpen(page, [bundleHouse(), bundleMixed({ bgMortgageAttribution: "housing" })]);
    await expandAssetSection(page, 2, 1);
    // 저장된 선언은 지우지 않는다 — 라디오가 열려 있고 주택·상가·나누어 입력은 비활성
    const group = page.locator('[data-field="bgMortgageAttribution"]');
    await expect(group).toHaveCount(1);
    await expect(page.locator('input[type="radio"][name^="bgMortgageAttribution"][value="housing"]')).toBeChecked();
    for (const v of ["housing", "commercial", "split"]) {
      await expect(page.locator(`input[type="radio"][name^="bgMortgageAttribution"][value="${v}"]`)).toBeDisabled();
    }
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toContainText("채무 귀속을 「구분 불분명」으로만 받습니다");
    // 「구분 불분명」으로 바꾸면 막힘이 풀리고 선택지(라디오)는 사라진다
    // `check()`는 쓰지 않는다 — 고르는 순간 라디오가 사라져(남은 선언이 풀려서) 사후 확인이 대상을 잃는다
    await page.locator('input[type="radio"][name^="bgMortgageAttribution"][value="unallocated"]').click();
    await expect(page.locator('input[type="radio"][name^="bgMortgageAttribution"]')).toHaveCount(0);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
  });

  // 🔄 2026-11-17(M-2 PR-C): 지분 분할 취득(축 B)을 계산한다 — 종전 BGMU-17은 막힘을 고정했다.
  //    화면 상태: 자산 1 = 물건 단위 칸 + 부담부증여 칸(물건 전체 · 귀속 불분명) · 자산 2 = 이 지분의 취득 쪽 칸만(② 숨김). 값은 route anchor
  //    `__tests__/calc/mixed-bg-axis-b.anchor.test.ts` S1과 같다 — 단독 소유 단건과 같은 67,033,120원.
  test("BGMU-17 지분 분할 취득(축 B) 겸용 BG를 계산한다 — 단건과 같은 세액 · ⑦ 카드 2장(축 B 문구) · 증여세 1회", async ({ page }) => {
    test.setTimeout(90_000);
    const first = bundleMixed({ assetId: "s1", ownershipNumerator: "60", ownershipDenominator: "100", bgMortgageAttribution: "unallocated" });
    const second = {
      ...makeDefaultAsset(2),
      assetId: "s2",
      addressJibun: (first as { addressJibun: string }).addressJibun,
      acquisitionCause: "purchase",
      acquisitionDate: "2010-03-15",
      mixedAcqHousingPrice: "300000000",
      mixedAcqLandPricePerSqm: "2500000",
      mixedAcqCommercialBuildingPrice: "50000000",
      mixedAcqHousingBuildingStdPrice: "50000000",
      transferType: "burdened_gift",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
    };
    await seedBundleAndOpen(page, [first, second], { assetSplitMode: "fractional", bundledSaleMode: "apportioned", householdHousingCount: "2" });
    // ⑤ 계산 범위 안내 — 지분 분할 취득을 계산한다고 적는다
    await expandAssetSection(page, 2, 0);
    await expect(page.getByTestId("bg-mixed-notice")).toContainText("지분마다 지분율로 나누어 계산");
    await expect(page.getByTestId("bg-mixed-notice")).not.toContainText("지분 분할 취득은 계산하지 않습니다");

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const r = await res;
    expect(r.status(), await r.text()).toBe(200);
    const data = (await r.json()).data;
    expect(data.mode).toBe("bundled");
    expect(data.aggregated.totalTax).toBe(67_033_120);
    // 증여세는 계약 단위 1회 — 단건과 같은 101,850,000원
    expect(data.aggregated.burdenedGift.giftTax.finalTax).toBe(101_850_000);

    // ⑦ 지분마다 4부분 카드 — 함께 양도의 재배분 문구 대신 축 B 문구
    for (const key of ["primary", "s2"]) {
      const card = page.getByTestId(`bg-mixed-bundle-card-${key}`);
      await card.waitFor({ timeout: 30_000 });
      await expect(card).toContainText("물건 전체로 입력한 채무 × 이 지분의 지분율");
      await expect(card).not.toContainText("재배분한 이 겸용주택의 몫");
      await expect(card).not.toContainText("증여세 산출세액");
    }
    await expect(page.getByTestId("bg-mixed-bundle-debt-primary")).toHaveText("360,000,000");
    await expect(page.getByTestId("bg-mixed-bundle-debt-s2")).toHaveText("240,000,000");
  });
});

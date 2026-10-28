/**
 * E2E — 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) PR-2: 일반건물(E2) 파트 · 주택 분리 파트(E3) 안내
 *
 * UI 설계서 docs/02-design/features/carryover-gift-debt-purchased-part-parts.ui.design.md §6.2 (CDPP-11~13)
 * 사례(vitest anchor `transfer.route.carryover-debt-parts*.anchor.test.ts`와 같은 값): 일반건물 환산 · 토지 100㎡ × 2,000,000 + 건물 2억 · 양도 2026-03-01 10억 ·
 *   토지만 이월과세(증여 2021-03-01 · 증여자 2005-06-15 취득 1.5억 · 평가액 4억 · 산출세액 3천만 · 과세가액 10억) · 채무 1억 →
 *   시나리오 A 채택 141,690,000 · 채무 OFF 156,620,000. E3(주택 분리 · 토지만 이월과세 · 채무 1억) 175,110,000.
 *
 * 실행(워크트리): E2E_PORT=3154 npx playwright test e2e/carryover-gift-debt-purchased-part-parts.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { calculate } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const TOGGLE = "당초 증여 때 채무를 인수했다";
const DEBT = '[data-field="carryover.giftAssumedDebt"]';

const coOf = (over: Record<string, unknown> = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-03-01",
  donorAcquisitionDate: "2005-06-15",
  donorAcquisitionPrice: "150000000",
  giftDateValuation: "400000000",
  giftTaxCalculated: "30000000",
  giftTaxBase: "1000000000",
  donorRelation: "lineal",
  donorSameHousehold: "no",
  ...over,
});

/** 일반건물 환산 · 토지만 이월과세(분리 ON — 화면에서 «토지만 이월과세»를 표현하는 유일한 모양). */
const gbAsset = (co: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(1),
  assetLabel: "자산 1",
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2021-03-01",
  acquisitionDate: "2021-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000",
  actualSalePrice: "1000000000",
  carryover: coOf(co),
  ...over,
});

async function seedAndOpen(page: Page, asset: Record<string, unknown>, formOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  const formData = {
    ...createDefaultTransferFormData(),
    assets: [asset],
    transferDate: "2026-03-01",
    filingDate: "2026-05-31",
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    ...formOver,
  };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버 Next.js 표시기 배지가 하단 버튼을 덮는다
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const toggle = (page: Page) => page.getByRole("switch", { name: TOGGLE });
const debtInput = (page: Page) => page.locator(`${DEBT} input`).first();
const openAcquisition = (page: Page) => expandAssetSection(page, 3, 0);
type Wire = { generalBuildingValuation?: { landCarryoverPart?: { giftAssumedDebt?: number }; carryoverGiftEvent?: { giftTaxCalculated?: number; giftTaxBase?: number } } };

test.describe("CDPP-11 E2 일반건물 기본 — 토글·채무 → 요청 body · 결과 조각 · 사이드바", () => {
  test("토글 ON → 채무 칸(분자 전용 노트 없음 · 증여분 안내) → 요청 body · 결과 141,690,000 · OFF 156,620,000 · 사이드바 = 엔진 차감", async ({ page }) => {
    test.setTimeout(240_000);
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: false }));
    await openAcquisition(page);
    await expect(toggle(page)).toBeVisible();
    await expect(page.locator(DEBT)).toHaveCount(0);
    await toggle(page).click();
    await expect(page.getByTestId("carryover-debt-numerator-only-note")).toHaveCount(0);
    await expect(page.locator(DEBT)).toContainText("채무 인수 부분");
    await expect(page.locator('[data-field="carryover.donorAcquisitionPrice"]').first()).toContainText("증여분에만");
    await expect(page.locator('[data-field="carryover.giftTaxCalculated"]').first()).toContainText("증여분에만");
    await debtInput(page).fill("100000000");

    const body = (await calculate(page)) as Wire;
    expect(body.generalBuildingValuation?.landCarryoverPart?.giftAssumedDebt).toBe(100_000_000);
    expect(body.generalBuildingValuation?.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000 });

    // 결과 — 토지 카드의 증여분·매입분 두 블록 + 방법 고지
    await expect(page.getByTestId("carryover-piece-gift").first()).toBeVisible();
    await expect(page.getByTestId("carryover-piece-purchased").first()).toBeVisible();
    await expect(page.getByTestId("carryover-piece-method-notice").first()).toContainText("확인 필요");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("141,690,000");
    // 상세명세서 한 줄 고지(T1)
    await expect(page.locator('[data-statement-row="취득가액"]').first()).toContainText("양도로 보는 부분(매입분)으로 나누어 계산했습니다");

    // ⑥ 사이드바 — 취득가액 462,500,000 · 필요경비 12,750,000 (엔진 차감 합)
    await page.getByRole("button", { name: "이전 화면" }).click();
    await page.locator("aside").getByRole("button", { name: /자산 목록/ }).click();
    await page.getByRole("heading", { name: "자산 목록·취득 정보 입력" }).waitFor();
    const side = page.locator("aside").first();
    await expect(side).toContainText("1,000,000,000");
    await expect(side).toContainText("462,500,000");
    await expect(side).toContainText("12,750,000");

    // OFF — 156,620,000 · 조각 없음 · 사이드바도 엔진 차감(4억 · 1,500만)
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: false, giftAssumedDebt: "" }));
    await calculate(page);
    await expect(page.getByTestId("carryover-piece-gift")).toHaveCount(0);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("156,620,000");
    await page.getByRole("button", { name: "이전 화면" }).click();
    await page.locator("aside").getByRole("button", { name: /자산 목록/ }).click();
    await page.getByRole("heading", { name: "자산 목록·취득 정보 입력" }).waitFor();
    await expect(page.locator("aside").first()).toContainText("400,000,000");
    await expect(page.locator("aside").first()).toContainText("15,000,000");
  });

  test("인쇄 — 출력 항목 전체 선택 뒤 print 미디어에서도 조각 블록이 보인다", async ({ page }) => {
    test.setTimeout(240_000);
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: true, giftAssumedDebt: "100000000" }));
    await calculate(page);
    await page.getByRole("button", { name: /전체 선택/ }).first().click();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("carryover-piece-purchased").first()).toBeVisible();
  });
});

const EXPR = { type: "public_expropriation", expropriationCash: "600000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01" };

test.describe("CDPP-12 E2 증여세 칸 규칙 · 차단 — ⑧ 이동 · K-2 와이어", () => {
  const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });
  const issues = (page: Page) => page.getByTestId("validation-issues");

  test("(a) 토글 ON · 과세가액 비움 → 계산 차단 · 증여세 과세가액 칸으로 이동", async ({ page }) => {
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: true, giftAssumedDebt: "100000000", giftTaxBase: "" }));
    await next(page).click();
    await expect(issues(page)).toContainText("당초 증여 때 채무를 인수했으면 증여세 신고서의 과세가액을 입력하세요");
    await expect(page.locator('[data-field="carryover.giftTaxBase"] input').first()).toBeFocused();
  });

  test("(b) 산출세액 0 · 과세가액 10억 → 통과 · 요청 body가 part 모양이고 채무가 실린다(K-2)", async ({ page }) => {
    test.setTimeout(240_000);
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: true, giftAssumedDebt: "100000000", giftTaxCalculated: "0" }));
    const body = (await calculate(page)) as Wire;
    expect(body.generalBuildingValuation?.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 0, giftTaxBase: 1_000_000_000 });
    expect(body.generalBuildingValuation?.landCarryoverPart?.giftAssumedDebt).toBe(100_000_000);
    await expect(page.getByTestId("carryover-piece-purchased").first()).toBeVisible();
  });

  test("(c) 조특법 감면 선택 → 차단 문구 · 토글은 켜진 채 보이고 채무 칸은 없다 · 끄면 통과", async ({ page }) => {
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: true, giftAssumedDebt: "100000000" }, { reductions: [EXPR] }));
    await openAcquisition(page);
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    await expect(page.getByTestId("carryover-debt-unsupported-toggle-note")).toContainText("이 토글을 끄세요");
    await expect(page.locator(DEBT)).toHaveCount(0);
    await next(page).click();
    await expect(issues(page)).toContainText("감면");
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
    await next(page).click();
    await expect(issues(page)).toHaveCount(0);
  });

  test("(d) 채무 = 평가액 + 증여자 자본적지출 → 증여자 자본적지출 칸으로 이동", async ({ page }) => {
    await seedAndOpen(page, gbAsset({ giftDebtAssumed: true, giftAssumedDebt: "400000000", donorCapitalExpenditure: "10000000" }));
    await next(page).click();
    await expect(issues(page)).toContainText("증여받은 부분이 없어 증여자 자본적지출을 적용할 곳이 없습니다");
    await expect(page.locator('[data-field="carryover.donorCapitalExpenditure"] input').first()).toBeFocused();
  });

  test("건물만 이월과세 변형 — 증여세 칸 이동 앵커가 buildingCarryover.*", async ({ page }) => {
    const bco = coOf({ giftDebtAssumed: true, giftAssumedDebt: "100000000", giftTaxBase: "" });
    await seedAndOpen(page, gbAsset({}, { acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS }, buildingCarryover: bco }));
    await next(page).click();
    await expect(issues(page)).toContainText("당초 증여 때 채무를 인수했으면 증여세 신고서의 과세가액을 입력하세요");
    await expect(page.locator('[data-field="buildingCarryover.giftTaxBase"] input').first()).toBeFocused();
  });
});

test.describe("CDPP-13 E3 주택 분리 파트(A) — 비지원: 노트 유지 · 와이어 불변 · 결과 T2 고지", () => {
  const splitAsset = (debtOn: boolean) => ({
    ...makeDefaultAsset(1),
    assetLabel: "자산 1",
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-03-01",
    landAcquisitionCause: "carryover_gift",
    landCauseHost: "purchase",
    landAcquisitionDate: "2023-03-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "400000000",
    actualSalePrice: "1200000000",
    saleSplitMode: "actual",
    landTransferPrice: "700000000",
    buildingTransferPrice: "500000000",
    landStandardPriceAtTransfer: "700000000",
    buildingStandardPriceAtTransfer: "500000000",
    landCarryover: coOf({ giftRegistryDate: "2023-03-01", donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: "100000000", giftTaxCalculated: "20000000", giftTaxBase: "400000000", giftDateValuation: "", giftDebtAssumed: debtOn, giftAssumedDebt: debtOn ? "100000000" : "" }),
  });
  const seedSplit = (page: Page, debtOn: boolean) => seedAndOpen(page, splitAsset(debtOn), { transferDate: "2025-06-30", filingDate: "2025-08-31", contractTotalPrice: "1200000000" });

  test("토글 ON · 토지 채무 1억 → 노트 유지 · body landCarryoverPart.giftAssumedDebt 불변 · 결과 T2 문장 · 175,110,000 · 인쇄에서도 보임 · OFF면 T2 없음 173,660,000", async ({ page }) => {
    test.setTimeout(240_000);
    await seedSplit(page, true);
    await openAcquisition(page);
    await expect(page.getByTestId("carryover-debt-numerator-only-note").first()).toContainText("분자에서만");
    const body = (await calculate(page)) as { landCarryoverPart?: { giftAssumedDebt?: number } };
    expect(body.landCarryoverPart?.giftAssumedDebt).toBe(100_000_000);
    await expect(page.getByTestId("split-carryover-debt-notice-0")).toContainText("에서만 뺐습니다");
    await expect(page.getByTestId("split-carryover-debt-notice-0")).toContainText("나누어 계산하지는 않았습니다");
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("175,110,000");
    await page.getByRole("button", { name: /전체 선택/ }).first().click();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("split-carryover-debt-notice-0")).toBeVisible();

    await page.emulateMedia({ media: "screen" });
    await seedSplit(page, false);
    await calculate(page);
    await expect(page.getByTestId("split-carryover-debt-notice-0")).toHaveCount(0);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("173,660,000");
  });
});

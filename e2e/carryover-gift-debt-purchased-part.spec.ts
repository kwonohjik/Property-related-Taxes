/**
 * E2E — 이월과세 × 당초 증여 때 인수한 채무 부분(매입분): 화면에서 토글·채무를 넣으면 계산과 결과 카드·사이드바에 닿는다
 *
 * 계획서: docs/00-pm/carryover-gift-debt-purchased-part.plan.md · UI 설계서 docs/02-design/features/carryover-gift-debt-purchased-part.ui.design.md §8.3
 * 사례(vitest anchor `transfer.route.carryover-debt-purchased-part.anchor.test.ts`와 같은 값): 주택 · 다주택 · 비조정 · 양도 2026-03-01 15억 ·
 *   당초 증여 2023-06-01 평가액 10억 · 증여자 취득 2000-06-01 1억 · 채무 4억 → 시나리오 A′ 293,970,000 채택 · OFF 374,610,000 · 단기(증여 2025-06-01) 349,270,000.
 *
 * 실행(워크트리): E2E_PORT=3153 npx playwright test e2e/carryover-gift-debt-purchased-part.spec.ts
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
  giftRegistryDate: "2023-06-01",
  donorAcquisitionDate: "2000-06-01",
  donorAcquisitionPrice: "100000000",
  giftDateValuation: "1000000000",
  giftTaxAmount: "0",
  donorRelation: "lineal",
  donorSameHousehold: "no",
  ...over,
});

async function seedAndOpen(page: Page, co: Record<string, unknown>, assetOver: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  const formData = {
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), assetLabel: "자산 1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "", actualSalePrice: "1500000000", carryover: coOf(co), ...assetOver }],
    transferDate: "2026-03-01",
    filingDate: "2026-05-31",
    contractTotalPrice: "1500000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
  };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버 Next.js 표시기 배지가 하단 버튼을 덮는다
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const toggle = (page: Page) => page.getByRole("switch", { name: TOGGLE });
const debtInput = (page: Page) => page.locator(`${DEBT} input`).first();
async function openAcquisition(page: Page) {
  await expandAssetSection(page, 3, 0);
}
type Wire = { carryoverTaxation?: { giftAssumedDebt?: number } };

test.describe("이월과세 채무 부분(매입분) — ⑤ 입력", () => {
  test("CDPP-1 토글은 OFF로 보이고 켜면 채무 칸 · 끄면 칸이 사라지되 값은 남는다", async ({ page }) => {
    await seedAndOpen(page, {});
    await openAcquisition(page);
    await expect(toggle(page)).toBeVisible();
    await expect(page.locator(DEBT)).toHaveCount(0);
    await toggle(page).click();
    await expect(page.locator(DEBT)).toHaveCount(1);
    await debtInput(page).fill("400000000");
    await toggle(page).click();
    await expect(page.locator(DEBT)).toHaveCount(0);
    await toggle(page).click();
    await expect(debtInput(page)).toHaveValue("400,000,000");
  });

  test("CDPP-2 ⑧ 칸 비우면 차단·그 칸으로 이동 · 평가액 초과 차단 · 0은 통과", async ({ page }) => {
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "" });
    const next = page.getByRole("button", { name: "다음", exact: true });
    await next.click();
    await expect(page.getByTestId("validation-issues")).toContainText("당초 증여 때 인수한 채무를 입력하세요");
    await expect(debtInput(page)).toBeFocused();
    await debtInput(page).fill("1500000000");
    await next.click();
    await expect(page.getByTestId("validation-issues")).toContainText("증여 당시 평가액보다 큽니다");
    // 값이 든 금액 칸에 `fill`하면 이어 붙는 일이 있다(`gb-bg-carryover-gift-tax-input.spec.ts` 주석) — 비운 뒤 넣는다.
    await debtInput(page).fill("");
    await debtInput(page).fill("0");
    await expect(debtInput(page)).toHaveValue("0");
    await next.click();
    await expect(page.getByTestId("validation-issues")).toHaveCount(0);
  });

  test("CDPP-6 지금 양도도 부담부증여 주택 — 토글 대신 안내 · 남은 ON은 켜진 채 보인다", async ({ page }) => {
    await seedAndOpen(page, {}, { transferType: "burdened_gift" });
    await openAcquisition(page);
    await expect(page.getByTestId("carryover-debt-unsupported-note")).toContainText("지금 양도하는 자산도 부담부증여입니다");
    await expect(toggle(page)).toHaveCount(0);
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "400000000" }, { transferType: "burdened_gift" });
    await openAcquisition(page);
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    await expect(page.locator(DEBT)).toHaveCount(0);
    await toggle(page).click();
    await expect(page.getByTestId("carryover-debt-unsupported-note")).toBeVisible();
  });
});

test.describe("이월과세 채무 부분(매입분) — ④ 전송 · ⑦ 결과", () => {
  test("CDPP-3 request body — ON·4억은 채무 키 · OFF(값이 남아 있어도)는 키 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    const on = (await calculate(page)) as Wire;
    expect(on.carryoverTaxation?.giftAssumedDebt).toBe(400_000_000);
    await seedAndOpen(page, { giftDebtAssumed: false, giftAssumedDebt: "400000000" });
    const off = (await calculate(page)) as Wire;
    expect(off.carryoverTaxation).not.toHaveProperty("giftAssumedDebt");
  });

  test("CDPP-4 결과 — 증여분 · 매입분 두 블록 · A′ 293,970,000 채택 · OFF는 374,610,000 · 조각 블록 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    await calculate(page);
    const gift = page.getByTestId("carryover-piece-gift");
    const buy = page.getByTestId("carryover-piece-purchased");
    await expect(gift.getByTestId("carryover-piece-gift-transfer-price")).toContainText("900,000,000");
    await expect(gift.getByTestId("carryover-piece-gift-acquisition-price")).toContainText("60,000,000");
    await expect(gift.getByTestId("carryover-piece-gift-acquisition-date")).toContainText("2000-06-01");
    await expect(buy.getByTestId("carryover-piece-purchased-transfer-price")).toContainText("600,000,000");
    await expect(buy.getByTestId("carryover-piece-purchased-acquisition-price")).toContainText("400,000,000");
    await expect(buy.getByTestId("carryover-piece-purchased-acquisition-date")).toContainText("2023-06-01");
    await expect(page.getByTestId("carryover-piece-method-notice")).toContainText("확인 필요");
    // 신고 전체 결정세액 — A′ 채택
    await expect(page.locator('[data-print-section="carryover"]').first()).toContainText("293,970,000");
    // 신고서 양식 열의 취득일: 증여분 열 = 증여자 취득일 · 매입분 열 = 증여 등기접수일
    const form = page.locator('[data-print-id="form-table"]').first();
    await expect(form).toContainText("2000-06-01");
    await expect(form).toContainText("2023-06-01");

    await seedAndOpen(page, { giftDebtAssumed: false, giftAssumedDebt: "" });
    await calculate(page);
    await expect(page.getByTestId("carryover-piece-gift")).toHaveCount(0);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("374,610,000");
  });

  test("CDPP-5 단기 매입분(증여 2025-06-01) — 349,270,000 · 매입분 세율 구분 행", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAndOpen(page, { giftRegistryDate: "2025-06-01", giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    await calculate(page);
    await expect(page.getByTestId("carryover-piece-purchased-rate")).toContainText("단기 보유 세율");
    await expect(page.locator('[data-print-section="carryover"]').first()).toContainText("349,270,000");
  });

  test("CDPP-9 인쇄 — 출력 항목 전체 선택 뒤 print 미디어에서도 조각 두 블록이 보인다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    await calculate(page);
    await page.getByRole("button", { name: /전체 선택/ }).first().click();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("carryover-piece-gift")).toBeVisible();
    await expect(page.getByTestId("carryover-piece-purchased")).toBeVisible();
  });

  test("CDPP-10 ⑥ 사이드바 — 계산 후 양도가액 15억 · 취득가액 4.6억(증여분 6천만 + 채무 4억)을 합쳐 보인다(조각 하나만 보이지 않는다)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedAndOpen(page, { giftDebtAssumed: true, giftAssumedDebt: "400000000" });
    await calculate(page);
    // 결과(bundled) → 「이전 화면」으로 입력 단계에 복귀(result 유지) → 자산 목록 단계 — 사이드바는 입력 단계에서 보인다.
    await page.getByRole("button", { name: "이전 화면" }).click();
    await page.locator("aside").getByRole("button", { name: /자산 목록/ }).click();
    await page.getByRole("heading", { name: "자산 목록·취득 정보 입력" }).waitFor();
    const side = page.locator("aside").first();
    await expect(side).toContainText("1,500,000,000");
    await expect(side).toContainText("460,000,000");
    await expect(side).not.toContainText("계산 후 표시");
  });
});

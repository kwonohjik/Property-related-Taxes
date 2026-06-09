/**
 * E2E: Phase 1 — 모든 주식 카드에서 FinancialDeductionChip(이미지32) 부재 확인
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §7 Phase 1
 *
 * 배경:
 *   resolveAssetToggleVisibility에서 listed_stock·unlisted_stock의 financialDeduction을
 *   "hidden_permanent"로 강제(법령 §22② override) → FinancialDeductionChip이 렌더되지 않아야 함.
 *   §22② 최대주주 토글(MajorShareholderStockToggle)은 비상장 V2에 그대로 존재.
 *
 * FinancialDeductionChip 고유 텍스트:
 *   - 헤더: "§22 금융재산공제 대상" (FinancialDeductionChip.tsx:39) — 고유 식별자
 *   - ToggleCard title: "공제 대상으로 포함" (eligible=true 기본) — MajorShareholderStockToggle과 겹치지 않음
 *
 * 주의: MajorShareholderStockToggle.description = "ON = 공제 대상 제외 · OFF = 공제 대상 포함"
 *   → "공제 대상 제외" 부분 일치 검색은 V2 카드에서 오탐. 헤더·title 고유 텍스트만 사용.
 *
 * 시나리오:
 *   S-1a: 상장주식 카드 → FinancialDeductionChip 부재
 *   S-1b: 비상장주식 V1(간편) 카드 → FinancialDeductionChip 부재
 *   S-1c: 비상장주식 V2(정식) 카드 → FinancialDeductionChip 부재 + §22② 토글("최대주주에 해당") 존재
 *
 * 정책:
 *   [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

// ============================================================
// 진입 헬퍼 — inheritance-unlisted-section22-toggle.spec.ts 동일 패턴
// ============================================================

async function gotoStep0AndFillDeathDate(
  page: Page,
  year: string,
  month: string,
  day: string,
) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 상장주식 카드 추가 */
async function openListedStockCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("상장주식", { exact: true }).click();
}

/** 비상장주식 V1(간편) 카드 추가 — 기본 모드가 simple이므로 별도 클릭 불필요 */
async function openUnlistedV1SimpleCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
  // 기본 모드 = "간편평가" (simple) — 추가 클릭 불필요
}

/** 비상장주식 V2(정식) 카드 추가 — inheritance-unlisted-section22-toggle.spec.ts 동일 */
async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

// ============================================================
// 시나리오
// ============================================================

test.describe("Phase 1 S-1: 모든 주식 카드에서 FinancialDeductionChip 부재", () => {
  test("S-1a: 상장주식 카드 — FinancialDeductionChip 미렌더", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openListedStockCard(page);

    // FinancialDeductionChip 고유 헤더 부재
    await expect(page.getByText("§22 금융재산공제 대상", { exact: true })).toHaveCount(0);

    // FinancialDeductionChip ToggleCard title "공제 대상으로 포함" 부재
    await expect(page.getByText("공제 대상으로 포함", { exact: true })).toHaveCount(0);
  });

  test("S-1b: 비상장주식 V1(간편) 카드 — FinancialDeductionChip 미렌더", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    // FinancialDeductionChip 고유 헤더 부재
    await expect(page.getByText("§22 금융재산공제 대상", { exact: true })).toHaveCount(0);

    // FinancialDeductionChip ToggleCard title "공제 대상으로 포함" 부재
    await expect(page.getByText("공제 대상으로 포함", { exact: true })).toHaveCount(0);
  });

  test("S-1c: 비상장주식 V2(정식) 카드 — FinancialDeductionChip 부재 + §22② 토글 존재", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // FinancialDeductionChip 고유 헤더 부재
    // ("§22 금융재산공제 대상" — MajorShareholderStockToggle 헤더 "§22② 최대주주 보유주식 금융재산공제 배제"와 구분됨)
    await expect(page.getByText("§22 금융재산공제 대상", { exact: true })).toHaveCount(0);

    // FinancialDeductionChip ToggleCard title "공제 대상으로 포함" 부재
    // (MajorShareholderStockToggle에는 이 title이 없음 — description에 "포함"은 있지만 exact:true로 구분)
    await expect(page.getByText("공제 대상으로 포함", { exact: true })).toHaveCount(0);

    // §22② 최대주주 토글(MajorShareholderStockToggle)은 그대로 존재해야 함
    // — 헤더 "§22② 최대주주 보유주식 금융재산공제 배제"
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toBeVisible();

    // — ToggleCard title "최대주주에 해당"
    await expect(page.getByText("최대주주에 해당", { exact: true })).toBeVisible();
  });
});

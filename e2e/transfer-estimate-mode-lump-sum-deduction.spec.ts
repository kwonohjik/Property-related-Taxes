/**
 * 감정가액·매매사례가액 취득가액의 **필요경비 개산공제(§163⑥)** — E2E.
 *
 * 계획서: docs/00-pm/transfer-appraisal-salescase-lump-sum-deduction.plan.md
 *
 * ## 무엇을 잡는가
 * ④가 개산공제 base(`standardPriceAtAcquisition`)를 환산 모드에서만 보내, 감정·매매사례는
 * 신고서 양식의 **필요경비가 `-`(0)** 로 찍혔다. vitest는 ④ payload와 엔진을 따로 보지만,
 * 이 spec은 **사용자가 실제로 본 화면의 금액**을 단언한다.
 *
 * ⚠️ `toContainText("0")` 같은 substring 단언을 쓰지 않는다 — "300,000"도 통과해 검증이
 *    조용히 멈춘다(PR#1008 전례).
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-estimate-mode-lump-sum-deduction.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/**
 * 양도가 2억 · 추계 취득가 1억 · 취득시 기준시가 1억 · 2017-03-09 취득 → 2026-02-16 양도.
 * 개산공제 = 1억 × 3%(등기) / × 0.3%(미등기).
 */
function seedForm(mode: "appraisal" | "salesCase", isUnregistered: boolean) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2017-03-09",
            actualSalePrice: "200000000",
            standardPriceAtAcq: "100000000",
            ...(mode === "salesCase"
              ? { isSalesCaseAcquisition: true, similarSalesValue: "100000000" }
              : { isAppraisalAcquisition: true, fixedAcquisitionPrice: "100000000" }),
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "200000000",
        householdHousingCount: "2",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function calculate(page: Page, mode: "appraisal" | "salesCase", isUnregistered: boolean) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(mode, isUnregistered),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 마지막 단계로 이동 — 스텝 인디케이터는 사용자가 실제로 쓰는 경로다(jumpToStep 우회 금지).
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

/** 신고서 양식의 「필요경비」 행 금액 셀 */
function necessaryExpenseCell(page: Page) {
  return page.getByRole("row").filter({ hasText: /^필요경비/ }).first().getByRole("cell").last();
}

test.describe("추계 취득가액의 필요경비 개산공제 (§97②2호 본문 · §163⑥)", () => {
  test("매매사례가액 + 미등기 → 필요경비 300,000 (종전: '-')", async ({ page }) => {
    test.setTimeout(90_000);
    await calculate(page, "salesCase", true);
    await expect(
      necessaryExpenseCell(page),
      "§163⑥1호·2호 단서 — 미등기양도자산은 3/1000",
    ).toHaveText("300,000");
  });

  test("감정가액 + 등기 → 필요경비 3,000,000", async ({ page }) => {
    test.setTimeout(90_000);
    await calculate(page, "appraisal", false);
    await expect(necessaryExpenseCell(page)).toHaveText("3,000,000");
  });
});

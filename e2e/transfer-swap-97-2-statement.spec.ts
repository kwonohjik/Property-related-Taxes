/**
 * §97②2호 **단서**(swap) — 신고서 양식과 계산 상세 명세서가 **같은 취득가액**을 보인다.
 *
 * 계획서: docs/00-pm/transfer-swap-97-2-display.plan.md
 *
 * ## 무엇을 잡는가
 *
 * 단서 채택 시 필요경비 전체가 나목(자본적지출 + 양도비)이고 환산취득가액은 차감되지 않는다.
 * 그런데 명세서는 `환산취득가액 + 자본적지출`을 취득가액으로 인쇄해 **신고서와 200,000,000
 * 어긋났다**(사용자 제보 2026-09-15 · 양도 400,000,000 · 환산 200,000,000 · 개산공제
 * 4,500,000 · 자본적지출 230,000,000 → 명세서 430,000,000 · 신고서 230,000,000).
 *
 * vitest anchor가 두 빌더를 각각 보지만, 이 spec은 **한 화면에 나란히 뜬 두 카드의 금액**을
 * 본다 — 어긋남은 화면에서만 드러나는 종류의 결함이다.
 *
 * ⚠️ substring 단언(`toContainText`)을 쓰지 않는다 — "430,000,000"도 "30,000,000"을 품는다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-swap-97-2-statement.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const SEED = {
  state: {
    formData: {
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2019-09-10",
          actualSalePrice: "400000000",
          useEstimatedAcquisition: true,
          standardPriceAtAcq: "150000000",
          standardPriceAtTransfer: "300000000",
          capitalExpenditure: "230000000",
          transferExpense: "0",
        },
      ],
      transferDate: "2026-06-03",
      filingDate: "2026-08-31",
      contractTotalPrice: "400000000",
      // 1세대1주택 비과세를 피해 과세 축으로 둔다(제보 화면과 같은 조건).
      householdHousingCount: "2",
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

/** 신고서 양식 표의 행 금액 셀 */
function filingCell(page: Page, label: string) {
  return page
    .getByRole("row")
    .filter({ hasText: new RegExp(`^${label}`) })
    .first()
    .getByRole("cell")
    .last();
}

/** 계산 상세 명세서의 항목 금액 (표가 아니라 div 목록이다) */
function statementValue(page: Page, label: string) {
  return page.locator(`[data-statement-row="${label}"] [data-statement-value]`).first();
}

test.describe("§97②2호 단서 — 두 카드가 같은 취득가액을 보인다", () => {
  test("명세서 취득가액이 신고서와 같고 항등식이 성립한다", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      SEED,
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    // 스텝 인디케이터로 이동 — 사용자가 실제로 쓰는 경로다(jumpToStep 우회 금지).
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });

    // 신고서 양식 — 자본적지출이 취득가액 칸, 필요경비 칸은 양도비(0 → "-")
    await expect(filingCell(page, "취득가액")).toHaveText("230,000,000");

    // 계산 상세 명세서 — 🔴 종전 430,000,000
    await expect(
      statementValue(page, "취득가액"),
      "환산취득가액(200,000,000)이 취득가액 값에 섞이면 안 된다",
    ).toHaveText("230,000,000");
    await expect(statementValue(page, "양도가액")).toHaveText("400,000,000");
    await expect(statementValue(page, "전체 양도차익")).toHaveText("170,000,000");

    // 단서 비교 근거가 명세서에 노출된다(종전에는 개산공제가 화면 어디에도 없었다).
    await expect(
      page.locator('[data-statement-row="취득가액"]'),
      "가목(환산 + 개산공제)과의 비교 근거",
    ).toContainText("204,500,000");
  });
});

/**
 * 실가 모드 — 자본적지출은 신고서 양식·계산 상세 명세서의 **필요경비** 칸에 표시된다.
 *
 * 계획서: docs/00-pm/transfer-depreciation-and-capex-display.plan.md (Phase A)
 *
 * ## 무엇을 잡는가
 *
 * 「소득세법」 §97①은 자본적지출을 취득가액(1호)이 아닌 2호 필요경비로 둔다. 결과탭은 그동안
 * 「신고서 양식 표시 관행」이라며 자본적지출을 **취득가액 칸**에 합산했다
 * (사용자 제보 2026-10-02 · 양도 50,000,000 · 취득 28,500,000 · 자본적지출 1,000,000 ·
 * 양도비 700,000 → 신고서 취득가액 29,500,000 · 필요경비 700,000).
 *
 * vitest anchor(`capex-actual-mode-display.anchor.test.ts`)가 두 빌더를 각각 보지만, 이 spec은
 * **한 화면에 나란히 뜬 두 카드**를 본다. 세액은 이 변경으로 달라지지 않는다.
 *
 * ⚠️ substring 단언(`toContainText`)을 쓰지 않는다 — "1,700,000"은 "700,000"을 품는다.
 *
 * worktree 실행: E2E_PORT=3217 npx playwright test e2e/transfer-capex-actual-display.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const SEED = {
  state: {
    formData: {
      assets: [
        {
          ...makeDefaultAsset(1),
          addressJibun: "서울 강남구 테스트동 1-1",
          assetKind: "building",
          acquisitionCause: "purchase",
          acquisitionDate: "2025-01-29",
          actualSalePrice: "50000000",
          fixedAcquisitionPrice: "28500000",
          capitalExpenditure: "1000000",
          transferExpense: "700000",
        },
      ],
      transferDate: "2026-03-25",
      filingDate: "2026-05-31",
      contractTotalPrice: "50000000",
      householdHousingCount: "0",
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

test.describe("실가 모드 — 자본적지출은 필요경비 칸에 표시된다", () => {
  test("신고서·명세서가 같은 취득가액·필요경비를 보이고 항등식이 성립한다", async ({ page }) => {
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

    // 신고서 양식 — 🔴 종전 취득가액 29,500,000 · 필요경비 700,000
    await expect(filingCell(page, "양도가액")).toHaveText("50,000,000");
    await expect(
      filingCell(page, "취득가액"),
      "자본적지출(1,000,000)이 취득가액 칸에 얹히면 안 된다",
    ).toHaveText("28,500,000");
    await expect(
      filingCell(page, "필요경비"),
      "필요경비 = 자본적지출 1,000,000 + 양도비 700,000",
    ).toHaveText("1,700,000");
    await expect(filingCell(page, "전체 양도차익")).toHaveText("19,800,000");

    // 계산 상세 명세서 — 신고서와 같은 값
    await expect(statementValue(page, "취득가액")).toHaveText("28,500,000");
    await expect(statementValue(page, "필요경비")).toHaveText("1,700,000");
    await expect(statementValue(page, "전체 양도차익")).toHaveText("19,800,000");

    // 필요경비 산식이 자본적지출과 양도비를 풀어 쓴다 — 취득가액 산식에는 자본적지출이 없다.
    await expect(page.locator('[data-statement-row="필요경비"]')).toContainText("자본적지출 1,000,000");
    await expect(page.locator('[data-statement-row="취득가액"]')).not.toContainText("자본적지출");
  });
});

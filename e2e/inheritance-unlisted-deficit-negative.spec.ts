/**
 * E2E: 비상장주식 간편평가 — 결손·순자산 음수 직접 입력
 *
 * 계획서: docs/00-pm/unlisted-stock-deficit-negative-direct-input.plan.md §7·§8
 *
 * 시나리오:
 *   N-1: 결손(적자) 토글 제거 — 순손익 섹션에 「결손(적자)」 칩 미존재
 *   N-2: 순손익 음수 직접 입력 → "결손 입력:" 안내 표시
 *   N-3: 순자산 음수 직접 입력 → "음수 순자산 → 0으로 처리" 안내 표시
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify, nextSteps } from "./_helpers/tax-flow";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year, month, day });
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await nextSteps(page, 1);
}

async function openUnlistedV1SimpleCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
  // 기본 모드 = "간편평가"(simple)
}

/** 연도별 순손익 입력칸 — 라벨 span → 행(div) → input */
function netIncomeInput(page: Page, nth: 1 | 2 | 3) {
  const label = `직전 ${nth}사업연도 순손익액`;
  return page
    .getByText(new RegExp(label))
    .locator("xpath=../..")
    .locator("input")
    .first();
}

test.describe("비상장 간편: 결손·순자산 음수 직접 입력", () => {
  test("N-1: 결손(적자) 토글 제거 — 칩 미존재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    // 순손익가치 입력 섹션은 표시
    await expect(
      page.getByText(/순손익가치 입력/),
    ).toBeVisible();
    // 「결손(적자)」 토글 칩은 제거됨
    await expect(page.getByText("결손(적자)", { exact: true })).toHaveCount(0);
  });

  test("N-2: 순손익 음수 직접 입력 → 결손 입력 안내", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    const input = netIncomeInput(page, 1);
    await input.fill("-120000000");
    await input.blur();

    // 음수 보존 표시 (천단위 콤마 + 부호)
    await expect(input).toHaveValue("-120,000,000");
    // 결손 입력 안내
    await expect(page.getByText(/결손 입력:/).first()).toBeVisible();
  });

  test("N-3: 순자산 음수 직접 입력 → 0 처리 안내", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    const netAsset = page
      .getByText(/순자산가치 \(회사 전체/)
      .locator("xpath=../..")
      .locator("input")
      .first();
    await netAsset.fill("-50000000");
    await netAsset.blur();

    await expect(netAsset).toHaveValue("-50,000,000");
    await expect(
      page.getByText(/음수 순자산 → 자기자본 0으로 처리 \(상증법 §55① 후단\)/),
    ).toBeVisible();
  });
});

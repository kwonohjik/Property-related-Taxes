/**
 * E2E: 장부분실 액면가 (§99①4 후단) — 입력 경로 일원화
 *
 * 종전에는 같은 규율의 입력 경로가 **둘**이었다:
 *   · 취득가액 라디오 「액면가 (장부분실)」(`acquisitionMode = "face_value"`)
 *   · 환산취득가 모드 하위 토글 「취득시점 장부분실 — 액면가 적용」(`acqFaceValueOnly`)
 *
 * 둘은 같은 값을 냈다 — 제거 전 13케이스(끝수·부동산과다 반전·결손·연혁 1999/2007 경계·
 * 순자산 단독 포함) 실측에서 취득가액·개산공제 기준이 전건 일치했다. 법문이 그렇게 만든다:
 * 법 §99①4 후단은 액면가를 「**취득 당시의** 기준시가」로만 정하고 양도 당시 기준시가는
 * 영 §165④ 보충평가 그대로라, 「양/취 모두 액면가」인 모드는 성립할 수 없다.
 *
 * ⇒ 라디오를 제거하고 토글로 일원화했다. 이 spec 이 그 두 면을 함께 고정한다:
 *   부정 — 취득가액 라디오에 「액면가」가 없다
 *   긍정 — 토글 경로가 **실제로 끝까지 통과**하고 양도기준시가 미리보기가 선다
 *          ([[feedback_negative_anchor_needs_positive_twin]])
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — 수동 확인 대체
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

function cardInput(page: Page, label: string) {
  return page.locator('[data-slot="field-card"]').filter({ hasText: label }).locator("input").first();
}

test("장부분실 액면가 — 라디오는 사라지고 토글 하나로 끝까지 통과한다", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoStockTransferTax(page);

  // Step1 — 비상장 (§99①4 전단 후단 대상)
  await page.getByPlaceholder("종목명을 입력하세요").fill("액면가테스트");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  const y = page.locator('input[type="text"][aria-label="연도"]');
  const m = page.locator('input[type="text"][aria-label="월"]');
  const d = page.locator('input[type="text"][aria-label="일"]');
  await y.nth(0).fill("2015"); await m.nth(0).fill("03"); await d.nth(0).fill("15");
  await y.nth(1).fill("2025"); await m.nth(1).fill("02"); await d.nth(1).fill("26");
  await cardInput(page, "양도 주식수").fill("10000");
  await cardInput(page, "발행주식 총수").fill("100000");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("textbox", { name: "양도가액 합계" }).fill("500000000");

  // ── 부정: 취득가액 라디오에 「액면가」가 없다 ──
  const acqModeGroup = page.locator('[data-slot="radio-card-group"]').filter({
    hasText: "매매사례가액",
  }).first();
  await expect(acqModeGroup.getByRole("radio", { name: /액면가/ })).toHaveCount(0);
  // 남은 3개가 한 행에 있다 (columns=3)
  await expect(acqModeGroup.getByRole("radio")).toHaveCount(3);
  // 옵션 설명(힌트)도 제거됐다 — 라벨만 남는다
  await expect(acqModeGroup.getByText("실제 취득가액 (1주당)")).toHaveCount(0);

  // ── 긍정: 토글 경로가 끝까지 통과한다 ──
  await page.getByRole("radio", { name: "환산취득가" }).first().click();
  // ⚠️ exact 필수 — 같은 화면에 「1주당 순손익가치 (취득시점)」이 함께 있다
  await page.getByRole("textbox", { name: "1주당 순손익가치", exact: true }).fill("10000");
  await page.getByRole("textbox", { name: "1주당 순자산가치", exact: true }).fill("10000");
  // 양도기준시가 = max(10,000×3/5 + 10,000×2/5, 10,000×80%) = 10,000 (§165④1 본칙)
  await expect(page.getByText(/양도기준시가 \(1주당\): 10,000원/)).toBeVisible();

  // 장부분실 토글 ON + 액면가 입력 (§99①4 후단 — 취득기준시가만 액면가)
  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득시점 장부분실" })
    .getByRole("switch")
    .click();
  await page.getByRole("textbox", { name: "1주당 액면가", exact: true }).fill("5000");
  // 토글이 켜지면 취득시점 NI/NA 칸은 사라진다 (액면가가 그 자리를 대신한다)
  await expect(
    page.getByRole("textbox", { name: "1주당 순손익가치 (취득시점)", exact: true }),
  ).toHaveCount(0);

  // 제거된 안내 문구가 되살아나지 않았다
  await expect(page.getByText(/양\/취 모두 액면가 적용은/)).toHaveCount(0);

  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByRole("heading", { name: /필요경비/ }).first()).toBeVisible({ timeout: 10_000 });
});

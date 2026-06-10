/**
 * E2E: 상속세 §74 지정문화유산 등 징수유예 — UI 검증 (2026-06-05)
 *
 * 설계: docs/02-design/features/inheritance-cultural-heritage-tax-deferral.{engine,ui}.design.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 검증:
 *   CH-E2E-1  자산카드 ⚙️ → §74 토글 ON(기본 3호 designated) → 4개호 라디오 + 담보면제 배너(§74⑤)
 *   CH-E2E-2  토글 ON → 계산 → 결과 "문화유산 등 징수유예" 카드 + ㉖ 산식 + §74② 사후관리 + 사이드바
 */

import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

/** 상속 Step1: 2024-06-10 + 자녀1 → 토지 30억(300㎡ × 1천만/㎡) */
async function gotoStep1WithLand(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
}

/** 자산카드 ⚙️ 고급 옵션 열고 §74 토글 ON (기본 3호 designated) */
async function enableHeritageToggle(page: Page) {
  await page.locator('[data-testid^="estate-advanced-panel-toggle-"]').first().click();
  // ToggleCard Switch는 title+description을 aria-label로 가짐 → role=switch + name으로 직접 선택
  const sw = page.getByRole("switch", {
    name: /지정문화유산 등 \(§74 징수유예 대상\)/,
  });
  await expect(sw).toBeVisible();
  await sw.click();
}

test.describe("§74 지정문화유산 등 징수유예 — UI", () => {
  test("CH-E2E-1: ⚙️ → §74 토글 ON → 4개호 라디오 + 담보면제 배너", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep1WithLand(page);
    await enableHeritageToggle(page);

    // 토글 ON 시 4개호 라디오 펼침 (기본 3호 designated)
    await expect(page.getByText("3호 — 국가지정문화유산등")).toBeVisible();
    await expect(page.getByText("1호 — 문화유산자료등")).toBeVisible();
    await expect(page.getByText("4호 — 천연기념물등")).toBeVisible();
    // 3·4호 담보 면제 안내(§74⑤)
    await expect(page.getByText(/담보 제공이 면제될 수 있습니다/)).toBeVisible();
  });

  test("CH-E2E-2: 토글 ON → 계산 → 징수유예 결과 카드 + 사후관리 안내", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoStep1WithLand(page);
    await enableHeritageToggle(page);

    await nextSteps(page, 3); // → Step2 → Step3 → Step4
    await calcAndWaitResult(page);
    // 징수유예 결과 카드 (상증령 §76① 산식)
    await expect(page.getByText("문화유산 등 징수유예 (상증법 §74)")).toBeVisible();
    await expect(page.getByText("= 징수유예세액 (별지9호 ㉖)")).toBeVisible();
    await expect(page.getByText("= 납부할세액 (별지9호 ㊳)")).toBeVisible();
    // §74② 사후관리 안내
    await expect(page.getByText(/유상양도하거나 인출하는 경우 즉시 징수/)).toBeVisible();
  });
});

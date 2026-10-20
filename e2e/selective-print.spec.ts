/**
 * E2E: 계산 결과 선택 출력 (상속세) — 화면 인쇄
 *
 * 검증:
 *   1. 결과 화면에 "출력 항목 선택" 패널 노출 + 기본 전체 미선택 → 인쇄 버튼 disabled
 *   2. 항목 1개 선택 → 인쇄 버튼 활성
 *   3. print 미디어 에뮬레이션 → 선택 섹션은 보이고, 미선택 섹션은 숨김(print:hidden)
 *   4. 다크 모드로 둔 채 인쇄 → 라이트로 인쇄한 것과 색이 같다
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — claude-in-chrome·수동안내 금지, spec 통과로 충족.
 * 상세 단위는 vitest __tests__/print/inheritance-print-sections.test.ts 에 위임.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  addHeir,
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

/** Step0: 상속개시일 + 자녀 1명 → 다음 */
async function fillStep0WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child"); // 2단계 picker(상속인 → 자녀) + 주민번호 자동 입력 + 모달 닫기
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step2→3→4→계산 → 결과 대기 */
async function proceedToResult(page: Page) {
  await nextSteps(page, 3);
  await calcAndWaitResult(page);
}

test.describe("계산 결과 선택 출력 — 화면 인쇄", () => {
  test("SP-1~4: 패널 노출 → 0건 가드 → 선택 시 print 가시성 토글 → 다크 상태 인쇄 = 라이트", async ({ page }) => {
    test.setTimeout(90_000);

    await fillStep0WithChild(page);
    await addLandAsset(page, { area: "300", unitPrice: "1000000" });
    await proceedToResult(page);

    // SP-1: 선택 패널 노출 + 기본 전체 미선택 → 인쇄 버튼 disabled
    const panel = page.getByTestId("print-selection-panel");
    await expect(panel).toBeVisible();
    const printBtn = page.getByTestId("print-selected-button");
    await expect(printBtn).toBeDisabled();

    // SP-2: "상속세 과세 요약" 항목 체크 → 버튼 활성
    await panel.getByRole("checkbox", { name: "상속세 과세 요약" }).check();
    await expect(printBtn).toBeEnabled();

    // SP-3: print 미디어 — 선택 섹션(tax-summary) 보이고, 미선택(valuation-detail) 숨김
    await page.emulateMedia({ media: "print" });
    await expect(page.locator('[data-print-id="tax-summary"]')).toBeVisible();
    await expect(page.locator('[data-print-id="valuation-detail"]')).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    // 화면(screen)에서는 미선택 섹션도 그대로 보임 (화면 표시 불변 원칙)
    await expect(page.locator('[data-print-id="valuation-detail"]')).toBeVisible();

    // SP-4: 다크 모드로 둔 채 인쇄해도 라이트와 똑같이 인쇄된다
    // (계획서 docs/00-pm/ui-light-contrast-and-dark-print.plan.md §3 — 다크 스타일은 화면 매체에만)
    await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
    const colors = () =>
      page.evaluate(() => {
        const els = [document.body, ...document.querySelectorAll('[data-print-id="tax-summary"], [data-print-id="tax-summary"] *')];
        return els.map((e) => {
          const cs = getComputedStyle(e);
          return `${cs.color}|${cs.backgroundColor}|${cs.borderTopColor}`;
        });
      });
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    const printLight = await colors();
    await page.emulateMedia({ media: "screen", colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    // 화면에서는 다크가 실제로 적용돼 있다(아래 비교가 헛통과하지 않도록)
    expect(await colors()).not.toEqual(printLight);
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    expect(await colors()).toEqual(printLight);
    await page.emulateMedia({ media: "screen", colorScheme: "light" });
  });
});

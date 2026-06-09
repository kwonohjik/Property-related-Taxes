/**
 * E2E: 상속세 이력 비즈니스 키 dedup — 같은 피상속인 중간 저장 ×3 → 이력 1건
 *
 * 계획서: docs/01-plan/calc-history-business-key-dedup.plan.md
 * UI 설계: docs/02-design/features/calc-history-business-key-dedup.ui.design.md
 *
 * 시나리오:
 *   H-1: 피상속인 주민번호 13자리 + 상속개시일 입력 → 저장하기 → 입력 변경 → 저장 재클릭 ×2
 *        → /history → 상속세 이력 카드 1개(중복 0). (현행이면 draft 3개)
 *   H-2: 다른 주민번호 → 카드 2개(정상 분리)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족.
 */

import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function saveDecedent(page: Page, rrn: string, names: string[]) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2023", month: "7", day: "1" });
  await page.getByPlaceholder("앞 6자리-뒤 7자리").first().fill(rrn);
  // 입력을 변경하며 ×N 저장 (중간 저장 모사 — input 매번 달라짐, 같은 피상속인 키)
  for (const name of names) {
    await page.getByPlaceholder("성명").first().fill(name);
    await page
      .getByRole("button", { name: /저장하기|현재 입력 저장/ })
      .first()
      .click();
    await page.waitForTimeout(150); // 저장 토스트/IndexedDB 반영 대기
  }
}

/** /history 의 이력 카드 수 = 카드별 "삭제" 버튼 수 (exact — "전체 삭제" 제외) */
function cardCount(page: Page) {
  return page.getByRole("button", { name: "삭제", exact: true }).count();
}

test.describe("상속세 이력 비즈니스 키 dedup", () => {
  test("H-1: 같은 피상속인 중간 저장 ×3 → 이력 1건", async ({ page }) => {
    await saveDecedent(page, "800101-1000000", ["김코리아", "김코리아 정정", "김코리아 최종"]);
    await page.goto("/history");
    await expect(page.getByText("상속세").first()).toBeVisible();
    expect(await cardCount(page)).toBe(1);
  });

  test("H-2: 다른 주민번호 → 이력 2건", async ({ page }) => {
    await saveDecedent(page, "800101-1000000", ["피상속인 A"]);
    await saveDecedent(page, "900202-2000000", ["피상속인 B"]);
    await page.goto("/history");
    expect(await cardCount(page)).toBe(2);
  });
});

/**
 * E2E: 법령 리서치 — 판례 생사 확인(cite_check)
 *
 * 검증:
 *   CITE-1: 판례 탭 검색 → 본문 열기 → "후속 인용 확인" 버튼 노출 → 클릭 시 중립 상태 배지.
 *
 * 비고:
 *   - 검색·본문·생사확인 모두 법제처 API(KOREAN_LAW_OC) 의존 → 넉넉한 타임아웃 + 관대한 단정.
 *   - 단정 금지 정책상 결과는 "검토 필요"/"미감지"/"없음" 중립 표현만 검증.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect } from "@playwright/test";

test.describe("법령 리서치 — 판례 생사 확인", () => {
  test("CITE-1: 판례 본문 → 후속 인용 확인 버튼 + 중립 상태", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/law");

    // 판례·결정례 탭으로 이동
    await page.getByRole("tab", { name: "판례·결정례" }).click();

    // 탭 자체 검색 입력(통합검색과 별개)으로 클린 쿼리 검색
    await page.getByPlaceholder("검색어 (예: 양도소득세 중과)").fill("양도소득세");
    // "검색" 버튼은 통합바·판례탭 2개 → 판례탭(마지막) 선택
    await page.getByRole("button", { name: "검색", exact: true }).last().click();

    // 첫 결과의 "본문" 버튼 클릭
    const firstBon = page.getByRole("button", { name: "본문" }).first();
    await expect(firstBon).toBeVisible({ timeout: 60_000 });
    await firstBon.click();

    // 상세 헤더에 생사 확인 버튼 노출
    const citeBtn = page.getByRole("button", { name: /후속 인용 확인/ });
    await expect(citeBtn).toBeVisible({ timeout: 30_000 });

    // 클릭 → 중립 상태 배지 중 하나 (검토 필요 / 미감지 / 없음)
    await citeBtn.click();
    await expect(
      page.getByText(/검토 필요|변경·폐기 신호 미감지|후속 인용 없음/),
    ).toBeVisible({ timeout: 60_000 });
  });
});

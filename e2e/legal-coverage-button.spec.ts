import { test, expect } from "@playwright/test";

/**
 * 홈 하단 법령 검증 패널의 "커버리지 점검" 버튼 동작 검증.
 * - 버튼 클릭 → GET /api/admin/legal-coverage → 커버리지 요약 노출
 * - legal-codes 인용 조문 전수 검증 (검증대상 100%, 미검증 0)
 */
test("커버리지 점검 버튼이 검증 커버리지를 보여준다", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "커버리지 점검" }).click();

  // 요약 바: "검증 커버리지 100.0% — 인용 조문 ... 미검증 0개"
  await expect(page.getByText(/검증 커버리지 \d+\.\d+%/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/미검증 0개/)).toBeVisible();
});

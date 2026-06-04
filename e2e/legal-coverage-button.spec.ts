import { test, expect } from "@playwright/test";

/**
 * 홈 하단 법령 검증 패널의 "커버리지 점검" 버튼 동작 검증.
 * - 버튼 클릭 → GET /api/admin/legal-coverage → 커버리지 요약 노출
 * - 검증대상 100% 달성 + 현행 부재 조문(인용 점검 필요) 별도 노출
 */
test("커버리지 점검 버튼이 커버리지와 현행 부재 조문을 보여준다", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "커버리지 점검" }).click();

  // 요약 바: "검증 커버리지 100.0% — 인용 조문 ... 현행부재 N개"
  await expect(page.getByText(/검증 커버리지 \d+\.\d+%/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/현행부재 \d+개/)).toBeVisible();

  // 현행 부재 조문(인용 점검 필요) amber 안내 노출
  await expect(page.getByText(/현행 부재 조문\(인용 점검 필요\)/)).toBeVisible();
});

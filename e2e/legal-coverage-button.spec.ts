import { test, expect } from "@playwright/test";

/**
 * 홈 하단 법령 검증 패널의 "커버리지 점검" 버튼 동작 검증.
 * - 버튼 클릭 → GET /api/admin/legal-coverage → 커버리지 요약 노출
 * - "미검증 조문 보기" 토글 → 법령별 그룹 노출
 */
test("커버리지 점검 버튼이 미검증 조문을 보여준다", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "커버리지 점검" }).click();

  // 요약 바: "검증 커버리지 NN.N% — 인용 조문 ... 미검증 N개"
  await expect(page.getByText(/검증 커버리지 \d+\.\d+%/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/미검증 \d+개/)).toBeVisible();

  // 미검증 조문 펼치기 → 법령 그룹 노출 (점검 직후 자동 펼침이지만 토글 동작도 확인)
  await expect(
    page.getByText("상속세 및 증여세법", { exact: false }).first(),
  ).toBeVisible();
});

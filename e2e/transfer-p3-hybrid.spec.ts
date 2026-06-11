/**
 * P3 — §98의3·§98의5·§98의6 하이브리드 UI E2E
 *
 * isFullyImplemented=true 전환: 미분양 그룹 라디오 활성 → 폼 렌더.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-p3-hybrid.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 P3 하이브리드 감면 패널", () => {
  test("미분양 그룹 → §98의3·§98의5·§98의6 폼 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByLabel("연도").first().fill("2024");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    await page.getByRole("button", { name: "감면·공제" }).click();
    await page.getByRole("button", { name: /미분양주택/ }).click();

    // §98의3 — 과밀 60% hint + 주체 라디오
    const item983 = page.getByText("§98의3 — 서울 외 미분양 100%(과밀 60%)", { exact: false }).first();
    await expect(item983).toBeVisible();
    await item983.click();
    await expect(page.getByText("주체·취득 유형·시기", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/국내사업장 없는 비거주자/).first()).toBeVisible();
    await expect(page.getByText(/수도권과밀억제권역/).first()).toBeVisible();

    // §98의5 — 인하율 입력
    const item985 = page.getByText("§98의5 — 분양가 인하율 60/80/100%", { exact: false }).first();
    await item985.click();
    await expect(page.getByText("분양가격 인하율 (%)", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/10% 이하 = 감면율 60%/).first()).toBeVisible();

    // §98의6 — 1호/2호 라디오
    const item986 = page.getByText("§98의6 — 준공후미분양 50%", { exact: false }).first();
    await item986.click();
    await expect(page.getByText(/사업주체등이 임대한 주택을 취득/).first()).toBeVisible();
    await expect(page.getByText(/취득 후 본인이 5년 이상 임대/).first()).toBeVisible();
    await expect(page.getByText(/기준시가 합계/).first()).toBeVisible();
  });
});

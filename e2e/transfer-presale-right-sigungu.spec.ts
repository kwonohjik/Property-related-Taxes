/**
 * transfer-presale-right-sigungu.spec.ts
 *
 * 분양권·입주권 "소재지(시·군·구)" 입력 — 인구감소지역 세컨드홈 특례 다·라목 2호
 * "취득 전 보유주택과 동일 시·군·구" 비교용 regionCode 입력 위젯(SigunguSelect) 노출·반영 검증.
 *
 * 실행: npx playwright test e2e/transfer-presale-right-sigungu.spec.ts
 *       (worktree는 E2E_PORT=3105 npx playwright test ...)
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "2채", exact: true }).click();
  await expect(page.getByText("분양권·입주권", { exact: false }).first()).toBeVisible();
}

test.describe("분양권 소재지(시·군·구) 입력 — 다·라목 2호 동일 시군구 비교", () => {
  test("분양권 추가 → 소재지 위젯 노출 → 시·군·구 5자리 직접 입력 반영", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 분양권·입주권 추가
    await page.getByRole("button", { name: "+ 추가", exact: true }).click();
    await expect(page.getByRole("button", { name: /분양권·입주권 1 삭제/ })).toBeVisible();

    // 소재지(시·군·구) 위젯 노출
    await expect(page.getByText("소재지 (시·군·구)", { exact: false })).toBeVisible();

    // 시·군·구 5자리 직접 입력 → 자동 선택 → 우측 코드 배지 표시
    const sgInput = page.getByPlaceholder("시군구 검색...");
    await sgInput.fill("42800"); // 강원 고성군(인구감소지역)
    await sgInput.blur();
    await expect(page.getByText("42800", { exact: false }).first()).toBeVisible();
  });
});

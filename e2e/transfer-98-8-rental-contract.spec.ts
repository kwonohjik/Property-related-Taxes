/**
 * C24 — §98의8 준공후미분양 "임대계약 체결일" 필드 UI E2E
 *
 * 감사 결정사항: 임대계약 체결일이 법 §98의8① 단서(2015.12.31 이전 체결)를 충족하지 않으면
 * 특례 적용 배제. Unsold988InputForm.tsx:95-98 에 DateInput(rentalContractDate988) + 단서
 * 안내문을 추가. 본 스펙은 필드·안내문 렌더를 검증(엔진 판정 로직은 vitest로 커버).
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-98-8-rental-contract.spec.ts
 */
import { test, expect } from "@playwright/test";

test.describe("양도세 §98의8 임대계약 체결일 UI", () => {
  test("미분양주택 그룹 선택 → 임대계약 체결일 필드 + §98의8① 단서 안내문 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await page.getByRole("button", { name: "감면·공제" }).click();

    await page.getByRole("button", { name: /미분양주택/ }).click();
    const item988 = page.getByText("§98의8 — 준공후미분양 6억·135㎡↓ 50%", { exact: false }).first();
    await expect(item988).toBeVisible();
    await item988.click();

    // 신규 필드 — 임대계약 체결일
    await expect(page.getByText("임대계약 체결일", { exact: true }).first()).toBeVisible();

    // §98의8① 단서 안내문
    await expect(
      page.getByText(/임대사업자등록을 한 후 2015\.12\.31 이전에 체결한 임대계약에 한정합니다/).first(),
    ).toBeVisible();
    await expect(page.getByText(/법 §98의8① 단서/).first()).toBeVisible();

    // 필드에 값 입력 가능 확인 (렌더뿐 아니라 조작 가능성도 함께 검증)
    const rentalContractSection = page
      .locator("label:has-text('임대계약 체결일')")
      .locator("xpath=..");
    await rentalContractSection.getByLabel("연도", { exact: true }).fill("2016");
    await rentalContractSection.getByLabel("월", { exact: true }).fill("06");
    await rentalContractSection.getByLabel("일", { exact: true }).fill("01");
    await expect(rentalContractSection.getByLabel("연도", { exact: true })).toHaveValue("2016");
  });
});

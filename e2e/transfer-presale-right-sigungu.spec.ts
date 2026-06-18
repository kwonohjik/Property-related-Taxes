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

test.describe("분양권 소재지(주소) 입력 — 다·라목 2호 동일 시군구 비교", () => {
  test("분양권 추가 → 소재지(주소) 위젯 노출 (AddressSearch · PNU 법정동코드)", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 분양권·입주권 추가
    await page.getByRole("button", { name: "+ 추가", exact: true }).click();
    await expect(page.getByRole("button", { name: /분양권·입주권 1 삭제/ })).toBeVisible();

    // 소재지(주소) 위젯 노출 — 주택과 동일 AddressSearch(PNU) 경로로 통일됨
    await expect(page.getByText("소재지 (주소)", { exact: false })).toBeVisible();
    // (주소 검색은 Vworld API 의존 → 위젯 노출까지 검증. regionCode 흐름은 엔진 anchor C9~C11로 검증)
  });
});

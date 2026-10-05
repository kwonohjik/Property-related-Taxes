/**
 * transfer-multi-house-marriage-rights.spec.ts
 *
 * #2b 혼인 합가 배우자 분양권/입주권 — 양도세 Step 4(보유 상황) → 혼인합가일 입력 시
 * 분양권·입주권 항목에 "배우자 단독 보유" chip(§167의4⑤) 조건부 노출 검증.
 *
 * 실행: E2E_PORT=3104 npx playwright test e2e/transfer-multi-house-marriage-rights.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { addHouseRow } from "./_helpers/add-house-row";

async function gotoHoldingStepWithTwoHouses(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  // 명부 필수화(PR-1, 2026-10-05) — "housing"은 "2채" 버튼이 사라졌다(Q-6). 목록은 항상 열려 있다.
  await expect(page.getByText("분양권·입주권", { exact: false }).first()).toBeVisible();
}

const spouseSwitch = (page: Page) => page.getByRole("switch", { name: /배우자 단독 보유/ });

test.describe("#2b 혼인 합가 배우자 분양권/입주권 chip", () => {
  test("혼인합가일 미입력 → chip 숨김 / 입력 → chip 노출 (분양권 항목)", async ({ page }) => {
    await gotoHoldingStepWithTwoHouses(page);

    // 명부 필수화(PR-1) — MergedHouseholdRightSection은 householdHousingCount >= 2를 직접 본다.
    // 명부가 정본이 됐으므로(명부 필수화) 취득일 있는 행 1개를 추가해 "2"로 도출시킨다.
    await addHouseRow(page);

    // 분양권·입주권 추가
    await page.getByRole("button", { name: "+ 추가", exact: true }).click();
    await expect(page.getByRole("button", { name: /분양권·입주권 1 삭제/ })).toBeVisible();

    // 혼인합가일 미입력 → chip 숨김
    await expect(spouseSwitch(page)).toHaveCount(0);

    // 혼인합가일 입력
    const marriageBlock = page
      .locator("div")
      .filter({ hasText: "혼인합가일" })
      .filter({ has: page.getByLabel("연도") })
      .last();
    await marriageBlock.getByLabel("연도").fill("2021");
    await marriageBlock.getByLabel("월").fill("6");
    await marriageBlock.getByLabel("일").fill("1");

    // chip 노출 + 토글
    await expect(spouseSwitch(page)).toBeVisible();
    await spouseSwitch(page).click();
    await expect(spouseSwitch(page)).toBeChecked();
  });
});

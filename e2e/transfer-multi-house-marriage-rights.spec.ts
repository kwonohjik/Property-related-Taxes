/**
 * transfer-multi-house-marriage-rights.spec.ts
 *
 * #2b 혼인 합가 배우자 분양권/입주권 — 양도세 Step 4(보유 상황) 분양권·입주권 행의
 * 「양도일 현재도 배우자 쪽이 보유하나요」 질문(§167의4⑤, 결정 #47).
 *
 * 종전 「배우자 단독 보유」 칩(혼인합가일만 입력하면 노출)은 사실 질문으로 대체됐다. 질문은 혼인합가일만으로 열리지 않고
 * `spouseHoldingQuestionApplies`(혼인 5년 안 양도 · 주택+권리 3↑ · 중과가 걸리는 양도)가 모두 맞을 때만 열린다.
 * 분양권·입주권 행은 미응답 = 모름(차감 없음)이라 답을 강제하지 않는다.
 *
 * 실행: E2E_PORT=3104 npx playwright test e2e/transfer-multi-house-marriage-rights.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { addHouseRow } from "./_helpers/add-house-row";
import { gotoSpouseHoldingOpenForm } from "./_helpers/spouse-holding-seed";

const RIGHT = { id: "r1", type: "presale_right", acquisitionDate: "2022-01-01", region: "capital" };

test.describe("#2b 혼인 합가 분양권·입주권 「양도일 현재 배우자 보유」 질문", () => {
  test("혼인합가일을 입력해도 조건이 안 맞으면 질문이 없다 (분양권 항목)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByText("분양권·입주권", { exact: false }).first()).toBeVisible();

    await addHouseRow(page);
    await page.getByRole("button", { name: "+ 추가", exact: true }).click();
    await expect(page.getByRole("button", { name: /분양권·입주권 1 삭제/ })).toBeVisible();

    const marriageBlock = page
      .locator("div")
      .filter({ hasText: "혼인합가일" })
      .filter({ has: page.getByLabel("연도") })
      .last();
    await marriageBlock.getByLabel("연도").fill("2021");
    await marriageBlock.getByLabel("월").fill("6");
    await marriageBlock.getByLabel("일").fill("1");

    // 혼인일이 있어도 2주택·비조정이라 질문도, 옛 칩도 없다
    await expect(page.locator('[data-testid^="spouse-holding-"]')).toHaveCount(0);
    await expect(page.getByRole("switch", { name: /배우자 단독 보유/ })).toHaveCount(0);
  });

  test("조건 충족 — 분양권 행에 예/아니오/모름 질문이 열리고 답이 유지된다", async ({ page }) => {
    await gotoSpouseHoldingOpenForm(page, { houseCount: 1, presaleRights: [RIGHT] });

    await expect(page.getByTestId("spouse-holding-right")).toBeVisible();
    await expect(page.getByTestId("spouse-holding-unknown-r1")).toBeVisible();
    await expect(page.getByRole("switch", { name: /배우자 단독 보유/ })).toHaveCount(0);
    await page.getByTestId("spouse-holding-yes-r1").check();
    await expect(page.getByTestId("spouse-holding-yes-r1")).toBeChecked();
  });
});

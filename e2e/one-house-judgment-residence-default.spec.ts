/**
 * 거주기간 입력 — 기본값(구간 입력 + 빈 구간 1개)과 개월 수 직접 입력 상한 (2026-10-08).
 *
 * vitest anchor(`residence-default-interval-direct-cap.anchor.test.ts`)는 leaf·⑧을 직접 부른다.
 * 이 spec은 화면에서 그 기본값이 실제로 보이고, ⑧ 오류가 「다음」을 막는지를 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
  await fillDateAndVerify(page, { year: "2023", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2024", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");
}

test.describe("판정 메뉴 ② 거주기간 입력", () => {
  test("[RD-E1] 토글이 켜진 채 빈 구간 1개가 보이고, 비워 두면 입주일을 요구한다", async ({ page }) => {
    await gotoSaleStep(page);
    await expect(page.getByRole("switch", { name: /^거주 기간 입력/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("거주 구간 #1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("거주 구간 #1: 입주일을 입력하세요.").first()).toBeVisible();
    await expect(page.getByText("③ 보유 주택·권리")).toHaveCount(0);
  });

  test("[RD-E2] 직접 입력은 취득일~양도일 개월 수(12)를 넘으면 막히고, 12개월이면 넘어간다", async ({ page }) => {
    await gotoSaleStep(page);
    await page.getByRole("switch", { name: /^거주 기간 입력/ }).click();
    const months = page.locator('[data-field="residencePeriodMonthsAsset"] input');
    await months.fill("71");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/71개월이 취득일\(2023-06-01\)부터 양도일까지의 12개월을 넘습니다/).first()).toBeVisible();
    await expect(page.getByText("③ 보유 주택·권리")).toHaveCount(0);

    await months.fill("12");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  });
});

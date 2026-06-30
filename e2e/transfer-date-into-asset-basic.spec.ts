import { test, expect } from "@playwright/test";

/**
 * 양도일·신고일을 자산 카드 ① 기본정보로 이동 — 동작 검증.
 * - 단일 자산: ① 자동 펼침으로 양도일·신고일 입력란이 보이고 입력값이 반영된다.
 * - 일괄양도: 양도일·신고일은 폼-전역값이라 첫 자산(주 자산)에만 1개씩 노출되고,
 *   2번째 자산에는 "주 자산과 공통" 안내가 표시된다(중복 testid 없음).
 */
test.describe("양도일·신고일 자산 ① 기본정보 이동", () => {
  test("단일 자산 — ① 기본정보 안 양도일·신고일 노출 + 입력 반영", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 진입 시 ① 자동 펼침 → 양도일·신고일 위젯 visible
    await expect(page.getByTestId("transfer-date")).toBeVisible();
    await expect(page.getByTestId("filing-date")).toBeVisible();

    // 입력 → 폼-전역값 반영
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2024");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");
    await expect(page.getByTestId("transfer-date").getByLabel("연도")).toHaveValue("2024");

    // 신고기한 hint 표시 (양도일 입력 후)
    await expect(page.getByText(/신고기한:/).first()).toBeVisible();
  });

  test("일괄양도 — 양도일·신고일은 첫 자산에만(중복 없음) + 공통 안내", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 일괄양도 토글 ON → 자산 2건
    await page.getByRole("switch", { name: /함께 양도한 다른 자산/ }).click();

    // 폼-전역 양도일·신고일 위젯은 첫 자산에만 1개씩 (strict 중복 없음)
    await expect(page.getByTestId("transfer-date")).toHaveCount(1);
    await expect(page.getByTestId("filing-date")).toHaveCount(1);

    // 2번째 자산에는 공통 안내 (① 접힘이어도 DOM 존재)
    await expect(
      page.getByText("양도일·신고일은 주 자산(자산 1)과 공통입니다."),
    ).toHaveCount(1);
  });
});

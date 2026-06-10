/**
 * E2E: 건물 기준시가 계산기 (독립 페이지 /tools/building-standard-price)
 *
 * 검증:
 *   1. 상속·증여 기본(U-01): 2025 평가·rc·아파트·공시지가 7,500,000 → 224,600,000 (BSP-01 anchor)
 *   2. 양도 2시점(U-02): 취득 2015 / 양도 2025 → 취득 81,300,000 / 양도 90,000,000 (BSP-06)
 *   3. 기계식주차(U-08): 토글 ON → 주차대수 50 → 255,000,000 (BSP-MECH)
 *   4. 검증 차단: 미입력 시 오류 메시지
 *
 * 설계: docs/02-design/features/building-standard-price.ui.design.md §11 DoD
 */
import { test, expect, type Page } from "@playwright/test";

const URL = "/tools/building-standard-price";

async function selectOption(page: Page, triggerText: string, optionName: string | RegExp) {
  await page.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

test("상속·증여 기본 — 224,600,000 (BSP-01)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();

  await page.getByPlaceholder("예: 2010").fill("2020"); // 신축연도
  await page.getByPlaceholder("예: 200").fill("200"); // 연면적

  await selectOption(page, "연도 선택", "2025년"); // 평가연도
  await selectOption(page, "구조 선택", /철근콘크리트조/);
  await selectOption(page, "용도 선택", /아파트/);
  await page.getByPlaceholder("원/㎡").fill("7500000"); // 공시지가

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("224,600,000");
});

test("양도 2시점 — 취득 81,300,000 / 양도 90,000,000 (BSP-06)", async ({ page }) => {
  await page.goto(URL);
  // 기본이 양도 모드

  await page.getByPlaceholder("예: 2010").fill("2010"); // 신축연도
  await page.getByPlaceholder("예: 200").fill("100"); // 연면적

  // 취득 시점
  await selectOption(page, "연도 선택", "2015년"); // 취득연도(첫 연도 Select)
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").first().fill("5000000");

  // 양도 시점
  await selectOption(page, "연도 선택", "2025년");
  await page.getByText("구조 선택").first().click();
  await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
  await page.getByText("용도 선택").first().click();
  await page.getByRole("option", { name: /아파트/ }).first().click();
  await page.getByPlaceholder("원/㎡").nth(1).fill("7500000");

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("81,300,000");
  await expect(result).toContainText("90,000,000");
});

test("기계식주차 — 255,000,000 (BSP-MECH)", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await page.getByText("기계식주차전용빌딩").click(); // 토글 ON

  await page.getByPlaceholder("예: 2010").fill("2020"); // 신축연도
  await page.getByPlaceholder("예: 50").fill("50"); // 주차대수
  await selectOption(page, "연도 선택", "2025년"); // 평가연도

  await page.getByRole("button", { name: "기준시가 계산하기" }).click();

  const result = page.getByTestId("bsp-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText("255,000,000");
});

test("검증 차단 — 미입력 시 오류", async ({ page }) => {
  await page.goto(URL);
  await page.getByText("상속·증여(1시점)").click();
  await page.getByRole("button", { name: "기준시가 계산하기" }).click();
  await expect(page.getByTestId("bsp-error")).toBeVisible();
});

test("홈 링크 → 건물 기준시가 계산기 진입", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /건물 기준시가 계산기/ }).click();
  await expect(page).toHaveURL(/\/tools\/building-standard-price/);
  await expect(page.getByRole("heading", { name: "건물 기준시가 계산기" })).toBeVisible();
});

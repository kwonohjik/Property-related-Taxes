/**
 * 양도일자 입력 오류 검증 — E2E (2026-06-29)
 *
 * (a) 양도일 < 취득일 → "다음" 차단 메시지.
 * (b) 취득일 미래 → 차단.
 * (c) 미래 양도일 → amber 경고 배너 + 진행 가능(비차단).
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-date-input-validation.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

async function setup(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const year = (p: Page, i: number) => p.getByRole("textbox", { name: "연도", exact: true }).nth(i);
const month = (p: Page, i: number) => p.getByRole("textbox", { name: "월", exact: true }).nth(i);
const day = (p: Page, i: number) => p.getByRole("textbox", { name: "일", exact: true }).nth(i);

async function fillBaseAsset(page: Page, acq: [string, string, string]) {
  // 자산: 주택(기본) · 양도가액 · 취득원인 매매 · 실지 취득가액 · 취득일
  await getInputByLabel(page, "양도가액 (원)").first().fill("1500000000");
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await year(page, 2).fill(acq[0]);
  await month(page, 2).fill(acq[1]);
  await day(page, 2).fill(acq[2]);
  await getInputByLabel(page, "취득가액 (원)").first().fill("800000000");
}

test("(a) 양도일 < 취득일 → 차단", async ({ page }) => {
  await setup(page);
  // 양도일 2019-12-31 (취득 2020-03-10보다 빠름)
  await year(page, 0).fill("2019");
  await month(page, 0).fill("12");
  await day(page, 0).fill("31");
  await fillBaseAsset(page, ["2020", "03", "10"]);

  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText("취득 후에만 양도할 수 있습니다", { exact: false }).first()).toBeVisible();
});

test("(b) 취득일 미래 → 차단", async ({ page }) => {
  await setup(page);
  // 양도일도 미래(2099-06)로 둬서 양도일<취득일이 먼저 잡히지 않게 — 취득일 미래(2099-01)만 차단
  await year(page, 0).fill("2099");
  await month(page, 0).fill("06");
  await day(page, 0).fill("01");
  await fillBaseAsset(page, ["2099", "01", "10"]);

  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText("취득일", { exact: false }).filter({ hasText: "오늘 이후" }).first()).toBeVisible();
});

test("(c) 미래 양도일 → amber 경고 + 진행 가능", async ({ page }) => {
  await setup(page);
  // 양도일 미래(2099) · 취득 과거 → 경고만, 차단 아님
  await year(page, 0).fill("2099");
  await month(page, 0).fill("01");
  await day(page, 0).fill("01");
  await fillBaseAsset(page, ["2015", "03", "10"]);

  // amber 경고 배너 노출
  await expect(page.getByText("미래 시점 가정 계산입니다", { exact: false }).first()).toBeVisible();
  // 진행 가능 — 계산까지 도달 (결과: 신고서 양식 렌더)
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible({ timeout: 15000 });
});

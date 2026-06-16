/**
 * 재산세 §107①2호 주택 건물·부속토지 소유자 분리 안분 E2E
 *
 * 시나리오:
 *   1. 주택 + house_split 선택 → 건물주·토지주·건축물/부속토지 시가표준액 입력 → 계산 →
 *      "건물 소유자 (§107①2호)" 라벨 + 안분 표 본세/고지액 합 검증
 *   2. house_split + 시가표준액 미입력 → validateStep 차단 (다음 진행 불가)
 *   3. 토지(land) 선택 시 house_split 옵션 노출 안 됨
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/property-house-split.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function amountInputByLabel(page: Page, labelText: string | RegExp) {
  return page
    .locator("div")
    .filter({ hasText: labelText })
    .locator('input[inputmode="numeric"]')
    .last();
}

function selectOwnership(page: Page, name: string | RegExp) {
  return page.getByRole("radio", { name });
}

async function gotoStep0(page: Page) {
  await page.goto("/calc/property-tax");
  // objectType 기본값 = housing(주택)
  await amountInputByLabel(page, /^공시가격/).fill("600000000");
}

async function openOwnershipSection(page: Page) {
  const card = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "소유 형태" })
    .first();
  await card.getByRole("switch").click();
  await expect(page.getByText("특수 소유 형태")).toBeVisible();
}

async function calcAndWait(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /재산세 계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `재산세 계산 API 비정상 ${resp.status()}`).toBe(true);
  await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("재산세 §107①2호 주택 건물·부속토지 소유자 분리 안분", () => {
  test("1: 주택 + house_split → 건물주·토지주·시가표준액 입력 → 계산 → 안분 표 표시", async ({ page }) => {
    await gotoStep0(page);
    await openOwnershipSection(page);

    // house_split 라디오 선택
    await selectOwnership(page, /주택 건물·부속토지 분리/).check();

    // 건물 소유자 입력
    await page.getByPlaceholder("건물 소유자 성명 또는 식별자").fill("홍건물");
    // 부속토지 소유자 입력
    await page.getByPlaceholder("부속토지 소유자 성명 또는 식별자").fill("김토지");

    // 건축물·부속토지 시가표준액 입력 — "시가표준액 (안분 기준, §4)" 섹션 컨텍스트로 범위 한정
    const stdValueSection = page
      .locator("div.space-y-3")
      .filter({ hasText: "시가표준액 (안분 기준, §4)" })
      .last();
    const stdValueInputs = stdValueSection.locator('input[inputmode="numeric"]');
    await stdValueInputs.nth(0).fill("360000000"); // 건축물 시가표준액
    await stdValueInputs.nth(1).fill("240000000"); // 부속토지 시가표준액

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    // 납세의무자 판정 섹션 + 건물 소유자 라벨
    await expect(page.getByText("납세의무자 판정").first()).toBeVisible();
    await expect(page.getByText(/건물 소유자 \(§107①2호\)/).first()).toBeVisible();

    // 안분 표 헤더
    await expect(page.getByText(/건물·부속토지 분리 안분/).first()).toBeVisible();
    await expect(page.getByText("본세 안분").first()).toBeVisible();
    await expect(page.getByText("고지액 안분").first()).toBeVisible();

    // 소유자명 노출 (name.trim() — 내부 id 노출 아님)
    await expect(page.getByText(/홍건물/).first()).toBeVisible();
    await expect(page.getByText(/김토지/).first()).toBeVisible();

    // 건물분 비율 표시
    await expect(page.getByText(/건물분 비율 60\.0%/).first()).toBeVisible();
  });

  test("2: house_split + 건축물 시가표준액 미입력 → validateStep 차단", async ({ page }) => {
    await gotoStep0(page);
    await openOwnershipSection(page);

    await selectOwnership(page, /주택 건물·부속토지 분리/).check();

    await page.getByPlaceholder("건물 소유자 성명 또는 식별자").fill("홍건물");
    await page.getByPlaceholder("부속토지 소유자 성명 또는 식별자").fill("김토지");
    // 건축물 시가표준액 미입력 (부속토지만 입력)
    const landInput = amountInputByLabel(page, /부속토지 시가표준액/);
    await landInput.fill("240000000");

    // 다음 클릭 → validate 차단 → 결과 미도달
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByText("총 납부세액")).toHaveCount(0);
    // 차단 메시지 확인
    await expect(page.getByText(/건축물 시가표준액/).first()).toBeVisible();
  });

  test("3: 토지 선택 시 house_split 옵션 노출 안 됨", async ({ page }) => {
    await page.goto("/calc/property-tax");
    // 물건 유형: 토지 선택
    await page.getByRole("radio", { name: "토지" }).check();
    await amountInputByLabel(page, /^공시가격/).fill("100000000");

    await page.locator('[data-slot="toggle-card"]').filter({ hasText: "소유 형태" }).first().getByRole("switch").click();
    await expect(page.getByText("특수 소유 형태")).toBeVisible();

    // house_split 옵션이 없어야 함
    await expect(page.getByRole("radio", { name: /주택 건물·부속토지 분리/ })).toHaveCount(0);
  });
});

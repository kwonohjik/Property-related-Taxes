/**
 * E2E: 비주식 자산 입력 폼 — 주식 카드(FieldCard) 스타일 통일 (2026-05-29)
 *
 * 계획서: docs/01-plan/estate-asset-input-fieldcard-restyle.plan.md
 *
 * 검증: 부동산·금융 자산 카드 본문이 "평가액 입력" 섹션 카드 + FieldCard(data-slot)
 *       좌-라벨 구조로 렌더 (이미지9 → 이미지10 스타일).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep1WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function addLandCard(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByRole("button", { name: /토지/ }).first().click();
}

async function addFinancialCard(page: Page) {
  await page.getByRole("button", { name: /재산 추가|상속재산 추가/ }).first().click();
  await page.getByText("예금·펀드·채권·공제금", { exact: true }).click();
}

test.describe("부동산 자산 카드 — FieldCard + 섹션 스타일", () => {
  test("토지 카드 → '평가액 입력' 섹션 + FieldCard 다수 + 라벨 렌더", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addLandCard(page);

    // 섹션 헤더
    await expect(page.getByText("평가액 입력").first()).toBeVisible();

    // FieldCard(data-slot="field-card") — 기본 노출(자산명·별칭·개별공시지가) 3개 이상
    // (2026-05-29 §8a75d27: 시가·감정가는 advanced 토글 뒤로 이동 — 기본 노출에서 제거됨)
    await expect(
      page.locator('[data-slot="field-card"]').first(),
    ).toBeVisible();
    expect(
      await page.locator('[data-slot="field-card"]').count(),
    ).toBeGreaterThanOrEqual(3);

    // 기본 노출 라벨 확인
    await expect(page.getByText("별칭", { exact: true })).toBeVisible();
    await expect(
      page.getByText("개별공시지가 (면적 포함 합산)", { exact: true }),
    ).toBeVisible();

    // 시가·감정평가액은 advanced 토글 ON 후 노출 (2026-05-29 UX3-Issue3)
    await page.getByText("시가·감정가·임대보증금·저당권 입력").click();
    await expect(
      page.getByText("시가 (매매·수용·경매가액)", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("감정평가액", { exact: true })).toBeVisible();
  });
});

test.describe("금융 자산 카드 — FieldCard + 섹션 스타일", () => {
  test("예금·펀드·채권·공제금 카드 → '평가액 입력' 섹션 + '잔액 또는 시가' FieldCard", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep1WithChild(page);
    await addFinancialCard(page);

    await expect(page.getByText("평가액 입력").first()).toBeVisible();
    await expect(
      page.locator('[data-slot="field-card"]').first(),
    ).toBeVisible();
    // financial 시가 라벨 (exact로 서브타이틀 중복 매칭 회피)
    await expect(page.getByText("잔액 또는 시가", { exact: true })).toBeVisible();
  });
});

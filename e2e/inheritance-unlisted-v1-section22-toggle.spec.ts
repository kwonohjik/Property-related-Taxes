/**
 * E2E: S-3 — 비상장주식 V1(간편) §22② 최대주주 토글 (F-1 Phase 2)
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §6·§7
 *
 * 시나리오:
 *   S-3-a: 비상장주식 V1(간편) 카드에 §22② 토글 표시
 *   S-3-b: 기본 OFF 상태
 *   S-3-c: 토글 ON → 펼침 안내 표시
 *   S-3-d: 정식(V2)으로 모드 전환 시 이 섹션의 토글이 사라지고 V2 카드 내부 토글로 전환(S-4 보완)
 *
 * 정책:
 *   [[feedback_browser_verify_with_playwright]] — 수동 안내 금지, spec 통과로 브라우저 확인 충족
 */

import { test, expect, type Page } from "@playwright/test";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openUnlistedV1SimpleCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByText("비상장주식", { exact: true }).click();
  // 기본 모드 = "간편평가"(simple) — 추가 클릭 불필요
}

test.describe("S-3: 비상장주식 V1(간편) §22② 최대주주 토글 (F-1)", () => {
  test("S-3-a: 비상장 V1 카드에 §22② 토글 헤더 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    // §22② 최대주주 토글 헤더 표시 확인
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toBeVisible();

    // ToggleCard title 표시
    await expect(page.getByText("최대주주에 해당", { exact: true })).toBeVisible();
  });

  test("S-3-b: 기본 OFF 상태 — 펼침 안내 미표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    const guide = page.getByText(/\[적용\] 버튼으로 반영/);
    await expect(guide).toHaveCount(0);
  });

  test("S-3-c: 토글 ON → 펼침 안내 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    // 토글 ON
    await page.getByText("최대주주에 해당", { exact: true }).click();

    // ON: 펼침 안내 표시
    await expect(page.getByText(/\[적용\] 버튼으로 반영/).first()).toBeVisible();
  });

  test("S-3-d: 정식(V2)으로 모드 전환 시 EstateCommonAttributes 토글 비노출 + V2 토글 존재", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openUnlistedV1SimpleCard(page);

    // V1에서 §22② 토글 표시 확인
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toBeVisible();

    // 정식평가로 전환
    await page.getByText("정식평가", { exact: true }).click();

    // V2 전환 후 §22② 토글은 단 1개만 존재해야 함 (S-4 중복 방지)
    // MajorShareholderStockToggle 헤더는 V2 카드 내부 1개만
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toHaveCount(1);
  });
});

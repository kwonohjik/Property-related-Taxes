/**
 * E2E: 비상장주식 V2 §22② 최대주주 토글 — 라벨 변경 · 자동판정 제거 · 금융재산공제 배제
 *
 * Plan: docs/00-pm/inheritance-section22-major-shareholder-toggle.plan.md §6.3
 * Phase 2 추가: S-4 — V2 카드 내부 토글 단 1개만 존재 (EstateCommonAttributesSection 중복 부재)
 *
 * 시나리오:
 *   T-S22-1: 신규 라벨 "§22② 최대주주 보유주식 금융재산공제 배제" 표시 + 구판 "추가공제 제외 판정" 부재
 *   T-S22-2: 자동판정 라디오("자동 판정 (보유지분율 기준)") 제거 확인
 *   T-S22-3: 토글 ON → "§22 금융재산 상속공제 대상금액에서 제외" 안내 펼침 (OFF엔 미표시)
 *   S-4: V2 카드에서 §22② 토글이 단 1개만 존재 (EstateCommonAttributesSection 중복 방지 확인)
 *
 * 진입 헬퍼: inheritance-unlisted-v2-convenience-fields.spec.ts 동일 패턴 재사용
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 §22② 최대주주 토글", () => {
  test("T-S22-1: 신규 라벨 표시 + 구판 라벨 부재", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toBeVisible();
    // 구판 라벨/문구 부재
    await expect(page.getByText("최대주주 추가공제 제외 판정")).toHaveCount(0);
  });

  test("T-S22-2: 자동판정 라디오 제거", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    await expect(page.getByText("자동 판정 (보유지분율 기준)")).toHaveCount(0);
    await expect(page.getByText(/수동: 최대주주 해당/)).toHaveCount(0);
  });

  test("T-S22-3: 토글 ON → §22 제외 안내 펼침 (OFF엔 미표시)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // children 펼침 영역 고유 문구 (description·ⓘ 안내와 구분)
    const guide = page.getByText(/\[적용\] 버튼으로 반영/);
    // OFF(기본): 펼침 안내 미표시
    await expect(guide).toHaveCount(0);

    // 토글 ON (ToggleCard title 클릭)
    await page.getByText("최대주주에 해당", { exact: true }).click();

    // ON: 펼침 안내 표시
    await expect(guide.first()).toBeVisible();
  });

  test("S-4: V2 카드에서 §22② 토글 1개만 존재 (EstateCommonAttributesSection 중복 부재)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // §22② 토글 헤더가 정확히 1개 (V2 카드 내부 1개만, EstateCommonAttributesSection 미노출)
    await expect(
      page.getByText("§22② 최대주주 보유주식 금융재산공제 배제", { exact: true }),
    ).toHaveCount(1);

    // "최대주주에 해당" ToggleCard title도 1개만
    await expect(page.getByText("최대주주에 해당", { exact: true })).toHaveCount(1);
  });
});

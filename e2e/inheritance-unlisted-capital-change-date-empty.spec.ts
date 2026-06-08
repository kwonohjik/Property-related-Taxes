/**
 * E2E: 비상장주식 V2 자본금 변동 — 새 행 추가 시 변동일 빈값 + 미입력 차단
 *
 * 검증:
 *   T1. "변동 추가" 클릭 후 변동일 DateInput이 빈값(오늘 날짜 아님)으로 시작
 *   T2. 변동일 미입력 상태에서 "다음" 진행 시 "변동일을 입력해야 합니다" 경고 표시
 *   T3. 변동일 입력 후 경고 사라짐
 *
 * 정책:
 *   - changeDate: undefined 기본값 → validate(inheritance-validate.ts) 차단
 *   - CapitalChangeTable 인라인 warning("변동일을 입력해야 합니다.") 유지 확인
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();

  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 자본금 변동 — 변동일 빈값 기본값", () => {
  test("T1: 변동 추가 후 변동일 DateInput이 빈값으로 시작 (오늘 날짜 아님)", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 자본금 변동사항 섹션에서 "변동 추가" 버튼 클릭
    await page.getByRole("button", { name: /\+ 변동 추가/ }).click();

    // 변동일 FieldCard 확인 — DateInput 내 연도·월·일 모두 빈값
    const changeDateCard = page
      .locator('[data-slot="field-card"]')
      .filter({ has: page.getByText("변동일", { exact: true }) });

    const yearInput = changeDateCard.getByLabel("연도");
    const monthInput = changeDateCard.getByLabel("월");
    const dayInput = changeDateCard.getByLabel("일");

    await expect(yearInput).toHaveValue("");
    await expect(monthInput).toHaveValue("");
    await expect(dayInput).toHaveValue("");

    // 오늘 날짜 연도가 아님을 확인 (실수로 new Date()가 들어가면 2026 등이 표시됨)
    const today = new Date();
    const todayYear = String(today.getFullYear());
    await expect(yearInput).not.toHaveValue(todayYear);
  });

  test("T2: 변동일 미입력 상태에서 인라인 경고 표시 — '변동일을 입력해야 합니다'", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 변동 추가
    await page.getByRole("button", { name: /\+ 변동 추가/ }).click();

    // 인라인 warning이 즉시 표시되어야 함 (FieldCard warning prop)
    await expect(page.getByText("변동일을 입력해야 합니다.")).toBeVisible();
  });

  test("T3: 변동일 입력 후 인라인 경고 사라짐", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 변동 추가
    await page.getByRole("button", { name: /\+ 변동 추가/ }).click();

    // 경고 확인
    await expect(page.getByText("변동일을 입력해야 합니다.")).toBeVisible();

    // 변동일 입력
    const changeDateCard = page
      .locator('[data-slot="field-card"]')
      .filter({ has: page.getByText("변동일", { exact: true }) });
    await changeDateCard.getByLabel("연도").fill("2022");
    await changeDateCard.getByLabel("월").fill("6");
    await changeDateCard.getByLabel("일").fill("30");

    // 경고 사라짐 확인
    await expect(page.getByText("변동일을 입력해야 합니다.")).not.toBeVisible();
  });
});

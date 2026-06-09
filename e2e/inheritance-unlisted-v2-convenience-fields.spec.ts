/**
 * E2E: 비상장주식 V2 입력 편의 3종 — 평가기준일 자동 기본값 / 자본금 자동 / 사업자번호 하이픈
 *
 * 시나리오:
 *   T-CF-1: 상속개시일 입력 → 비상장 V2 진입 시 평가기준일 자동 표시
 *   T-CF-2: 액면가·발행주식총수 입력 → 자본금 자동 계산 표시
 *   T-CF-3: 사업자등록번호 숫자 입력 → 하이픈 자동 삽입
 *
 * 진입 헬퍼: inheritance-unlisted-v2-validation-gate.spec.ts 동일 패턴 재사용
 */
import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoStep0AndFillDeathDate(page: Page, year: string, month: string, day: string) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill(year);
  await page.getByLabel("월").first().fill(month);
  await page.getByLabel("일").first().fill(day);

  // 상속인 추가 (최소 1명 필수)
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function openV2FormalCard(page: Page) {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 입력 편의 3종", () => {
  test("T-CF-1: 상속개시일(2026-05-15) → V2 진입 시 평가기준일 자동 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // 평가기준일 DateInput에 상속개시일(2026-05-15)이 표시되어야 함
    const evalDateCard = page
      .locator('[data-slot="field-card"]')
      .filter({ has: page.getByText("평가기준일", { exact: true }) });

    // 연도 필드가 2026으로 채워져 있어야 함
    const yearInput = evalDateCard.getByLabel("연도");
    await expect(yearInput).toHaveValue("2026");

    // 월 필드가 5로 채워져 있어야 함
    const monthInput = evalDateCard.getByLabel("월");
    await expect(monthInput).toHaveValue("5");
  });

  test("T-CF-2: 액면가·발행주식총수 입력 → 자본금 hint에 자동 계산 안내 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // 액면가 입력 후 blur (다음 필드로 이동해 onChange 완료 보장)
    const faceValueInput = page.getByPlaceholder("1주당 액면가액");
    await faceValueInput.fill("5000");
    await faceValueInput.press("Tab");

    // 발행주식총수 입력 후 blur
    const totalSharesInput = page.getByPlaceholder("발행주식총수");
    await totalSharesInput.fill("10000");
    await totalSharesInput.press("Tab");

    // 자본금 FieldCard의 hint에 "자동 계산" 안내가 표시되어야 함
    // (capital이 없으면 hint: "액면가(5,000) × 발행주식총수(10,000) 자동 계산 — 수정 가능")
    await expect(page.getByText(/자동 계산.*수정 가능/)).toBeVisible();
  });

  test("T-CF-3: 사업자등록번호 숫자 입력 → 하이픈 자동 삽입 (123-45-78945)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    const bizRegInput = page.getByTestId("unlisted-v2-biz-reg-no");
    await bizRegInput.fill("1234578945");

    // 하이픈 자동 삽입으로 123-45-78945 형식 표시
    await expect(bizRegInput).toHaveValue("123-45-78945");
  });

  test("T-CF-4: 자본금 수동 입력 시 hint에 자동계산 안내가 사라짐", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoStep0AndFillDeathDate(page, "2026", "5", "15");
    await openV2FormalCard(page);

    // 액면가·발행주식총수 입력 — 자동 계산 hint 나타남
    const faceValueInput = page.getByPlaceholder("1주당 액면가액");
    await faceValueInput.fill("5000");
    await faceValueInput.press("Tab");

    const totalSharesInput = page.getByPlaceholder("발행주식총수");
    await totalSharesInput.fill("10000");
    await totalSharesInput.press("Tab");

    // 자동 hint 표시 확인
    await expect(page.getByText(/자동 계산.*수정 가능/)).toBeVisible();

    // 자본금을 사용자가 직접 입력하면 capital이 store에 저장되어 hint가 사라짐
    // (capital이 있으면 hint = "제1쪽 1번" 표시)
    const capitalInput = page.getByPlaceholder("자본금");
    await capitalInput.click();
    await capitalInput.press("Control+A");
    await capitalInput.type("99000000");
    await capitalInput.press("Tab");

    // 자동 계산 hint가 사라져야 함
    await expect(page.getByText(/자동 계산.*수정 가능/)).not.toBeVisible();
  });
});

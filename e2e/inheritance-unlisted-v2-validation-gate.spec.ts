/**
 * E2E: 비상장주식 V2 정식평가 — 필수 입력 검증 차단·인라인 경고
 *
 * 요구사항:
 *   - 유상증자 행 추가 후 주식수·1주당 납입금액 미입력 → "다음" 버튼 클릭 시 에러 메시지 표시(진행 차단)
 *   - 인라인 경고(주식수 0, 1주당 금액 0) 즉시 표시
 *   - 사업연도 종료일 미입력 → 종료일 필수 경고 표시
 *
 * 진입 경로: inheritance-unlisted-capital-increase-section56-5.spec.ts와 동일 헬퍼 재사용
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 + 상속인 추가
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /^다음/ }).click();

  // Step1: 비상장주식 V2 카드 열기
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /비상장주식/ }).click();
  await page.getByText("정식평가", { exact: true }).click();
}

/** FieldCard(라벨 exact span 기준) 안의 DateInput 채우기 */
async function fillFieldCardDate(page: Page, label: string, y: string, m: string, d: string) {
  const card = page
    .locator('[data-slot="field-card"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await card.getByLabel("연도").fill(y);
  await card.getByLabel("월").fill(m);
  await card.getByLabel("일").fill(d);
}

/** 사업연도 열(라벨 input 부모) 안의 종료일 DateInput(개시일=0, 종료일=1) 채우기 */
async function fillFiscalYearEndDate(col: Locator, y: string, m: string, d: string) {
  await col.getByLabel("연도").nth(1).fill(y);
  await col.getByLabel("월").nth(1).fill(m);
  await col.getByLabel("일").nth(1).fill(d);
}

test.describe("비상장주식 V2 — 필수 입력 검증 차단·인라인 경고", () => {
  test("T-GATE-1: 유상증자 행 추가 후 주식수 미입력 → 다음 버튼 차단 + 에러 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoV2FormalValuationCard(page);

    // 최소 법인 기본 정보
    await page.getByPlaceholder("법인명 입력").fill("게이트테스트법인");
    await fillFieldCardDate(page, "사업개시일", "2000", "1", "1");
    await fillFieldCardDate(page, "평가기준일", "2023", "3", "31");
    await page.getByPlaceholder("1주당 액면가액").fill("5000");
    await page.getByPlaceholder("발행주식총수").fill("10000");
    await page.getByPlaceholder("보유 주식수").fill("5000");

    // 사업연도 종료일 3개 입력
    const yearLabels = page.getByPlaceholder("사업연도 라벨");
    await yearLabels.nth(0).fill("2022");
    await yearLabels.nth(1).fill("2021");
    await yearLabels.nth(2).fill("2020");
    await fillFiscalYearEndDate(yearLabels.nth(0).locator(".."), "2022", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(1).locator(".."), "2021", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(2).locator(".."), "2020", "12", "31");

    // 유상증자 행 추가 — 주식수는 의도적으로 0 유지, 변동일만 채움
    await page.getByRole("button", { name: /변동 추가/ }).click();
    await fillFieldCardDate(page, "변동일", "2022", "6", "30");
    // 주식수·납입금액 미입력 상태 유지

    // 인라인 경고 즉시 표시 확인 (주식수) — FieldCard warning prop으로 렌더됨
    await expect(page.getByText("주식수를 1 이상 입력해야 합니다.").first()).toBeVisible({ timeout: 5_000 });
    // 인라인 경고 즉시 표시 확인 (납입금액)
    await expect(page.getByText("1주당 납입금액을 입력해야 합니다. (§56⑤)").first()).toBeVisible({ timeout: 5_000 });

    // 다음 버튼 클릭 → 차단 에러 메시지 표시 (validateStep Step 1)
    await page.getByRole("button", { name: /^다음/ }).click();
    // 에러 메시지는 "비상장주식" 포함 (validateUnlistedStockV2 반환 형식)
    await expect(
      page.getByText(/주식수를 1 이상 입력해야 합니다/).first(),
    ).toBeVisible({ timeout: 5_000 });

    // 주식수·납입금액 입력 후 인라인 경고 사라짐 확인
    await page.getByPlaceholder("증가·감소 주식수").fill("1000");
    await page.getByPlaceholder("1주당 납입·지급금액").fill("5000");

    // 인라인 경고 사라짐 확인 (strict: 텍스트 포함된 p 요소)
    await expect(page.locator("p.text-destructive", { hasText: "주식수를 1 이상 입력해야 합니다." })).not.toBeVisible({ timeout: 3_000 });
    await expect(page.locator("p.text-destructive", { hasText: "1주당 납입금액을 입력해야 합니다." })).not.toBeVisible({ timeout: 3_000 });
  });

  test("T-GATE-2: 유상증자 주식수·납입금액 정상 입력 후 차단 없음 (회귀)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoV2FormalValuationCard(page);

    // 법인 기본 정보
    await page.getByPlaceholder("법인명 입력").fill("회귀테스트법인");
    await fillFieldCardDate(page, "사업개시일", "2000", "1", "1");
    await fillFieldCardDate(page, "평가기준일", "2023", "3", "31");
    await page.getByPlaceholder("1주당 액면가액").fill("5000");
    await page.getByPlaceholder("발행주식총수").fill("10000");
    await page.getByPlaceholder("보유 주식수").fill("5000");

    // 사업연도 종료일 3개 입력 (기본값이 유효 Date이지만 명시적으로 채움)
    const yearLabels = page.getByPlaceholder("사업연도 라벨");
    await yearLabels.nth(0).fill("2022");
    await yearLabels.nth(1).fill("2021");
    await yearLabels.nth(2).fill("2020");
    await fillFiscalYearEndDate(yearLabels.nth(0).locator(".."), "2022", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(1).locator(".."), "2021", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(2).locator(".."), "2020", "12", "31");

    // 유상증자 행 추가 — 주식수·납입금액·변동일 모두 정상 입력
    await page.getByRole("button", { name: /변동 추가/ }).click();
    await fillFieldCardDate(page, "변동일", "2022", "6", "30");
    await page.getByPlaceholder("증가·감소 주식수").fill("1000");
    await page.getByPlaceholder("1주당 납입·지급금액").fill("5000");

    // 인라인 경고 없어야 함
    await expect(page.locator("p.text-destructive", { hasText: "주식수를 1 이상 입력해야 합니다." })).not.toBeVisible({ timeout: 3_000 });
    await expect(page.locator("p.text-destructive", { hasText: "1주당 납입금액을 입력해야 합니다." })).not.toBeVisible({ timeout: 3_000 });

    // 다음 버튼 클릭 → 에러 없이 다음 단계로 진행
    await page.getByRole("button", { name: /^다음/ }).click();
    // Step 2(비과세·장례비)로 이동 — "비과세" 텍스트 확인
    await expect(page.getByText(/비과세|장례비|장례/).first()).toBeVisible({ timeout: 8_000 });
  });
});

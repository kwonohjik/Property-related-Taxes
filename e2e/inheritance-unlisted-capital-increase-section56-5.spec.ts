/**
 * E2E: 비상장주식 V2 정식평가 — §56⑤ 유상증자 순손익액 조정 반영 + PDF 파일명 방어
 *
 * 회귀 배경:
 *   - capital-increase-adjustment.ts / converted-shares.ts 가 changeDate·fiscalYearEndDate를
 *     raw Date 비교(`>=`/`>`)했다. sessionStorage/이력 복원으로 날짜가 string이 되면 silent false →
 *     §56⑤ 유상증자 조정·환산주식수가 0으로 떨어졌다. (orchestrator 진입부 toOptionalDate 정규화로 수정)
 *   - generateBesshiPdfFilename / 본문 메타가 input.evaluationDate.toISOString()을 무방비 호출 →
 *     평가기준일 미입력 시 TypeError. (toOptionalDate 가드로 수정)
 *
 * 검증:
 *   T1. 법인·사업연도·유상증자 풀 입력 → 별지 제6쪽 "라. 유상증(감)자시 반영액" 비0 표시
 *   T2. 평가기준일 미입력 상태에서 별지 미리보기 펼침 → toISOString TypeError 오버레이 없음(PDF 버튼 렌더)
 *
 * 진입 경로: inheritance-unlisted-fiscal-year-annualize.spec.ts 와 동일
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일
  await page.getByLabel("연도").first().fill("2023");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click();

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

test.describe("비상장주식 V2 — §56⑤ 유상증자 조정 UI 반영", () => {
  test("T1: 유상증자 입력 → 별지 제6쪽 '라. 유상증(감)자시 반영액'이 비0으로 표시된다", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoV2FormalValuationCard(page);

    // 법인 기본 정보
    await page.getByPlaceholder("법인명 입력").fill("예제법인");
    await fillFieldCardDate(page, "사업개시일", "2000", "1", "1");
    await fillFieldCardDate(page, "평가기준일", "2022", "6", "30");
    await page.getByPlaceholder("1주당 액면가액").fill("5000");
    await page.getByPlaceholder("발행주식총수").fill("180000");
    await page.getByPlaceholder("보유 주식수").fill("180000");

    // 사업연도 소득금액 (① 행 — 1년전/2년전/3년전) — 표가 div grid(role=row)로 전환됨(2026-05-27)
    const incomeRow = page.locator('[role="row"]').filter({ hasText: "각 사업연도 소득금액" });
    await incomeRow.getByPlaceholder("0").nth(0).fill("140000000");
    await incomeRow.getByPlaceholder("0").nth(1).fill("110000000");
    await incomeRow.getByPlaceholder("0").nth(2).fill("80000000");

    // 사업연도 종료일 (라벨 input 부모 = 열 컨테이너)
    const yearLabels = page.getByPlaceholder("사업연도 라벨");
    await yearLabels.nth(0).fill("2021");
    await yearLabels.nth(1).fill("2020");
    await yearLabels.nth(2).fill("2019");
    await fillFiscalYearEndDate(yearLabels.nth(0).locator(".."), "2021", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(1).locator(".."), "2020", "12", "31");
    await fillFiscalYearEndDate(yearLabels.nth(2).locator(".."), "2019", "12", "31");

    // 자본금 변동: 유상증자 2021-06-30, 50,000주 @ 5,000원
    await page.getByRole("button", { name: /변동 추가/ }).click();
    await fillFieldCardDate(page, "변동일", "2021", "6", "30");
    await page.getByPlaceholder("증가·감소 주식수").fill("50000");
    await page.getByPlaceholder("1주당 납입·지급금액").fill("5000");

    // 별지 제4호 부표3 인쇄 미리보기 펼침
    await page.getByTestId("besshi-form-toggle").click();

    // 라. 유상증(감)자시 반영액 — PDF 사례 1과 동일 [12,500,000 / 25,000,000 / 25,000,000]
    const row = page.getByTestId("p6-라");
    await expect(row).toBeVisible({ timeout: 5_000 });
    await expect(row).toContainText("12,500,000");
    await expect(row).toContainText("25,000,000");
    // 회귀(전부 0)였다면 "0원0원0원"이었음 — 비0 확정
    await expect(row).not.toContainText(/^라\..*반영액.*0원0원0원$/);
  });
});

test.describe("비상장주식 V2 — 평가기준일 미입력 PDF 파일명 방어", () => {
  test("T2: 평가기준일 미입력 + 별지 미리보기 펼침 → toISOString TypeError 오버레이 없음", async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await gotoV2FormalValuationCard(page);

    // 평가기준일은 일부러 비워둠. 최소 입력만 (totalShares·ownedShares)
    await page.getByPlaceholder("발행주식총수").fill("180000");
    await page.getByPlaceholder("보유 주식수").fill("180000");

    // 별지 미리보기 펼침 → PDF 다운로드 버튼 렌더 시 generateBesshiPdfFilename 호출
    await page.getByTestId("besshi-form-toggle").click();

    // toISOString TypeError가 던져지지 않아야 함
    expect(errors.join("\n")).not.toContain("toISOString");
    // Next.js 런타임 에러 오버레이 부재
    await expect(page.locator("text=Cannot read properties of undefined")).toHaveCount(0);
  });
});

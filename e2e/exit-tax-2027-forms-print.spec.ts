/**
 * E2E: 국외전출세 2027 — U3 서식(별지 제84호 세율구분별 열 · 별지 제104호 신고 대상 종목) + 인쇄 선택
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` §12 V-6·V-7 · UQ-7 (a)
 *
 * 시료(2027-01-01 출국) — H1 코스닥(차익 4억) + F1 국외주식(차익 9.2억, 2호 나목) → 구분 2개 · 배분 2,500,000 / 0
 *   ⑩ 산출세액 1호 84,375,000 · 2호 나목 184,000,000 · 합계 268,375,000
 * 소액 국외주식 F2(2,800,000 — 5억 이하 → 제외)는 제104호 표와 제84호 합계에 들어가지 않는다.
 *
 * 인쇄 판정은 `print:hidden` 클래스로 한다(화면 표시는 선택과 무관). 선택은 기본 전체 미선택 — 먼저 「전체 선택」.
 */

import { test, expect, type Page } from "@playwright/test";

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

/** 연/월/일 aria-label 입력 — `nth`번째 DateInput */
async function fillDate(page: Page, nth: number, y: string, m: string, d: string) {
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

/** 보유 종목 카드의 시장 버튼 그리드 */
const MARKET_BUTTONS = 'div:has(> label:text-is("시장")) button';

async function openWizard(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 60_000 });
}

/** 1단계(국외전출세 · 거주 10년 · 출국일 · 대주주) → 2단계 진입 */
async function reachStep2(page: Page, departure: [string, string, string]) {
  await openWizard(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();
  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  await fillDate(page, 0, ...departure); // 이 화면의 유일한 DateInput
  await page.getByText("직전 연도말 대주주 해당").first().click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });
}

/** 국내 코스닥 H1 한 건을 `idx`번째 카드에 채운다 (`+ 종목 추가` 포함) */
async function addDomesticH1(page: Page, idx: number) {
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").nth(idx).fill("H1 코스닥");
  await page.locator(MARKET_BUTTONS, { hasText: "코스닥" }).nth(idx).click();
  await page.getByPlaceholder("보유 주식수 (주)").nth(idx).fill("10000");
  await page.getByPlaceholder("1주당 취득가액").first().fill("10000");
  await fillDate(page, idx, "2015", "01", "01");
  await page.getByPlaceholder("출국일 실제 거래가액 (주당)").first().fill("50000");
}

/** 국외주식 F1(외화 경로)을 `idx`번째 카드에 채운다 — 외국법인 발행(기본) → 2호 나목 */
async function addForeignF1(page: Page, idx: number) {
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").nth(idx).fill("F1 국외주식");
  await page.locator(MARKET_BUTTONS, { hasText: "국외주식" }).nth(idx).click();
  await expect(page.getByTestId("exit-foreign-holding-fields")).toHaveCount(1);
  await page.getByPlaceholder("보유 주식수 (주)").nth(idx === 0 ? 0 : 1).fill("1000");
  await fillDate(page, idx, "2018", "01", "01");
  await page.getByPlaceholder("1주당 외화 취득가액").fill("400");
  await page.getByPlaceholder("취득일 기준환율").fill("1200");
  await page.getByPlaceholder("출국일 1주당 외화 시가").fill("1000");
  await page.getByPlaceholder("출국일 기준환율").fill("1400");
}

const rowOf = (page: Page, label: string) =>
  page.locator(`div.flex:has(> span:text-is("${label}"))`).first();

/** 계산 요청 body를 모은다 */
function captureBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/calc/stock-transfer")) {
      bodies.push(req.postData() ?? "");
    }
  });
  return bodies;
}


const printId = (id: string) => `[data-print-id="${id}"]`;

/** 소액 국외주식 F2 — 2,800,000 (5억 이하 → 영 §178의8②1호 제외) */
async function addSmallForeignF2(page: Page, idx: number) {
  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").nth(idx).fill("F2 소액");
  await page.locator(MARKET_BUTTONS, { hasText: "국외주식" }).nth(idx).click();
  await expect(page.getByTestId("exit-foreign-holding-fields")).toHaveCount(1);
  await page.getByPlaceholder("보유 주식수 (주)").nth(idx === 0 ? 0 : 1).fill("10");
  await fillDate(page, idx, "2018", "01", "01");
  await page.getByPlaceholder("1주당 외화 취득가액").fill("100");
  await page.getByPlaceholder("취득일 기준환율").fill("1200");
  await page.getByPlaceholder("출국일 1주당 외화 시가").fill("200");
  await page.getByPlaceholder("출국일 기준환율").fill("1400");
}

test.describe("국외전출세 2027 — U3 서식·인쇄", () => {
  test("U3-A 구분 2개 → 별지 제84호가 세율구분별 열 표 · 표시 보류 없음 · 제104호 2행 · 인쇄 전체 선택", async ({ page }) => {
    test.setTimeout(240_000);
    await reachStep2(page, ["2027", "01", "01"]);
    await addDomesticH1(page, 0);
    await addForeignF1(page, 1);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    const allocInputs = page.getByPlaceholder("배분액 (0이라도 입력)");
    await allocInputs.nth(0).fill("2500000");
    await allocInputs.nth(1).fill("0");
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByTestId("exit-tax-bucket-filing-table")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("별지 제84호서식 표시 보류")).toHaveCount(0);
    await expect(page.getByTestId("row-3-rate-code-clause1")).toHaveText("1-94");
    await expect(page.getByTestId("row-3-rate-code-clause2b")).toHaveText("2-94");
    await expect(page.getByTestId("row-10-calculated-tax-clause1")).toHaveText("84,375,000");
    await expect(page.getByTestId("row-10-calculated-tax-clause2b")).toHaveText("184,000,000");
    await expect(page.getByTestId("row-10-calculated-tax-total")).toHaveText("268,375,000");
    await expect(page.getByTestId("row-9-rate-clause1")).toContainText("25%");
    await expect(page.getByTestId("exit-local-tax-note")).toContainText("확인 필요");

    // 제104호 — 과세 2종목 모두 행
    await page.getByTestId("exit-tax-holding-report-toggle").click();
    await expect(page.getByTestId("table-data-tbody").locator('[data-testid^="row-data-"]')).toHaveCount(2);

    // 인쇄 — 전체 선택 먼저
    await expect(page.locator(printId("filing-form"))).toHaveClass(/print:hidden/);
    await page.getByRole("button", { name: "전체 선택" }).first().click();
    await expect(page.locator(printId("filing-form"))).not.toHaveClass(/print:hidden/);
    await expect(page.locator(printId("exit-holding-report"))).not.toHaveClass(/print:hidden/);
  });

  test("U3-B 소액 국외주식 F2(제외) → 제104호 표에서 빠지고 · 제84호 합계에도 없다 · 인쇄 선택은 유지", async ({ page }) => {
    test.setTimeout(240_000);
    await reachStep2(page, ["2027", "01", "01"]);
    await addDomesticH1(page, 0);
    await addSmallForeignF2(page, 1);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });

    // 제84호(구분 1개 → 25행 표) 합계에 H1 차익 4억만
    await expect(page.locator(printId("filing-form"))).toContainText("400,000,000");

    await expect(page.getByTestId("exit-tax-holding-report-toggle")).toContainText("1건");
    await page.getByTestId("exit-tax-holding-report-toggle").click();
    const rows = page.getByTestId("table-data-tbody").locator('[data-testid^="row-data-"]');
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId("col-corp-name")).toHaveText("H1 코스닥");
    await expect(page.getByTestId("table-data-tbody")).not.toContainText("F2 소액");

    await page.getByRole("button", { name: "전체 선택" }).first().click();
    await expect(page.locator(printId("exit-holding-report"))).not.toHaveClass(/print:hidden/);
  });

  test("U3-C 모두 제외(F2만) → 제104호는 안내 · 인쇄 선택 항목에서 빠진다", async ({ page }) => {
    test.setTimeout(240_000);
    await reachStep2(page, ["2027", "01", "01"]);
    await addSmallForeignF2(page, 0);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByTestId("exit-exclusion-notice")).toBeVisible({ timeout: 60_000 });

    await expect(page.getByTestId("exit-tax-holding-report-none")).toBeVisible();
    await expect(page.getByTestId("exit-tax-holding-report-toggle")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /국외전출자 보유현황 신고서/ })).toHaveCount(0);
  });
});

/**
 * E2E: 국외전출세 — **2027.1.1. 이후 출국** 국외주식 (U1+U2 · 소득세법 §118의9·§118의11 개정)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` §8.1 · `.plan.md` §2.1
 *
 * ## 시료 (손계산 — 엔진 route anchor와 같은 시료)
 *
 *   H1 코스닥 10,000주 · 취득 10,000 · 시가 50,000                         → 차익 400,000,000 (1호)
 *   F1 국외주식 1,000주 · 취득 400 USD × 1,200 · 시가 1,000 USD × 1,400   → 시가 1,400,000,000 · 취득 480,000,000 · 차익 920,000,000 (2호 나목)
 *
 *   X2-B F1 단독 · 2027-01-01 출국  (920,000,000 − 2,500,000) × 20%                     = 183,500,000
 *   X2-C H1 + F1 · 기본공제 배분 (1호 2,500,000 / 2호 나목 0)  84,375,000 + 184,000,000  = 268,375,000
 *
 * ⑫⑬⑭는 TypeScript가 못 잡는다 — 요청 body에 새 키(외화 단가·환율·배분·외국인근로자)가 실리는지 Network로 직접 본다.
 * 2026 이전 출국 회귀는 `exit-tax-2026-departure-regression.spec.ts`(수정 없이 통과)가 따로 지킨다.
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

test.describe("국외전출세 2027.1.1. 이후 출국 — 국외주식", () => {
  test("X2-A 시장 버튼: 2027-01-01 → 5개(국외주식 포함) · 시장 선택 시 외화 입력 · 원화 거래가액 칸 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await reachStep2(page, ["2027", "01", "01"]);
    await page.getByRole("button", { name: "+ 종목 추가" }).click();

    const buttons = page.locator(MARKET_BUTTONS);
    await expect(buttons).toHaveCount(5);
    await expect(buttons).toHaveText(["코스피", "코스닥", "코넥스", "비상장", "국외주식"]);

    await buttons.filter({ hasText: "국외주식" }).click();
    await expect(page.getByTestId("exit-foreign-holding-fields")).toBeVisible();
    // 국외 종목은 외화 전용 칸만 — 원화 거래가액 칸은 같은 카드에 없다(D-4)
    await expect(page.getByPlaceholder("출국일 실제 거래가액 (주당)")).toHaveCount(0);
    await expect(page.getByPlaceholder("출국일 기준환율")).toBeVisible();
    // 외국인근로자 블록은 국외 행이 생긴 뒤에만
    await expect(page.getByText("국외주식등 제외 — 외국인근로자 (시행령 §178의8②)")).toBeVisible();
  });

  test("X2-B F1 단독(외화 경로) → 산출세액 183,500,000 · body에 외화 키·국외 시장 · 근로자 키 없음", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep2(page, ["2027", "01", "01"]);
    await addForeignF1(page, 0);
    // 환산 참고 칩(엔진 leaf) — 외화 시가 × 환율 × 주식수
    await expect(page.getByTestId("exit-foreign-preview-chip")).toContainText("1,400,000,000");
    await page.getByRole("button", { name: /^다음/ }).click();

    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    // 과세 구분이 하나면 배분 칸이 없다
    await expect(page.getByTestId("exit-alloc-notice")).toHaveCount(0);
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });

    await expect(rowOf(page, "산출세액 = 과세표준 × 세율 (§118의11 2호)")).toContainText("183,500,000");
    await expect(page.getByTestId("exit-bucket-clause2b")).toBeVisible();
    await expect(page.getByText("참고: 산출세액 × 10%로 본 지방소득세")).toBeVisible();
    // 종목 카드 — 호 뱃지 · 외화 환산 echo
    await expect(page.getByText("§118의11 2호 나목").first()).toBeVisible();
    await expect(page.getByText("USD 1,000 × 1,400")).toBeVisible();

    // ⑫⑬⑭ — 새 키가 body에 실렸다
    expect(bodies.length).toBeGreaterThan(0);
    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.departureDate).toBe("2027-01-01");
    expect(body.holdings).toHaveLength(1);
    expect(body.holdings[0]).toMatchObject({
      marketType: "foreign_stock",
      departureDayValuationMode: "foreign_market_price",
      isListedForeignCorp: true,
      isSmallMediumEnterprise: false,
      countryCode: "US",
      foreignCurrencyCode: "USD",
      departureDayPriceForeign: 1000,
      departureExchangeRate: 1400,
      perShareAcquisitionPriceForeign: 400,
      acquisitionExchangeRate: 1200,
      perShareAcquisitionPrice: 0,
    });
    expect(body.holdings[0]).not.toHaveProperty("departureDayMarketPrice");
    expect(body).not.toHaveProperty("foreignWorkerStatus");
    expect(body).not.toHaveProperty("basicDeductionAllocation");
  });

  test("X2-C 국내 H1 + 국외 F1 혼합 → 3단계 배분 입력 → 268,375,000 · body basicDeductionAllocation", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep2(page, ["2027", "01", "01"]);
    await addDomesticH1(page, 0);
    await addForeignF1(page, 1);
    await page.getByRole("button", { name: /^다음/ }).click();

    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    // 과세 구분 둘 이상 → 배분 입력 칸(1호 · 2호 나목)
    await expect(page.getByTestId("exit-alloc-notice")).toBeVisible();
    const allocInputs = page.getByPlaceholder("배분액 (0이라도 입력)");
    await expect(allocInputs).toHaveCount(2);

    // 배분을 비운 채 다음으로 가려 하면 ⑧이 막는다 (자동으로 나누지 않는다)
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "배분" }).first()).toBeVisible();

    await allocInputs.nth(0).fill("2500000");
    await allocInputs.nth(1).fill("0");
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });

    await expect(rowOf(page, "산출세액 = 세율 구분별 산출세액의 합계")).toContainText("268,375,000");
    await expect(page.getByTestId("exit-bucket-clause1")).toContainText("84,375,000");
    await expect(page.getByTestId("exit-bucket-clause2b")).toContainText("184,000,000");
    await expect(page.getByTestId("exit-alloc-basis")).toBeVisible();

    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.basicDeductionAllocation).toEqual({ clause1: 2_500_000, clause2b: 0 });
    expect(body.holdings.map((h: { marketType: string }) => h.marketType)).toEqual(["kosdaq", "foreign_stock"]);
  });

  test("X2-D 외국인근로자 본인(요건 4개) → 국외주식 제외 → 납세의무 없음 · body foreignWorkerStatus/Checks", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep2(page, ["2027", "01", "01"]);
    await addForeignF1(page, 0);

    await page.getByRole("radio", { name: /외국인근로자 본인/ }).click();
    const checks = page.getByTestId("exit-foreign-worker-checks");
    await expect(checks).toBeVisible();
    for (const t of [
      "외국인인 임원 또는 사용인",
      "일용근로자가 아님",
      "출국일 10년 전부터 출국일까지",
      "국내에서 근로의 제공이 종료된 날부터 6개월 이내에 출국",
    ]) {
      await checks.getByText(t).first().click();
    }
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByTestId("exit-exclusion-notice")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("납세의무 없음 (§118의9)")).toBeVisible();
    await expect(page.getByText("외국인근로자 소유 (시행령 §178의8②2호)")).toBeVisible();

    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.foreignWorkerStatus).toBe("foreign_worker");
    expect(body.foreignWorkerChecks).toEqual({
      isOfficerOrEmployee: true,
      isNotDailyWorker: true,
      domesticWorkRatioAtLeast80: true,
      departedWithin6MonthsOfWorkEnd: true,
    });
  });

  test("X2-E 출국일을 2026으로 바꿔도 국외 행은 지워지지 않고 안내만 · 근로자 블록은 사라진다", async ({ page }) => {
    test.setTimeout(180_000);
    await reachStep2(page, ["2027", "01", "01"]);
    await addForeignF1(page, 0);
    await expect(page.getByText("국외주식등 제외 — 외국인근로자 (시행령 §178의8②)")).toBeVisible();

    // 이전 단계로 돌아가 출국일을 2026-12-31로 바꾼다
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await fillDate(page, 0, "2026", "12", "31");
    await page.getByRole("button", { name: /^다음/ }).click();

    await expect(page.getByText("2027.1.1. 이전 출국분은 국외주식등이 과세 대상이 아닙니다")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("exit-foreign-holding-fields")).toBeVisible(); // 행 유지 — 자동 삭제 없음
    await expect(page.locator(MARKET_BUTTONS)).toHaveCount(4);
    await expect(page.getByText("국외주식등 제외 — 외국인근로자 (시행령 §178의8②)")).toHaveCount(0);
  });
});

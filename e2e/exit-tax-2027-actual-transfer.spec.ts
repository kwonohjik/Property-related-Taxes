/**
 * E2E: 국외전출세 — 2027.1.1. 이후 출국 **종목별 실제 양도(경정청구, PR-7b)**
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.plan.md` §2.2 PR-7 결정 · §2.3 PR-7b
 *
 * ## 시료 (손계산)
 *   F1 국외주식 1,000주 · 취득 400 USD × 1,200 · 출국일 시가 1,000 USD × 1,400 (2호 나목, 외국법인 발행)
 *   F1 단독 · 2027-01-01 출국 → 산출세액 (920,000,000 − 2,500,000) × 20% = 183,500,000
 *   전량 양도 — 외화 1,000 × 실제 양도일 기준환율 1,200 = 1,200,000,000 → 하락분 200,000,000 × 20% = 조정공제 40,000,000 → 경정 후 143,500,000
 *   400주 양도 — 판 부분 560,000,000 · 실제 480,000,000 → 하락분 80,000,000 × 20% = 조정공제 16,000,000
 *
 * ⑫⑬⑭는 TypeScript가 못 잡는다 — 요청 body에 `holdings[].actualTransfer`가 실리는지 Network로 직접 본다.
 * 2026 이전 출국 회귀(교재 갑 41,875,000)는 `exit-tax-2026-departure-regression.spec.ts`가 따로 지킨다.
 */

import { test, expect, type Page } from "@playwright/test";

async function fillByLabel(page: Page, label: string, value: string) {
  await page
    .locator(`div:has(> label:has-text('${label}')) input[type="text"]`)
    .first()
    .fill(value);
}

async function fillDate(page: Page, nth: number, y: string, m: string, d: string) {
  await page.locator('input[type="text"][aria-label="연도"]').nth(nth).fill(y);
  await page.locator('input[type="text"][aria-label="월"]').nth(nth).fill(m);
  await page.locator('input[type="text"][aria-label="일"]').nth(nth).fill(d);
}

const MARKET_BUTTONS = 'div:has(> label:text-is("시장")) button';

async function openWizard(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 60_000 });
}

/** 1단계(국외전출세 · 거주 10년 · 2027-01-01 출국 · 대주주) → 2단계(F1 입력) → 3단계 진입 */
async function reachStep3WithF1(page: Page) {
  await openWizard(page);
  await page.getByPlaceholder("종목명을 입력하세요").fill("전출 케이스");
  await page.getByRole("radio", { name: "국외전출세 (§118의9)" }).first().click();
  await fillByLabel(page, "출국일 전 10년 중 국내 거주 연수", "10");
  await fillDate(page, 0, "2027", "01", "01");
  await page.getByText("직전 연도말 대주주 해당").first().click();
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("보유 종목 — 간주양도 대상 (§178의9)")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "+ 종목 추가" }).click();
  await page.getByPlaceholder("종목명 입력").first().fill("F1 국외주식");
  await page.locator(MARKET_BUTTONS, { hasText: "국외주식" }).first().click();
  await expect(page.getByTestId("exit-foreign-holding-fields")).toHaveCount(1);
  await page.getByPlaceholder("보유 주식수 (주)").first().fill("1000");
  await fillDate(page, 0, "2018", "01", "01");
  await page.getByPlaceholder("1주당 외화 취득가액").fill("400");
  await page.getByPlaceholder("취득일 기준환율").fill("1200");
  await page.getByPlaceholder("출국일 1주당 외화 시가").fill("1000");
  await page.getByPlaceholder("출국일 기준환율").fill("1400");
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("실양도 정보 — 경정청구용")).toBeVisible({ timeout: 10_000 });
}

const rowOf = (page: Page, label: string) =>
  page.locator(`div.flex:has(> span:text-is("${label}"))`).first();

function captureBodies(page: Page): string[] {
  const bodies: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/calc/stock-transfer")) {
      bodies.push(req.postData() ?? "");
    }
  });
  return bodies;
}

const SOLD_SWITCH = { name: /F1 국외주식.*실제 양도함/ };
const ADJ_LABEL = "조정공제 (§118의12①) = 세율 구분별 조정공제의 합";

test.describe("국외전출세 2027.1.1. 이후 출국 — 종목별 실제 양도", () => {
  test("X7-A 2호 과세 → 종목별 입력만(전역 실양도·외국납부세액 입력 없음) · 전량 양도 → 조정공제 40,000,000 · 경정 후 143,500,000 · body actualTransfer", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep3WithF1(page);

    // 강제 모드 — 종목별 토글만, 전역 입력 3곳은 없다
    await expect(page.getByTestId("exit-actual-forced-note")).toBeVisible();
    await expect(page.getByText("외국납부세액 있음 (§118의13)")).toHaveCount(0);
    await expect(page.getByText("비거주자 세액공제 (§118의14, 선택)")).toHaveCount(0);

    await page.getByRole("switch", SOLD_SWITCH).click();
    await page.getByPlaceholder("양도한 주식 수 (주)").fill("1000");
    await page.getByPlaceholder("1주당 외화 양도가").fill("1000");
    await page.getByPlaceholder("실제 양도일 기준환율").fill("1200");

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });

    await expect(rowOf(page, "산출세액 = 과세표준 × 세율 (§118의11 2호)")).toContainText("183,500,000");
    await expect(page.locator('[data-testid^="exit-actual-lot-"]')).toContainText("1,200,000,000");
    await expect(page.getByTestId("exit-actual-bucket-clause2b")).toContainText("40,000,000");
    await expect(rowOf(page, ADJ_LABEL)).toContainText("40,000,000");
    await expect(rowOf(page, "경정 후 최종세액 = 산출세액 − 조정공제 − 외국납부세액공제")).toContainText("143,500,000");
    // 엔진 warnings — 환산 기준일 «확인 필요»
    await expect(page.getByText("환산 기준일은 법령").first()).toBeVisible();

    // ⑫⑬⑭ — 종목별 actualTransfer가 body에 실렸고 전역 경정청구 키는 없다
    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.holdings[0].actualTransfer).toEqual({ shareCount: 1000, priceForeign: 1000, exchangeRate: 1200 });
    for (const k of ["actualTransferDate", "actualTransferPricePerShare", "foreignTaxPaid", "domesticSourceTaxWithheld"]) {
      expect(body).not.toHaveProperty(k);
    }
  });

  test("X7-B 부분 양도 400주 → 조정공제 16,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep3WithF1(page);
    await page.getByRole("switch", SOLD_SWITCH).click();
    await page.getByPlaceholder("양도한 주식 수 (주)").fill("400");
    await page.getByPlaceholder("1주당 외화 양도가").fill("1000");
    await page.getByPlaceholder("실제 양도일 기준환율").fill("1200");
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });

    await expect(rowOf(page, ADJ_LABEL)).toContainText("16,000,000");
    await expect(page.locator('[data-testid^="exit-actual-lot-"]')).toContainText("560,000,000");
    await expect(page.getByText("일부만 양도한 종목").first()).toBeVisible();
    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.holdings[0].actualTransfer.shareCount).toBe(400);
  });

  test("X7-C 보유 주식 수보다 많이 입력하면 3단계에서 막힌다 · 토글을 끄면 입력이 모두 지워져 body에 actualTransfer가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    const bodies = captureBodies(page);
    await reachStep3WithF1(page);
    await page.getByRole("switch", SOLD_SWITCH).click();
    await page.getByPlaceholder("양도한 주식 수 (주)").fill("1001");
    await page.getByPlaceholder("1주당 외화 양도가").fill("1000");
    await page.getByPlaceholder("실제 양도일 기준환율").fill("1200");
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "보유 주식 수" }).first()).toBeVisible();

    // 끄면 값이 모두 지워진다 — 다시 켜도 빈 칸
    await page.getByRole("switch", SOLD_SWITCH).click();
    await page.getByRole("switch", SOLD_SWITCH).click();
    await expect(page.getByPlaceholder("양도한 주식 수 (주)")).toHaveValue("");
    await page.getByRole("switch", SOLD_SWITCH).click();

    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(page.getByText("산출세액 계산 (§118의10~§118의11)")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("exit-actual-transfer-result")).toHaveCount(0);
    const body = JSON.parse(bodies[bodies.length - 1]);
    expect(body.holdings[0]).not.toHaveProperty("actualTransfer");
  });
});

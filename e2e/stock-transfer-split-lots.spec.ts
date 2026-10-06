/**
 * E2E: 분할 매수·분할 양도 모드 — 제보 사례를 결과까지 (D-2·D-3·D-4)
 *
 * 계획서: docs/00-pm/stock-split-lots-ui-bugfix.plan.md
 *
 * 종전에는 분할 양도 모드(매도 건 입력)를 **결과까지 모는 spec이 0건**이었다. 그래서 폼 기본
 * 입력 방식이 「합계 직접 입력」으로 바뀐 뒤(2026-08·09) 분할 모드가 새 폼에서 항상
 * 「Validation failed」로 끝나는 것을 아무 게이트도 잡지 못했다.
 *
 * SPL-1: 매수 3건(매매 8,000@10,000 · 매매 8,000@12,000 · 증여 4,000@5,000) + 매도 10,000@20,000
 *        선입선출 → Step2 자동 산출(200,000,000 / 104,000,000) · 결과 계산 성공 · 취득가액 104,000,000
 *
 * SPL-2: 매수 #2 를 「유상증자」로 바꿔도 결과 동일(엔진에는 매매) · 매수 #3 「무상증자(비과세분)」은
 *        자본조정 안내와 함께 다음 단계로 못 간다 (PR-2 · A안)
 *
 * SPL-3: 단일에서 「상속」(피상속인 취득일 비움) → 분할 전환 → lot 원인을 「매매」로 바꿔도
 *        화면 밖에 남은 단건 원인으로 막히지 않는다 (막다른 오류 — 2026-10-06 재현)
 *
 * SPL-4: 매수 #1 을 1980-06-10 취득으로 — 의제취득일 전 매수 lot 에 영 §176의2④2호 ②
 *        (1주당 floor(10,000 × 50.57 ÷ 39.17) = 12,910) → Step2·결과 취득가액 127,280,000 · 결과 경고 문구
 *
 * SPL-5: 비상장 · 1980 매수 lot · ① 매매사례가액 — Step2 ① 비교 카드 → 미리보기 144,000,000 → 결과 취득가액·개산공제
 *        (영 §176의2④1호 — ① 15,000 > ② 12,910 인 매수 #1 만 ① 채택) · 요청 본문에 신규 필드
 *
 * SPL-6: 코스닥 · 1980 매수 lot · 매도 2건 ① 환산 — 매도 건별 분모 행 · 건별 채택이 갈린다(① 40,000 · ② 12,910)
 *
 * SPL-7: lots-only(일자별 다건) · 코스닥 · ① 환산 — 매트릭스 아래 카드 · 사이드바 취득가액이 엔진과 같다(근사 대체)
 *
 * 실행: E2E_PORT=3217 npx playwright test e2e/stock-transfer-split-lots.spec.ts
 *       스크린샷: E2E_SHOT_DIR=/tmp/shots 를 주면 Step2 입력 카드·결과 카드를 저장한다
 */

import { test, expect, type Page, type Locator } from "@playwright/test";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

async function fillDate(scope: Locator, ymd: string) {
  const [y, m, d] = ymd.split("-");
  await scope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
  await scope.locator('input[type="text"][aria-label="월"]').first().fill(m);
  await scope.locator('input[type="text"][aria-label="일"]').first().fill(d);
}

/** 매수 lot 카드 (`AcquisitionLotCard` — 외곽 ⓐ 박스는 amber-200, 카드는 amber-300) */
const acqCard = (page: Page, n: number) =>
  page.locator("div.border-amber-300").filter({ hasText: `매수 #${n}` });
/** 매도 lot 카드 */
const trnCard = (page: Page, n: number) =>
  page.locator("div.border-emerald-300").filter({ hasText: `매도 #${n}` });

async function fillAcqLot(page: Page, n: number, date: string, shares: string, price: string) {
  const card = acqCard(page, n);
  await fillDate(card, date);
  await card.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill(shares);
  await card.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill(price);
}


async function selectCause(page: Page, n: number, label: string) {
  await acqCard(page, n).getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

test.describe("분할 매수·분할 양도", () => {
  test("SPL-1: 제보 사례 선입선출 — Step2 자동 산출 · 결과 취득가액 104,000,000", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("분할양도예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();

    // ⓐ 매수 3건
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /매수 행 추가/ }).click();
    }
    await fillAcqLot(page, 1, "2024-01-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await acqCard(page, 3).getByRole("combobox").click();
    await page.getByRole("option", { name: "증여", exact: true }).click();

    // ⓑ 매도 1건
    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");

    // D-2: 매도 행의 양도일 세 칸이 카드 안에 다 보인다(3열 배치에서는 오른쪽으로 밀려 잘렸다)
    const dateField = sale.locator('[data-slot="field-card"]').filter({ hasText: "양도일" }).first();
    const fieldBox = (await dateField.boundingBox())!;
    const dayBox = (await sale.locator('input[aria-label="일"]').first().boundingBox())!;
    expect(dayBox.x + dayBox.width).toBeLessThanOrEqual(fieldBox.x + fieldBox.width);

    await page.getByText("선입선출법", { exact: true }).click();
    await page
      .locator('[data-slot="field-card"]')
      .filter({ hasText: "발행주식 총수" })
      .locator("input")
      .first()
      .fill("100000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // D-3: Step2 는 빈 입력칸 대신 1단계에서 산출한 값을 보여준다
    await expect(page.getByTestId("split-preview-transfer-total")).toHaveText("200,000,000");
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("104,000,000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await fillDate(page.locator("body"), "2026-07-31"); // 신고일 (3단계 첫 날짜 칸)

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    // D-4: 종전에는 400 「Validation failed」(입력 방식 기본값 total 이 분할 방어선에 걸림)
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.result.lotMatchingDetail.method).toBe("fifo");
    expect(json.result.transferPrice).toBe(200_000_000);
    expect(json.result.acquisitionPrice).toBe(104_000_000);
    await expect(page.getByText("Validation failed")).toHaveCount(0);
  });
  test("SPL-2: 유상증자 lot 은 매매와 같은 결과 · 비과세 무상주 lot 은 안내 + 진행 차단", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);
    await page.getByPlaceholder("종목명을 입력하세요").fill("증자원인예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /매수 행 추가/ }).click();
    }
    await fillAcqLot(page, 1, "2024-01-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await selectCause(page, 2, "유상증자");
    await selectCause(page, 3, "무상증자 (의제배당 비과세분)");
    await expect(page.getByTestId("lot-bonus-untaxed-notice")).toContainText("자본조정");

    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");

    // 비과세 무상주가 남아 있으면 2단계로 가지 못한다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveCount(0);

    // 과세분으로 바꾸면(액면가 500) 진행 — 선입선출은 매수 #1·#2만 쓰므로 취득가액 104,000,000
    await selectCause(page, 3, "주식배당·무상증자 (과세분)");
    await expect(page.getByTestId("lot-bonus-untaxed-notice")).toHaveCount(0);
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("104,000,000");
  });
  test("SPL-3: 단일 「상속」 잔존값 → 분할 전환 후 막다른 오류 없이 2단계 진입 · 결과 계산", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);
    await page.getByPlaceholder("종목명을 입력하세요").fill("잔존원인예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    // 단일 모드 — 취득일만 넣고 「상속」 선택(피상속인 취득일은 비운다)
    await fillDate(page.locator("body"), "2024-01-10");
    await page.getByRole("radio", { name: /^상속/ }).first().click();
    // 분할 전환 — 첫 매수 건으로 이관된다(원인 「상속」)
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    await selectCause(page, 1, "매매");
    await fillAcqLot(page, 1, "2024-01-10", "8000", "10000");
    await page.getByRole("button", { name: /매수 행 추가/ }).click();
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");

    await page.getByRole("button", { name: /^다음/ }).click();
    // 종전: 「상속의 경우 피상속인 취득일을 입력하세요」 — 분할 화면에는 그 칸이 없다
    await expect(page.getByText("피상속인 취득일을 입력하세요")).toHaveCount(0);
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("104,000,000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await fillDate(page.locator("body"), "2026-07-31");
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.status()).toBe(200);
    expect((await resp.json()).result.acquisitionPrice).toBe(104_000_000);
  });

  test("SPL-4: 1980 매수 lot — 의제취득일 전 ② 적용 · Step2·결과 127,280,000", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("분할양도예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /매수 행 추가/ }).click();
    }
    await fillAcqLot(page, 1, "1980-06-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await selectCause(page, 3, "증여");

    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    // ⑤⑥ 미리보기도 엔진과 같은 순서로 ②를 적용한다
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("127,280,000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await fillDate(page.locator("body"), "2026-07-31");

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.result.acquisitionPrice).toBe(127_280_000);
    expect(json.result.appliedRules).toContain("의제취득일물가상승가산");
    await expect(page.getByText(/매수 lot #1\(1980-06 취득/).first()).toBeVisible({ timeout: 10_000 });
  });

  /** E2E_SHOT_DIR 가 있을 때만 스크린샷 저장 (화면 확인용) */
  async function shot(page: Page, name: string) {
    const dir = process.env.E2E_SHOT_DIR;
    if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }

  /** Step3 → 결과 보기 — 요청 본문과 응답을 돌려준다 */
  async function calcFromStep3(page: Page) {
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await fillDate(page.locator("body"), "2026-07-31");
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calcResponse;
    expect(resp.status()).toBe(200);
    return { body: JSON.parse(resp.request().postData() ?? "{}"), json: await resp.json() };
  }

  /** 라디오는 라벨이 아니라 value 로 집는다 — description 에도 「매매사례가액」이 들어 있어 이름 매칭이 둘을 잡는다 */
  const RADIO_ESTIMATED = 'input[name="preDeemedLotClause1Mode"][value="estimated"]';
  const RADIO_SALE_CASE = 'input[name="preDeemedLotClause1Mode"][value="sale_case"]';
  /** 상장 대주주 — 결과가 비과세(장내 비대주주) 정보용 화면이 아니라 과세 결과 화면으로 가게 한다(결과 카드가 거기에만 있다) */
  async function makeMajorShareholder(page: Page) {
    await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 지분율" }).locator("input").first().fill("5");
    await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 시가총액" }).locator("input").first().fill("6000000000");
  }

  const clause1Card = (page: Page) => page.getByTestId("pre-deemed-lots-clause1-card");

  test("SPL-5: 비상장 1980 lot · ① 매매사례가액 — 카드 입력 → 미리보기 144,000,000 → 결과 취득가액 · 개산공제 800,000", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("분할양도예제");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /매수 행 추가/ }).click();
    await fillAcqLot(page, 1, "1980-06-10", "8000", "10000");
    await fillAcqLot(page, 2, "2025-02-10", "8000", "12000");
    await fillAcqLot(page, 3, "2025-12-24", "4000", "5000");
    await selectCause(page, 3, "증여");
    await page.getByRole("button", { name: /매도 행 추가/ }).click();
    const sale = trnCard(page, 1);
    await fillDate(sale, "2026-05-11");
    await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("10000");
    await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill("20000");
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    // ① 기본은 견주지 않음 — ② 만 적용한 미리보기(127,280,000)와 «① 미산정» 안내
    const card = clause1Card(page);
    await expect(card).toBeVisible();
    await expect(page.getByTestId("pre-deemed-lots-none-note")).toContainText("① 미산정");
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("127,280,000");
    // 비상장은 환산이 막혀 있다(안내) · 매매사례 선택 가능
    await expect(card.locator(RADIO_ESTIMATED)).toBeDisabled();

    await card.locator(RADIO_SALE_CASE).click();
    await card.locator(`div:has(> label:has-text('1주당 취득 매매사례가액')) input[type="text"]`).first().fill("15000");
    await fillDate(card.locator('[data-slot="field-card"]').filter({ hasText: "사례 거래일" }), "1985-12-20");
    await card.locator('[data-field="acquisitionYearNetIncomePerShare"] input').fill("10000");
    await card.locator('[data-field="acquisitionYearNetAssetPerShare"] input').fill("10000");
    await shot(page, "spl5-step2-card");

    // 매수 #1 8,000주만 ① 채택(15,000 > ② 12,910) · 매수 #2 2,000주는 ② — 엔진 anchor 와 같은 144,000,000
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("144,000,000");
    await expect(page.getByTestId("split-preview-basis").first()).toHaveText("① 매매사례");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("pre-deemed-lots-expense-note")).toBeVisible();
    const { body, json } = await calcFromStep3(page);
    expect(body.preDeemedLotClause1).toBe("sale_case");
    expect(body.acquisitionMarketSamplePrice).toBe(15000);
    expect(body.acquisitionYearNetAssetPerShare).toBe(10000);
    expect(json.result.acquisitionPrice).toBe(144_000_000);
    expect(json.result.expenses).toBe(800_000);
    expect(json.result.preDeemedLotsDetail.clause1.settlement.estimatedDeduction).toBe(800_000);

    // 결과 카드 — 건별 ① 채택 · 귀속 근거 · 법령상 명문 없음
    const result = page.getByTestId("pre-deemed-lots-result-card");
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result.getByTestId("pre-deemed-lots-selected").first()).toHaveText("① 채택");
    await expect(result.getByTestId("pre-deemed-lots-settlement")).toContainText("800,000");
    await expect(result.getByTestId("pre-deemed-lots-no-statute")).toContainText("법령상 명문은 없어");
    await shot(page, "spl5-result-card");
  });

  test("SPL-6: 코스닥 1980 lot · 매도 2건 ① 환산 — 매도 건별 분모 · 건별 채택(① 40,000 / ② 12,910) · 취득가액 52,910,000", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("분할양도예제");
    await page.getByRole("radio", { name: "코스닥" }).first().click();
    await page.getByRole("radio", { name: "분할 양도" }).first().click();
    await page.getByRole("button", { name: /매수 행 추가/ }).click();
    await fillAcqLot(page, 1, "1980-06-10", "2000", "10000");
    for (const [n, date, price] of [[1, "2025-12-01", "200000"], [2, "2025-12-02", "180000"]] as const) {
      await page.getByRole("button", { name: /매도 행 추가/ }).click();
      const sale = trnCard(page, n);
      await fillDate(sale, date);
      await sale.locator('[data-slot="field-card"]').filter({ hasText: "주식수" }).locator("input").first().fill("1000");
      await sale.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).first().fill(price);
    }
    await page.getByText("선입선출법", { exact: true }).click();
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
    await makeMajorShareholder(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });

    const card = clause1Card(page);
    await card.locator(RADIO_ESTIMATED).click();
    // 매매사례는 상장에서 막힌다
    await expect(card.locator(RADIO_SALE_CASE)).toBeDisabled();
    await page.getByTestId("pre-deemed-lots-deemed-std").fill("20000");
    // 의제 lot 을 소진하는 매도 2건 모두 분모 행이 있다
    await expect(page.getByTestId("pre-deemed-lots-sale-row-0")).toBeVisible();
    await expect(page.getByTestId("pre-deemed-lots-sale-row-1")).toBeVisible();
    // 분모 미입력이면 다음 단계로 못 간다(⑧)
    await page.getByTestId("pre-deemed-lots-sale-std-0").fill("100000");
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByTestId("pre-deemed-lots-clause1-card")).toBeVisible(); // 2단계에 머문다
    await expect(page.getByText(/매도 #2의 양도일 이전 1개월 종가평균/).first()).toBeVisible();
    await page.getByTestId("pre-deemed-lots-sale-std-1").fill("2000000");
    await shot(page, "spl6-step2-card");

    // 매도 #1 ① 환산 40,000 채택 · 매도 #2 ① 1,800 < ② 12,910 → ② — 미리보기 합 40,000,000 + 12,910,000
    await expect(page.getByTestId("split-preview-acquisition-total")).toHaveText("52,910,000");
    await expect(page.getByTestId("split-preview-basis")).toHaveText(["① 환산", "② 물가상승"]);

    await page.getByRole("button", { name: /^다음/ }).click();
    const { body, json } = await calcFromStep3(page);
    expect(body.preDeemedLotClause1).toBe("estimated");
    expect(body.acquisitionDatePriceAvg1Month).toBe(20000);
    expect(body.transferLots.map((l: { transferStdPricePerShare?: number }) => l.transferStdPricePerShare)).toEqual([100000, 2000000]);
    expect(json.result.acquisitionPrice).toBe(52_910_000);
    expect(json.result.expenses).toBe(200_000);

    const rows = page.getByTestId("pre-deemed-lots-sublot-table").locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("pre-deemed-lots-selected")).toHaveText(["① 채택", "② 채택"]);
    await shot(page, "spl6-result-card");
  });

  test("SPL-7: lots-only(일자별 다건) 코스닥 · ① 환산 — 매트릭스 아래 카드 · 사이드바 취득가액 40,000,000 (엔진 미리보기)", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);

    await page.getByPlaceholder("종목명을 입력하세요").fill("다건예제");
    await page.getByRole("radio", { name: "코스닥" }).first().click();
    const year = page.locator('input[type="text"][aria-label="연도"]');
    const month = page.locator('input[type="text"][aria-label="월"]');
    const day = page.locator('input[type="text"][aria-label="일"]');
    await year.nth(0).fill("1980");
    await month.nth(0).fill("06");
    await day.nth(0).fill("10");
    await year.nth(1).fill("2025");
    await month.nth(1).fill("12");
    await day.nth(1).fill("01");
    await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("1000");
    await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("100000");
    await makeMajorShareholder(page);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await page.locator(`div:has(> label:has-text('양도가액 합계')) input[type="text"]`).first().fill("200000000");
    await page.getByText("일자별 다건", { exact: true }).click();
    // 매수 #1 — 1980-06-10 1,000주 × 10,000
    await year.nth(0).fill("1980");
    await month.nth(0).fill("06");
    await day.nth(0).fill("10");
    await page.locator(`div:has(> label:has-text('주식수')) input[type="text"]`).nth(0).fill("1000");
    await page.locator(`div:has(> label:has-text('1주당 단가')) input[type="text"]`).nth(0).fill("10000");

    // 매트릭스 아래에 카드가 생긴다 · ② 만 적용한 사이드바는 12,910,000
    const card = clause1Card(page);
    await expect(card).toBeVisible();
    await expect(page.getByText("12,910,000").first()).toBeVisible();

    await card.locator(RADIO_ESTIMATED).click();
    await page.getByTestId("pre-deemed-lots-deemed-std").fill("20000");
    await page.getByTestId("pre-deemed-lots-transfer-std").fill("100000");
    await expect(page.getByText("40,000,000").first()).toBeVisible();
    await shot(page, "spl7-step2-card");

    await page.getByRole("button", { name: /^다음/ }).click();
    const { body, json } = await calcFromStep3(page);
    expect(body.preDeemedLotClause1).toBe("estimated");
    expect(body.transferLots[0].transferStdPricePerShare).toBe(100000);
    expect(json.result.acquisitionPrice).toBe(40_000_000);
    expect(json.result.expenses).toBe(200_000);
    expect(json.result.preDeemedLotsDetail).toBeTruthy();
    await expect(page.getByTestId("pre-deemed-lots-result-card")).toBeVisible({ timeout: 60_000 });
  });
});

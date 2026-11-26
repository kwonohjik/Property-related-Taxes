/**
 * E2E: 국외주식(§94①3호다목) 이월과세 §97의2① — 폼 → request body → 세액 → 결과 카드
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §8.2
 *
 * ⚠️ **anchor가 증명하지 못하는 것을 여기서 증명한다** — 「입력 UI가 실제로 존재하고, 거기 넣은 값이
 *    request body를 거쳐 세액까지 간다」. anchor는 폼 객체에서 출발하므로 UI가 없어도 통과한다
 *    (메모리 `feedback_api_trigger_without_input_path_is_noop`).
 *
 * 사례(FC-1) — 100주 · USD
 *   증여자 취득  2025-08-01  1주 400 @1,250  = 50,000,000
 *   수증(증여)   2026-01-05  1주 800 @1,250  = 100,000,000 (증여세 0 — 배우자 공제)
 *   양도         2026-12-02  1주 2,000 @1,500 = 300,000,000
 *   A(적용)   양도차익 250,000,000 → 과세표준 247,500,000 × 20% = 49,500,000
 *   B(미적용) 양도차익 200,000,000 → 과세표준 197,500,000 × 20% = 39,500,000   ⇒ A 채택
 *
 * 실행(워크트리): E2E_PORT=3210 npx playwright test e2e/foreign-stock-carryover-97-2.spec.ts
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_worktree_e2e_port_isolation]]
 *
 * FC-1 토글 ON/OFF 입력 칸 출현(긍정·부정 짝) · FC-2 49,500,000 도달 · FC-3 OFF 회귀(숨은 값이 새지 않는다)
 * FC-4 증여자 취득가액 미입력 차단(2단계) · FC-5 증여세 안분 분자·분모 차단(3단계)
 * FC-6 혼합 다건(이월과세 종목이 마지막이 아님) 카드 표시 · FC-7 국내 → 국외 전환 시 국내 원화 값 미혼입
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { gotoStockTransferTax, fillByLabel, fillStep1 } from "./_helpers/stock-item-fill";
import { chooseAcqPerShare } from "./_helpers/stock-acq-input-mode";

const CARD_TITLE = "§97의2① 이월과세 — 적용 / 미적용 비교";

/** 라벨이 **정확히** 일치하는 FieldCard의 텍스트 입력 — 「취득일 기준환율」이 「증여자 취득일 기준환율」을 잡지 않게 */
function cardInput(page: Page, label: string): Locator {
  return page
    .locator('[data-slot="field-card"]')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input[type="text"]')
    .first();
}

/** 날짜 FieldCard(연·월·일 세 칸) 채우기 */
async function fillDateCard(page: Page, label: string, ymd: [string, string, string]) {
  const card = page
    .locator('[data-slot="field-card"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await card.locator('input[aria-label="연도"]').fill(ymd[0]);
  await card.locator('input[aria-label="월"]').fill(ymd[1]);
  await card.locator('input[aria-label="일"]').fill(ymd[2]);
}

const gateSwitch = (page: Page) => page.getByTestId("fg-carryover-toggle").getByRole("switch").first();

/** 게이트 토글을 원하는 상태로 — 이미 그 상태면 누르지 않는다(재클릭은 토글을 되돌린다) */
async function setGate(page: Page, on: boolean) {
  const sw = gateSwitch(page);
  if ((await sw.getAttribute("aria-checked")) === String(on)) return;
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
}

/**
 * 1단계 전체 — 토글 ON이면 라벨이 「수증일」로 바뀌므로 토글 상태에 맞는 라벨을 쓴다.
 * (토글을 먼저 정한 뒤 날짜를 채운다)
 */
async function fillForeignStep1Full(page: Page, name: string, carry: boolean) {
  await page.getByPlaceholder("종목명을 입력하세요").fill(name);
  await page.getByRole("radio", { name: "해외주식" }).first().click();
  await fillByLabel(page, "국내 거주 연수", "7");
  await setGate(page, carry);
  await fillDateCard(page, carry ? "수증일" : "취득일", ["2026", "01", "05"]);
  await fillDateCard(page, "양도일", ["2026", "12", "02"]);
  await fillByLabel(page, "양도 주식수", "100");
  if (carry) {
    await fillDateCard(page, "증여자 취득일", ["2025", "08", "01"]);
    await page.getByRole("radio", { name: "배우자" }).first().click();
  }
}

/** 2단계 — 양도·취득(수증일 평가액) 금액. 증여자 취득가액은 따로 채운다. */
async function fillForeignStep2Base(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도가액 — 원화 환산 (§178의5)")).toBeVisible({ timeout: 10_000 });
  await cardInput(page, "양도일 기준환율").fill("1500");
  await cardInput(page, "1주당 양도가액 (외화)").fill("2000");
  await cardInput(page, "취득일 기준환율").fill("1250");
  await cardInput(page, "1주당 취득가액 (외화)").fill("800");
}

async function fillDonorPrice(page: Page) {
  await cardInput(page, "증여자 취득일 기준환율").fill("1250");
  await cardInput(page, "1주당 증여자 취득가액 (외화)").fill("400");
}

async function toStep3(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
}

/** 3단계 신고일 — 첫 날짜 칸이 신고일이다 */
async function fillFilingDate(page: Page) {
  await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2027");
  await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("02");
  await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("26");
}

function waitCalc(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
    { timeout: 60_000 },
  );
}

const DONOR_BODY_KEYS = [
  "acquisitionCause",
  "donorRelation",
  "donorAcquisitionDate",
  "donorAcquisitionMode",
  "donorPerShareAcquisitionPriceForeign",
  "donorAcquisitionCurrencyCode",
  "donorAcquisitionExchangeRate",
];

test.describe("국외주식 이월과세 §97의2① — 폼 → 세액 → 결과", () => {
  test("FC-1: 토글 ON이면 증여자 칸이 나타나고 OFF면 없다 (부정 + 긍정 짝) · 취득일 → 수증일", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await page.getByPlaceholder("종목명을 입력하세요").fill("FC Corp");
    await page.getByRole("radio", { name: "해외주식" }).first().click();
    await expect(page.getByTestId("fg-carryover-toggle")).toBeVisible();

    // 부정 — OFF
    await expect(gateSwitch(page)).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("증여자 취득일", { exact: true })).toHaveCount(0);
    await expect(page.getByText("증여자와의 관계 (§97의2① 본문)")).toHaveCount(0);
    await expect(page.getByText("수증일", { exact: true })).toHaveCount(0);

    // 긍정 짝 — ON
    await setGate(page, true);
    await expect(page.getByText("증여자 취득일", { exact: true })).toBeVisible();
    await expect(page.getByText("증여자와의 관계 (§97의2① 본문)")).toBeVisible();
    await expect(page.getByText("수증일", { exact: true })).toBeVisible();
    // 토글을 켠 상태에서 2·3단계 입력 안내
    await expect(page.getByTestId("fg-carryover-toggle")).toContainText("2단계");
    await expect(page.getByTestId("fg-carryover-toggle")).toContainText("3단계");

    // 다시 OFF → 칸이 사라진다
    await setGate(page, false);
    await expect(page.getByText("증여자 취득일", { exact: true })).toHaveCount(0);
    await expect(page.getByText("수증일", { exact: true })).toHaveCount(0);
  });

  test("FC-2: 입력이 body → 세액 → 결과 카드까지 도달한다 (49,500,000 · 비교 카드)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1Full(page, "FC2 Corp", true);
    await fillForeignStep2Base(page);

    // 2단계 §3 — 증여자 취득가액(외화 + 증여자 취득일 환율)
    await expect(page.getByText("증여자 취득가액 — 이월과세 (§97의2①1호 · 영 §178의5)")).toBeVisible();
    await fillDonorPrice(page);
    // 400 × 100주 × 1,250 = 50,000,000 — 화면이 원화 환산 참고를 보인다
    await expect(page.getByText("증여자 취득가액(원화 환산 참고): 50,000,000")).toBeVisible();

    await toStep3(page);
    await fillFilingDate(page);

    const calc = waitCalc(page);
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calc;
    expect(resp.ok(), await resp.text()).toBeTruthy();

    // ⑬ body — 13개 계약 키가 실렸다 (여기가 비면 엔진만 고친 no-op이다)
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.marketType).toBe("foreign_stock");
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.donorRelation).toBe("spouse");
    expect(body.donorAcquisitionDate).toBe("2025-08-01");
    expect(body.donorAcquisitionMode).toBe("actual");
    expect(body.donorPerShareAcquisitionPriceForeign).toBe(400);
    expect(body.donorAcquisitionCurrencyCode).toBe("USD");
    expect(body.donorAcquisitionExchangeRate).toBe(1250);
    // 국내 원화 필드는 섞이지 않는다
    expect(body).not.toHaveProperty("donorAcquisitionPrice");
    expect(body).not.toHaveProperty("donorCapitalExpenditure");

    // 세액 — 엔진 실측으로 교재 값(49,500,000)이 나온다
    const json = await resp.json();
    expect(json.result.incomeTax).toBe(49_500_000);
    expect(json.result.carryoverOutcome).toBe("applied");
    expect(json.result.carryoverComparison).toEqual({ appliedTotalTax: 49_500_000, excludedTotalTax: 39_500_000 });

    // ⑦ 결과 카드 — 비교 카드와 두 결정세액
    const card = page.locator("div.rounded-lg").filter({ has: page.getByText(CARD_TITLE) }).last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("49,500,000");
    await expect(card).toContainText("39,500,000");
    await expect(card).toContainText("취득가액 (원화 환산)");
    await expect(card).not.toContainText("세율 보유기간");
    // 취득가액 행이 증여자 취득 당시 승계로 바뀐다
    await expect(page.getByText("취득가액 (외화) — 증여자 취득 당시 승계 (이월과세)")).toBeVisible();
  });

  test("FC-3 [회귀]: 토글 OFF면 donor 값이 남아 있어도 body에 안 실리고 39,500,000이다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    // ON으로 donor 값을 모두 채운 뒤 …
    await fillForeignStep1Full(page, "FC3 Corp", true);
    await fillForeignStep2Base(page);
    await fillDonorPrice(page);

    // … 1단계로 돌아가 OFF (값은 store에 남는다)
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByTestId("fg-carryover-toggle")).toBeVisible({ timeout: 10_000 });
    await setGate(page, false);
    await expect(page.getByText("증여자 취득일", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도가액 — 원화 환산 (§178의5)")).toBeVisible({ timeout: 10_000 });
    // 2단계에도 증여자 섹션이 없다
    await expect(page.getByText("증여자 취득가액 — 이월과세")).toHaveCount(0);
    await toStep3(page);
    await fillFilingDate(page);

    const calc = waitCalc(page);
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calc;
    expect(resp.ok(), await resp.text()).toBeTruthy();
    const body = JSON.parse(resp.request().postData() ?? "{}");
    for (const k of DONOR_BODY_KEYS) expect(body, k).not.toHaveProperty(k);

    const json = await resp.json();
    expect(json.result.incomeTax).toBe(39_500_000);
    expect(json.result.carryoverOutcome).toBeUndefined();
    await expect(page.getByText(CARD_TITLE)).toHaveCount(0);
  });

  test("FC-4: 증여자 1주당 취득가액을 비우면 2단계에서 막힌다 (자동 보정 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1Full(page, "FC4 Corp", true);
    await fillForeignStep2Base(page);
    // 증여자 환율만 넣고 취득가는 비운다
    await cardInput(page, "증여자 취득일 기준환율").fill("1250");

    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("증여자 1주당 취득가액 (외화)을 입력하세요").first()).toBeVisible({ timeout: 10_000 });
    // 3단계로 넘어가지 않았다
    await expect(page.getByText("증여자 자본적지출액 (외화)")).toHaveCount(0);
  });

  test("FC-5: 증여세 산출세액만 넣으면 3단계에서 안분 분자·분모를 요구한다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await fillForeignStep1Full(page, "FC5 Corp", true);
    await fillForeignStep2Base(page);
    await fillDonorPrice(page);
    await toStep3(page);
    await fillFilingDate(page);

    await expect(page.getByText("증여자 자본적지출액 (외화)")).toBeVisible();
    await cardInput(page, "증여세 산출세액 (§97의2①3호)").fill("1000000");

    let posted = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/stock-transfer") && r.method() === "POST") posted = true;
    });
    await page.getByRole("button", { name: "결과 보기" }).click();
    await expect(
      page.getByText("양도한 해당 자산가액(증여세 안분 분자)을 입력하세요").first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(posted).toBe(false);
  });

  test("FC-6: 혼합 다건 — 이월과세 국외 종목이 마지막이 아니어도 A/B 카드가 뜬다 (Q-8 · V-5)", async ({ page }) => {
    test.setTimeout(240_000);
    await gotoStockTransferTax(page);

    // 종목 1 — 국외 이월과세 (확정 → 목록에 쌓인다)
    await fillForeignStep1Full(page, "국외이월", true);
    await fillForeignStep2Base(page);
    await fillDonorPrice(page);
    await toStep3(page);
    await fillFilingDate(page);
    await page.getByTestId("stock-item-add").click();
    await expect(page.getByText(/양도 종목 \(2건\)/)).toBeVisible({ timeout: 15_000 });

    // 종목 2 — 국내 비상장(비이월) · 같은 과세기간(2026) 양도 — 마지막 종목이 된다
    await fillStep1(page, "국내일반", { y: "2026", m: "12", d: "02" });
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
    await fillByLabel(page, "양도가액 합계", "100000000");
    await chooseAcqPerShare(page);
    await fillByLabel(page, "1주당 취득가액", "500000");
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });

    const calc = waitCalc(page);
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calc;
    expect(resp.ok(), await resp.text()).toBeTruthy();
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.items).toHaveLength(2);
    // 국외 종목이 첫째 — 이월과세 body가 items[0]에 실렸다
    expect(body.items[0].marketType).toBe("foreign_stock");
    expect(body.items[0].acquisitionCause).toBe("carryover_gift");
    expect(body.items[1].marketType).not.toBe("foreign_stock");

    const json = await resp.json();
    expect(json.result.items[0].carryoverDetail.outcome).toBe("applied");
    expect(json.result.items[1].carryoverDetail).toBeUndefined();

    // 대표 결과(마지막 종목)에는 이월과세가 없는데도 첫째 종목 카드가 뜬다
    const cards = page.locator("p").filter({ hasText: CARD_TITLE });
    await expect(cards).toHaveCount(1, { timeout: 30_000 });
    await expect(cards.first()).toContainText("종목 1");
  });

  test("FC-7: 국내에서 이월과세를 고르고 해외로 전환해도 국내 원화 값이 body에 섞이지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await page.getByPlaceholder("종목명을 입력하세요").fill("FC7 Corp");
    await page.getByRole("radio", { name: "비상장" }).first().click();
    await page.getByRole("radio", { name: "이월과세(증여)" }).first().click();
    // 국내 원화 donor 값을 넣어 둔다
    await fillByLabel(page, "증여자 취득가액", "30000");

    // 해외주식으로 전환 — 게이트 토글은 raw acquisitionCause를 읽어 ON으로 보인다
    await page.getByRole("radio", { name: "해외주식" }).first().click();
    await expect(page.getByTestId("fg-carryover-toggle")).toBeVisible();
    await expect(gateSwitch(page)).toHaveAttribute("aria-checked", "true");

    await fillByLabel(page, "국내 거주 연수", "7");
    await fillDateCard(page, "수증일", ["2026", "01", "05"]);
    await fillDateCard(page, "양도일", ["2026", "12", "02"]);
    await fillByLabel(page, "양도 주식수", "100");
    await fillDateCard(page, "증여자 취득일", ["2025", "08", "01"]);
    await page.getByRole("radio", { name: "배우자" }).first().click();
    await fillForeignStep2Base(page);
    await fillDonorPrice(page);
    await toStep3(page);
    await fillFilingDate(page);

    const calc = waitCalc(page);
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calc;
    expect(resp.ok(), await resp.text()).toBeTruthy();
    const body = JSON.parse(resp.request().postData() ?? "{}");
    expect(body.acquisitionCause).toBe("carryover_gift");
    expect(body.donorPerShareAcquisitionPriceForeign).toBe(400);
    // 국내 원화 1주당 30,000이 외화 단가로 재해석되지 않는다
    expect(body).not.toHaveProperty("donorAcquisitionPrice");
    const json = await resp.json();
    expect(json.result.incomeTax).toBe(49_500_000);
  });
});

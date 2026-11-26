/**
 * E2E: 주식 §97의2④ 가업상속공제 의제 취득가액 — 폼 → request body → 세액 → 결과 카드 (PR-1d 단건 취득)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.4
 *
 * ⚠️ anchor가 증명하지 못하는 것을 여기서 증명한다 — 「입력 UI가 실제로 존재하고, 거기 넣은 값이 request body를
 *    거쳐 세액까지 간다」(`feedback_api_trigger_without_input_path_is_noop`). anchor는 폼 객체에서 출발해 UI가 없어도 통과한다.
 *
 * 사례(계획서 §7.2 F1-2) — 비상장 대주주 비중소 · 1만 주
 *   상속 2024-03-01 · 상속개시일 평가액 5만/주(5억) · 피상속인 취득 5천/주 · 양도 2026-06-01 8만/주(8억)
 *   법인 총자산 50억 / 사업무관 10억 → 적용률 4/5
 *   의제 취득가액 = 5천 × 1만 × 4/5 + 5억 × 1/5 = 40,000,000 + 100,000,000 = 140,000,000
 *   양도소득금액 660,000,000 → 과세표준 657,500,000 → 산출세액 149,375,000 (§18의2⑩ 공제 89,875,000 — 이 양도세에서 빼지 않음)
 *
 * FB-1 카드 노출·토글 · era 쌍(법인) · 사이드바 의제값(상속평가 아님) · request body · 세액 · 결과 카드·신고서 라벨
 * FB-2 양도일을 경계 건너(2026-02-26)로 바꾸면 쌍이 구 ③으로 바뀌고 새 쌍은 빈칸 → 2단계 차단(조용한 전환 없음)
 * FB-3 취득원인이 매매면 카드가 없다(대조군) · 환산 모드에서는 disabled
 *
 * 실행(워크트리): E2E_PORT=3147 npx playwright test e2e/stock-fb-97-2-4.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { gotoStockTransferTax, fillByLabel } from "./_helpers/stock-item-fill";
import { chooseAcqPerShare } from "./_helpers/stock-acq-input-mode";

/** 날짜 FieldCard(연·월·일 세 칸) 채우기 — 라벨이 정확히 일치하는 카드로 한정(`e2e/CLAUDE.md` §1) */
async function fillDateCard(page: Page, label: string, ymd: [string, string, string]) {
  const card = page.locator('[data-slot="field-card"]').filter({ has: page.getByText(label, { exact: true }) }).first();
  await card.locator('input[aria-label="연도"]').fill(ymd[0]);
  await card.locator('input[aria-label="월"]').fill(ymd[1]);
  await card.locator('input[aria-label="일"]').fill(ymd[2]);
}

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="종목명을 입력하세요"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

/** 1단계 — 비상장 대주주 · 상속 · 1만 주 */
async function fillStep1(page: Page, transferYmd: [string, string, string]) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("가업상속예제");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  await page.getByRole("radio", { name: /^상속/ }).first().click();
  await fillDateCard(page, "취득일", ["2024", "03", "01"]);
  await fillDateCard(page, "피상속인 취득일 (§104②1)", ["2015", "01", "01"]);
  await fillDateCard(page, "양도일", transferYmd);
  // 대주주 — 비상장은 지분율·시가총액 중 하나로 자동 판정된다
  await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 지분율" }).locator("input").first().fill("60");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 시가총액" }).locator("input").first().fill("2000000000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("10000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("1000000");
}

async function toStep2(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
}

const fbSwitch = (page: Page) => page.getByTestId("stock-fb-toggle").getByRole("switch").first();

/** 토글을 원하는 상태로 — 이미 그 상태면 누르지 않는다(재클릭은 토글을 되돌린다 · e2e/CLAUDE.md §6-1) */
async function setFb(page: Page, on: boolean) {
  const sw = fbSwitch(page);
  if ((await sw.getAttribute("aria-checked")) === String(on)) return;
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
}

async function fillStep2Basics(page: Page) {
  await fillByLabel(page, "양도가액 합계", "800000000");
  await chooseAcqPerShare(page);
  await fillByLabel(page, "1주당 취득가액", "50000");
}

/** CurrencyInput의 data-testid는 내부 input에 붙는다 */
const tid = (page: Page, id: string) => page.getByTestId(id);

test.describe("주식 §97의2④ 가업상속공제 의제 취득가액", () => {
  test("FB-1: 입력 → 사이드바 의제값 → body → 산출세액 149,375,000 → 결과 카드", async ({ page }) => {
    test.setTimeout(150_000);
    await gotoStockTransferTax(page);
    await waitHydrated(page);

    await fillStep1(page, ["2026", "06", "01"]);
    await toStep2(page);
    await fillStep2Basics(page);

    // 카드 노출·토글 — 켜기 전에는 입력칸이 없다
    await expect(page.getByTestId("stock-fb-toggle")).toBeVisible();
    await expect(page.getByTestId("stock-fb-body")).toHaveCount(0);
    await setFb(page, true);
    await expect(page.getByTestId("stock-fb-body")).toBeVisible();

    // 양도일 2026-06-01 → 법인 ③2호 쌍(총자산·사업무관자산). % 직접 입력·구 쌍은 없다
    await expect(page.getByTestId("stock-fb-pair-corporate")).toBeVisible();
    await expect(page.getByTestId("stock-fb-pair-deduction")).toHaveCount(0);

    // 사이드바 — 결과 전 취득가액은 상속평가 × 주식수(500,000,000)가 아니라 의제값이 되어야 한다.
    // 입력 전에는 행을 생략한다(그럴듯한 오답 금지).
    const sidebar = page.locator("aside, [data-testid='wizard-sidebar']").first();
    await expect(page.getByText("취득가액 (§97의2④ 의제)")).toHaveCount(0);

    await tid(page, "stock-fb-decedent-per-share").fill("5000");
    await tid(page, "stock-fb-corp-total-assets").fill("5000000000");
    await tid(page, "stock-fb-corp-non-business").fill("1000000000");

    await expect(page.getByTestId("stock-fb-preview")).toContainText("140,000,000");
    await expect(page.getByText("취득가액 (§97의2④ 의제)").first()).toBeVisible();
    await expect(page.getByText("140,000,000").first()).toBeVisible();
    void sidebar;

    // Step 3 — 신고일 후 계산
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("필요경비·신고").first()).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="text"][aria-label="연도"]').nth(0).fill("2026");
    await page.locator('input[type="text"][aria-label="월"]').nth(0).fill("08");
    await page.locator('input[type="text"][aria-label="일"]').nth(0).fill("31");

    const calc = page.waitForResponse(
      (r) => r.url().includes("/api/calc/stock-transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "결과 보기" }).click();
    const resp = await calc;
    expect(resp.ok()).toBeTruthy();

    // ⑬ request body — 신규 입력이 실제로 실렸는가 (⑫⑭ 침묵 strip 탐지)
    const req = JSON.parse(resp.request().postData() ?? "{}");
    expect(req.familyBusinessInheritance).toEqual({
      decedentAcquisitionPricePerShare: 5_000,
      fbRateBasis: { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
    });

    // 세액까지 도달
    const json = await resp.json();
    expect(json.result.acquisitionPrice).toBe(140_000_000);
    expect(json.result.calculatedTax).toBe(149_375_000);
    expect(json.result.familyBusinessDetail.creditAmount).toBe(89_875_000);

    // ⑦ 결과 카드 — 의제 취득가액 · 법정량 · §18의2⑩(이 양도세에서 빼지 않음)
    await expect(page.getByText("가업상속공제 주식 양도세 특례").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("fb-rate-basis-row").first()).toContainText("법인 총자산가액 5,000,000,000");
    await expect(page.getByText("의제 취득가액 (원취득가 × 80.00% + 평가액 × 20.00%)").first()).toBeVisible();
    // 별지 제84호 취득가액 라벨
    await expect(page.getByText("11. 취득가액 (② = 의제 취득가액 · 소득세법 §97의2④)").first()).toBeAttached();
  });

  test("FB-2: 양도일을 경계 건너로 바꾸면 쌍이 바뀌고 새 쌍은 빈칸 → 2단계에서 차단", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await waitHydrated(page);

    await fillStep1(page, ["2026", "06", "01"]);
    await toStep2(page);
    await fillStep2Basics(page);
    await setFb(page, true);
    await tid(page, "stock-fb-decedent-per-share").fill("5000");
    await tid(page, "stock-fb-corp-total-assets").fill("5000000000");
    await tid(page, "stock-fb-corp-non-business").fill("1000000000");
    await expect(page.getByTestId("stock-fb-preview")).toBeVisible();

    // 1단계로 돌아가 양도일을 2026-02-26(구 ③)으로 — 사이드바 단계 이동
    await page.getByRole("button", { name: /^자산·시장·대주주 단계로 이동/ }).click();
    await fillDateCard(page, "양도일", ["2026", "02", "26"]);
    await toStep2(page);

    // 쌍이 구 ③으로 바뀌고 새 쌍은 빈칸이다 — 조용한 전환(자동 채움)이 없다. 미리보기도 사라진다
    await expect(page.getByTestId("stock-fb-pair-deduction")).toBeVisible();
    await expect(page.getByTestId("stock-fb-pair-corporate")).toHaveCount(0);
    await expect(tid(page, "stock-fb-deduction-amount")).toHaveValue("");
    await expect(page.getByTestId("stock-fb-preview")).toHaveCount(0);

    // 다음 단계 진입이 막힌다(⑧) — 2단계에 머문다
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("가업상속공제금액을 입력하세요").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("stock-fb-toggle")).toBeVisible();
  });

  test("FB-3: 대조군 — 취득원인 매매면 카드가 없고, 환산 모드에서는 disabled", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await waitHydrated(page);

    await fillStep1(page, ["2026", "06", "01"]);
    await toStep2(page);
    await fillStep2Basics(page);
    await expect(page.getByTestId("stock-fb-toggle")).toBeVisible();

    // 환산 모드 — 카드는 보이되 입력을 받지 않는다(OFF도 tone 유지)
    await page.getByRole("radio", { name: "환산취득가" }).first().click();
    await expect(page.getByTestId("stock-fb-toggle")).toContainText("실지거래가액");
    await expect(page.getByTestId("stock-fb-body")).toHaveCount(0);
    await expect(fbSwitch(page)).toBeDisabled();

    // 취득원인 매매 — 카드 자체가 없다
    await page.getByRole("button", { name: /^자산·시장·대주주 단계로 이동/ }).click();
    await page.getByRole("radio", { name: /^매매/ }).first().click();
    await toStep2(page);
    await expect(page.getByTestId("stock-fb-toggle")).toHaveCount(0);
  });
});

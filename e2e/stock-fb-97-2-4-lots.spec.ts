/**
 * E2E: 주식 §97의2④ 가업상속공제 의제 취득가액 — **취득 lot(일자별 다건) 카드** → request body → 세액 → 결과 (PR-1d′)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.7 (F1-10 혼재 사례)
 *
 * ⚠️ anchor가 증명하지 못하는 것을 여기서 증명한다 — 「lot 카드의 입력칸이 실제로 존재하고, 거기 넣은 값이 request body의
 *    acquisitionLots[i].familyBusinessInheritance를 거쳐 세액까지 간다」(`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 사례 — 비상장 대주주 비중소 · 일자별 다건 취득 · fifo · 양도 2026-06-01 5,000주 @8만(합계 4억)
 *   매수 #1 매매 2023-01-10 2,000주 @3만 · 매수 #2 일반 상속 2024-01-15 1,000주 @4만 ·
 *   매수 #3 가업 상속 2024-03-01 6,000주 (상속평가 5만/주 · 피상속인 5천/주 · 자본적지출 총액 1,200만 ·
 *   법인 총자산 50억 / 사업무관 10억 → 적용률 4/5)
 *   FIFO: #1 2,000 · #2 1,000 · #3 2,000 → #3 의제 취득원가 = ⌊(5,000×2,000 + 4,000,000) × 4/5⌋ + ⌊50,000×2,000 × 1/5⌋ = 31,200,000
 *   취득가액 합 131,200,000 · 양도소득금액 268,800,000 · 산출세액 53,260,000 · §18의2⑩ 공제 13,760,000
 *   (엔진 anchor `fb-97-2-4-stock-lots.anchor.test.ts` F1-10 손계산과 같은 값)
 *
 * FBL-1 lot 카드(상속 lot에만) · 입력 → 사이드바 의제 라벨 · request body(acquisitionLots[2]) · 세액 · 결과 카드(취득원가 열)
 * FBL-2 가업 lot 필수 입력(피상속인 1주당)을 비우면 2단계에서 차단(⑧ lot 축)
 *
 * 실행(워크트리): E2E_PORT=3147 npx playwright test e2e/stock-fb-97-2-4-lots.spec.ts
 */

import { test, expect, type Locator, type Page } from "@playwright/test";
import { gotoStockTransferTax, fillByLabel } from "./_helpers/stock-item-fill";

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

/** 1단계 — 비상장 대주주 · 매매(단건 원인은 기본) · 5,000주 양도 */
async function fillStep1(page: Page) {
  await page.getByPlaceholder("종목명을 입력하세요").fill("가업상속로트예제");
  await page.getByRole("radio", { name: "비상장" }).first().click();
  await fillDateCard(page, "취득일", ["2023", "01", "10"]);
  await fillDateCard(page, "양도일", ["2026", "06", "01"]);
  await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 지분율" }).locator("input").first().fill("60");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "본인 단독 시가총액" }).locator("input").first().fill("2000000000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "양도 주식수" }).locator("input").first().fill("5000");
  await page.locator('[data-slot="field-card"]').filter({ hasText: "발행주식 총수" }).locator("input").first().fill("1000000");
}

async function toStep2(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.getByText("양도·취득가액").first()).toBeVisible({ timeout: 10_000 });
}

/** 매수 lot 카드 — 「매수 #n」 라벨을 가진 가장 바깥 카드 */
function lotCard(page: Page, n: number): Locator {
  return page.locator("div.rounded.border.border-amber-300").filter({ hasText: `매수 #${n}` }).first();
}

/** lot 카드 안 FieldCard를 라벨 머리글자로 집는다 — 「주식수」는 「이 양도에 배정 수량」과 구분하려 정규식으로 앵커한다 */
const fieldIn = (card: Locator, label: RegExp) => card.locator('[data-slot="field-card"]').filter({ hasText: label }).first();

async function fillLot(
  page: Page,
  n: number,
  v: { date: [string, string, string]; cause?: "상속"; shares: string; perShare: string; decedent?: [string, string, string] },
) {
  const card = lotCard(page, n);
  await card.locator('input[aria-label="연도"]').first().fill(v.date[0]);
  await card.locator('input[aria-label="월"]').first().fill(v.date[1]);
  await card.locator('input[aria-label="일"]').first().fill(v.date[2]);
  if (v.cause) {
    await fieldIn(card, /^취득원인/).locator('[role="combobox"]').click();
    await page.getByRole("option", { name: v.cause, exact: true }).click();
  }
  await fieldIn(card, /^주식수/).locator("input").first().fill(v.shares);
  await card.locator("div:has(> label:has-text('1주당 단가')) input[type='text']").first().fill(v.perShare);
  if (v.decedent) {
    const d = fieldIn(card, /^피상속인 취득일/);
    await d.locator('input[aria-label="연도"]').fill(v.decedent[0]);
    await d.locator('input[aria-label="월"]').fill(v.decedent[1]);
    await d.locator('input[aria-label="일"]').fill(v.decedent[2]);
  }
}

const tid = (page: Page, id: string) => page.getByTestId(id);

test.describe("주식 §97의2④ 가업상속공제 — 취득 lot(일자별 다건) 카드", () => {
  test("FBL-1: lot 입력 → 사이드바 → body(acquisitionLots[2]) → 산출세액 53,260,000 → 결과 카드", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStockTransferTax(page);
    await waitHydrated(page);

    await fillStep1(page);
    await toStep2(page);
    await fillByLabel(page, "양도가액 합계", "400000000");

    // 취득가액 입력방식 → 일자별 다건 (lot 1건이 자동 생성된다) → 2건 더
    await page.getByText("일자별 다건", { exact: true }).click();
    await expect(lotCard(page, 1)).toBeVisible();
    await page.getByRole("button", { name: "+ 매수 행 추가" }).click();
    await page.getByRole("button", { name: "+ 매수 행 추가" }).click();
    await expect(lotCard(page, 3)).toBeVisible();

    await fillLot(page, 1, { date: ["2023", "01", "10"], shares: "2000", perShare: "30000" });
    await fillLot(page, 2, { date: ["2024", "01", "15"], cause: "상속", shares: "1000", perShare: "40000", decedent: ["2015", "01", "01"] });
    await fillLot(page, 3, { date: ["2024", "03", "01"], cause: "상속", shares: "6000", perShare: "50000", decedent: ["2015", "01", "01"] });

    // 카드 노출 — 매매 lot(#1)에는 없고, 상속 lot(#2·#3)에만 있다. 켜기 전에는 입력칸이 없다
    await expect(tid(page, "stock-fb-lot-0-toggle")).toHaveCount(0);
    await expect(tid(page, "stock-fb-lot-1-toggle")).toBeVisible();
    await expect(tid(page, "stock-fb-lot-2-toggle")).toBeVisible();
    await expect(tid(page, "stock-fb-lot-2-body")).toHaveCount(0);

    // 단건 카드는 lot 모드에서 안내만 한다
    // (단건 취득원인이 매매라 카드가 아예 없다 — 종목 축 입력은 존재하지 않는다)
    await expect(tid(page, "stock-fb-toggle")).toHaveCount(0);

    // 사이드바 — 가업 입력 전에는 일반값(평가 × 배정 주식수 = 200,000,000)
    await expect(page.getByText("취득가액 (§97의2④ 의제 포함)")).toHaveCount(0);

    // #3 가업 ON — 양도일 2026-06-01 → 법인 ③2호 쌍
    const sw = tid(page, "stock-fb-lot-2-toggle").getByRole("switch").first();
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(tid(page, "stock-fb-lot-2-pair-corporate")).toBeVisible();
    await expect(tid(page, "stock-fb-lot-2-pair-deduction")).toHaveCount(0);
    // 이력 불러오기·단건 미리보기는 lot에 없다
    await expect(tid(page, "stock-fb-lookup-open")).toHaveCount(0);

    await tid(page, "stock-fb-lot-2-decedent-per-share").fill("5000");
    await tid(page, "stock-fb-lot-2-decedent-capex").fill("12000000");
    await tid(page, "stock-fb-lot-2-corp-total-assets").fill("5000000000");
    await tid(page, "stock-fb-lot-2-corp-non-business").fill("1000000000");

    // 사이드바 — 엔진 배정값(의제 포함) 131,200,000, 상속평가 그대로(160,000,000)가 아니다
    await expect(page.getByText("취득가액 (§97의2④ 의제 포함)").first()).toBeVisible();
    await expect(page.getByText("131,200,000").first()).toBeVisible();

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

    // ⑬ request body — lot 축에만 실렸다(종목 축 familyBusinessInheritance는 없다). ⑫⑭ 침묵 strip 탐지
    const req = JSON.parse(resp.request().postData() ?? "{}");
    expect(req.familyBusinessInheritance).toBeUndefined();
    const lots = req.acquisitionLots as Array<Record<string, unknown>>;
    expect(lots).toHaveLength(3);
    expect(lots[0].familyBusinessInheritance).toBeUndefined();
    expect(lots[1].familyBusinessInheritance).toBeUndefined();
    expect(lots[2].familyBusinessInheritance).toEqual({
      decedentAcquisitionPricePerShare: 5_000,
      decedentCapitalExpenditure: 12_000_000,
      fbRateBasis: { kind: "corporate_business_assets", totalAssets: 5_000_000_000, nonBusinessAssets: 1_000_000_000 },
    });

    // 세액까지 도달 — 엔진 anchor F1-10 손계산과 같다
    const json = await resp.json();
    expect(json.result.acquisitionPrice).toBe(131_200_000);
    expect(json.result.calculatedTax).toBe(53_260_000);
    expect(json.result.familyBusinessDetail.imputedAcquisitionPrice).toBe(31_200_000);
    expect(json.result.familyBusinessDetail.creditAmount).toBe(13_760_000);

    // ⑦ 결과 — 비교 카드 · 로트별 매칭 상세의 취득원가 열(가업 행 = 총액 31,200,000)
    await expect(page.getByText("가업상속공제 주식 양도세 특례").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("fb-rate-basis-row").first()).toContainText("법인 총자산가액 5,000,000,000");
    const costs = await page.getByTestId("lot-detail-row-cost").allTextContents();
    expect(costs).toEqual(["60,000,000", "40,000,000", "31,200,000"]);
    await expect(page.getByText("11. 취득가액 (② = 의제 취득가액 · 소득세법 §97의2④)").first()).toBeAttached();
  });

  test("FBL-2: 가업 lot 필수 입력을 비우면 2단계에서 차단된다(⑧ lot 축 · 조용한 0 없음)", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoStockTransferTax(page);
    await waitHydrated(page);

    await fillStep1(page);
    await toStep2(page);
    await fillByLabel(page, "양도가액 합계", "400000000");
    await page.getByText("일자별 다건", { exact: true }).click();
    await fillLot(page, 1, { date: ["2024", "03", "01"], cause: "상속", shares: "6000", perShare: "50000", decedent: ["2015", "01", "01"] });

    const sw = tid(page, "stock-fb-lot-0-toggle").getByRole("switch").first();
    await sw.click();
    await expect(tid(page, "stock-fb-lot-0-body")).toBeVisible();

    // 값을 비워 둔 채 다음 단계 → 막힌다(⑧ lot 축). 조용한 0·자동 채움 없음
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(page.getByText("피상속인의 1주당 취득가액을 입력하세요").first()).toBeVisible({ timeout: 10_000 });
    await expect(tid(page, "stock-fb-lot-0-toggle")).toBeVisible();
  });
});

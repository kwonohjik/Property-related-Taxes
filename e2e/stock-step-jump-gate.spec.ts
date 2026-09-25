/**
 * E2E: 주식양도세 마법사 — **단계 점프가 필수 입력을 건너뛰지 못한다** (F-8 후속)
 *
 * 계획서: docs/00-pm/validation-warnings-display.plan.md §7 F-8.
 *
 * ## 왜 E2E인가 — RTL이 못 보는 층
 *
 * RTL anchor(`__tests__/components/calc/stock-step-jump-gate.predo.anchor.test.tsx`)는
 * 스토어에 폼을 **직접 주입**한다. 실제 결함은 사람이 걷는 순서에서 난다 —
 * ②에서 양도가액만 채우고 취득가액을 비운 채 사이드바 「결과」를 누르는 흐름이다.
 * 그리고 RTL은 `callStockTransferTaxAPI`를 mock하므로 **API가 실제로 안 나갔는지**를
 * 증명하지 못한다. 여기서는 `page.route`로 **POST 0건**을 단언한다.
 *
 * ## 착수 전 실측 (2026-09-25)
 *
 * 취득단가만 비워도 Zod가 통과하고 엔진이 200을 돌려줬다. 취득가액이 조용히 0원으로
 * 처리돼 과세표준 97,500,000 → 107,500,000, 세액 **19,500,000 → 21,500,000**(경고 0건).
 * 0원처럼 눈에 띄지 않는 **그럴듯한 오답**이다.
 *
 * SJE-1: ②가 불완전하면 「결과」 점프가 막히고 **계산 요청이 0건**
 * SJE-2: (긍정 짝) ②를 채우면 같은 점프가 통하고 계산이 나간다
 * SJE-3: 사이드바가 불완전 단계를 rose «입력 필요»로 지목한다
 *
 * 정책: [[feedback_negative_anchor_needs_positive_twin]] ·
 *       [[feedback_wizard_step_assertion_vacuous_indicator_label]](단계 단언은 `aria-current`)
 */

import { test, expect, type Page } from "@playwright/test";

import { chooseAcqPerShare } from "./_helpers/stock-acq-input-mode";

const CALC_API = "**/api/calc/stock-transfer";

async function gotoStockTransferTax(page: Page) {
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/calc/stock-transfer-tax");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("종목명을 입력하세요").waitFor({ state: "visible", timeout: 30_000 });
}

/** Step1 필수 입력 — 대주주라야 과세되어 세액 축에 구별력이 생긴다. */
async function fillStep1(page: Page) {
  await page.getByRole("radio", { name: "코스피" }).first().click();
  await page.getByPlaceholder("종목명을 입력하세요").fill("점프게이트종목");

  const years = page.locator('input[type="text"][aria-label="연도"]');
  const months = page.locator('input[type="text"][aria-label="월"]');
  const days = page.locator('input[type="text"][aria-label="일"]');
  await years.nth(0).fill("2015");
  await months.nth(0).fill("01");
  await days.nth(0).fill("15");
  await years.nth(1).fill("2026");
  await months.nth(1).fill("03");
  await days.nth(1).fill("10");

  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "양도 주식수" })
    .locator("input")
    .first()
    .fill("1000");
  await page
    .locator('[data-slot="field-card"]')
    .filter({ hasText: "발행주식 총수" })
    .locator("input")
    .first()
    .fill("100000");
}

/**
 * 사이드바 행 — `<nav aria-label="진행 단계">` 안의 `listitem`으로 스코프한다.
 *
 * ⚠️ 버튼 접근명으로 잡으면 안 된다. 상태 글리프 span의 `aria-label`(«입력 필요»·«확인 필요»)이
 *    **접근명에 합쳐지므로** `^라벨`로 앵커하면 표식이 붙는 순간 셀렉터가 깨진다(실측).
 * ⚠️ 「… 단계로 이동」은 **StepIndicator** 쪽 라벨이고 사이드바에는 없다.
 */
function sidebarRow(page: Page, label: string) {
  return page
    .getByRole("navigation", { name: "진행 단계" })
    .getByRole("listitem")
    .filter({ hasText: label });
}

function sidebarJump(page: Page, label: string) {
  return sidebarRow(page, label).getByRole("button");
}

/** 현재 단계 판정 — StepIndicator의 `aria-current`(저장소 관례). */
function stepIndicator(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label} 단계로 이동`) });
}

/**
 * 오류 배너 — 페이지에 `role="alert"`가 둘이라(빈 live region 포함) 텍스트로 좁힌다.
 * ⚠️ `getByRole("alert")` 단독은 strict mode 위반이다(실측).
 */
function errorBanner(page: Page) {
  return page.getByRole("alert").filter({ hasText: /입력|선택|확인/ });
}

/** ③ 필요경비·신고의 필수 — 신고일. 이것이 없으면 「결과」 점프는 정당하게 막힌다. */
async function fillStep3(page: Page) {
  const card = page.locator('[data-slot="field-card"]').filter({ hasText: "신고일" }).last();
  await card.locator('input[aria-label="연도"]').fill("2026");
  await card.locator('input[aria-label="월"]').fill("05");
  await card.locator('input[aria-label="일"]').fill("31");
}

async function goToStep2(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(stepIndicator(page, "양도·취득가액")).toHaveAttribute("aria-current", "step", {
    timeout: 10_000,
  });
}

test.describe("주식 마법사 — 단계 점프 게이트", () => {
  test("SJE-1: ②가 불완전하면 「결과」 점프가 막히고 계산 요청이 0건", async ({ page }) => {
    test.setTimeout(90_000);

    const posts: string[] = [];
    await page.route(CALC_API, async (route) => {
      if (route.request().method() === "POST") posts.push(route.request().url());
      await route.continue();
    });

    await gotoStockTransferTax(page);
    await fillStep1(page);
    await goToStep2(page);

    // 양도가액만 채운다 — 취득가액은 비워 둔다(이것이 조용히 0원이 되던 축).
    await page
      .locator("div:has(> label:has-text('양도가액 합계')) input")
      .first()
      .fill("500000000");
    await chooseAcqPerShare(page);

    /**
     * 🔑 먼저 **③으로** 점프한다 — Step4가 마운트되지 않아 자동 계산도, 제출 백스톱도 돌지
     *    않는다. 즉 여기서 막는 주체는 **점프 게이트뿐**이다.
     *
     * ⚠️ 이 단계가 없으면 이 spec은 게이트를 전혀 지키지 못한다. 「결과」 점프만 재면
     *    게이트를 통째로 들어내도 백스톱이 같은 화면을 만들어 **초록으로 남는다**(실측 —
     *    뮤테이션 SURVIVED). [[feedback_anchor_excluded_axis_is_unguarded]]
     */
    await sidebarJump(page, "필요경비·신고").click();
    await expect(stepIndicator(page, "양도·취득가액")).toHaveAttribute("aria-current", "step");
    await expect(errorBanner(page)).toContainText("1주당 취득가액");

    // 이어서 결과 단계로 점프 — 여기서는 게이트와 백스톱이 겹쳐 막는다.
    await sidebarJump(page, "결과").click();

    // ②에 머물러야 한다 — 라벨 가시성이 아니라 `aria-current`로 본다.
    await expect(stepIndicator(page, "양도·취득가액")).toHaveAttribute("aria-current", "step", {
      timeout: 10_000,
    });
    await expect(
      errorBanner(page),
      "어느 칸이 빠졌는지 알려 줘야 함",
    ).toContainText("1주당 취득가액");

    // 🔑 이 단언이 이 spec의 존재 이유다 — 화면만 되돌아오고 요청은 나갔을 수 있다.
    expect(posts, "계산 요청이 나가면 안 된다").toHaveLength(0);
  });

  test("SJE-2: ②를 채우면 같은 점프가 통하고 계산이 나간다", async ({ page }) => {
    test.setTimeout(90_000);

    const posts: string[] = [];
    await page.route(CALC_API, async (route) => {
      if (route.request().method() === "POST") posts.push(route.request().url());
      await route.continue();
    });

    await gotoStockTransferTax(page);
    await fillStep1(page);
    await goToStep2(page);

    await page
      .locator("div:has(> label:has-text('양도가액 합계')) input")
      .first()
      .fill("500000000");
    await chooseAcqPerShare(page);
    await page
      .locator("div:has(> label:has-text('1주당 취득가액')) input")
      .first()
      .fill("100000");

    // ③으로의 전진 점프는 ①②가 유효하므로 통해야 한다.
    await sidebarJump(page, "필요경비·신고").click();
    await expect(stepIndicator(page, "필요경비·신고")).toHaveAttribute("aria-current", "step", {
      timeout: 10_000,
    });

    // 🔑 이 시점의 「결과」 점프는 **정당하게 막힌다** — ③ 신고일이 비어 있다.
    await sidebarJump(page, "결과").click();
    await expect(stepIndicator(page, "필요경비·신고")).toHaveAttribute("aria-current", "step");
    expect(posts, "③이 불완전한 동안에는 요청이 없어야 함").toHaveLength(0);

    await fillStep3(page);
    await sidebarJump(page, "결과").click();
    await expect(stepIndicator(page, "결과")).toHaveAttribute("aria-current", "step", {
      timeout: 15_000,
    });
    await expect
      .poll(() => posts.length, { timeout: 20_000, message: "계산 요청이 나가야 함" })
      .toBeGreaterThan(0);
  });

  /**
   * 🔑 표식이 **도달 가능한 상태**인지부터 따져야 한다. 두 조건이 동시에 필요하다 —
   *    ⓐ 그 단계를 **지나왔고**(`i < currentStep`) ⓑ 지금 무효여야 한다.
   *    게이트는 전진만 막으므로 「③까지 감 → 뒤로 ②에서 지움 → 뒤로 ①」이면 그 상태가 된다.
   *
   * ⚠️ 아직 안 간 단계에는 **붙지 않는다**(빈 폼 첫 화면 노이즈 방지) — 그 축은
   *    RTL anchor가 지킨다(`stock-step-jump-gate.predo.anchor.test.tsx`).
   */
  test("SJE-3: 지나온 단계가 무효가 되면 «입력 필요»로 지목한다", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStockTransferTax(page);
    await fillStep1(page);
    await goToStep2(page);

    await page
      .locator("div:has(> label:has-text('양도가액 합계')) input")
      .first()
      .fill("500000000");
    await chooseAcqPerShare(page);
    const acqInput = page
      .locator("div:has(> label:has-text('1주당 취득가액')) input")
      .first();
    await acqInput.fill("100000");

    // ③으로 전진 — ①② 모두 유효하므로 통한다.
    await page.getByRole("button", { name: /^다음/ }).click();
    await expect(stepIndicator(page, "필요경비·신고")).toHaveAttribute("aria-current", "step", {
      timeout: 10_000,
    });

    const row = sidebarRow(page, "양도·취득가액");
    // 이 시점 ②는 지나왔고 유효하다 — 표식이 없어야 한다(긍정 짝).
    await expect(row.locator('[aria-label="입력 필요"]')).toHaveCount(0);

    // 뒤로 ②에서 취득단가를 지우고, 한 칸 더 뒤로 간다(후진은 막지 않는다).
    await sidebarJump(page, "양도·취득가액").click();
    await expect(stepIndicator(page, "양도·취득가액")).toHaveAttribute("aria-current", "step");
    /**
     * ⚠️ CurrencyInput 비우기는 두 가지 흔한 방법이 **둘 다 안 통한다**(실측):
     *   ⓐ `fill("")` — 빈 문자열은 insert할 것이 없어 input 이벤트가 안 나고, 그 전에 포커스가
     *      `handleFocus`를 깨워 `localRaw`를 **옛 값으로 되돌린다**. 값이 그대로 남는다.
     *   ⓑ `click()` 직후 Backspace — `SelectOnFocusProvider`의 `select()`가 **RAF로 지연**돼
     *      전체 선택 전에 키가 떨어진다. 한 글자만 지워져 간헐 실패한다.
     * ⇒ 키보드로 직접 전체 선택한다. RAF에 의존하지 않아 확정적이다.
     */
    await acqInput.click();
    await acqInput.press("ControlOrMeta+a");
    await acqInput.press("Backspace");
    await expect(acqInput).toHaveValue("");

    await sidebarJump(page, "자산·시장·대주주").click();
    await expect(stepIndicator(page, "자산·시장·대주주")).toHaveAttribute("aria-current", "step");

    await expect(
      row.locator('[aria-label="입력 필요"]'),
      "지나온 ②가 무효가 됐으므로 rose 표식이 붙어야 함",
    ).toBeVisible();
  });
});

/**
 * 판정 메뉴 → 계산기 **사실 전달** (P5-a)
 *
 * 계획서 §5.3 · D-3.
 *
 * ## 이 spec이 지키는 것
 *
 * 배관 주장(본문 → Zod → 엔진 → 판정이 뒤집힌다)은 anchor가 고정한다
 * (`__tests__/calc/one-house-judgment-handoff.anchor.test.ts` H-1~H-8c).
 *
 * 여기서만 관측되는 것은 **화면이 실제로 이어지는가**다 — CTA가 뜨고, 눌렀을 때 계산기로
 * 가고, 그 화면에 넘겨받은 사실이 읽기 전용으로 보이는 것은 DOM·라우팅에서만 보인다
 * (`feedback_library_anchor_does_not_prove_component_uses_it`).
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const JIBUN = "서울 강남구 대치동 316";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

/**
 * ① → ② 양도 대상 주택.
 *
 * 🔄 2026-09-23 재배치 — §155의3 상생임대 입력도 **이 화면으로 옮겨왔다**(거주요건 면제
 * 특례 3종은 거주기간 입력과 같은 화면에 모았다).
 */
async function gotoSaleStep(page: Page) {
  await page.goto("/calc/one-house-exemption?new=1");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

/** ② 에서 §155의3 상생임대 특례를 **성립하도록** 채운다. */
async function declareWinWinRental(page: Page) {
  await toggleSwitch(page, /^상생임대주택 특례/).click();
  await fillDateAndVerify(page, { year: "2022", month: "03", day: "01" }, {
    scope: page.getByTestId("ww-contract-date"),
  });
  await page.getByTestId("ww-increase-rate").fill("4");
  /*
   * 🔑 이 두 칸은 `FieldCard` 라벨과 `htmlFor`로 묶여 있지 않아 `getByLabel`이 통하지 않았다.
   *    화면에 `ariaLabel`을 붙여 해결했다 — 입력 **순서**에 기대는 `.nth()`는 형제 위젯이
   *    하나만 늘어도 조용히 엉뚱한 칸을 집는다(`feedback_new_widget_breaks_uniqueness_selectors`).
   */
  await page.getByLabel("직전임대차 임대기간").fill("18");
  await page.getByLabel("상생임대차 임대기간").fill("24");
}

/** ②의 필수 3값을 채우고 ③을 지나 판정 결과까지 간다. */
async function judge(page: Page) {
  await fillDateAndVerify(page, { year: "2021", month: "03", day: "01" }, {
    scope: page.getByTestId("one-house-acq-date"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("one-house-sale-date"),
  });
  await page.getByTestId("one-house-sale-price").fill("900000000");
  // ③ 보유 주택·권리 — 명부는 비운 채 지나간다. CTA는 이 마지막 입력 단계에만 있다.
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

/**
 * 계산기 0단계의 **소재지**를 채운다.
 *
 * 🔑 판정 메뉴에도 소재지 칸이 생겼지만(2026-09-23 — 조정대상지역 정밀 판정용) **선택 입력**이라
 *    비워 둘 수 있고, 이 spec은 비운 채 넘긴다. 그래서 전달 직후 계산기 0단계는
 *    「소재지를 입력하세요」로 막힌다. 이것은 결함이 아니라 전달이 **0단계에 내려놓는 이유**다
 *    (취득가액·필요경비도 여기서 받는다).
 */
async function fillCalculatorAddress(page: Page) {
  await page.route("**/api/address/search*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: [] }) }),
  );
  await expandAssetSection(page, 1);
  const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(JIBUN);
  await input.press("Enter");
  await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
  await expect(page.getByText(JIBUN).first()).toBeVisible();
}

/**
 * 계산기 0단계의 **필수 입력을 전부** 채운다 — 판정 메뉴를 거치지 않은 시나리오 전용.
 *
 * 전달 경로는 양도일·취득일이 이미 넘어오므로 이 함수를 쓰지 않는다.
 */
async function fillCalculatorRequiredBasics(page: Page) {
  await fillDateAndVerify(page, { year: "2026", month: "06", day: "01" }, {
    scope: page.getByTestId("transfer-date"),
  });
  await fillCalculatorAddress(page);
  await expandAssetSection(page, 2); // ② 양도
  await page.getByTestId("companion-actual-sale-price").fill("900000000");
  await expandAssetSection(page, 3); // ③ 취득
  await fillDateAndVerify(page, { year: "2021", month: "03", day: "01" }, {
    scope: page.getByTestId("acq-date-building"),
  });
  await page.getByTestId("fixed-acquisition-price").fill("500000000");
}

/** 전달 직후 계산기 → ② 보유 상황 단계(넘겨받은 사실 카드가 있는 곳). */
async function gotoHoldingStep(page: Page) {
  await expect(page).toHaveURL(/\/calc\/transfer-tax$/);
  await fillCalculatorAddress(page);
  /*
   * 🔑 **취득가액은 판정 메뉴가 묻지 않는다** — 비과세 판정에 필요 없는 값이고, 그래서 전달은
   *    사용자를 계산기 **0단계**에 내려놓는다. 여기서 막히는 것이 설계된 동작이다
   *    (결과 단계로 바로 보내면 0원 취득가액 세액을 완성된 답으로 오해한다).
   */
  await expandAssetSection(page, 3); // ③ 취득 — 자산 카드는 기본 전부 접힘이다
  await page.getByTestId("fixed-acquisition-price").fill("500000000");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("① 세대·주택 현황")).toBeVisible();
}

test.describe("판정 메뉴 → 계산기 사실 전달", () => {
  /** 🔑 판정 결과 화면에 전달 통로가 **실제로 있다**. 없으면 사용자는 다시 입력해야 한다. */
  test("[HO-1] 판정 결과에 「이 결과로 세액 계산」 CTA가 뜬다", async ({ page }) => {
    await gotoSaleStep(page);
    await judge(page);
    await expect(page.getByTestId("one-house-to-calculator")).toBeVisible();
  });

  /**
   * 🔴 **핵심 경로** — 누르면 양도세 계산기로 가고, 판정 메뉴에서 넣은 사실이 그 화면에
   *    읽기 전용으로 보인다.
   */
  test("[HO-2] CTA를 누르면 계산기로 이동하고 넘겨받은 사실이 보인다", async ({ page }) => {
    await gotoSaleStep(page);
    await declareWinWinRental(page);
    await judge(page);

    await page.getByTestId("one-house-to-calculator").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/);

    await gotoHoldingStep(page);
    await expect(page.getByTestId("imported-one-house-facts")).toBeVisible();
    await expect(page.getByTestId("imported-win-win-rental")).toBeVisible();
    await expect(page.getByTestId("imported-win-win-rental")).toContainText("2022-03-01");
    await expect(page.getByTestId("imported-win-win-rental")).toContainText("24개월");
  });

  /**
   * 🔑 **판정 사실이 계산기 입력란에도 채워진다.** 운반 상자만 넘어가고 공유 필드가 빠지면
   *    사용자는 「사실이 넘어왔다」는 카드를 보면서 빈 폼을 다시 채워야 한다.
   */
  test("[HO-3] 양도일 등 공유 필드도 함께 넘어온다", async ({ page }) => {
    await gotoSaleStep(page);
    await judge(page);
    await page.getByTestId("one-house-to-calculator").click();
    await expect(page).toHaveURL(/\/calc\/transfer-tax$/);

    // 1단계(자산 목록)에 양도일이 채워져 있다. 라벨은 「년」이 아니라 **「연도」**다.
    await expect(page.getByTestId("transfer-date").getByLabel("연도")).toHaveValue("2026");
  });

  /**
   * 🔑 **판정 메뉴를 거치지 않은 사용자에게는 카드가 뜨지 않는다.**
   *    「넘겨받은 사실 없음」 카드를 띄우면 쓰지 않는 조문으로 화면만 길어진다.
   */
  test("[HO-4] 계산기에 직접 들어오면 그 카드가 없다", async ({ page }) => {
    await page.goto("/calc/transfer-tax?new=1");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await fillCalculatorRequiredBasics(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("① 세대·주택 현황")).toBeVisible();
    await expect(page.getByTestId("imported-one-house-facts")).toHaveCount(0);
  });

  /**
   * 🔑 「전달됐으나 두 특례 OFF」도 **말해 준다** — 아무 말도 하지 않으면 사용자는 자기가 켠
   *    특례가 사라졌다고 의심한다(사실은 켠 적이 없다).
   */
  test("[HO-5] 특례를 선언하지 않고 넘기면 「선언하지 않았다」고 알린다", async ({ page }) => {
    await gotoSaleStep(page);
    await judge(page);
    await page.getByTestId("one-house-to-calculator").click();
    await gotoHoldingStep(page);

    await expect(page.getByTestId("imported-one-house-facts")).toBeVisible();
    await expect(page.getByTestId("imported-one-house-facts-none")).toBeVisible();
    await expect(page.getByTestId("imported-win-win-rental")).toHaveCount(0);
  });
});

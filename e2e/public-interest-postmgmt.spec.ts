/**
 * E2E: 공익법인 출연재산 사후관리 시뮬레이터 (상증법 §48②1호 · 상증령 §40①1호)
 *
 * 🔑 **엔진 anchor로는 이 층을 못 잡는다** — anchor는 입력 객체를 직접 만들어 넣으므로
 *    입력 UI가 없어도 통과한다([[feedback_api_trigger_without_input_path_is_noop]]).
 *    여기서는 **화면에서 값을 넣어 세액이 나오는지**를 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

/** 20억 출연 · 2021-03-01 출연 · 2025-06-30 판정 · 8억 미사용 */
async function fillBase(page: Page) {
  await page.goto("/calc/public-interest-postmgmt");
  await page.getByRole("heading", { name: /공익법인 출연재산 사후관리/ }).waitFor();

  await page.getByTestId("pi-donated-value").fill("2000000000");
  await fillDateAndVerify(page, { year: "2021", month: "3", day: "1" }, {
    scope: page.getByTestId("pi-donation-date"),
  });
  await fillDateAndVerify(page, { year: "2025", month: "6", day: "30" }, {
    scope: page.getByTestId("pi-assessment-date"),
  });
  await page.getByTestId("pi-violated-value").fill("800000000");
}

test.describe("공익법인 사후관리 (§48②1호)", () => {
  test("PI-E2E-1: 입력 → 추징 증여세가 계산된다", async ({ page }) => {
    test.setTimeout(90_000);
    await fillBase(page);
    await page.getByRole("button", { name: "추징세액 계산" }).click();

    await expect(page.getByTestId("pi-postmgmt-result")).toBeVisible();
    await expect(page.getByText("추징 대상입니다")).toBeVisible();
    // 8억 → §56 누진(30% − 6천만 누진공제) = 180,000,000
    await expect(page.getByTestId("pi-gift-tax")).toHaveText(/180,000,000/);
    // 3년 경계·조문 근거가 함께 보인다
    await expect(page.getByText(/2024-03-01/)).toBeVisible();
    await expect(page.getByText(/상증령 §40①1호/).first()).toBeVisible();
  });

  test("PI-E2E-2: 단서 3요건 충족 → 「추징 제외」로 뒤집힌다", async ({ page }) => {
    test.setTimeout(90_000);
    await fillBase(page);

    // 부득이한 사유 ON → 보고 ON → 사유 소멸일·사용일(1년 이내)
    await page.getByRole("switch", { name: /부득이한 사유/ }).click();
    await page.getByRole("switch", { name: /관할세무서장에게 보고함/ }).click();
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "1" }, {
      scope: page.getByTestId("pi-reason-end-date"),
    });
    await fillDateAndVerify(page, { year: "2025", month: "5", day: "31" }, {
      scope: page.getByTestId("pi-used-date"),
    });

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    // ⚠️ 「추징 제외」는 결과 배너·단서 step·토글 설명에 모두 나온다 → 결과 영역으로 스코프한다
    //    (e2e/CLAUDE.md §3 — 라벨 중복은 strict mode 위반).
    const resultBox = page.getByTestId("pi-postmgmt-result");
    await expect(resultBox).toBeVisible();
    await expect(resultBox.getByText(/추징 제외/).first()).toBeVisible();
    // 세액 표시 자체가 사라진다(부재 단언은 toHaveCount(0) — strict 무관).
    await expect(page.getByTestId("pi-gift-tax")).toHaveCount(0);
  });

  test("PI-E2E-3: querystring이 출연가액을 사전 채운다 (결과화면 링크 경로)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/public-interest-postmgmt?donatedValue=2000000000");
    await expect(page.getByText(/사전 입력되었습니다/)).toBeVisible();
    await expect(page.getByTestId("pi-donated-value")).toHaveValue(/2,000,000,000/);
  });

  test("PI-E2E-4: 잘못된 querystring은 무시된다 (양성 대조군)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/public-interest-postmgmt?donatedValue=abc");
    await page.getByRole("heading", { name: /공익법인 출연재산 사후관리/ }).waitFor();
    await expect(page.getByText(/사전 입력되었습니다/)).toHaveCount(0);
  });
});

/**
 * §48②4호 — 매각대금 3년.
 *
 * 🔑 **엔진 anchor가 고정한 「기산점이 과세기간 종료일」이 화면까지 도달하는지**가 이 블록의
 *    존재 이유다. 결산일 입력이 없으면 엔진은 맞아도 사용자는 그 값을 넣을 길이 없다
 *    ([[feedback_api_trigger_without_input_path_is_noop]]).
 */
async function openClause4(page: Page) {
  await page.goto("/calc/public-interest-postmgmt");
  await page.getByRole("heading", { name: /공익법인 출연재산 사후관리/ }).waitFor();
  await page.getByRole("radio", { name: /매각대금 \(§48②4호\)/ }).check();
}

/** 매각대금 10억 · 2021-05-20 매각 · 12월 결산 · 2026-06-30 판정 */
async function fillClause4Base(page: Page) {
  await page.getByTestId("pi4-sale-proceeds").fill("1000000000");
  await fillDateAndVerify(page, { year: "2021", month: "5", day: "20" }, {
    scope: page.getByTestId("pi4-sale-date"),
  });
  await fillDateAndVerify(page, { year: "2021", month: "12", day: "31" }, {
    scope: page.getByTestId("pi4-fiscal-year-end"),
  });
  await fillDateAndVerify(page, { year: "2026", month: "6", day: "30" }, {
    scope: page.getByTestId("pi4-assessment-date"),
  });
}

test.describe("공익법인 매각대금 사후관리 (§48②4호)", () => {
  test("PI4-E2E-1: 나목 — 사용실적 8억 → 미달 1억 → 추징세액 1천만원", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause4(page);
    await fillClause4Base(page);
    await page.getByTestId("pi4-direct-use").fill("800000000");
    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const resultBox = page.getByTestId("pi4-result");
    await expect(resultBox).toBeVisible();
    // 사용기준금액 9억 − 사용실적 8억 = 1억 → 1억 × 10% = 10,000,000
    await expect(page.getByTestId("pi4-gift-tax")).toHaveText(/10,000,000/);
    await expect(resultBox.getByText(/상증령 §40①3호 나목/).first()).toBeVisible();
  });

  test("PI4-E2E-2: ⭐ 기한이 매각일이 아니라 과세기간 종료일에서 나온다", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause4(page);
    await fillClause4Base(page);
    await page.getByTestId("pi4-direct-use").fill("800000000");
    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const resultBox = page.getByTestId("pi4-result");
    await expect(resultBox).toBeVisible();
    // 2021-12-31 + 3년
    await expect(resultBox.getByText(/2024-12-31/).first()).toBeVisible();
    // ❌ 매각일(2021-05-20) 기산이면 2024-05-20이 나온다 — 부재를 함께 단언한다.
    await expect(resultBox.getByText(/2024-05-20/)).toHaveCount(0);
  });

  test("PI4-E2E-3: 가목 — 라디오를 바꾸면 입력 필드가 바뀌고 안분액이 나온다", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause4(page);
    await fillClause4Base(page);

    await page.getByRole("radio", { name: /공익목적사업 외 사용/ }).check();
    // 나목 필드가 사라지고 가목 필드가 나타난다 (라디오만 있고 입력 경로가 없으면 no-op).
    await expect(page.getByTestId("pi4-direct-use")).toHaveCount(0);
    await page.getByTestId("pi4-outside-use").fill("200000000");
    await page.getByRole("button", { name: "추징세액 계산" }).click();

    // 9억 × 2억/10억 = 1.8억 → 1.8억 × 20% − 1천만 = 26,000,000
    await expect(page.getByTestId("pi4-gift-tax")).toHaveText(/26,000,000/);
    await expect(
      page.getByTestId("pi4-result").getByText(/상증령 §40①3호 가목/).first(),
    ).toBeVisible();
  });

  test("PI4-E2E-4: 90%를 채우면 추징 대상이 아니다 (양성 대조군)", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause4(page);
    await fillClause4Base(page);
    await page.getByTestId("pi4-direct-use").fill("900000000");
    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const resultBox = page.getByTestId("pi4-result");
    await expect(resultBox).toBeVisible();
    await expect(resultBox.getByText(/추징 대상 아님/)).toBeVisible();
    await expect(page.getByTestId("pi4-gift-tax")).toHaveText(/^0/);
  });
});

/**
 * §48②3호 — 운용소득 목적 외 사용.
 *
 * 🔑 이 블록이 지키는 것은 **평가가액 결정 경로가 화면에 전부 있는가**다. 상증칙 §13②
 *    단서(제4장 평가액 70%)와 §13③(1년 이상 보유 주식등 = 액면가액)은 입력 칸이 없으면
 *    엔진이 맞아도 사용자가 도달할 수 없다([[feedback_ui_gate_removes_sole_input_path]]).
 */
async function openClause3(page: Page) {
  await page.goto("/calc/public-interest-postmgmt");
  await page.getByRole("heading", { name: /공익법인 출연재산 사후관리/ }).waitFor();
  await page.getByRole("radio", { name: /운용소득 목적 외 사용/ }).check();
}

/** 운용소득 2억 중 5천만 목적 외 사용 · 제4장 평가액 50억 */
async function fillClause3Base(page: Page) {
  await page.getByTestId("pi3-operating-income").fill("200000000");
  await page.getByTestId("pi3-outside-use").fill("50000000");
  await page.getByTestId("pi3-chapter4-value").fill("5000000000");
}

test.describe("공익법인 운용소득 목적 외 사용 (§48②3호)", () => {
  test("PI3-E2E-1: 평가가액 × (외부사용액 ÷ 운용소득) → 증여세", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause3(page);
    await fillClause3Base(page);
    await page.getByTestId("pi3-book-value").fill("4000000000"); // 50억×70%=35억 초과 → 단서 미적용

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const box = page.getByTestId("pi3-result");
    await expect(box).toBeVisible();
    // 40억 × (5천만 ÷ 2억) = 10억 → 10억 × 30% − 6천만 = 240,000,000
    await expect(page.getByTestId("pi3-gift-tax")).toHaveText(/240,000,000/);
    await expect(box.getByText(/상증령 §40①2의2호/).first()).toBeVisible();
    // 단서 배지는 나타나지 않는다
    await expect(page.getByTestId("pi3-chapter4-applied")).toHaveCount(0);
  });

  test("PI3-E2E-2: ⭐ 70% 단서 → 제4장 평가액으로 대체된다", async ({ page }) => {
    test.setTimeout(90_000);
    await openClause3(page);
    await fillClause3Base(page);
    await page.getByTestId("pi3-book-value").fill("3000000000"); // 35억 이하 → 단서 발동

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    await expect(page.getByTestId("pi3-chapter4-applied")).toBeVisible();
    // 50억 × 0.25 = 12.5억 → 12.5억 × 40% − 1.6억 = 340,000,000
    await expect(page.getByTestId("pi3-gift-tax")).toHaveText(/340,000,000/);
  });

  test("PI3-E2E-3: ⭐ 1년 이상 보유 주식등 액면가액이 평가가액에 더해진다 (상증칙 §13③)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openClause3(page);
    await fillClause3Base(page);
    await page.getByTestId("pi3-book-value").fill("4000000000");
    await page.getByTestId("pi3-stock-par-value").fill("1000000000");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    // (40억 + 10억) × 0.25 = 12.5억 → 340,000,000 (주식을 빠뜨리면 240,000,000)
    await expect(page.getByTestId("pi3-gift-tax")).toHaveText(/340,000,000/);
  });

  test("PI3-E2E-4: 제4장 평가액을 비우면 단서를 적용하지 않고 안내한다 (양성 대조군)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openClause3(page);
    await page.getByTestId("pi3-operating-income").fill("200000000");
    await page.getByTestId("pi3-outside-use").fill("50000000");
    await page.getByTestId("pi3-book-value").fill("3000000000");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const box = page.getByTestId("pi3-result");
    await expect(box).toBeVisible();
    // 단서 미적용 → 30억 × 0.25 = 7.5억 → 7.5억 × 30% − 6천만 = 165,000,000
    await expect(page.getByTestId("pi3-gift-tax")).toHaveText(/165,000,000/);
    await expect(page.getByTestId("pi3-chapter4-applied")).toHaveCount(0);
    await expect(box.getByText(/제4장 평가액/).first()).toBeVisible();
  });
});

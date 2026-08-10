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

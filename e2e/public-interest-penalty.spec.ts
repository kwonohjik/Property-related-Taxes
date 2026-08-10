/**
 * E2E: 공익법인 사후관리 **가산세** 계산기 (상증법 §48②5호·7호 → §78⑨)
 *
 * 🔑 **엔진 anchor로는 이 층을 못 잡는다** — anchor는 입력 객체를 직접 만들어 넣으므로
 *    토글·입력 UI가 없어도 통과한다([[feedback_api_trigger_without_input_path_is_noop]]).
 *    특히 **200% 토글**과 **1호·3호 택일**은 화면에서 도달 가능해야 의미가 있다.
 */
import { test, expect, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/calc/public-interest-penalty");
  await page.getByRole("heading", { name: /공익법인 사후관리 가산세/ }).waitFor();
}

/** ③ 의무지출: 출연재산가액 100억 · 사용액 4천만 */
async function fillMandatory(page: Page) {
  await page.getByRole("switch", { name: /의무지출 기준금액 미달/ }).click();
  await page.getByTestId("pn-asset-base").fill("10000000000");
  await page.getByTestId("pn-mandatory-used").fill("40000000");
}

test.describe("공익법인 사후관리 가산세 (§78⑨)", () => {
  test("PN-E2E-1: 3호 — 100억 × 1% = 1억 기준, 사용 4천만 → 6천만 × 10%", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await fillMandatory(page);
    await page.getByRole("button", { name: "가산세 계산" }).click();

    await expect(page.getByTestId("pn-result")).toBeVisible();
    await expect(page.getByTestId("pn-total-penalty")).toHaveText(/6,000,000/);
  });

  test("PN-E2E-2: ⭐ 가목 토글 → 200% (나목 10%의 20배)", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await fillMandatory(page);
    await page.getByRole("switch", { name: /가목의 공익법인등/ }).click();
    await page.getByRole("button", { name: "가산세 계산" }).click();

    // 6천만 × 200% = 120,000,000 (10%였다면 6,000,000)
    await expect(page.getByTestId("pn-total-penalty")).toHaveText(/120,000,000/);
    await expect(
      page.getByTestId("pn-result").getByText(/200%/).first(),
    ).toBeVisible();
  });

  test("PN-E2E-3: ⭐ 1호·3호 동시 → 더 큰 금액만 (합산 아님)", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await fillMandatory(page); // 3호 = 6,000,000

    await page.getByRole("switch", { name: /운용소득 기준금액 미달/ }).click();
    await page.getByTestId("pn-operating-income").fill("100000000");
    await page.getByTestId("pn-operating-used").fill("60000000"); // 1호 = 2,000,000

    await page.getByRole("button", { name: "가산세 계산" }).click();

    // max(2,000,000, 6,000,000) = 6,000,000 — 합산(8,000,000)이 아니다
    await expect(page.getByTestId("pn-total-penalty")).toHaveText(/6,000,000/);
    await expect(page.getByTestId("pn-total-penalty")).not.toHaveText(/8,000,000/);
    await expect(page.getByTestId("pn-clause-choice")).toContainText("3호(의무지출)");
  });

  test("PN-E2E-4: 2호 — 1년 30%·2년 60% 각각 부과되고 합산된다", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await page.getByRole("switch", { name: /매각대금 1년 30%/ }).click();
    await page.getByTestId("pn-sale-proceeds").fill("1000000000");
    await page.getByTestId("pn-sale-used-1y").fill("200000000"); // 기준 3억 → 미달 1억
    await page.getByTestId("pn-sale-used-2y").fill("500000000"); // 기준 6억 → 미달 1억
    await page.getByRole("button", { name: "가산세 계산" }).click();

    // (1억 + 1억) × 10% = 20,000,000
    await expect(page.getByTestId("pn-total-penalty")).toHaveText(/20,000,000/);
    // 부과 시기가 다르다는 안내가 화면에 도달한다
    await expect(
      page.getByTestId("pn-result").getByText(/부과 시기가 다릅니다/).first(),
    ).toBeVisible();
    // 3년 90%는 증여세라는 구분 안내도 함께
    await expect(
      page.getByTestId("pn-result").getByText(/§48②4호 증여세/).first(),
    ).toBeVisible();
  });

  test("PN-E2E-5: 기준금액을 채우면 부과 대상이 아니다 (양성 대조군)", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await page.getByRole("switch", { name: /운용소득 기준금액 미달/ }).click();
    await page.getByTestId("pn-operating-income").fill("100000000");
    await page.getByTestId("pn-operating-used").fill("80000000"); // 정확히 80%
    await page.getByRole("button", { name: "가산세 계산" }).click();

    const box = page.getByTestId("pn-result");
    await expect(box).toBeVisible();
    await expect(box.getByText(/가산세 부과 대상 아님/)).toBeVisible();
    await expect(page.getByTestId("pn-total-penalty")).toHaveText(/^0/);
    // 택일 표시가 나타나지 않는다(해당 호가 없다)
    await expect(page.getByTestId("pn-clause-choice")).toHaveCount(0);
  });
});

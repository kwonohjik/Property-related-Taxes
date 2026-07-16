import { test, expect } from "@playwright/test";

/**
 * 가업상속공제 사후관리 시뮬레이터 (PR-2b) e2e.
 *
 * 검증: querystring prefill → 위반 입력 → 계산 → 추징/면제 결과.
 * 엔진(PR-2)은 unit anchor로 검증됨 — 본 spec은 UI 폼→엔진→결과 배선 검증.
 */
test.describe("가업상속공제 사후관리 시뮬레이터", () => {
  const PREFILL =
    "/calc/family-business-postmgmt?originalDeduction=10000000000&taxBase=10000000000&deathDate=2025-01-01&filingDeadline=2025-07-31";

  async function setViolationDate(card: ReturnType<import("@playwright/test").Page["getByTestId"]>, y: string, m: string, d: string) {
    await card.getByLabel("연도").fill(y);
    await card.getByLabel("월").fill(m);
    await card.getByLabel("일").fill(d);
  }

  test("5년 내 가업 미종사 → 추징 발생(면제 아님)", async ({ page }) => {
    await page.goto(PREFILL);
    await expect(page.getByRole("heading", { name: "가업상속공제 사후관리 시뮬레이터" })).toBeVisible();
    // 메인 진입 prefill 안내
    await expect(page.getByText("메인 마법사에서 진입")).toBeVisible();

    // 위반 유형: 가업 미종사
    await page.getByText("가업 미종사", { exact: false }).first().click();

    // 위반일 2026-06-01 (5년 내)
    const card = page.getByTestId("violation-0");
    await setViolationDate(card, "2026", "06", "01");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    // 추징 발생 → 위반별 표에 "면제" 없음
    await expect(result).not.toContainText("면제 (outside_five_year_period)");
    // 순 추징세액 표시 (0원 아님)
    await expect(page.getByTestId("fb-postmgmt-net")).toBeVisible();
  });

  test("5년 초과 위반 → 자동 면제(outside_five_year_period)", async ({ page }) => {
    await page.goto(PREFILL);
    await page.getByText("가업 미종사", { exact: false }).first().click();

    // 위반일 2031-06-01 (사망 2025-01-01 + 5년 초과)
    const card = page.getByTestId("violation-0");
    await setViolationDate(card, "2031", "06", "01");

    await page.getByRole("button", { name: "추징세액 계산" }).click();

    const result = page.getByTestId("fb-postmgmt-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("outside_five_year_period");
  });

  test("PR-5: cgt querystring → 양도소득세 환원 공제(§18의2⑩) prefill", async ({ page }) => {
    // 양도세 결과뷰 링크에서 넘어온 §18의2⑩ creditAmount 5억
    await page.goto(`${PREFILL}&cgt=500000000`);
    // §18의2⑩ 환원 공제 안내 라벨 노출 + 입력칸에 5억 prefill
    await expect(page.getByText("양도소득세 환원 공제 (§18의2⑩, 선택)")).toBeVisible();
    await expect(page.locator('input[value="500,000,000"]')).toBeVisible();
  });
});

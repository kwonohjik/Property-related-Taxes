/**
 * E2E: 상속세 §23의2 동거주택 상속공제 시기구분 한도 (Phase 1 = G1)
 *
 * 검증:
 *   - 2018 상속 + 동거주택 8억 → 80% 적용, 한도 5억 → 결과 카드 "5억 최고한도" + 공제 5억
 *   - 2024 상속 + 동거주택 8억 → 100% 적용, 한도 6억 → 결과 카드 "6억 최고한도" + 공제 6억 (회귀)
 *
 * 엔진 설계: docs/02-design/features/inheritance-cohabit-deduction.engine.design.md
 * UI 설계:  docs/02-design/features/inheritance-cohabit-deduction.ui.design.md
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

/** Step0: 상속개시일(year) + 동거 자녀 1명 → Step1: 아파트 8억 + 동거주택 체크 → 계산 → 공제 상세 펼침 */
async function calcWithCohabitHouse(page: Page, year: string) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year, month: "6", day: "1" });

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  // 자녀 동거(isCohabitant) — §23의2 게이팅 충족
  await page.getByText("동거주택 상속공제 해당").click();

  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

  // 상속재산: 주택, 기준시가 총액 8억
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /주택/ }).click();
  await page.getByPlaceholder("금액 입력").first().fill("800000000");

  // advanced 토글 열고 동거주택 공제 대상 체크
  await page.getByText("시가·감정가·임대보증금·저당권 입력").click();
  await page.getByText("동거주택 공제 대상 (§23의2)").click();

  // Step1 → 2 → 3 → 4
  await nextSteps(page, 3);

  await calcAndWaitResult(page);

  // 결과 — 상속공제 상세 내역 펼침 → 동거주택 공제 카드 펼침
  await page.getByRole("button", { name: /상속공제 상세 내역/ }).click();
  await page
    .getByText("동거주택 공제 (§23의2)")
    .locator("..")
    .getByRole("button", { name: "펼치기" })
    .click();
}

test.describe("§23의2 동거주택공제 시기구분 한도", () => {
  test("E2E-1: 2018 상속 8억 → 80%·한도 5억 → '5억 최고한도' + 공제 5억", async ({
    page,
  }) => {
    await calcWithCohabitHouse(page, "2018");

    await expect(page.getByText("5억 최고한도")).toBeVisible();
    await expect(page.getByText("공제율 80%")).toBeVisible();
    // 트리거 값 = 공제액 5억
    await expect(
      page.getByText("동거주택 공제 (§23의2)").locator("..").getByText("500,000,000"),
    ).toBeVisible();
  });

  test("E2E-2: 2024 상속 8억 → 100%·한도 6억 → '6억 최고한도' + 공제 6억 (회귀)", async ({
    page,
  }) => {
    await calcWithCohabitHouse(page, "2024");

    await expect(page.getByText("6억 최고한도")).toBeVisible();
    await expect(page.getByText("공제율 100%")).toBeVisible();
    await expect(
      page.getByText("동거주택 공제 (§23의2)").locator("..").getByText("600,000,000"),
    ).toBeVisible();
  });
});

/**
 * 리뷰 C-5·C-6 — 화면 확인. 라이브러리 단언은 `__tests__/calc/temp-two-house-card-display-c3-c6.ui.test.tsx`.
 *
 * - C-5 판정 메뉴 ③ §155① 요건 카드 — ④가 §154① 단서 사유를 버리는 3주택 맥락에서는 「단서 사유로 1년 요건 면제」를 말하지 않는다.
 * - C-6 계산기 — 판정 메뉴에서 넘겨받은 신규 주택 계약일이 명부의 신규 주택 취득일보다 늦으면 계산 요청 전에 막는다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const row = (id: string, acquisitionDate: string) => ({
  id,
  region: "non_capital",
  acquisitionOrigin: "general",
  acquisitionDate,
  officialPrice: "100000000",
  isInherited: false,
});

async function seedJudgment(page: Page, houses: Record<string, unknown>[]) {
  // 종전 2015-01-01 → 신규 2015-06-01(1년 미만) · §154①1호(임대주택 거주 5년) 단서
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2017-01-01",
    contractTotalPrice: "500000000",
    assets: [
      {
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2015-01-01",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "24",
      },
    ],
    houses,
    provisoReason: "rental_5yr_residence",
    provisoRentalLeaseResidenceMonths: "60",
  });
}

test("[C5-1] 3주택 — §155① 카드가 단서 사유로 1년 요건을 면제한다고 말하지 않는다", async ({ page }) => {
  await seedJudgment(page, [row("n", "2015-06-01"), row("o", "2010-01-01")]);
  const card = page.getByTestId("temp-two-house-verdict");
  await expect(card).toBeVisible();
  await expect(card).toContainText("미충족 · 요건 A");
  await expect(card).not.toContainText("§154① 단서 사유로 1년 요건 면제");
});

test("[C5-2] 짝 — 2주택이면 면제를 말한다", async ({ page }) => {
  await seedJudgment(page, [row("n", "2015-06-01")]);
  const card = page.getByTestId("temp-two-house-verdict");
  await expect(card).toBeVisible();
  await expect(card).toContainText("§154① 단서 사유로 1년 요건 면제");
});

test("[C6-1] 계산기 — 넘겨받은 계약일이 신규 주택 취득일보다 늦으면 계산 요청 전에 막는다", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("n", "2018-03-01")],
    formOver: { transferDate: "2019-06-01", newHouseContractDate: "2018-04-01" },
  });
  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
  });
  await page.getByRole("button", { name: "가산세" }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText(/신규 주택 취득일보다 늦을 수 없습니다/).first()).toBeVisible();
  expect(posted, "⑧이 막았으면 계산 API를 부르지 않는다").toBe(false);
});

/**
 * 판정 메뉴 — OH-22(I-1) §154⑤ 단서 최종 1주택 재기산 처분 이력 입력 → 판정 (브라우저 경로)
 *
 * 엔진·route 주장은 anchor가 고정한다(`one-house-final-house-restart.anchor.test.ts` ·
 * `transfer.route.final-house-restart-oh22.anchor.test.ts`). 여기서만 관측되는 것은 **화면 입력이 실제로
 * 판정 본문에 실려 결론을 바꾸는가**다 — 3-state 라디오·날짜 칸·노출 범위가 DOM에서 연결돼야 한다.
 *
 * 시나리오: 비조정 1주택 2015-03-01 취득 · 5억 · 2022-03-01 양도.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seedOneHouse(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2022-03-01",
    contractTotalPrice: "500000000",
    wasRegulatedAtAcquisition: false,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2015-03-01",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    ],
    houses: [],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

test.describe("판정 메뉴 — §154⑤ 단서 최종 1주택 재기산", () => {
  test("[FR-1] 이력 미답 → 비과세 + 판정 보류 고지(본문에 키 없음)", async ({ page }) => {
    await seedOneHouse(page);
    await expect(page.getByTestId("final-house-restart-section")).toBeVisible();
    const body = await judge(page);
    expect(body).not.toHaveProperty("finalOneHouseRestart");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByText(/처분한 이력이 입력되지 않아/).first()).toBeVisible();
  });

  test("[FR-2] ★ 있음 · 양도 2021-06-01 · 일시적 2주택 아님 → 재기산 과세", async ({ page }) => {
    await seedOneHouse(page);
    await page.getByTestId("final-house-history-yes").click();
    await page.getByTestId("final-house-kind-transfer").click();
    await fillDateAndVerify(page, { year: "2021", month: "06", day: "01" }, {
      scope: page.getByTestId("final-house-date-0"),
    });
    await page.getByTestId("final-house-temp-0-no").click();
    await expect(page.getByTestId("final-house-restart-preview")).toContainText("2021-06-01부터 다시 셉니다");

    const body = await judge(page);
    expect(body.finalOneHouseRestart).toEqual({
      hadOtherHouseDisposal: true,
      disposals: [{ kind: "transfer", date: "2021-06-01", temporaryTwoHouseSpecial: false }],
    });
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByTestId("one-house-final-house-restart")).toContainText("2021-06-01부터 다시 셉니다");
  });

  test("[FR-3] 없음 → 비과세 · 취득일 기산 안내", async ({ page }) => {
    await seedOneHouse(page);
    await page.getByTestId("final-house-history-no").click();
    await judge(page);
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByTestId("one-house-final-house-restart")).toContainText("취득일부터 셉니다");
  });

  test("[FR-4] 있음인데 처분일을 비우면 판정으로 넘어가지 않는다(⑧)", async ({ page }) => {
    await seedOneHouse(page);
    await page.getByTestId("final-house-history-yes").click();
    await page.getByTestId("final-house-kind-transfer").click();
    await page.getByTestId("final-house-temp-0-no").click();
    await page.getByTestId("one-house-judge-cta").click();
    await expect(page.getByText(/처분일을 입력하세요/).first()).toBeVisible();
    await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
  });
});

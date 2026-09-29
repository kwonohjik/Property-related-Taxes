/**
 * 판정 메뉴 — 「판정 결과 보기」가 막혔을 때 그 사유가 **화면에 보여야** 한다.
 *
 * 🔴 결함: 오류 배너는 페이지 맨 위에 뜨는데 CTA는 맨 아래다. 「다음」(`handleNext`)은 위로
 *    스크롤하지만 CTA는 하지 않아, 막혀도 **아무 반응이 없는 것처럼** 보였다
 *    (공익사업 수용 선택 + 수용일 미입력 — 사용자 제보).
 *
 * ⚠️ `toBeVisible()`은 뷰포트 밖이어도 통과한다 — 그래서 [R4-3]이 이 결함을 못 잡았다.
 *    여기서는 `toBeInViewport()`로 단언한다.
 */
import { test, expect } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

test("[CTA-SCROLL-1] 공익사업 수용 + 수용일 미입력 → 차단 사유가 뷰포트에 보인다", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-07-01",
    contractTotalPrice: "900000000",
    wasRegulatedAtAcquisition: true,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2018-03-01",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    ],
    houses: [],
  });
  await page.getByTestId("proviso-reason-expropriation").click();

  const cta = page.getByTestId("one-house-judge-cta");
  await cta.scrollIntoViewIfNeeded();
  await cta.click();

  await expect(page.getByText(/수용일을 입력하세요/).first()).toBeInViewport();
  await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
});

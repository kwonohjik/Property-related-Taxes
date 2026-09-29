/**
 * 판정 메뉴 ③ — 「양도 대상 주택에 적용할 특례」 소제목 묶음.
 *
 * §154① 단서 · §155⑱ · §156의2⑤는 양도 대상 주택에 붙는 특례지만 노출이 ③ 명부에서 파생되므로
 * ③에 둔다(`SaleHouseSpecialsGroup` 머리 주석). 여기서는 **묶였는가**와 **판정 카드가 그 뒤에
 * 오는가**(요건 A·B를 바꾸는 입력 → 결과 순서)를 본다.
 */
import { test, expect } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

test("[SHS-1] 일시적 2주택 — 세 특례가 한 소제목 아래에 있고 요건 판정 카드는 그 뒤다", async ({ page }) => {
  // 기본 시드: 양도 대상 2017 취득 + 명부 2018 취득 1채 ⇒ 신규 주택 도출 · 일시적 2주택 맥락
  await gotoJudgmentHoldingsStep(page);

  const group = page.getByTestId("sale-house-specials");
  await expect(group).toHaveCount(1);
  await expect(group.getByText("양도 대상 주택에 적용할 특례")).toBeVisible();
  await expect(group.getByText("처분기한 예외 사유 (§155⑱)")).toBeVisible();
  await expect(group.getByText(/§154① 단서 — 보유·거주 요건 면제 사유/)).toBeVisible();
  await expect(group.getByText("대체주택 비과세 특례 해당 (§156의2⑤)")).toBeVisible();

  const groupBox = await group.boundingBox();
  const verdictBox = await page.getByTestId("temp-two-house-verdict").boundingBox();
  expect(groupBox && verdictBox, "소제목 묶음과 판정 카드가 모두 렌더돼야 한다").toBeTruthy();
  expect(verdictBox!.y).toBeGreaterThan(groupBox!.y + groupBox!.height - 1);
});

test("[SHS-2] 1주택 — §154① 단서도 같은 소제목 아래에 있다", async ({ page }) => {
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

  const group = page.getByTestId("sale-house-specials");
  await expect(group).toHaveCount(1);
  await expect(group.getByTestId("proviso-reason-expropriation")).toBeVisible();
  // 신규 주택이 없으면 §155⑱은 없다
  await expect(group.getByText("처분기한 예외 사유 (§155⑱)")).toHaveCount(0);
});

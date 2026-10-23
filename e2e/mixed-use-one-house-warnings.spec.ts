/**
 * 겸용주택 × 1세대1주택 「적용되지 않은 특례」 사유 — 브라우저 경로 (계획서 `docs/00-pm/mixed-use-one-house-warning-parity.plan.md` · Q-1 (a))
 *
 * 겸용주택에서 삭제 전 §154①4호를 골랐지만 등록 신청일(2019-12-17)이 부칙 기한(2019-12-16) 뒤라 적용되지 않으면,
 * 종전에는 결과 화면에 「§154① 요건 미충족」만 있고 4호를 왜 적용하지 않았는지가 없었다. 일반 주택과 같은 문장이 1건 보이는지 본다.
 * 경로별 단언은 anchor가 고정한다(`__tests__/calc/mixed-use-one-house-warnings.anchor.test.ts` MW-1).
 * 양도세 API는 모킹하지 않는다.
 *
 * 시료: 서울 강남 겸용주택 2018-06-01 취득(조정) · 거주 0 · 1주택 · 2026-06-01 양도 · 10억.
 */
import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";

const RENTAL_4HO_TEXT = /삭제 전 §154①4호 .*을 적용하지 않았습니다 — .*2019년 12월 16일 뒤/;

test("[MUW-1] 겸용주택 · 4호 미충족 — 결과 화면에 일반 주택과 같은 이유 1건", async ({ page }) => {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: withMixedHousingStd({
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2018-06-01",
      addressJibun: "서울특별시 강남구 역삼동 1",
      regionCode: "1168010100",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "700000000",
      isMixedUseHouse: true,
      residentialFloorArea: "100",
      nonResidentialFloorArea: "60",
      mixedUseTotalLandArea: "200",
      buildingFootprintArea: "100",
      mixedTransferHousingPrice: "600000000",
      mixedTransferLandPricePerSqm: "5000000",
      mixedTransferCommercialBuildingPrice: "100000000",
      mixedAcqHousingPrice: "300000000",
      mixedAcqLandPricePerSqm: "2500000",
      mixedAcqCommercialBuildingPrice: "50000000",
      mixedIsMetropolitanArea: true,
    }),
    formOver: {
      transferDate: "2026-06-01",
      filingDate: "2026-07-31",
      contractTotalPrice: "1000000000",
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      provisoReason: "rental_registration_4ho",
      proviso4hoBusinessRegDate: "2019-12-17",
      proviso4hoRentalRegDate: "2019-12-17",
      proviso4hoRegulatedOneHouse: "yes",
      proviso4hoStatus: "maintained",
      proviso4hoDuringMandatory: "no",
      proviso4hoRentOver5: "no",
    },
  });
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const request = resp.request().postDataJSON() as { mixedUse?: unknown };
  expect(request.mixedUse).toBeDefined();
  const result = ((await resp.json()) as { data: { result: { warnings?: string[] } } }).data.result;
  expect((result.warnings ?? []).filter((w) => RENTAL_4HO_TEXT.test(w))).toHaveLength(1);
  await expect(page.getByText(RENTAL_4HO_TEXT)).toHaveCount(1);
});

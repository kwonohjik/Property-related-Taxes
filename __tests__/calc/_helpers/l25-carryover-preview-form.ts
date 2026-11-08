/**
 * 레인 L25 공용 폼 — 이월과세(`carryover_gift`) 주택의 Step4 미리보기 2곳(한시 유예 나·다목 보유 2년 게이트 · §154⑤ 단서 재기산)이
 * 칸 없는 `acquisitionDate` 잔재(`residue`)가 아니라 증여 등기접수일(`gift` — 엔진이 읽는 취득일)을 읽는지 보는 시료.
 * 두 폼 모두 ⑧ 이슈 0건(주소·「분양권 없음」 확정까지 채움).
 */
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { carryoverFacts } from "./l24-carryover-residence-form";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

export const GANGNAM = "1168010100";

/** 한시 유예 나·다목 — 양도 2026-07-15 · 강남(조정대상지역) · 2주택 · 다목(계약 2026-04-01 · 계약금 증빙). */
export function graceForm(residue: string, gift: string, cause: "carryover_gift" | "purchase" = "carryover_gift"): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  Object.assign(f, {
    transferDate: "2026-07-15",
    filingDate: "2026-09-30",
    contractTotalPrice: "800000000",
    residencePeriodMonths: "0",
    householdHousingCount: "2",
    isOneHousehold: true,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    householdNoPresaleRightsConfirmed: true,
    houses: [
      {
        id: "h2",
        region: "capital",
        regionCode: GANGNAM,
        acquisitionDate: "2012-01-01",
        officialPrice: "300000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
    gracePeriod: { contractDate: "2026-04-01", isLandPermitTarget: false, depositReceiptConfirmed: true },
  });
  f.assets[0] = {
    ...f.assets[0],
    assetId: "a0",
    assetKind: "housing",
    acquisitionCause: cause,
    acquisitionDate: residue,
    acquisitionPrice: "100000000",
    fixedAcquisitionPrice: cause === "purchase" ? "100000000" : "",
    actualSalePrice: "800000000",
    useEstimatedAcquisition: false,
    regionCode: GANGNAM,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    ...(cause === "carryover_gift" ? { carryover: carryoverFacts(gift) } : {}),
  } as AssetForm;
  return f;
}

/** §154⑤ 단서 재기산 — 양도 2022-03-01 · 1주택 · 처분 2021-06-01(양도). */
export function restartForm(residue: string, gift: string, cause: "carryover_gift" | "purchase" = "carryover_gift"): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  Object.assign(f, {
    transferDate: "2022-03-01",
    filingDate: "2022-05-31",
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    residencePeriodMonths: "0",
    contractTotalPrice: "500000000",
    finalHouseRestartHistory: "yes",
    finalHouseRestartDisposals: [{ id: "d1", kind: "transfer", date: "2021-06-01", temporaryTwoHouse: "no" }],
  });
  f.assets[0] = {
    ...f.assets[0],
    assetId: "a0",
    assetKind: "housing",
    acquisitionCause: cause,
    acquisitionDate: residue,
    acquisitionPrice: "100000000",
    fixedAcquisitionPrice: cause === "purchase" ? "100000000" : "",
    actualSalePrice: "500000000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
    ...(cause === "carryover_gift" ? { carryover: carryoverFacts(gift) } : {}),
  } as AssetForm;
  return f;
}

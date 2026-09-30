/**
 * 명부형 3종의 **단일(명부 없는) 모드** — 수증자가 1인(또는 한 묶음)이라 계산 단위 토글이 맞는 입력 (7-15).
 * 각 픽스처는 `applied: true`여야 한다(과세되지 않는 입력으로는 게이트를 증명하지 못한다 — §8-F).
 */
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";

const CON = { preContribShares: 20_000, contributedShares: 20_000, allocatedShares: 20_000 };

/** 단일 모드 — 공통 토글이 걸려야 하는 입력 */
export const SINGLE_MODE: Record<string, DeemedGiftInput> = {
  // §38 단일 — 대주주등(majorShares) 한 묶음 (교재 사례2 MRG-S2 · 1,400,000,000)
  merger_single: {
    type: "merger", caseType: "stock", mergedPriceMode: "auto",
    overvaluedSharePrice: 10_000, preMergerShares: 200_000, exchangedShares: 100_000,
    underSharePrice: 50_000, underPreShares: 200_000, postMergerTotalShares: 300_000, majorShares: 70_000,
  } as DeemedGiftInput,
  // §39의2 단일 저가 — 대주주등 (R-CD-1 · 6,000,000)
  cd_single_low: {
    type: "capital_decrease", sharePrice: 10_000, redemptionPrice: 6_000,
    totalRedeemedShares: 10_000, majorPostRatio: { numer: 30, denom: 100 }, relatedRedeemedShares: 5_000,
  } as DeemedGiftInput,
  // §39의2 단일 고가 — 해당 주주등 (R-CD-H · 500,000,000)
  cd_single_high: {
    type: "capital_decrease", caseType: "high", sharePrice: 3_000, redemptionPrice: 8_000,
    ownRedeemedShares: 100_000, faceValue: 5_000,
  } as DeemedGiftInput,
  // §39의3 저가 명부 없음 — 수증자 = 현물출자자
  con_low: { type: "contribution", caseType: "low", preContribPrice: 7_500, newSharePrice: 2_500, ...CON } as DeemedGiftInput,
  // §39의3 저가 **명부 있음** — 명부는 증여자다. 수증자는 여전히 현물출자자 1인
  con_low_roster: {
    type: "contribution", caseType: "low", preContribPrice: 7_500, newSharePrice: 2_500, ...CON,
    // relation — ⑧ 3-E가 요구하는 행 관계(2026-09-30 ⑫ 필수화 #31). 엔진 가액에는 닿지 않는다(echo)
    parties: [{ name: "을", preShares: 10_000, relation: "father" }, { name: "정", preShares: 5_000, relation: "father" }],
  } as DeemedGiftInput,
  // §39의3 고가 명부 없음 — 특수관계 기존주주 한 묶음(relatedRatio)
  con_high: {
    type: "contribution", caseType: "high", preContribPrice: 1_000, newSharePrice: 2_000, ...CON,
    relatedRatio: { numer: 50, denom: 100 },
  } as DeemedGiftInput,
};

/** 명부 모드 — 수증자가 여럿이라 행별 축(7-13)을 쓴다. 공통 토글은 걸리면 안 된다 */
export const ROSTER_MODE: Record<string, DeemedGiftInput> = {
  merger_matrix: {
    ...SINGLE_MODE.merger_single, majorShares: 0,
    shareholders: {
      overvalued: [{ id: "gap", name: "갑", shares: 140_000 }, { id: "byung", name: "병", shares: 60_000 }],
      undervalued: [{ id: "gap", name: "갑", shares: 100_000 }, { id: "eul", name: "을", shares: 60_000 }, { id: "small", name: "소액", shares: 40_000 }],
      exchangeRatio: { numer: 1, denom: 2 },
    },
  } as DeemedGiftInput,
  cd_multi: {
    type: "capital_decrease", sharePrice: 30_000, preTotalShares: 200_000,
    shareholders: [
      { id: "s1", name: "갑", preShares: 100_000, redeemedShares: 100_000, redemptionPricePerShare: 10_000, relationGroup: "A" },
      { id: "s3", name: "병", preShares: 100_000, redeemedShares: 0, relationGroup: "A" },
    ],
  } as DeemedGiftInput,
  con_high_roster: {
    type: "contribution", caseType: "high", preContribPrice: 1_000, newSharePrice: 2_000, ...CON,
    parties: [{ name: "을", preShares: 10_000 }],
  } as DeemedGiftInput,
};

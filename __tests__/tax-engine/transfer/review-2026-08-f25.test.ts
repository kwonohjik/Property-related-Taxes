/**
 * F25 — 토지·건물 분리 자산에서 §114조의2 신축 가산세의 게이트·base가 자산-수준 플래그에
 * 묶여 있던 결함의 회귀 anchor (코드리뷰 2026-08).
 *
 * ## 법령
 * 「소득세법」 제114조의2 제1항 — 건물을 신축·증축하고 취득일부터 5년 이내에 양도하면서
 * §97①1호나목의 감정가액 또는 환산취득가액을 취득가액으로 하는 경우, **「해당 건물의」**
 * 감정가액 또는 환산취득가액의 100분의 5를 결정세액에 더한다(증축은 증축 부분 한정).
 * ⇒ base는 **건물분**이다. 토지 실취득가가 섞이면 안 된다.
 *
 * ## 결함 (수정 전 실측)
 * 토지 2015-05-01 실가 200,000,000 + 건물 2021-03-10 신축(환산) 별개취득, 양도 2024-06-01
 * 양도가 1,000,000,000(토지 700,000,000 + 건물 300,000,000), 건물 취득시 기준시가 225,000,000 /
 * 양도시 300,000,000 → **건물 환산취득가 225,000,000**:
 *
 *  | 경로 | penaltyTax | penaltyBase | totalTax |
 *  |---|---|---|---|
 *  | 현행 payload(`acquisitionMethod="actual"` · `buildingAcqMode="estimated"`) | **0** | 0 | 178,994,200 |
 *  | 자산 전체를 환산으로 전환 | **21,250,000** | 425,000,000(토지 실취득가 혼입) | 202,369,200 |
 *  | 법정 정답 = 225,000,000 × 5% | **11,250,000** | 225,000,000 | — |
 *
 * 파트 라디오(`landAcqMode`/`buildingAcqMode`)는 자산-수준 `acquisitionMethod`·
 * `useEstimatedAcquisition`을 갱신하지 않으므로, 게이트(`calculateBuildingPenalty`의
 * `isPenaltyMethod`)가 false가 되어 가산세가 통째로 사라졌다. 반대로 자산-수준을 환산으로 돌리면
 * `calcTransferGain`의 split 분기가 `estimatedBase = 토지 + 건물 합계`를 내어 base가 과대가 된다.
 *
 * ## 수정 (part-local)
 * `resolveSplitBuildingPenaltyAxis`(transfer-tax-finalize.ts)가 `splitDetail.building`의
 * `acqMode`·`acquisitionPrice`만 보고 게이트와 base를 정한다. 자산-수준 플래그를 파트에서
 * **역파생하지 않는다** — 그 플래그의 소비 지점이 엔진 안에만 35곳이라 과소를 과대로 바꿀 뿐이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/** 토지 실가(2015) + 건물 신축 환산(2021) 별개취득 — 5년 이내 양도 */
const SEPARATE_NEW_BUILDING: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferPrice: 1_000_000_000,
  transferDate: new Date("2024-06-01"),
  acquisitionDate: new Date("2021-03-10"),
  landAcquisitionDate: new Date("2015-05-01"),
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
  landAcquisitionPrice: 200_000_000,
  acquisitionPrice: 200_000_000,
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 300_000_000,
  saleSplitMode: "actual",
  buildingStandardPriceAtAcquisition: 225_000_000,
  standardPricePerSqmAtAcquisition: 3_000_000,
  acquisitionArea: 100,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
  isSelfBuilt: true,
  constructionDate: new Date("2021-03-10"),
  buildingType: "new",
  isOneHousehold: false,
  householdHousingCount: 0,
};

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({ ...SEPARATE_NEW_BUILDING, ...over } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("F25 — §114조의2 게이트·base는 건물 파트에서 온다", () => {
  it("🔴 파트 모드만 환산(자산-수준은 실가) → 가산세가 발동한다", () => {
    const r = run({ acquisitionMethod: "actual", useEstimatedAcquisition: false });
    expect(r.splitDetail?.building.acqMode).toBe("estimated");
    expect(r.splitDetail?.building.acquisitionPrice).toBe(225_000_000);
    expect(
      r.penaltyTax,
      "파트 라디오는 자산-수준 acquisitionMethod를 갱신하지 않는다 — 그것에만 매달리면 가산세가 사라진다",
    ).toBe(11_250_000);
    expect(r.penaltyBase).toBe(225_000_000);
    expect(r.totalTax).toBe(191_369_200);
  });

  it("🔴 자산-수준까지 환산이어도 base에 토지 실취득가가 섞이지 않는다", () => {
    const r = run({ acquisitionMethod: "estimated", useEstimatedAcquisition: true });
    expect(
      r.penaltyBase,
      "토지 200,000,000이 섞이면 425,000,000 × 5% = 21,250,000이 되어 법정액의 약 1.9배가 된다",
    ).toBe(225_000_000);
    expect(r.penaltyTax).toBe(11_250_000);
    expect(r.totalTax).toBe(191_369_200);
  });

  it("두 경로가 **같은 값**으로 수렴한다 (자산-수준 플래그는 더 이상 축이 아니다)", () => {
    const asActual = run({ acquisitionMethod: "actual", useEstimatedAcquisition: false });
    const asEstimated = run({ acquisitionMethod: "estimated", useEstimatedAcquisition: true });
    expect(asActual.penaltyTax).toBe(asEstimated.penaltyTax);
    expect(asActual.penaltyBase).toBe(asEstimated.penaltyBase);
  });

  it("건물 파트가 실가면 가산세 없음 — §114조의2①은 감정·환산 전용", () => {
    const r = run({
      acquisitionMethod: "actual",
      useEstimatedAcquisition: false,
      buildingAcqMode: "actual",
      buildingAcquisitionPrice: 300_000_000,
    });
    expect(r.splitDetail?.building.acqMode).toBe("actual");
    expect(r.penaltyTax).toBe(0);
    expect(r.penaltyBase).toBe(0);
  });

  it("신축·5년 요건은 그대로 산다 — 취득일부터 5년 초과 양도는 미발동", () => {
    const r = run({
      acquisitionMethod: "actual",
      useEstimatedAcquisition: false,
      transferDate: new Date("2027-06-01"),
    });
    expect(r.penaltyTax).toBe(0);
  });

  it("`isSelfBuilt` 미설정(신축 아님) → 미발동", () => {
    const r = run({ acquisitionMethod: "actual", useEstimatedAcquisition: false, isSelfBuilt: false });
    expect(r.penaltyTax).toBe(0);
  });
});

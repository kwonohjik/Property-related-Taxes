/**
 * anchor — 겸용주택 §164⑨ 1호 공익수용 특례 (계획 P7/D8, 일반 §97).
 *
 * 목별 독립 적용(KoreanLaw 확정): 주택분(라목 개별주택가격 총액) + 상가분(가목 토지 기준시가).
 * 상가 건물분(나목) 미적용(§80⑧). 각 부분 **환산 분모만** 낮추고 양도가액 안분(§166⑥)은 원값
 * (D16-GB 원리의 겸용 확장). PHD·4부분은 미적용(후속).
 *
 * 베이스: 일반 §97 겸용(acqHousingPrice 공시). 수용 보상: 주택분 6억·기초 7억(개별주택가격 8.72억↓),
 *   상가토지분 2억·기초 2.5억. 검증: 각 부분 환산취득가↑·양도가액 안분 landTransferPrice **불변**.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();

/** 일반 §97 겸용(취득시 개별주택가격 공시) + 선택적 §164⑨ 필드 */
function mixed97(over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    usePreHousingDisclosure: false,
    preHousingDisclosure: undefined,
    acquisitionStandardPrice: {
      housingPrice: 400_000_000, // 공시 → 일반 §97 (PHD 아님)
      commercialBuildingPrice: 30_000_000,
      landPricePerSqm: 2_380_000,
    },
    ...over,
  };
}

function run(asset: MixedUseAssetInput) {
  return calcMixedUseTransferTax(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, asset, rates);
}

describe("겸용주택 §164⑨ 1호 (P7/D8, 일반 §97)", () => {
  const base = run(mixed97()); // 수용 아님
  const expr = run(
    mixed97({
      transferCause: "public_expropriation",
      housingCompensationTotal: 600_000_000,
      housingCompensationBasisTotal: 700_000_000,
      commercialLandCompensationTotal: 200_000_000,
      commercialLandCompensationBasisTotal: 250_000_000,
    }),
  );

  it("baseline(수용 아님) — §164⑨ detail 미부착", () => {
    expect(base.expropriationDetail).toBeUndefined();
  });

  it("주택분 — 환산취득가↑(개별주택가격 8.72억→6억) · 양도가액 안분 landTransferPrice 불변", () => {
    expect(expr.housingPart.estimatedAcquisitionPrice).toBeGreaterThan(
      base.housingPart.estimatedAcquisitionPrice,
    );
    // 양도가액 토지분 안분은 원 개별주택가격 기준 → 불변
    expect(expr.housingPart.landTransferPrice).toBe(base.housingPart.landTransferPrice);
    expect(expr.housingPart.buildingTransferPrice).toBe(base.housingPart.buildingTransferPrice);
    expect(expr.expropriationDetail?.housing?.standardTotal).toBe(872_000_000);
    expect(expr.expropriationDetail?.housing?.chosen).toBe(600_000_000);
  });

  it("상가분 — 토지분만 환산 분모↓ → 환산취득가↑ · 양도가액 안분 landTransferPrice 불변(건물분·안분 원값)", () => {
    expect(expr.commercialPart.estimatedAcquisitionPrice).toBeGreaterThan(
      base.commercialPart.estimatedAcquisitionPrice,
    );
    // 양도가액 토지/건물 안분비는 원 기준시가 기준 → 불변
    expect(expr.commercialPart.landTransferPrice).toBe(base.commercialPart.landTransferPrice);
    expect(expr.commercialPart.buildingTransferPrice).toBe(base.commercialPart.buildingTransferPrice);
    const cd = expr.expropriationDetail?.commercialLand;
    expect(cd).toBeDefined();
    expect(cd?.compensationTotal).toBe(200_000_000);
    expect(cd?.compensationBasisTotal).toBe(250_000_000);
    // chosen = min(상가토지 기준시가, 2억, 2.5억) — 상가토지 기준시가가 2억 초과면 2억
    expect(cd?.chosen).toBe(Math.min(cd!.standardTotal, 200_000_000, 250_000_000));
  });

  it("게이트 OFF — 보상 미입력(수용만) → detail 미부착·현행 불변", () => {
    const r = run(mixed97({ transferCause: "public_expropriation" }));
    expect(r.expropriationDetail).toBeUndefined();
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(base.housingPart.estimatedAcquisitionPrice);
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(base.commercialPart.estimatedAcquisitionPrice);
  });

  it("PHD 겸용 guard — 주택분 §164⑨ 미적용(후속) — PHD 분기 조기반환", () => {
    const r = run(
      mixed97({
        usePreHousingDisclosure: true,
        preHousingDisclosure: {
          firstDisclosureDate: new Date("2005-01-01"),
          firstDisclosureHousingPrice: 300_000_000,
          landPricePerSqmAtAcquisition: 1_000_000,
          buildingStdPriceAtAcquisition: 20_000_000,
          landPricePerSqmAtFirstDisclosure: 1_500_000,
          buildingStdPriceAtFirstDisclosure: 20_000_000,
          transferHousingPrice: 872_000_000,
          landPricePerSqmAtTransfer: 6_100_000,
          buildingStdPriceAtTransfer: 50_000_000,
        },
        transferCause: "public_expropriation",
        housingCompensationTotal: 600_000_000,
        housingCompensationBasisTotal: 700_000_000,
      }),
    );
    // PHD 주택분은 calcHousingEstimatedAcq 조기반환으로 §164⑨ 미적용 → housing detail 없음.
    expect(r.expropriationDetail?.housing).toBeUndefined();
  });
});

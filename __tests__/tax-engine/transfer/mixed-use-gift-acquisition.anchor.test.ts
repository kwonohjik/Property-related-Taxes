/**
 * 겸용주택 증여 취득가액 엔진 정합 (소득세법 시행령 §163⑨) — anchor 테스트
 *
 * 계획: docs/02-design/features/transfer-special-engine-gift-acquisition-163-9.plan.md §1.1(법제처 원문)
 * 설계: transfer-special-engine-gift-acquisition-163-9.engine.design.md (D1=옵션B)
 *
 * 검증 핵심: 겸용 엔진의 취득가액이 증여 취득 시 "환산"(§97)이 아닌 "증여일 평가액 직접"(§163⑨)으로
 * 산정 — 공시(비-PHD, fallback ??) / 미공시(PHD, max §164⑦) 두 경로 + 개산공제 배제 + 필요경비 반영.
 * §163⑨은 상속·증여 공통이므로 상속 케이스와 동일 산정(reported 필드 재사용, resolve 불변).
 *
 * golden 수치는 상속 anchor(mixed-use-inheritance-acquisition)와 동일 입력 → 동일 결과여야 함
 * (§163⑨ 상속·증여 동일 취급). 원단위 실측 고정.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../_helpers/mock-rates";

afterEach(cleanup);

const RATES = makeMockRates();
const TRANSFER_PRICE = 3_300_000_000;
const GIFT_DATE = new Date("2020-06-01");
const TRANSFER_DATE = new Date("2026-06-01");

/** 공시 증여 겸용 표준 케이스 — 증여일 개별주택가격 5억(주택 100㎡:상가 100㎡). 상속 anchor inheritedBase 미러. */
function giftBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: GIFT_DATE,
    buildingAcquisitionDate: GIFT_DATE,
    transferStandardPrice: {
      housingPrice: 800_000_000,
      commercialBuildingPrice: 500_000_000,
      landPricePerSqm: 3_000_000,
    },
    // 증여일(=취득일) 현재 보충적평가액 — 주택 5억(§61)·상가건물 3억+토지(2M/㎡×100㎡)=5억
    acquisitionStandardPrice: {
      housingPrice: 500_000_000,
      commercialBuildingPrice: 300_000_000,
      landPricePerSqm: 2_000_000,
    },
    residencePeriodYears: 6,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    acquisitionByGift: true,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 증여 취득가액 엔진 정합 (소령 §163⑨, 상속과 동일)", () => {
  // G-1 공시·보충적평가 자동
  it("G-1(공시): housingInheritedValue 미입력 → 취득시 기준시가 직접, route=gift_direct, 개산공제 0", () => {
    const r = run(giftBase());
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("gift_direct");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(500_000_000);
    expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: null,
      standardPriceCandidate: 500_000_000,
      selected: "standard_price",
    });
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.housingPart.buildingAppraisalDed).toBe(0);
    // 상속 anchor와 동일 입력 → 동일 golden(§163⑨ 상속·증여 동일)
    expect(r.total.totalPayable).toBe(525_493_500);
  });

  // G-1b 신고가액 override (fallback, max 아님)
  it("G-1b(공시·override): housingInheritedValue 입력 → 신고가액 채택(reported)", () => {
    const r = run(giftBase({ housingInheritedValue: 550_000_000 }));
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(550_000_000);
    expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: 550_000_000,
      standardPriceCandidate: 500_000_000,
      selected: "reported",
    });
  });

  // G-1 상가분
  it("G-1(상가·공시): commercialInheritedValue 미입력 → acqTotalStd 직접", () => {
    const r = run(giftBase());
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(500_000_000);
    expect(r.commercialPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: null,
      standardPriceCandidate: 500_000_000,
      selected: "standard_price",
    });
    expect(r.commercialPart.landAppraisalDed).toBe(0);
    expect(r.commercialPart.buildingAppraisalDed).toBe(0);
  });

  // G-1 상가 override + 실비 (정정 2026-07-22: 필요경비 취득시 토지/건물 기준시가 40:60 안분)
  it("G-1b(상가·override+실비): commercialInheritedValue·Expense 반영(토지/건물 안분)", () => {
    const r = run(giftBase({ commercialInheritedValue: 700_000_000, commercialInheritedExpense: 5_000_000 }));
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(700_000_000);
    expect(r.commercialPart.landAppraisalDed).toBe(2_000_000);
    expect(r.commercialPart.buildingAppraisalDed).toBe(3_000_000);
    expect(r.commercialPart.landAppraisalDed + r.commercialPart.buildingAppraisalDed).toBe(5_000_000);
  });

  // G-5 정보 없음 방어
  it("G-5(방어): 주택분 신고가액·기준시가 모두 없음 → Error throw", () => {
    expect(() =>
      run(giftBase({ acquisitionStandardPrice: { ...giftBase().acquisitionStandardPrice, housingPrice: 0 } })),
    ).toThrow(/평가액 정보가 없습니다/);
  });

  // G-2 미공시(PHD) 주택분 max(신고가, §164⑦)
  describe("G-2 미공시(PHD) — §163⑨2호/§176의2②2호 max(신고가액, §164⑦ 환산)", () => {
    function phdGiftBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
      return giftBase({
        landAcquisitionDate: new Date("2000-06-01"),
        buildingAcquisitionDate: new Date("2000-06-01"),
        acquisitionStandardPrice: {
          housingPrice: undefined,
          commercialBuildingPrice: 300_000_000,
          landPricePerSqm: 2_000_000,
        },
        usePreHousingDisclosure: true,
        preHousingDisclosure: {
          firstDisclosureDate: new Date("2005-01-01"),
          firstDisclosureHousingPrice: 150_000_000,
          landPricePerSqmAtAcquisition: 800_000,
          buildingStdPriceAtAcquisition: 5_000_000,
          landPricePerSqmAtFirstDisclosure: 1_200_000,
          buildingStdPriceAtFirstDisclosure: 8_000_000,
          transferHousingPrice: 800_000_000,
          landPricePerSqmAtTransfer: 3_000_000,
          buildingStdPriceAtTransfer: 20_000_000,
        },
        ...overrides,
      });
    }

    it("G-2: 신고가액 미입력 → §164⑦ 환산 채택, route=gift_phd_max", () => {
      const r = run(phdGiftBase());
      expect(r.calculationRoute.acquisitionConversionRoute).toBe("gift_phd_max");
      expect(r.housingPart.estimatedAcquisitionPrice).toBe(99_609_375);
      expect(r.housingPart.inheritedAcquisitionDetail?.selected).toBe("standard_price");
    });

    it("G-2b: 신고가액 > §164⑦ 환산 → max로 신고가액 채택(reported)", () => {
      const r = run(phdGiftBase({ housingInheritedValue: 109_609_375 }));
      expect(r.housingPart.estimatedAcquisitionPrice).toBe(109_609_375);
      expect(r.housingPart.inheritedAcquisitionDetail?.selected).toBe("reported");
    });
  });

  // 회귀 — 비증여(매매) 불변
  it("R(회귀): acquisitionByGift 없으면 환산+§97 경로 완전 불변", () => {
    const r = run(giftBase({ acquisitionByGift: undefined }));
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");
    expect(r.housingPart.inheritedAcquisitionDetail).toBeUndefined();
  });
});

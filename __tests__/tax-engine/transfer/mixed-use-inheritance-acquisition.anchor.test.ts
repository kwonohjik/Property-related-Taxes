/**
 * 겸용주택 상속 취득가액 엔진 정합 (소득세법 시행령 §163⑨) — anchor 테스트
 *
 * 설계 문서: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.engine.design.md §11
 * 계획 문서: docs/02-design/features/transfer-mixed-use-inheritance-acquisition.plan.md §4.5(정본 계약)
 *
 * 검증 핵심: 겸용 엔진의 취득가액이 상속 취득 시 "환산"(§97)이 아닌 "상속개시일 평가액 직접"(§163⑨)으로
 * 산정되는지 — 공시(비-PHD, fallback ??) / 미공시(PHD, max) 두 경로 + 개산공제 배제 + 필요경비 반영 +
 * Phase 2 조합(4부분·용도변경·공익수용) 가드 + 비상속 회귀.
 *
 * golden 수치는 신규 코드 실행값을 원단위 그대로 고정한 것(추정 아님, 2026-07-20 실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  mixedUsePdfGap,
  GAP_TRANSFER_PRICE,
  GAP_TRANSFER_DATE,
} from "../_helpers/mixed-use-fixture";

afterEach(cleanup);

const RATES = makeMockRates();
const TRANSFER_PRICE = 3_300_000_000; // 33억 (Pre-Do 케이스 규모, plan.md §6)
const INHERITANCE_DATE = new Date("2020-06-01");
const TRANSFER_DATE = new Date("2026-06-01");

/**
 * 공시 상속 겸용 표준 케이스 — 상속개시일 개별주택가격 5억(주택 100㎡:상가 100㎡ = 50:50).
 * mixedUseCase14()는 land 1992/building 1997 별도 취득일(비상속 회귀 전용)이라
 * 본 기능은 landAcquisitionDate === buildingAcquisitionDate === 상속개시일인 신규 픽스처를 사용한다.
 */
function inheritedBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: INHERITANCE_DATE,
    buildingAcquisitionDate: INHERITANCE_DATE,
    transferStandardPrice: {
      housingPrice: 800_000_000,
      commercialBuildingPrice: 500_000_000,
      landPricePerSqm: 3_000_000,
    },
    // 상속개시일(=취득일) 현재 보충적평가액 — 주택 5억(§61)·상가건물 3억+토지(2M/㎡×100㎡)=5억(§62·§99)
    acquisitionStandardPrice: {
      housingPrice: 500_000_000,
      commercialBuildingPrice: 300_000_000,
      landPricePerSqm: 2_000_000,
    },
    residencePeriodYears: 6,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    acquisitionByInheritance: true,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 상속 취득가액 엔진 정합 (소득세법 시행령 §163⑨)", () => {
  // ─── 케이스#1 — 주택분 · 공시 · 보충적평가 자동(Pre-Do 케이스) ───
  it("케이스#1 A-golden(공시): housingInheritedValue 미입력 → acquisitionStandardPrice.housingPrice 그대로 취득가 사용", () => {
    const r = run(inheritedBase());
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("inheritance_direct");
    expect(r.acquisitionByInheritance).toBe(true);
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(500_000_000);
    expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: null,
      standardPriceCandidate: 500_000_000,
      selected: "standard_price",
    });
    // 총 납부세액 (원단위 golden — 회귀 방어)
    expect(r.total.transferTax).toBe(477_721_364);
    expect(r.total.localTax).toBe(47_772_136);
    expect(r.total.totalPayable).toBe(525_493_500);
  });

  // ─── 케이스#2 — 주택분 · 공시 · 상속세 신고가액(시가·감정) override ───
  it("케이스#2 A-golden(공시·override): housingInheritedValue 입력 시 신고가액이 취득가 채택(fallback, max 아님)", () => {
    const r = run(inheritedBase({ housingInheritedValue: 550_000_000 }));
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(550_000_000);
    expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: 550_000_000,
      standardPriceCandidate: 500_000_000,
      selected: "reported",
    });
  });

  // ─── 케이스#5 — 상가분(토지+건물) · 보충적평가 자동 ───
  it("케이스#5 A-golden(상가·공시): commercialInheritedValue 미입력 → acqTotalStd(토지+건물 보충적평가 합계) 그대로 사용", () => {
    const r = run(inheritedBase());
    // acqTotalStd = landPricePerSqm(2,000,000) × commercialLandArea(100㎡) + commercialBuildingPrice(300,000,000)
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(500_000_000);
    expect(r.commercialPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: null,
      standardPriceCandidate: 500_000_000,
      selected: "standard_price",
    });
  });

  // ─── 케이스#6 — 상가분 · 상속세 신고가액(시가·감정) override ───
  it("케이스#6 A-golden(상가·override): commercialInheritedValue 입력 시 신고가액 채택", () => {
    const r = run(inheritedBase({ commercialInheritedValue: 700_000_000 }));
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(700_000_000);
    expect(r.commercialPart.inheritedAcquisitionDetail).toEqual({
      reportedValue: 700_000_000,
      standardPriceCandidate: 500_000_000,
      selected: "reported",
    });
  });

  // ─── 케이스#7·#8 — 주택분·상가분 개산공제 배제 검증 ───
  it("케이스#7·#8 A-개산공제0: 상속 모드 landAppraisalDed/buildingAppraisalDed === 0(필요경비 미입력 시)", () => {
    const r = run(inheritedBase());
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.housingPart.buildingAppraisalDed).toBe(0);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
    expect(r.commercialPart.buildingAppraisalDed).toBe(0);
  });

  // ─── 케이스#10 — 주택분·상가분 실제 필요경비 override(건물분 슬롯 대체) ───
  it("케이스#10: housingInheritedExpense/commercialInheritedExpense → buildingAppraisalDed 슬롯에 그대로 반영(토지분은 0 유지)", () => {
    const r = run(
      inheritedBase({ housingInheritedExpense: 10_000_000, commercialInheritedExpense: 5_000_000 }),
    );
    expect(r.housingPart.buildingAppraisalDed).toBe(10_000_000);
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.commercialPart.buildingAppraisalDed).toBe(5_000_000);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
  });

  // ─── 케이스#9 — 비상속(purchase) 겸용주택 회귀 ───
  it("케이스#9 A-regression: 비상속 겸용은 환산+개산공제 경로 완전 불변", () => {
    const before = calcMixedUseTransferTax(
      2_300_000_000,
      new Date("2022-02-16"),
      mixedUseCase14(),
      RATES,
    );
    expect(before.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");
    expect(before.acquisitionByInheritance).toBeUndefined();
    expect(before.housingPart.inheritedAcquisitionDetail).toBeUndefined();
    expect(before.commercialPart.inheritedAcquisitionDetail).toBeUndefined();
  });

  // ─── 케이스#16 — 신고가액·기준시가 둘 다 없을 때 → 엔진 방어 오류 ───
  it("케이스#16 정보 없음 방어: 주택분 신고가액·기준시가 모두 없음 → Error throw", () => {
    expect(() =>
      run(
        inheritedBase({
          acquisitionStandardPrice: { ...inheritedBase().acquisitionStandardPrice, housingPrice: 0 },
        }),
      ),
    ).toThrow(/상속개시일 평가액 정보가 없습니다/);
  });

  // ─── 케이스#14 (가드) — 상속 + 보유 중 용도변경 조합, Phase 2 범위 밖 ───
  it("가드: 상속 취득 + 보유 중 일부 용도변경 조합 → Error throw (케이스#14, Phase 2 예정)", () => {
    expect(() =>
      run(inheritedBase({ partialUsageChange: { direction: "house_to_commercial" } })),
    ).toThrow(/보유 중 용도변경/);
  });

  // ─── 케이스#13 (가드) — 상속 + 공익수용 특례 조합, Phase 2 범위 밖 ───
  it("가드: 상속 취득 + §164⑨1호 공익수용 특례 조합 → Error throw (케이스#13, Phase 2 예정)", () => {
    expect(() => run(inheritedBase({ transferCause: "public_expropriation" }))).toThrow(
      /공익수용/,
    );
  });

  // ─── 케이스#3·#4 — 주택분 · 미공시(PHD) · §164⑦ 환산값만 / max(신고가액, §164⑦) ───
  describe("미공시(PHD) 상속 주택 — 소령 §163⑨2호 max(신고가액, §164⑦ 환산)", () => {
    function phdInheritedBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
      return inheritedBase({
        landAcquisitionDate: new Date("2000-06-01"),
        buildingAcquisitionDate: new Date("2000-06-01"),
        acquisitionStandardPrice: {
          housingPrice: undefined, // 미공시(PHD)
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

    it("케이스#3: 신고가액 미입력 → §164⑦ 환산(P_A_est) 그대로 채택(standard_price), route=inheritance_phd_max", () => {
      const r = run(phdInheritedBase());
      expect(r.calculationRoute.acquisitionConversionRoute).toBe("inheritance_phd_max");
      expect(r.housingPart.estimatedAcquisitionPrice).toBe(99_609_375);
      expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
        reportedValue: null,
        standardPriceCandidate: 99_609_375,
        selected: "standard_price",
      });
      expect(r.housingPart.landAppraisalDed).toBe(0);
      expect(r.housingPart.buildingAppraisalDed).toBe(0);
    });

    it("케이스#4: 신고가액(109,609,375) > §164⑦ 환산(99,609,375) → max 비교로 신고가액 채택(reported)", () => {
      const r = run(phdInheritedBase({ housingInheritedValue: 109_609_375 }));
      expect(r.housingPart.estimatedAcquisitionPrice).toBe(109_609_375);
      expect(r.housingPart.inheritedAcquisitionDetail).toEqual({
        reportedValue: 109_609_375,
        standardPriceCandidate: 99_609_375,
        selected: "reported",
      });
    });
  });

  // ─── 케이스#12 (가드) — 상속 + PHD 4부분 안분(Case A, 용도변경 결합) 조합, Phase 2 범위 밖 ───
  it("가드: 상속 취득 + PHD Case A 4부분 안분(용도변경 결합) 조합 → Error throw (케이스#12, Phase 2 예정)", () => {
    const asset: MixedUseAssetInput = {
      ...mixedUsePdfGap(),
      acquisitionByInheritance: true,
      preHousingDisclosure: {
        ...mixedUsePdfGap().preHousingDisclosure!,
        // 4부분 안분 게이트 — commercialBuildingStdPriceAtAcq/AtFirstDisclosure + totalTransferPriceForFourPart
        commercialBuildingStdPriceAtAcq: 6_890_152,
        commercialBuildingStdPriceAtFirstDisclosure: 6_257_940,
        totalTransferPriceForFourPart: GAP_TRANSFER_PRICE,
      },
    };
    expect(() =>
      calcMixedUseTransferTax(GAP_TRANSFER_PRICE, GAP_TRANSFER_DATE, asset, RATES),
    ).toThrow(/PHD 4부분 안분/);
  });
});

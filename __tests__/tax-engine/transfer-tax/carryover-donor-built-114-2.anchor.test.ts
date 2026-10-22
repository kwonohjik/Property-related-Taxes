/**
 * anchor — 이월과세 × 증여자 신축·증축 건물 「소득세법」 §114조의2 가산세 (PR-1 엔진)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (사용자 확정 D1~D4 · Q-1 R2 · Q-2 · Q-6 b)
 *
 * 규칙 요약
 *  · D1 5년 기산 = 증여자 신축일(증축이면 증축일) ~ 양도일, 5년 되는 날 당일 포함
 *  · D2 base = 증여자 기준 환산취득가액의 건물분(증축은 증축 부분)
 *  · D3(R2) 가산세는 **이월과세 A 채택**일 때만. ②3호 B 채택·②1호·②2호·③ 배제는 가산세 없음 — 비교(결정세액, 가산세 前)·채택은 불변
 *  · D4 건물분만 — 일체 주택은 개별주택가격을 토지:건물 기준시가 비율로 나눈 건물분(Q-2),
 *    양도가액 건물분은 `resolveTransferPriceSplit` 법정 서열(구분 기재 → §100③ → 감정 → 기준시가, Q-6 b)
 *
 * 수치는 계획서 §5 probe 실측(mock 세율, `makeMockRates`)이다 — 산식 추론이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

interface DonorBuiltOver {
  buildingType?: "new" | "extension";
  constructionDate?: Date;
  extensionFloorArea?: number;
  extensionStdPriceAtAcquisition?: number;
  housing?: Record<string, unknown>;
}

const HOUSING = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000,
  buildingStdPriceAtTransfer: 160_000_000,
};

/** 증여자 취득 2022-01-10(=신축일) · 증여 2024-05-01 · 양도 2026-03-01 — 계획서 §5 기준 셀 */
function cell(opts: {
  type: "building" | "housing";
  giftVal?: number;
  donorBuilt?: DonorBuiltOver | null;
  over?: Partial<TransferTaxInput>;
  ct?: Record<string, unknown>;
}): TransferTaxInput {
  const { type, giftVal = 800_000_000, donorBuilt, over, ct } = opts;
  const isHousing = type === "housing";
  const db: DonorBuiltOver | null | undefined =
    donorBuilt === null
      ? undefined
      : donorBuilt === undefined
        ? undefined
        : {
            buildingType: "new",
            constructionDate: D("2022-01-10"),
            ...(isHousing ? { housing: HOUSING } : {}),
            ...donorBuilt,
          };
  return baseTransferInput({
    propertyType: type,
    isOneHousehold: false,
    householdHousingCount: isHousing ? 2 : 0,
    residencePeriodMonths: 0,
    transferPrice: 1_000_000_000,
    transferDate: D("2026-03-01"),
    acquisitionPrice: 0,
    acquisitionDate: D("2024-05-01"),
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: isHousing ? 200_000_000 : 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: D("2024-05-01"),
      donorAcquisitionDate: D("2022-01-10"),
      useEstimatedAcquisition: true,
      giftTaxAmount: 0,
      giftDateValuation: giftVal,
      ...(db ? { donorBuilt: db } : {}),
      ...ct,
    },
    ...over,
  } as unknown as Partial<TransferTaxInput>);
}

const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);

describe("DB-0 회귀 — donorBuilt 부재면 현행과 같다 (가산세 0, 세액 불변)", () => {
  it("비주택 건물 A 채택: 현행 총납부 170,337,200 · 가산세 0", () => {
    const r = run(cell({ type: "building" }));
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r.penaltyTax).toBe(0);
    expect(r.totalTax).toBe(170_337_200);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty).toBeUndefined();
  });
  it("비주택 건물 ②3호 B 채택: 현행 총납부 218,900,000", () => {
    const r = run(cell({ type: "building", giftVal: 500_000_000 }));
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("B");
    expect(r.penaltyTax).toBe(0);
    expect(r.totalTax).toBe(218_900_000);
  });
});

describe("DB-1 비주택 건물 · A 채택 — 증여자 환산취득가액 전체가 base (D2)", () => {
  it("가산세 25,000,000 = 환산 5억 × 5% · 총납부 170,337,200 → 197,837,200 (+27,500,000)", () => {
    const r = run(cell({ type: "building", donorBuilt: {} }));
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r.penaltyBase).toBe(500_000_000);
    expect(r.penaltyTax).toBe(25_000_000);
    expect(r.determinedTax).toBe(154_852_000); // 결정세액은 가산세 前 — 불변
    expect(r.localIncomeTax).toBe(17_985_200); // (결정세액 + 가산세) × 10%
    expect(r.totalTax).toBe(197_837_200);
    const echo = r.carryoverTaxationDetail!.donorBuiltPenalty!;
    expect(echo).toMatchObject({ applied: true, base: 500_000_000, penalty: 25_000_000, buildingType: "new" });
    expect(echo.fifthAnniversary).toBe("2027-01-10");
  });

  it("가산세 설명 step 에 증여자 신축이 구분되어 실린다", () => {
    const r = run(cell({ type: "building", donorBuilt: {} }));
    const step = r.steps.find((s) => s.label.includes("환산가액적용가산세"));
    expect(step?.formula).toContain("증여자");
  });
});

describe("DB-2 일체 주택 · A 채택 — 건물분만 (Q-2: 개별주택가격 토지:건물 비례 안분)", () => {
  it("B_acq 75,000,000 · B_tr 160,000,000 · S_b 400,000,000 → base 187,500,000 → 가산세 9,375,000 · 총납부 180,649,700 (+10,312,500)", () => {
    const r = run(cell({ type: "housing", donorBuilt: {} }));
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r.penaltyBase).toBe(187_500_000);
    expect(r.penaltyTax).toBe(9_375_000);
    expect(r.totalTax).toBe(180_649_700);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit).toEqual({
      acquisitionBuilding: 75_000_000,
      transferBuilding: 160_000_000,
      saleBuilding: 400_000_000,
    });
  });
  it("토지분이 섞인 일체 전체 환산(5억)이 아니다 — D4", () => {
    const r = run(cell({ type: "housing", donorBuilt: {} }));
    expect(r.penaltyBase).not.toBe(500_000_000);
  });
  it("증축(증축 부분 취득시 기준시가 1,500만): S_b × 15,000,000 ÷ B_tr = 37,500,000 → 가산세 1,875,000", () => {
    const r = run(
      cell({
        type: "housing",
        donorBuilt: { buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000 },
      }),
    );
    expect(r.penaltyBase).toBe(37_500_000);
    expect(r.penaltyTax).toBe(1_875_000);
  });
});

describe("DB-2b Q-6(b) — 양도가액 건물분은 resolveTransferPriceSplit 법정 서열", () => {
  const withSale = (sale: Record<string, unknown>) =>
    cell({ type: "housing", donorBuilt: { housing: { ...HOUSING, sale } } });

  it("구분 기재 토지 7억/건물 3억 (안분값 6억/4억과 25% 차이 < 30%) → 구분 기재 채택 S_b=300,000,000 → base 140,625,000", () => {
    const r = run(withSale({ landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 }));
    expect(r.penaltyBase).toBe(140_625_000);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty!.housingSplit!.saleBuilding).toBe(300_000_000);
  });
  it("구분 기재 토지 8억/건물 2억 (안분값 대비 건물 50% 차이 ≥ 30%) → §100③ 불분명 의제 → 안분값 S_b=400,000,000 → base 187,500,000", () => {
    const r = run(withSale({ landTransferPrice: 800_000_000, buildingTransferPrice: 200_000_000 }));
    expect(r.penaltyBase).toBe(187_500_000);
  });
  it("감정평가 토지 3억/건물 1억 (기준시가보다 우선) → S_b=250,000,000 → base 117,187,500", () => {
    const r = run(withSale({ landAppraisalAtTransfer: 300_000_000, buildingAppraisalAtTransfer: 100_000_000 }));
    expect(r.penaltyBase).toBe(117_187_500);
    expect(r.penaltyTax).toBe(5_859_375);
  });
});

describe("DB-3 R2 — 수증자 취득가액이 실지거래가액(증여 당시 평가액)인 경우는 가산세 없음", () => {
  it("②3호 B 채택: 가산세 0 · 총납부 218,900,000(현행과 같다) · 채택 시나리오도 현행과 같다", () => {
    const r = run(cell({ type: "building", giftVal: 500_000_000, donorBuilt: {} }));
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("B");
    expect(r.penaltyTax).toBe(0);
    expect(r.totalTax).toBe(218_900_000);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "scenario_b" });
  });

  it("격자 — 평가액 5.0~6.4억: 채택(A/B)과 비교 세액이 donorBuilt 유무와 모든 셀에서 같다", () => {
    for (const g of [500, 520, 540, 560, 580, 600, 620, 640]) {
      const a = run(cell({ type: "building", giftVal: g * 1e6 }));
      const b = run(cell({ type: "building", giftVal: g * 1e6, donorBuilt: {} }));
      expect(b.carryoverTaxationDetail!.adoptedScenario, `${g}`).toBe(a.carryoverTaxationDetail!.adoptedScenario);
      expect(b.carryoverTaxationDetail!.scenarioA.determinedTax, `${g}`).toBe(a.carryoverTaxationDetail!.scenarioA.determinedTax);
      expect(b.carryoverTaxationDetail!.scenarioB.determinedTax, `${g}`).toBe(a.carryoverTaxationDetail!.scenarioB.determinedTax);
      expect(b.determinedTax, `${g}`).toBe(a.determinedTax);
      if (a.carryoverTaxationDetail!.adoptedScenario === "B") expect(b.totalTax, `${g}`).toBe(a.totalTax);
      else expect(b.penaltyTax, `${g}`).toBe(25_000_000);
    }
  });

  it("③ 기간 초과(증여 후 10년 경과)로 이월과세 부적격 → B 고정 · 가산세 0", () => {
    const base = cell({
      type: "building",
      donorBuilt: { constructionDate: D("2010-01-10") },
      ct: { giftRegistryDate: D("2012-05-01"), donorAcquisitionDate: D("2010-01-10") },
      over: { acquisitionDate: D("2012-05-01"), transferDate: D("2026-03-01") },
    });
    const r = run(base);
    expect(r.carryoverTaxationDetail!.isEligible).toBe(false);
    expect(r.penaltyTax).toBe(0);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "carryover_excluded" });
  });
});

describe("DB-4 5년 경계 · 시행일 · 증축 85㎡ (기존 calculateBuildingPenalty 게이트 승계)", () => {
  const at = (construction: string, transfer: string, over?: Partial<TransferTaxInput>) =>
    run(
      cell({
        type: "building",
        donorBuilt: { constructionDate: D(construction) },
        ct: { donorAcquisitionDate: D(construction) },
        over: { transferDate: D(transfer), ...over },
      }),
    );
  it("신축일 + 5년 되는 날 당일 → 부과", () => {
    expect(at("2021-03-01", "2026-03-01").penaltyTax).toBe(25_000_000);
  });
  it("신축일 + 5년 다음 날 → 없음 (echo: outside_penalty_window)", () => {
    const r = at("2021-03-01", "2026-03-02");
    expect(r.penaltyTax).toBe(0);
    expect(r.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: false, notAppliedReason: "outside_penalty_window" });
  });
  it("윤년 2/29 신축 → 5년 후 2/28 까지 / 3/1 부터 제외", () => {
    expect(at("2020-02-29", "2025-02-28").penaltyTax).toBe(25_000_000);
    expect(at("2020-02-29", "2025-03-01").penaltyTax).toBe(0);
  });
  it("환산 시행일 이전 양도(2017-12-31) → 없음", () => {
    const r = run(
      cell({
        type: "building",
        donorBuilt: { constructionDate: D("2016-01-01") },
        ct: { giftRegistryDate: D("2016-06-01"), donorAcquisitionDate: D("2016-01-01") },
        over: { acquisitionDate: D("2016-06-01"), transferDate: D("2017-12-31") },
      }),
    );
    expect(r.penaltyTax).toBe(0);
  });
  const ext = (area: number) =>
    run(
      cell({
        type: "building",
        donorBuilt: {
          buildingType: "extension",
          extensionFloorArea: area,
          extensionStdPriceAtAcquisition: 80_000_000,
        },
      }),
    );
  it("증축 85㎡ → 없음 / 85.01㎡ → 증축 부분 환산 1,000,000,000 × 80,000,000 ÷ 400,000,000 = 200,000,000 의 5% = 10,000,000", () => {
    expect(ext(85).penaltyTax).toBe(0);
    const r = ext(85.01);
    expect(r.penaltyBase).toBe(200_000_000);
    expect(r.penaltyTax).toBe(10_000_000);
  });
});

describe("DB-5 §114조의2② — 산출세액이 없어도(양도차손) 부과", () => {
  it("증여자 환산 15억 > 양도가 10억: 결정세액 0 · 가산세 75,000,000 · 지방소득세 7,500,000 · 총납부 82,500,000", () => {
    const r = run(
      cell({
        type: "building",
        giftVal: 1_500_000_000,
        donorBuilt: {},
        over: { standardPriceAtAcquisition: 600_000_000 },
      }),
    );
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r.determinedTax).toBe(0);
    expect(r.penaltyBase).toBe(1_500_000_000);
    expect(r.penaltyTax).toBe(75_000_000);
    expect(r.localIncomeTax).toBe(7_500_000);
    expect(r.totalTax).toBe(82_500_000);
  });
});

describe("DB-6 입력 거부 — 조용히 무시하지 않는다", () => {
  const throwsInvalid = (i: TransferTaxInput, re: RegExp) => {
    expect(() => run(i)).toThrow(TaxCalculationError);
    expect(() => run(i)).toThrow(re);
  };
  it("증여자 취득가액이 실가 승계(환산 OFF)면 §114조의2 대상이 아니다", () => {
    throwsInvalid(
      cell({
        type: "building",
        donorBuilt: {},
        ct: { useEstimatedAcquisition: false, donorAcquisitionPrice: 100_000_000 },
        over: { useEstimatedAcquisition: false },
      }),
      /환산/,
    );
  });
  it("신축일이 증여자 취득일보다 앞 / 증여 등기접수일보다 뒤", () => {
    throwsInvalid(cell({ type: "building", donorBuilt: { constructionDate: D("2021-01-01") } }), /신축|증축/);
    throwsInvalid(cell({ type: "building", donorBuilt: { constructionDate: D("2024-06-01") } }), /신축|증축/);
  });
  it("증축인데 바닥면적·증축 부분 기준시가 미입력", () => {
    throwsInvalid(cell({ type: "building", donorBuilt: { buildingType: "extension" } }), /바닥면적/);
    throwsInvalid(
      cell({ type: "building", donorBuilt: { buildingType: "extension", extensionFloorArea: 100 } }),
      /기준시가/,
    );
  });
  it("일체 주택인데 건물분 산정 입력(L·N·L_T·N_T) 누락 — 합계 역산 fallback 없음", () => {
    throwsInvalid(cell({ type: "housing", donorBuilt: { housing: undefined } }), /건물/);
    throwsInvalid(
      cell({ type: "housing", donorBuilt: { housing: { ...HOUSING, buildingStdPriceAtAcquisition: 0 } } }),
      /건물/,
    );
    throwsInvalid(
      cell({ type: "housing", donorBuilt: { housing: { ...HOUSING, landStdPriceAtTransfer: 0 } } }),
      /양도/,
    );
  });
  it("지원하지 않는 자산(토지)·개별주택가격 미공시 환산(PHD)·분리 계산·부담부증여", () => {
    throwsInvalid(cell({ type: "building", donorBuilt: {}, over: { propertyType: "land" } }), /주택|건물/);
    throwsInvalid(
      cell({
        type: "building",
        donorBuilt: {},
        over: {
          preHousingDisclosure: {
            firstDisclosureDate: D("2005-04-30"),
            firstDisclosureHousingPrice: 100_000_000,
            transferHousingPrice: 400_000_000,
            landAreaM2: 100,
            totalAreaM2: 100,
            priceAtAcquisitionLand: 1,
            priceAtAcquisitionBuilding: 1,
            priceAtFirstDisclosureLand: 1,
            priceAtFirstDisclosureBuilding: 1,
          } as never,
        },
      }),
      /개별주택가격|공시|환산/,
    );
    throwsInvalid(cell({ type: "building", donorBuilt: {}, over: { landAcquisitionDate: D("2010-01-01") } }), /분리|토지/);
    throwsInvalid(
      cell({
        type: "building",
        donorBuilt: {},
        over: { transferType: "burdened_gift", burdenedGiftInfo: {} as never },
      }),
      /부담부증여/,
    );
  });
});

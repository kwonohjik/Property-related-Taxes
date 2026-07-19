/**
 * Pre-Do 앵커 — 일시적 2주택 §155① 요건 A: 종전주택 취득 후 1년 경과 후 신규주택 취득
 *
 * 계획서: docs/02-design/features/transfer-temporary-two-house-155-auto-judge.plan.md §6 (TT-1·TT-2)
 * 갭(D1): 현행 checkExemption E-3(transfer-tax-exemption.ts:216~253)은
 *         종전주택 보유요건 + 신규취득+3년 deadline만 판정, §155① "1년 경과" 요건 미검사.
 * 세법: 소득세법 시행령 §155① — 종전주택 취득일부터 1년 이상 지난 후 신규주택 취득.
 *       예외: §154①1호·2호가목·3호(임대5년·수용·부득이)는 1년 요건 미적용(waiver).
 *
 * ★ TT-2가 D1 격리 핵심: 보유 2년 통과 + 3년 deadline 통과 + 1년 미경과.
 *   → 현행 엔진은 특례 O(오판), D1 수정 후 특례 X(정답).
 *   보유 2년 미달로 세팅하면 기존 보유요건에서 이미 과세되어 갭이 드러나지 않음(Pre-Do 발견).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

function tt(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 500_000_000, // < 12억 → 전액 비과세 판정
    acquisitionPrice: 300_000_000,
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    ...over,
  });
}

describe("일시적 2주택 §155① 1년 경과 요건 (D1 앵커)", () => {
  // TT-1 정상(control): 종전 2018-01-01 → 신규 2020-01-01(24개월↑) → 양도 2021-06-01(3년내)
  //   보유 3.4년 ≥ 2년. 1년 경과 O. → 현행·수정 후 모두 비과세(불변).
  it("TT-1 정상: 1년 경과 + 3년내 + 보유2년↑ → 비과세 (불변)", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2018-01-01"),
        transferDate: new Date("2021-06-01"),
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2018-01-01"),
          newAcquisitionDate: new Date("2020-01-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // ★ TT-2 D1 격리: 종전 2020-01-01 → 신규 2020-06-01(5개월, 1년 미경과) → 양도 2022-06-01
  //   보유 2.4년 ≥ 2년(보유요건 통과), deadline 2023-06-01 ≥ 양도(3년 통과).
  //   유일한 결함 = 1년 미경과. 현행 엔진: 특례 O(오판/RED). D1 수정 후: 특례 X(GREEN).
  it("★ TT-2 1년 미경과: 보유2년↑·3년내여도 특례 X (RED→GREEN, D1)", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2022-06-01"),
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2020-01-01"),
          newAcquisitionDate: new Date("2020-06-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // TT-경계: 신규취득 = 종전취득 + 정확히 1년 → "1년 이상 지난 후" 충족(>=) → 비과세
  it("TT-경계 1년 정각: 신규=종전+1년 → 요건 A 충족 → 비과세", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2018-01-01"),
        transferDate: new Date("2021-06-01"),
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2018-01-01"),
          newAcquisitionDate: new Date("2019-01-01"), // 정확히 1년
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // TT-3 요건 B(3년 초과): 1년 경과·보유OK지만 양도가 신규취득+3년 초과 → 과세(현행 동작 불변)
  it("TT-3 3년 초과: 신규취득+3년 경과 후 양도 → 특례 X", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2018-01-01"),
        transferDate: new Date("2023-06-01"), // deadline 2023-01-01 초과
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2018-01-01"),
          newAcquisitionDate: new Date("2020-01-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // TT-4 waiver(수용): 1년 미경과여도 §154①2호가목(수용, proviso 조건충족) → 1년 요건 면제 → 비과세
  it("TT-4 수용 waiver: 1년 미경과여도 특례 O (요건 A 면제)", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2021-01-01"),
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2020-01-01"),
          newAcquisitionDate: new Date("2020-06-01"), // 5개월, 1년 미경과
        },
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2020-06-01"), // 취득(2020-01-01) < 사업인정 → 적격
          expropriationDate: new Date("2020-12-01"), // 양도일부터 5년 내
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // TT-8 waiver + 3년 초과: 1년 면제되어도 요건 B(3년) 미달 → 특례 X
  it("TT-8 수용 waiver + 3년 초과: 특례 X (요건 B 미달)", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2024-01-01"), // deadline 2023-06-01 초과
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2020-01-01"),
          newAcquisitionDate: new Date("2020-06-01"),
        },
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2020-06-01"),
          expropriationDate: new Date("2023-06-01"), // 양도일부터 5년 내
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // TT-9 waiver 불성립(proviso 조건 미충족): 수용 사유 선택하나 취득이 사업인정 후(부적격)
  //   → resolveExemptionProviso null → 1년 요건 부활 → 1년 미경과 → 특례 X (과잉면제 방지, R4)
  it("TT-9 수용 사유선택하나 proviso 조건 미충족 → 1년 요건 부활 → 특례 X", () => {
    const r = calculateTransferTax(
      tt({
        acquisitionDate: new Date("2020-01-01"),
        transferDate: new Date("2022-06-01"), // 보유 2.4년(보유요건 통과)
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2020-01-01"),
          newAcquisitionDate: new Date("2020-06-01"), // 1년 미경과
        },
        oneHouseExemptionProviso: {
          reason: "expropriation",
          businessApprovalDate: new Date("2019-01-01"), // 취득(2020-01-01) ≥ 사업인정 → 부적격(null)
          expropriationDate: new Date("2022-01-01"),
        },
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });
});

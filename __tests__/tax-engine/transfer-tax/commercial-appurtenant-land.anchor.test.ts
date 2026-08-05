/**
 * anchor — 상업용건물·오피스텔(CB) 부수토지 기준면적 초과분 비사업용 중과 (Phase B)
 *
 * 설계: `docs/02-design/features/commercial-building-appurtenant-land-nbl.plan.md`
 *   · 채택 설계 안 B-2 (§5.2) — 공용 헬퍼 판정 → `nonBusinessLandAreaRatio` 주입
 *   · 구분소유 판정 모델 ㉮ (§2.3) — 지분율이 약분되어 전체 대지·바닥면적만으로 확정
 *
 * 케이스 매트릭스 C-1·C-2·C-6·C-9·C-10·C-14 대응.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/** STEP 0.62 판정이 기록됐는지 — 결과 타입에 `isNonBusinessLand`가 없으므로 step으로 확인한다. */
const hasExcessStep = (r: TransferTaxResult): boolean =>
  (r.steps ?? []).some((s) => s.label === "부수토지 기준면적 초과분 비사업용 판정");

/** 상가 1호 양도 — 10년 보유, 양도 12억 / 취득 6억. */
const cb = (overrides: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "commercial_building",
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    transferPrice: 1_200_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: new Date("2014-06-01"),
    transferDate: new Date("2024-06-01"),
    ...overrides,
  });

/** 집합건물 전체 — 대지 1,200㎡ / 바닥 200㎡. 상업지역 3배면 기준면적 600㎡ → 초과 600㎡(1/2). */
const totals = { totalLandArea: 1200, totalBuildingFootprintArea: 200 };

describe("CB-1 (C-1) — 기준면적 이내면 현행과 동일 (회귀 가드)", () => {
  it("녹지지역 7배 → 기준면적 1,400㎡ ≥ 대지 1,200㎡ → 중과 없음", () => {
    const withJudgment = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "green" } }),
      rates,
    );
    const baseline = calculateTransferTax(cb(), rates);

    expect(withJudgment.calculatedTax).toBe(baseline.calculatedTax);
    expect(hasExcessStep(withJudgment)).toBe(false); // 초과 0 → 판정 STEP 미기록
  });

  it("판정 입력을 아예 안 주면 no-op (현행 동작 불변)", () => {
    expect(calculateTransferTax(cb(), rates).calculatedTax).toBe(
      calculateTransferTax(cb({ commercialAppurtenantLand: undefined }), rates).calculatedTax,
    );
  });
});

describe("CB-2 (C-2) — 초과분이 있으면 중과된다", () => {
  it("상업지역 3배 → 기준면적 600㎡ · 초과 600㎡ → 세액이 증가한다", () => {
    const baseline = calculateTransferTax(cb(), rates);
    const surcharged = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "commercial" } }),
      rates,
    );

    expect(surcharged.calculatedTax).toBeGreaterThan(baseline.calculatedTax);
  });

  it("초과 비율은 지분율과 무관하게 전체 면적만으로 확정된다 (모델 ㉮ — 지분 약분)", () => {
    // 전체 대지 1,200 · 바닥 200 · 3배 → 초과 600/1200 = 0.5.
    // 지분율을 어떻게 잡든 이 비율은 변하지 않으므로, 같은 전체값이면 세액이 같다.
    const a = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "commercial" } }),
      rates,
    );
    const b = calculateTransferTax(
      cb({
        commercialAppurtenantLand: {
          totalLandArea: 2400,
          totalBuildingFootprintArea: 400, // 배율 동일 → 초과비율 동일(0.5)
          zoneType: "commercial",
        },
      }),
      rates,
    );
    expect(b.calculatedTax).toBe(a.calculatedTax);
  });

  it("배율이 클수록 초과분이 줄어 세액이 작거나 같다", () => {
    const tax = (zone: string) =>
      calculateTransferTax(
        cb({ commercialAppurtenantLand: { ...totals, zoneType: zone } }),
        rates,
      ).calculatedTax;

    // 상업 3배(초과 1/2) ≥ 일반주거 4배(초과 1/3) ≥ 녹지 7배(초과 0)
    expect(tax("commercial")).toBeGreaterThanOrEqual(tax("general_residential"));
    expect(tax("general_residential")).toBeGreaterThanOrEqual(tax("green"));
  });
});

describe("CB-3 (C-6) — §101① 단서: 허가·사용승인 미이행은 전량 비사업용", () => {
  it("배율 무관 전량 중과 — 용도지역이 없어도 차단되지 않는다", () => {
    const r = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, isUnregistered: true } }),
      rates,
    );
    expect(hasExcessStep(r)).toBe(true);
    expect(r.calculatedTax).toBeGreaterThan(calculateTransferTax(cb(), rates).calculatedTax);
  });

  it("녹지지역(7배·초과 0)이어도 단서가 우선한다", () => {
    const withinLimit = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "green" } }),
      rates,
    );
    const unregistered = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "green", isUnregistered: true } }),
      rates,
    );
    expect(unregistered.calculatedTax).toBeGreaterThan(withinLimit.calculatedTax);
  });
});

describe("CB-4 (C-9·C-10) — 배율 결정 불가는 추정하지 않고 차단한다", () => {
  it("용도지역 미입력 → 예외", () => {
    expect(() =>
      calculateTransferTax(cb({ commercialAppurtenantLand: { ...totals } }), rates),
    ).toThrow(/용도지역/);
  });

  it("세분 전 주거지역(residential) → 예외", () => {
    expect(() =>
      calculateTransferTax(
        cb({ commercialAppurtenantLand: { ...totals, zoneType: "residential" } }),
        rates,
      ),
    ).toThrow(/제101조 제2항/);
  });

  it("오류 메시지에 상업용건물 경로가 표시된다", () => {
    expect(() =>
      calculateTransferTax(cb({ commercialAppurtenantLand: { ...totals } }), rates),
    ).toThrow(/상업용건물/);
  });
});

describe("CB-5 (C-11) — 취득방법과 무관하게 동작한다", () => {
  it("상속 취득(환산 미적용 경로)에서도 초과분이 중과된다", () => {
    const base = cb({
      acquisitionCause: "inheritance",
      decedentAcquisitionDate: new Date("2010-01-01"),
    });
    const baseline = calculateTransferTax(base, rates);
    const surcharged = calculateTransferTax(
      { ...base, commercialAppurtenantLand: { ...totals, zoneType: "commercial" } },
      rates,
    );
    expect(surcharged.calculatedTax).toBeGreaterThan(baseline.calculatedTax);
  });
});

describe("CB-6 (C-14) — 비율만 주입하고 플래그를 안 켜면 무효 (함정 가드)", () => {
  it("isNonBusinessLand 없이 nonBusinessLandAreaRatio만 있으면 중과가 적용되지 않는다", () => {
    // `transfer-tax-rate-calc.ts`의 중과 분기는 isNonBusinessLand를 함께 요구한다.
    // STEP 0.62가 두 값을 **함께** 주입하는 이유를 고정한다.
    const ratioOnly = calculateTransferTax(
      cb({ nonBusinessLandAreaRatio: 0.5 }),
      rates,
    );
    expect(ratioOnly.calculatedTax).toBe(calculateTransferTax(cb(), rates).calculatedTax);

    // 반면 STEP 0.62를 태우면 둘 다 주입되어 중과가 걸린다.
    const viaStep = calculateTransferTax(
      cb({ commercialAppurtenantLand: { ...totals, zoneType: "commercial" } }),
      rates,
    );
    expect(viaStep.calculatedTax).toBeGreaterThan(ratioOnly.calculatedTax);
  });
});

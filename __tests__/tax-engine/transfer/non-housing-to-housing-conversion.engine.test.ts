/**
 * Phase B — 비주택 → 주택 용도변경 장기보유특별공제 혼합 분기 (「소득세법」 §95⑤·⑥)
 *
 * 계획서 케이스 매트릭스: docs/02-design/features/non-housing-to-housing-conversion.plan.md §6
 *   C-2  양도일 < 2025-01-01 → 미적용
 *   C-4  표2 대상 아님 → 미적용 (표1 단독·전기간)
 *   C-5  주택 보유기간 < 3년 → 표2 보유분 0%, 거주분은 지급
 *   C-6  비주택 보유기간 < 3년 → 표1 0%
 *   C-7  표1 + 표2 보유분 > 40% → 40% 캡 (§95⑤1호 단서)
 *   C-8·C-9  주거용 사용 개시일이 취득일 이전·양도일 이후 → throw
 *   C-25 공동소유 지분 → 공제율은 지분과 직교
 *
 * 공제율 헬퍼 단위 검증(3년 가드·40% 캡·정수 % 유지)은 `conversion-holding-pct.test.ts`가
 * 담당한다. 여기는 **엔진 통합 경로**가 그 값을 실제로 쓰는지를 고정한다.
 *
 * 전 케이스 12억 초과 고가주택이다 — 12억 이하는 1세대1주택 비과세로 전액 빠져
 * 장기보유특별공제가 세액에 드러나지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 15억 양도·6억 취득 고가주택 (PDF 사례 30과 같은 금액 축) — 과세 양도차익 178,540,000 */
function conv(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2026-01-27"),
    acquisitionPrice: 600_000_000,
    acquisitionDate: new Date("2018-02-10"),
    expenses: 7_300_000,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 36, // 거주 3년 → 표2 거주분 12%
    isUnregistered: false,
    ...overrides,
  });
}

/** 토글 입력 — 절사 개월은 Phase E(API 변환 계층)가 채운다. 엔진은 표시용으로만 흘린다. */
function toggle(residentialUseStartDate: string, residenceMonthsTrimmed = 0) {
  return {
    nonHousingToHousingConversion: {
      residentialUseStartDate: new Date(residentialUseStartDate),
      residenceMonthsTrimmed,
    },
  };
}

const TAXABLE_GAIN = 178_540_000;

describe("§95⑤ 혼합 공제 — 기간 구성별 공제율", () => {
  it("C-5 주택 보유 3년 미만 — 표2 보유분 0%, 거주분은 지급", () => {
    // 비주택 2018-02-10 ~ 2023-06-01 = 5년 3개월 → 5년 → 표1 10%
    // 주택   2023-06-01 ~ 2026-01-27 = 2년 7개월 → 2년 → 표2 보유 0% (3년 가드)
    // 거주   3년 → 12% (총 보유 7년 ≥ 3년이므로 지급)
    const r = calculateTransferTax(conv(toggle("2023-06-01")), rates);

    expect(r.usageConversionDetail).toMatchObject({
      nonHousingYears: 5,
      housingYears: 2,
      table1Pct: 10,
      table2HoldingPct: 0,
      residencePct: 12,
      holdingRateCapped: false,
    });
    expect(r.longTermHoldingRate).toBeCloseTo(0.22, 10);
    expect(r.longTermHoldingDeduction).toBe(39_278_800); // 178,540,000 × 22%
  });

  it("C-6 비주택 보유 3년 미만 — 표1 0%, 주택분만", () => {
    // 비주택 2018-02-10 ~ 2020-06-01 = 2년 3개월 → 2년 → 표1 0%
    // 주택   2020-06-01 ~ 2026-01-27 = 5년 7개월 → 5년 → 표2 보유 20%
    const r = calculateTransferTax(conv(toggle("2020-06-01")), rates);

    expect(r.usageConversionDetail).toMatchObject({
      nonHousingYears: 2,
      housingYears: 5,
      table1Pct: 0,
      table2HoldingPct: 20,
      residencePct: 12,
    });
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10);
    expect(r.longTermHoldingDeduction).toBe(57_132_800); // 178,540,000 × 32%
  });

  it("C-7 보유분 합계 40% 초과 — §95⑤1호 단서로 40%에서 자른다", () => {
    // 비주택 2005-01-10 ~ 2018-01-10 = 12년 → 표1 24% (초일불산입 — 13주년 하루 전)
    // 주택   2018-01-10 ~ 2026-01-27 =  8년 → 표2 보유 32%
    // raw 56% → 40% 캡. 거주분 12%는 별도 → 총 52%
    const r = calculateTransferTax(
      conv({ acquisitionDate: new Date("2005-01-10"), ...toggle("2018-01-10") }),
      rates,
    );

    expect(r.usageConversionDetail).toMatchObject({
      nonHousingYears: 12,
      housingYears: 8,
      table1Pct: 24,
      table2HoldingPct: 32,
      residencePct: 12,
      holdingRateCapped: true,
    });
    expect(r.longTermHoldingRate).toBeCloseTo(0.52, 10);
    expect(r.longTermHoldingDeduction).toBe(92_840_800); // 178,540,000 × 52%
  });
});

describe("§95⑤ 적용 게이트", () => {
  it("C-2 양도일이 2024-12-31이면 적용하지 않는다 — 부칙 제19933호 제7조", () => {
    const r = calculateTransferTax(
      conv({ transferDate: new Date("2024-12-31"), ...toggle("2022-11-25") }),
      rates,
    );

    expect(r.usageConversionDetail).toBeUndefined();
    // 현행 표2 — 총 보유 2018-02-10 ~ 2024-12-31 = 6년 → 24% + 거주 12% = 36%
    expect(r.longTermHoldingRate).toBeCloseTo(0.36, 10);
  });

  it("★ 2025-01-01 정확일 양도는 적용한다 (경계 — 로컬 자정 파싱)", () => {
    // 비주택 2018-02-10 ~ 2022-11-25 = 4년 → 표1 8%
    // 주택   2022-11-25 ~ 2025-01-01 = 2년 → 표2 보유 0% (3년 미만)
    const r = calculateTransferTax(
      conv({ transferDate: new Date("2025-01-01"), ...toggle("2022-11-25") }),
      rates,
    );

    expect(r.usageConversionDetail).toMatchObject({
      nonHousingYears: 4,
      housingYears: 2,
      table1Pct: 8,
      table2HoldingPct: 0,
    });
  });

  it("C-4 표2 대상이 아니면(1세대1주택 아님) 적용하지 않는다 — 표1 단독·전기간", () => {
    const r = calculateTransferTax(
      conv({ householdHousingCount: 2, ...toggle("2022-11-25") }),
      rates,
    );

    expect(r.usageConversionDetail).toBeUndefined();
    // 표1 — 총 보유 7년 × 2% = 14% (용도변경으로 쪼개지 않는다)
    expect(r.longTermHoldingRate).toBeCloseTo(0.14, 10);
  });

  it("C-4' 통산 거주 2년 미만이면 적용하지 않는다", () => {
    const r = calculateTransferTax(
      conv({ residencePeriodMonths: 12, ...toggle("2022-11-25") }),
      rates,
    );

    expect(r.usageConversionDetail).toBeUndefined();
  });

  it("토글이 없으면 현행 그대로다 (C-1 회귀 0)", () => {
    const r = calculateTransferTax(conv(), rates);

    expect(r.usageConversionDetail).toBeUndefined();
    expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10); // 보유 7년 28% + 거주 12%
  });
});

describe("§95⑥ 주거용 사용 개시일 — 구조적 위반은 조용히 넘기지 않는다", () => {
  it("C-8 취득일 이전이면 throw — 엔진 단독 호출은 validation을 거치지 않는다", () => {
    expect(() =>
      calculateTransferTax(conv(toggle("2017-01-01")), rates),
    ).toThrow(TaxCalculationError);
  });

  it("C-9 양도일 이후여도 throw", () => {
    expect(() =>
      calculateTransferTax(conv(toggle("2026-06-01")), rates),
    ).toThrow(/취득일 이후·양도일 이전/);
  });
});

describe("R-2 §154⑤ 단서 — 비과세 보유기간은 주거용 사용일부터 기산한다 (Phase C)", () => {
  /** 12억 이하 — 비과세 여부가 세액을 가르도록. 거주 3년이라 거주요건은 항상 충족한다. */
  function exempt(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return conv({ transferPrice: 1_000_000_000, ...overrides });
  }

  it("C-11 주거용 사용일 기준 보유 2년 미달이면 비과세가 아니다", () => {
    // 취득 2018-02-10 기준으로는 7년이지만, 주거용 사용일 2024-03-20 기준으로는 1년 10개월.
    const r = calculateTransferTax(exempt(toggle("2024-03-20")), rates);
    expect(r.isExempt).toBe(false);
  });

  it("주거용 사용일 기준 보유 2년을 채우면 비과세다", () => {
    // 2023-01-01 ~ 2026-01-27 = 3년 → 보유요건 충족
    const r = calculateTransferTax(exempt(toggle("2023-01-01")), rates);
    expect(r.isExempt).toBe(true);
  });

  it("C-2' 양도일이 2024-02-29면 단서를 적용하지 않는다 — 취득일 기준 비과세", () => {
    const r = calculateTransferTax(
      exempt({ transferDate: new Date("2024-02-29"), ...toggle("2023-01-01") }),
      rates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("★ 2024-03-01 정확일 양도부터 단서를 적용한다 (경계 — 대통령령 제34265호)", () => {
    // 주거용 사용일 2023-01-01 → 2024-03-01까지 1년 2개월이라 보유 2년 미달 → 과세.
    // 같은 입력이 하루 전(2024-02-29)에는 위 케이스처럼 비과세다.
    const r = calculateTransferTax(
      exempt({ transferDate: new Date("2024-03-01"), ...toggle("2023-01-01") }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("토글이 없으면 §154⑧3호 상속 통산 backdate가 그대로 산다 (회귀 0)", () => {
    // 상속개시 2025-06-01(보유 8개월)이지만 동일세대 통산 기산일 2015-01-01 → 보유요건 충족.
    const inherited = {
      acquisitionDate: new Date("2025-06-01"),
      acquisitionCause: "inheritance" as const,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: new Date("2015-01-01"),
    };
    const r = calculateTransferTax(exempt(inherited), rates);
    expect(r.isExempt).toBe(true);

    // 통산 기산일이 없으면 상속개시일 기준 8개월이라 비과세가 아니다 — backdate가 실제로 작동한 증거.
    const noBackdate = calculateTransferTax(
      exempt({ ...inherited, decedentCohabitationHoldingStartDate: undefined }),
      rates,
    );
    expect(noBackdate.isExempt).toBe(false);
  });

  it("두 사유가 겹치면 §154⑤ 단서가 이긴다 — 상속 통산으로 우회할 수 없다", () => {
    // ⚠️ 이 조합은 validation(C-21)이 차단한다. 순서는 엔진 단독 호출에서만 드러난다.
    const r = calculateTransferTax(
      exempt({
        acquisitionDate: new Date("2025-06-01"),
        acquisitionCause: "inheritance",
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationHoldingStartDate: new Date("2015-01-01"),
        ...toggle("2025-08-01"), // 주거용 사용일 기준 보유 5개월
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("R-3 거주요건 판정 시점 — 주택이 된 날 기준 (Phase D)", () => {
  /**
   * 서면-2020-부동산-5098 [부동산납세과-1247] — 거주요건은 **주택 취득시점** 기준.
   * 비주택으로 취득했다면 주거용 사용 개시일이 그 시점이다.
   *
   * 김포 동지역(4157010100)은 2020-12 지정 → 2022 하반기 해제라 한 코드로 양방향을 만든다.
   * ⚠️ regionCode가 없으면 boolean fallback이라 기준일이 판정에 쓰이지 않는다.
   */
  const GIMPO = "4157010100";

  it("C-12 취득시 조정 · 용도변경시 비조정 → 거주요건 미적용", () => {
    const base = {
      regionCode: GIMPO,
      acquisitionDate: new Date("2021-06-01"), // 지정 기간
      residencePeriodMonths: 0, // 거주 0 — 요건이 부과되면 반드시 탈락한다
      transferPrice: 1_000_000_000, // 12억 이하 — 비과세 여부가 드러나도록
    };

    // 용도변경 2023-06-01(해제 후)이 기준 → 조정대상지역이 아니므로 거주요건 자체가 없다
    const r = calculateTransferTax(conv({ ...base, ...toggle("2023-06-01") }), rates);
    expect(r.isExempt).toBe(true);

    // 토글이 없으면 취득일(2021-06-01, 지정 중) 기준이라 거주 0으로 탈락한다 — 기준일이 결론을 가른다
    const without = calculateTransferTax(conv(base), rates);
    expect(without.isExempt).toBe(false);
  });

  it("C-13 취득시 비조정 · 용도변경시 조정 → 거주요건 적용 (대칭)", () => {
    const base = {
      regionCode: GIMPO,
      acquisitionDate: new Date("2019-06-01"), // 미지정 기간
      residencePeriodMonths: 0,
      transferPrice: 1_000_000_000,
      transferDate: new Date("2025-06-01"),
    };

    // 용도변경 2021-06-01(지정 중)이 기준 → 거주 2년이 필요한데 0이라 탈락
    const r = calculateTransferTax(conv({ ...base, ...toggle("2021-06-01") }), rates);
    expect(r.isExempt).toBe(false);

    // 토글이 없으면 취득일(2019-06-01, 미지정) 기준이라 거주요건이 없어 비과세
    const without = calculateTransferTax(conv(base), rates);
    expect(without.isExempt).toBe(true);
  });

  it("regionCode가 없으면 boolean fallback이라 기준일이 판정을 바꾸지 않는다", () => {
    // 정밀 판정 경로가 아니면 폼이 넘긴 wasRegulatedAtAcquisition을 그대로 신뢰한다.
    const r = calculateTransferTax(
      conv({
        wasRegulatedAtAcquisition: true,
        residencePeriodMonths: 0,
        transferPrice: 1_000_000_000,
        ...toggle("2023-06-01"),
      }),
      rates,
    );
    expect(r.isExempt).toBe(false); // 거주 0 → 요건 미충족
  });
});

describe("C-25 공동소유 지분 — 공제율은 지분과 직교한다", () => {
  it("50% 지분이면 공제율은 같고 공제액만 절반이다", () => {
    // 총 물건 15억 중 50% 지분 양도. 12억 안분 분모는 총 물건 양도가액(15억).
    const r = calculateTransferTax(
      conv({
        transferPrice: 750_000_000,
        totalPropertyTransferPrice: 1_500_000_000,
        acquisitionPrice: 300_000_000,
        expenses: 3_650_000,
        ...toggle("2022-11-25"),
      }),
      rates,
    );

    expect(r.taxableGain).toBe(TAXABLE_GAIN / 2); // 89,270,000
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10); // 지분과 무관
    expect(r.longTermHoldingDeduction).toBe(28_566_400); // 57,132,800 / 2
    expect(r.usageConversionDetail).toMatchObject({ table1Pct: 8, table2HoldingPct: 12 });
  });
});

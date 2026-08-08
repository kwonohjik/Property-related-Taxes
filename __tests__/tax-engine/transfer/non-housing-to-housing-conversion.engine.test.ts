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
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type {
  AggregateTransferInput,
  TransferTaxItemInput,
} from "@/lib/tax-engine/types/transfer-aggregate.types";

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

describe("Phase H — 다자산 경로·이력 왕복", () => {
  it("다자산에서도 primary 자산의 §95⑤이 적용된다", () => {
    // Phase E에서 request body 도달은 고정했으나 **엔진 결과**는 미확인이었다.
    // 함께 양도한 토지가 있어도 주 자산의 혼합 공제율은 단건과 같아야 한다.
    const primary: TransferTaxItemInput = {
      ...(conv(toggle("2022-11-25")) as unknown as TransferTaxItemInput),
      propertyId: "primary",
      propertyLabel: "오피스텔",
    };
    const land: TransferTaxItemInput = {
      ...(baseTransferInput({
        propertyType: "land",
        transferPrice: 300_000_000,
        acquisitionPrice: 250_000_000,
        acquisitionDate: new Date("2018-06-01"),
        transferDate: new Date("2026-01-27"),
        isOneHousehold: false,
        householdHousingCount: 0,
      }) as unknown as TransferTaxItemInput),
      propertyId: "land-1",
      propertyLabel: "토지",
    };
    const input: AggregateTransferInput = {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [primary, land],
    };

    const r = calculateTransferTaxAggregate(input, rates);
    const p = r.properties.find((x) => x.propertyId === "primary")!;

    expect(p.longTermHoldingDeduction).toBe(57_132_800); // 단건과 동일
    expect(p.usageConversionDetail).toMatchObject({
      nonHousingYears: 4,
      housingYears: 3,
      table1Pct: 8,
      table2HoldingPct: 12,
      residencePct: 12,
    });
  });

  it("★ 이력 JSON 왕복 후에도 echo가 살아남는다", () => {
    // 결과는 IndexedDB에 JSON으로 저장·복원된다. `residentialUseStartDate`를 Date로 두면
    // 왕복 후 문자열이 되어 결과 카드가 깨진다 — 그래서 처음부터 string으로 설계했다.
    const r = calculateTransferTax(conv(toggle("2022-11-25", 5)), rates);
    const revived = JSON.parse(JSON.stringify(r)) as typeof r;

    expect(revived.usageConversionDetail).toEqual(r.usageConversionDetail);
    expect(typeof revived.usageConversionDetail!.residentialUseStartDate).toBe("string");
    expect(revived.usageConversionDetail!.residenceMonthsTrimmed).toBe(5);
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

/**
 * I 시리즈 — 상속 취득 × 용도변경 (계획서
 * `non-housing-to-housing-conversion-inheritance-c21.plan.md` §5)
 *
 * §154⑧3호는 "**상속받은 주택**으로서"를 전제한다. 그런데 C-8이 이중으로
 * (`transfer-tax-validate-usage-conversion.ts:37` · `usage-period-info.ts:41`)
 * 용도변경일 > 취득일을 강제하고, 상속의 취득일은 **상속개시일**이다.
 * ⇒ 토글 ON인 상속은 언제나 「상속개시 당시 **비주택**」이라 통산 요건이 성립하지 않는다.
 *
 * 통산은 **표2 대상 판정**에만 쓰이므로(공제율 거주분은 실거주 유지 — 사전법령해석재산 2021-202),
 * 이 배제가 세액을 바꾸는 지점은 **I-3 하나**다. I-3이 없으면 게이트가 no-op이어도 초록이 된다.
 */
describe("I: 상속 취득 × 용도변경 — §154⑧3호 통산 배제", () => {
  /** 동일세대 상속 통산 입력 */
  function inherited(residenceMonths: number, cohabitMonths: number) {
    return {
      acquisitionCause: "inheritance" as const,
      residencePeriodMonths: residenceMonths,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationResidenceMonths: cohabitMonths,
    };
  }

  it("I-1 상속 + 동일세대 아님 → 통산 자체가 없어 현행과 같다", () => {
    const r = calculateTransferTax(
      conv({ acquisitionCause: "inheritance", ...toggle("2022-11-25") }),
      rates,
    );

    expect(r.usageConversionDetail).toMatchObject({ table1Pct: 8, table2HoldingPct: 12 });
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10); // 보유 20% + 실거주 3년 12%
  });

  it("I-2 상속 동일세대 + 상속인 실거주 2년 → 통산 없이도 표2 대상 성립", () => {
    const r = calculateTransferTax(
      conv({ ...inherited(24, 24), ...toggle("2022-11-25") }),
      rates,
    );

    // 통산(48개월)이든 실거주(24개월)든 2년 이상이라 대상 판정 결과가 같다.
    expect(r.usageConversionDetail).toMatchObject({ table1Pct: 8, table2HoldingPct: 12 });
    expect(r.longTermHoldingRate).toBeCloseTo(0.28, 10); // 보유 20% + 실거주 2년 8%
  });

  it("I-3 상속 동일세대 + 실거주 2년 미만 — 통산으로 표2 대상을 만들지 않는다", () => {
    const r = calculateTransferTax(
      conv({ ...inherited(12, 24), ...toggle("2022-11-25") }),
      rates,
    );

    // 통산하면 36개월(3년)이라 표2 대상이 되지만, 상속개시 당시 비주택이므로 §154⑧3호가
    // 적용되지 않는다 → 실거주 12개월(1년) < 2년 → 표2 대상 탈락 → 표1 단독·전기간.
    expect(r.usageConversionDetail).toBeUndefined();
    expect(r.longTermHoldingRate).toBeCloseTo(0.14, 10); // 총 보유 7년 × 2%
  });

  it("I-6 토글 OFF면 통산 그대로 — 상속 회귀 0", () => {
    const r = calculateTransferTax(conv(inherited(12, 24)), rates);

    // 용도변경이 없으면 「상속받은 주택」 전제가 깨지지 않는다 → 통산 유지.
    expect(r.usageConversionDetail).toBeUndefined();
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10); // 표2 보유 7년 28% + 실거주 1년 4%
  });
});

/**
 * K 시리즈 — 이월과세(§97의2) × 용도변경 (계획서
 * `non-housing-to-housing-conversion-carryover-c21.plan.md` §7)
 *
 * 「소득세법」 §95④ 단서가 **전체 보유기간**의 기산일을(이월과세면 증여자 취득일),
 * §95⑥이 그중 **주택으로 보유한 기간**의 기산일을(주거용 사용일) 각각 정한다 — 충돌이 아니다.
 * ⇒ 비주택 기간은 자연히 「증여자 취득일 ~ 주거용 사용일」이 된다.
 *
 * ⚠️ 이월과세는 **시나리오 A(적용)와 B(미적용)를 모두 계산해 세액을 비교**한다(§97의2②3호).
 *    두 시나리오는 **서로 다른 취득일**을 쓴다 — A는 증여자 취득일, B는 증여 등기접수일.
 *    한쪽만 맞으면 비교 자체가 틀린 값으로 이뤄지므로 **양쪽을 함께 고정**한다.
 */
describe("K: 이월과세 × 용도변경 — 시나리오별 기산일", () => {
  const DONOR_ACQ = new Date("2010-01-01");
  const GIFT_REG = new Date("2018-06-01");

  /** 이월과세 입력 — 증여자 취득일 2010-01-01 · 증여 등기 2018-06-01 */
  function carryover(overrides: Record<string, unknown> = {}) {
    return {
      acquisitionCause: "carryover_gift" as const,
      acquisitionDate: DONOR_ACQ, // API 변환이 채우는 값(폼은 giftRegistryDate fallback)
      carryoverTaxation: {
        giftRegistryDate: GIFT_REG,
        donorAcquisitionDate: DONOR_ACQ,
        useEstimatedAcquisition: false,
        donorAcquisitionPrice: 300_000_000,
        giftTaxAmount: 0,
        giftDateValuation: 700_000_000,
        ...overrides,
      },
    };
  }

  it("K-2 전환일이 증여 등기일 **이후** — A·B 모두 분해 가능하고 계산이 끝까지 간다", () => {
    const r = calculateTransferTax(
      conv({ ...carryover(), ...toggle("2020-03-01") }),
      rates,
    );

    // 이월과세 판정 자체가 성립한다(용도변경이 이 축을 깨뜨리지 않는다)
    expect(r.carryoverTaxationDetail).toBeDefined();
    // 채택 시나리오의 기산일로 분해된 §95⑤ 결과가 나온다
    expect(r.usageConversionDetail).toBeDefined();
    expect(r.usageConversionDetail!.residentialUseStartDate).toBe("2020-03-01");
  });

  it("K-4 전환일이 증여자 취득일과 등기일 **사이** — 시나리오 B가 기간을 나눌 수 없다", () => {
    // A(증여자 취득일 2010 기산)는 통과하지만 B(등기일 2018 기산)는 전환일이 취득일 이전이라
    // 기간 분해가 불가능하다. 폼 경로는 validate가 막아야 하는데 지금은 막지 못한다(계획 D-3).
    expect(() =>
      calculateTransferTax(conv({ ...carryover(), ...toggle("2015-01-01") }), rates),
    ).toThrow(TaxCalculationError);
  });
});

/**
 * R-G — 「그 보유기간 중 거주기간」 클램프가 §154① 비과세를 가른다 (2026-08-09)
 *
 * ## 이 블록이 존재하는 이유
 *
 * 종전 계획서는 이 클램프를 **「명문 없는 불리 적용」**(R-G)으로 기록하고, 근거 예규가 나오면
 * 정식 근거로 승격하기로 남겨 뒀다. 2026-08-09 법문 전수 확인 결과 **그 서술이 틀렸다** —
 * 근거는 이미 조문에 있다:
 *
 *   - **「소득세법 시행령」 제154조 제1항 괄호**: 취득 당시 조정대상지역 주택은
 *     "해당 주택의 보유기간이 2년 … 이상이고 **그 보유기간 중 거주기간이 2년 이상**인 것"
 *   - **같은 조 제5항**: "**제1항에 따른 보유기간**의 계산은 법 제95조제4항에 따른다.
 *     다만, 주택이 아닌 건물을 사실상 주거용으로 사용하거나 … 그 보유기간은 해당 자산을
 *     **사실상 주거용으로 사용한 날** … 부터 양도한 날까지로 한다."
 *
 * ⇒ ⑤ 단서가 「제1항의 보유기간」을 주거용 사용일부터로 **재정의**하고, ①이 요구하는 것은
 *   **「그 보유기간 중」의 거주**다. 주거용 사용일 이전의 거주는 정의상 그 기간 안에 없다.
 *   클램프는 문언 그대로이지 창작이 아니다.
 *
 * ❌ 종전 반대 근거였던 **§154⑥**("거주기간은 전입일부터 전출일까지")은 **개별 거주 구간의
 *    시종을 정의**할 뿐 **어느 구간을 산입하는가**를 정하지 않는다. ①의 「그 보유기간 중」을
 *    놓친 독법이었다. 이 논거를 되살리지 말 것.
 *
 * ⚠️ 예규·심판례는 여전히 **0건**이다(§154⑤ 단서가 2024-03-01 신설이라 실무 해석 미형성).
 *    조문 해석으로 확정한 것이지 유권해석이 아니다 — 반대 해석이 나오면 재검토한다.
 *
 * ## 종전 anchor의 실질 결함
 *
 * `__tests__/calc/usage-conversion-api-pipeline.test.ts`의 C-10c는 제목이 "클램프가 비과세를
 * 탈락시킨다"인데 **API body의 `residencePeriodMonths`만** 단언했다. 즉 **세액을 한 번도 보지
 * 않았다** — 파이프라인 중간값만 보는 anchor다(`feedback_anchor_observes_wrong_stage`).
 * 여기서 **끝까지** 단언한다.
 */
describe("R-G §154① 「그 보유기간 중 거주기간」 — 클램프의 세액 효과", () => {
  /** 12억 이하 · 조정대상지역 취득 — 비과세 여부가 세액을 그대로 가른다. */
  function rg(residencePeriodMonths: number, overrides: Partial<TransferTaxInput> = {}) {
    return conv({
      transferPrice: 1_000_000_000,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths,
      ...toggle("2023-06-01"),
      ...overrides,
    });
  }

  // 거주 구간 2018-02-10 ~ 2026-01-27(94개월) 중 주거용 사용일 2023-06-01 이후는 31개월.
  // API 계층(`clampResidenceToHousingPeriod`)이 잘라 엔진에 넣는 값이 클램프 후 개월 수다.
  // 여기서는 그 두 세계를 엔진 입력으로 직접 대비한다.

  it("R-G-1 클램프 후 거주 2년 미만 → 비과세 탈락 (세액이 실제로 발생한다)", () => {
    const r = calculateTransferTax(rg(7), rates);

    expect(r.isExempt).toBe(false);
    /**
     * 손 검산 — 이 값이 어디서 오는지 남긴다(숫자만 맞추는 anchor 방지).
     *   양도차익      1,000,000,000 − 600,000,000 − 7,300,000 = 392,700,000
     *   장특공제      거주 7개월이라 **표2 대상 탈락** → 표1 단독. 총 보유 7년 × 2% = 14%
     *                 392,700,000 × 14% = 54,978,000
     *   양도소득금액  392,700,000 − 54,978,000 = 337,722,000
     *   과세표준      337,722,000 − 2,500,000(기본공제) = 335,222,000
     *   산출세액      335,222,000 × 40% − 25,940,000 = 108,148,800
     */
    expect(r.calculatedTax).toBe(108_148_800);
  });

  it("R-G-2 같은 입력에 클램프를 걸지 않으면 비과세다 — 클램프가 세액을 가르는 증거", () => {
    // ⚠️ 이 대조군이 없으면 R-G-1이 「클램프 때문」이 아니라 다른 이유로 과세된 경우와
    //    구별되지 않는다(`feedback_negative_assertion_needs_mutation_probe`).
    const r = calculateTransferTax(rg(94), rates);

    expect(r.isExempt).toBe(true);
    expect(r.calculatedTax).toBe(0);
  });

  it("R-G-3 취득 당시 비조정이면 클램프는 세액에 무영향 — 거주요건 자체가 없다", () => {
    // §154① 괄호의 거주요건은 **취득 당시 조정대상지역** 주택에만 붙는다
    // (`meetsOneHouseResidenceRequirement`의 `!wasRegulated` 단락).
    // ⇒ 클램프의 사정거리는 조정지역으로 한정된다. 과잉 적용이 아니라는 근거다.
    const clamped = calculateTransferTax(rg(7, { wasRegulatedAtAcquisition: false }), rates);
    const raw = calculateTransferTax(rg(94, { wasRegulatedAtAcquisition: false }), rates);

    expect(clamped.isExempt).toBe(true);
    expect(clamped.calculatedTax).toBe(0);
    expect(clamped.calculatedTax).toBe(raw.calculatedTax);
  });
});

/**
 * anchor — §99의3 지역 제외·고가주택 판정의 시기 축 (리뷰 NH-01 · NH-04, 법률 제6762호 부칙 §29)
 *
 * 결함 ① NH-01: 지역 제외(`SPECULATION_AREA`)를 계약·승인일과 무관하게 적용했다.
 *   종전 조특법 §99의3①(2002.11.27. 시행본)에는 지역 제외가 없고, 2003.1.1. 시행본(법률 제6762호)부터 생겼다.
 *   부칙 §29① — 시행 전(= 2003.1.1. 전) 계약·사용승인분은 종전 규정, §29② — 2호는 2003.1.1. 전 공사 착수 +
 *   2003.6.30.까지 사용승인이면 종전 규정.
 * 결함 ② NH-04: 2003.1.1. 이후 계약·승인분의 고가주택을 계약·승인일 축 「6억 초과」로 판정했다.
 *   재산세과-3466 — 양도 당시 소득세법 §89①3호 기준(2008.10.7.~ 9억 · 2021.12.8.~ 12억).
 * Q-5: §29② 해당분의 고급주택은 종전 기준(재산세제과-96) = 2002.10.1.~12.31. 시행 소령 §156(공동주택 149㎡ + 6억).
 *
 * 기대값은 «법령상 적용될 사실로 바꾼 대조 시료»의 실측이다(같은 사실에서 region을 outside로 두거나 기준일을 종전 구간으로 둔 세액).
 * 세율표는 mock(정본 세액 아님) — 상대 비교가 목적이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { evaluateNew993, isHighValueHouseUnder993 } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { evaluateNew99 } from "@/lib/tax-engine/transfer-reductions/new-99";
import {
  makeMockRates,
  baseTransferInput,
  makeMockRatesWithHouseEngine,
  makeHouseInfo,
} from "@/__tests__/tax-engine/_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

type Over = Record<string, unknown>;
const R = (o: Over) => ({
  type: "new_99_3" as const,
  standardPriceAtAcquisition993: 100_000_000,
  standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84,
  region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const,
  isResident993: true,
  isHousingConstructionBusiness993: false,
  ...o,
});
const base = (o: Over) =>
  baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2004-09-01"),
    transferDate: D("2023-08-01"),
    householdHousingCount: 2,
    ...o,
  } as never);
const run = (reduction: Over, baseOver: Over = {}, r = rates) => {
  const res = calculateTransferTax(base({ ...baseOver, reductions: [R(reduction)] }), r);
  return {
    eligible: res.new993Detail?.isEligible,
    reasons: res.new993Detail?.ineligibleReasons?.map((x) => x.code),
    totalTax: res.totalTax,
    detail: res.new993Detail,
  };
};

// 대조 시료 실측 (mock 세율표, 양도 2023-08-01 · 8억 · 취득 3억 · 2주택)
const T_REDUCED_800 = 83_610_998; // 감면 적용 (reducible 116,666,666)
const T_NO_REDUCTION_800 = 124_366_000; // 감면 0

describe("NH-01 · 부칙 §29① — 2003.1.1. 전 계약·사용승인분은 지역 제외 없음", () => {
  for (const [label, over] of [
    ["1호 계약 2002-05-01", { contractDate993: D("2002-05-01") }],
    ["1호 계약 2002-12-31 (시행 전날)", { contractDate993: D("2002-12-31") }],
    [
      "2호 사용승인 2002-10-01",
      { acquisitionType993: "self_built", usageApprovalDate993: D("2002-10-01") },
    ],
    [
      "2호 사용승인 2002-12-31 (착공 모름이어도 §29①이라 무관)",
      {
        acquisitionType993: "self_built",
        usageApprovalDate993: D("2002-12-31"),
        constructionStartedBefore2003_993: "unknown",
      },
    ],
  ] as Array<[string, Over]>) {
    it(`${label} × 가격 급등 지역 → 적용 (outside 대조와 같은 세액)`, () => {
      const spec = run({ ...over, region993: "speculation" });
      const outside = run({ ...over, region993: "outside_speculation" });
      expect(outside.eligible).toBe(true);
      expect(outside.totalTax).toBe(T_REDUCED_800);
      expect(spec.eligible).toBe(true);
      expect(spec.reasons).toEqual([]);
      expect(spec.totalTax).toBe(T_REDUCED_800);
    });
  }

  it("대조군 — 1호 계약 2003-01-01(시행일) × 가격 급등 지역 → 개정규정이라 배제", () => {
    const spec = run({ contractDate993: D("2003-01-01"), region993: "speculation" });
    expect(spec.eligible).toBe(false);
    expect(spec.reasons).toEqual(["SPECULATION_AREA"]);
    expect(spec.totalTax).toBe(T_NO_REDUCTION_800);
  });

  it("S6 — 3주택·조정대상지역·2021 양도, 1호 계약 2002-05-01 × 가격 급등 지역 → 중과 없이 감면 적용", () => {
    const mk = (region: "outside_speculation" | "speculation") =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 800_000_000,
          acquisitionPrice: 300_000_000,
          acquisitionDate: D("2004-09-01"),
          transferDate: D("2021-08-01"),
          householdHousingCount: 3,
          isRegulatedArea: true,
          houses: [
            makeHouseInfo("h1", { acquisitionDate: D("2004-09-01"), regionCode: "11680" }),
            makeHouseInfo("h2"),
            makeHouseInfo("h3"),
          ],
          sellingHouseId: "h1",
          reductions: [R({ contractDate993: D("2002-05-01"), region993: region })],
        } as never),
        makeMockRatesWithHouseEngine(),
      );
    const spec = mk("speculation");
    const outside = mk("outside_speculation");
    expect(outside.totalTax).toBe(83_610_998);
    expect(spec.new993Detail?.isEligible).toBe(true);
    expect(spec.totalTax).toBe(83_610_998);
  });
});

describe("NH-01 · 부칙 §29② — 2호 사용승인 2003.1.1.~6.30. + 2003.1.1. 전 착공(3-state)", () => {
  // S4b: 5억 · 취득 2억 · 사용승인 2003-05-01 (고가주택 판정과 분리)
  const s4b = (over: Over) =>
    run(
      {
        acquisitionType993: "self_built",
        usageApprovalDate993: D("2003-05-01"),
        region993: "speculation",
        ...over,
      },
      { transferPrice: 500_000_000, acquisitionPrice: 200_000_000, acquisitionDate: D("2003-05-01") },
    );

  it("착공 예 → 종전 규정 (지역 제외 없음) — 법령상 세액", () => {
    const r = s4b({ constructionStartedBefore2003_993: "yes" });
    expect(r.eligible).toBe(true);
    expect(r.totalTax).toBe(41_198_500);
    expect(r.detail?.priorRuleBasis).toBe("addenda_29_2");
    expect(r.detail?.needsConstructionStartConfirmation).toBeFalsy();
  });

  it("착공 아니오 → 개정규정 → 지역 제외", () => {
    const r = s4b({ constructionStartedBefore2003_993: "no" });
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(["SPECULATION_AREA"]);
    expect(r.totalTax).toBe(64_801_000);
    expect(r.detail?.priorRuleBasis).toBeUndefined();
    expect(r.detail?.needsConstructionStartConfirmation).toBeFalsy();
  });

  it("모름 → §29② 불성립(개정규정) + 확인 필요", () => {
    const r = s4b({ constructionStartedBefore2003_993: "unknown" });
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(["SPECULATION_AREA"]);
    expect(r.totalTax).toBe(64_801_000);
    expect(r.detail?.priorRuleBasis).toBeUndefined();
    expect(r.detail?.needsConstructionStartConfirmation).toBe(true);
  });

  it("미입력(undefined)도 모름과 같다 — 자동으로 종전 규정을 적용하지 않는다", () => {
    const r = s4b({});
    expect(r.eligible).toBe(false);
    expect(r.totalTax).toBe(64_801_000);
    expect(r.detail?.needsConstructionStartConfirmation).toBe(true);
  });

  it("경계 — 사용승인 2003-01-01 · 2003-06-30은 §29② 범위, 2003-07-01은 신축주택취득기간 외", () => {
    expect(s4b({ usageApprovalDate993: D("2003-01-01"), constructionStartedBefore2003_993: "yes" }).detail?.priorRuleBasis).toBe("addenda_29_2");
    expect(s4b({ usageApprovalDate993: D("2003-06-30"), constructionStartedBefore2003_993: "yes" }).detail?.priorRuleBasis).toBe("addenda_29_2");
    const out = s4b({ usageApprovalDate993: D("2003-07-01"), constructionStartedBefore2003_993: "yes" });
    expect(out.eligible).toBe(false);
    expect(out.detail?.priorRuleBasis).toBeUndefined();
  });

  it("1호는 §29②가 아니다 — 계약 2003-03-01 × 착공 예 × 가격 급등 지역 → 배제", () => {
    const r = run({
      contractDate993: D("2003-03-01"),
      region993: "speculation",
      constructionStartedBefore2003_993: "yes",
    });
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(["SPECULATION_AREA"]);
  });
});

describe("NH-04 — 2003.1.1. 이후 계약·승인분의 고가주택은 양도 당시 소득세법 §89①3호 기준", () => {
  it("A — 계약 2003-03-15 · 양도 2024-07-01 · 8억 → 12억 이하라 적용 (종전 구간 대조 시료와 같은 세액)", () => {
    const r = run(
      { contractDate993: D("2003-03-15") },
      { transferDate: D("2024-07-01") },
    );
    expect(r.eligible).toBe(true);
    expect(r.totalTax).toBe(83_610_998);
  });

  it("B — 재산세과-3466 사실관계: 계약 2003-05-21 · 취득 2006-04-19 · 양도 2024-03-15 · 8.5억", () => {
    const r = run(
      {
        contractDate993: D("2003-05-21"),
        standardPriceAtAcquisition993: 150_000_000,
        standardPriceAt5Years: 250_000_000,
      },
      {
        transferPrice: 850_000_000,
        acquisitionDate: D("2006-04-19"),
        transferDate: D("2024-03-15"),
      },
    );
    expect(r.eligible).toBe(true);
    expect(r.totalTax).toBe(85_613_000);
  });

  it("2호 사용승인 2003-03-10 · 착공 아니오 · 같은 사실 → 적용 (양도일 축)", () => {
    const r = run(
      {
        acquisitionType993: "self_built",
        usageApprovalDate993: D("2003-03-10"),
        constructionStartedBefore2003_993: "no",
        standardPriceAtAcquisition993: 150_000_000,
        standardPriceAt5Years: 250_000_000,
      },
      { transferPrice: 850_000_000, acquisitionDate: D("2006-04-19"), transferDate: D("2024-03-15") },
    );
    expect(r.eligible).toBe(true);
    expect(r.totalTax).toBe(85_613_000);
  });

  const at = (price: number, transferDate: string) =>
    run({ contractDate993: D("2003-03-15") }, { transferPrice: price, transferDate: D(transferDate) });

  it("12억 경계 (양도 2024) — 1,200,000,000 적용 / 1,200,000,001 고가주택 배제", () => {
    expect(at(1_200_000_000, "2024-07-01").eligible).toBe(true);
    const over = at(1_200_000_001, "2024-07-01");
    expect(over.eligible).toBe(false);
    expect(over.reasons).toEqual(["HIGH_VALUE_HOUSE"]);
  });

  it("9억 경계 (양도 2019) — 900,000,000 적용 / 900,000,001 고가주택 배제", () => {
    expect(at(900_000_000, "2019-08-01").eligible).toBe(true);
    expect(at(900_000_001, "2019-08-01").reasons).toEqual(["HIGH_VALUE_HOUSE"]);
  });

  it("2021-12-07 / 2021-12-08 양도일 경계 — 10억은 12-07엔 고가주택(9억 초과), 12-08엔 적용(12억 이하)", () => {
    expect(at(1_000_000_000, "2021-12-07").reasons).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(at(1_000_000_000, "2021-12-08").eligible).toBe(true);
  });

  it("13억 (양도 2024) — 12억 초과라 법령상도 배제 (대조군)", () => {
    expect(at(1_300_000_000, "2024-07-01").reasons).toEqual(["HIGH_VALUE_HOUSE"]);
  });

  it("종전 구간(계약 2002)은 계약일 당시 기준 유지 — 149㎡ 미만이면 가액이 커도 고급주택 아님, 165/149㎡ 이상이면 배제", () => {
    const small = run({ contractDate993: D("2002-12-20") }, { transferPrice: 1_300_000_000 });
    expect(small.eligible).toBe(true);
    const big = run({ contractDate993: D("2002-12-20"), exclusiveAreaSqm993: 150 }, { transferPrice: 700_000_000 });
    expect(big.reasons).toEqual(["HIGH_VALUE_HOUSE"]);
  });
});

describe("Q-5 — §29② 해당분의 고급주택은 종전 기준 (2002.12.31. 시행 소령 §156: 공동주택 149㎡ 이상 + 6억 초과)", () => {
  const s29_2 = (over: Over, baseOver: Over = {}) =>
    run(
      {
        acquisitionType993: "self_built",
        usageApprovalDate993: D("2003-05-01"),
        constructionStartedBefore2003_993: "yes",
        ...over,
      },
      { acquisitionDate: D("2003-05-01"), ...baseOver },
    );

  it("착공 예: 150㎡ · 7억 → 종전 기준 고급주택 → 배제 / 착공 아니오: 같은 사실이 12억 이하라 적용", () => {
    expect(s29_2({ exclusiveAreaSqm993: 150 }, { transferPrice: 700_000_000 }).reasons).toEqual(["HIGH_VALUE_HOUSE"]);
    const no = s29_2(
      { exclusiveAreaSqm993: 150, constructionStartedBefore2003_993: "no" },
      { transferPrice: 700_000_000 },
    );
    expect(no.eligible).toBe(true);
  });

  it("착공 예: 130㎡ · 13억 → 종전 기준은 면적 미달이라 고급주택 아님 → 적용 / 착공 아니오: 13억이 12억 초과라 배제", () => {
    expect(s29_2({ exclusiveAreaSqm993: 130 }, { transferPrice: 1_300_000_000 }).eligible).toBe(true);
    const no = s29_2(
      { exclusiveAreaSqm993: 130, constructionStartedBefore2003_993: "no" },
      { transferPrice: 1_300_000_000 },
    );
    expect(no.reasons).toEqual(["HIGH_VALUE_HOUSE"]);
  });

  it("착공 예: 149㎡ 정확히 · 6억 정확히 → 경계 (149㎡ 이상 AND 6억 초과)", () => {
    expect(s29_2({ exclusiveAreaSqm993: 149 }, { transferPrice: 600_000_000 }).eligible).toBe(true);
    expect(s29_2({ exclusiveAreaSqm993: 149 }, { transferPrice: 600_000_001 }).eligible).toBe(false);
    expect(s29_2({ exclusiveAreaSqm993: 148.99 }, { transferPrice: 700_000_000 }).eligible).toBe(true);
  });
});

describe("§99(new-99.ts)·헬퍼 무영향 — 기준일이 모두 2003 전이라 시기 축이 바뀌지 않는다", () => {
  it("isHighValueHouseUnder993 단독 호출은 기준일 축 그대로 (2003~2008.10.5 → 6억)", () => {
    expect(isHighValueHouseUnder993(D("2003-05-21"), 850_000_000, 84)).toBe(true);
    expect(isHighValueHouseUnder993(D("2002-12-20"), 850_000_000, 84)).toBe(false);
    expect(isHighValueHouseUnder993(D("2002-12-20"), 850_000_000, 150)).toBe(true);
  });

  it("§99 — 1998 계약 165㎡·7억 → 고가(고급)주택 배제 유지", () => {
    const r = evaluateNew99({
      transferDate: D("2010-06-30"),
      acquisitionDate: D("1999-03-01"),
      contractDate: D("1998-09-01"),
      transferIncome: 300_000_000,
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAt5Years: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      wholePropertyTransferPrice: 700_000_000,
      exclusiveAreaSqm: 170,
      isResident: true,
      isHousingConstructionBusiness: false,
      acquisitionType: "from_builder",
      isNationalHousing: false,
      calculatedTaxBeforeReduction: 100_000_000,
      calculatedTaxAfterReduction: 0,
    } as never);
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("HIGH_VALUE_HOUSE");
  });
});

describe("직접 evaluateNew993 — 필드 에코", () => {
  it("종전 규정 적용분은 priorRuleBasis(§29①)를 돌려준다", () => {
    const r = evaluateNew993({
      transferDate: D("2023-08-01"),
      acquisitionDate: D("2004-09-01"),
      contractDate: D("2002-05-01"),
      transferIncome: 350_000_000,
      standardPriceAtAcquisition: 100_000_000,
      standardPriceAt5Years: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      wholePropertyTransferPrice: 800_000_000,
      exclusiveAreaSqm: 84,
      region: "speculation",
      isResident: true,
      isHousingConstructionBusiness: false,
      acquisitionType: "from_builder",
      calculatedTaxBeforeReduction: 0,
      calculatedTaxAfterReduction: 0,
    });
    expect(r.isEligible).toBe(true);
    expect(r.priorRuleBasis).toBe("addenda_29_1");
  });
});

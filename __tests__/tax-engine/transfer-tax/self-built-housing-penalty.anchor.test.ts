/**
 * anchor — 일체 주택 **본인 신축** × 「소득세법」 §114조의2 환산·감정가액 5% 가산세: base 를 **건물분**으로 (Q-12 PR-1 엔진)
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§3 · §5 · §9 Pre-Do anchor 1~8 · 사용자 확정 Q-1~Q-15)
 *
 * 규칙 요약
 *  · 입력 `selfBuiltHousing` 중첩 객체가 있으면 base 가 건물분으로 바뀐다. **필요한데 없으면 던진다**(PR-4 엄격화 · Q-2 — `self-built-housing-strict.anchor.test.ts`). 영 §164⑨ 공익수용·공매도 PR-A 부터 같다(환산은 H_T′ 를 같은 비례 규칙으로 나눈 건물분 — `strict.anchor` [S3]).
 *  · 환산: base = 건물분 양도가액 S_b × 취득 당시 건물분 기준시가 B_acq ÷ 양도 당시 건물분 기준시가 B_tr
 *      (B = 주택공시가격을 토지:건물 기준시가 비율로 안분한 건물분 — 취득·양도 시점 각각, S_b = `resolveTransferPriceSplit` 법정 서열)
 *  · 감정: 건물 감정가액 직접 입력(`buildingAppraisalValue`) → 없으면 감정가액 총액 × 취득 당시 N ÷ (L+N)
 *  · 양도차익·결정세액은 불변 — 가산세와 그 10% 지방소득세만 바뀐다(Q-14)
 *  · 증축은 제외(Q-4) · 부담부증여·이월과세·분리(split)·PHD 는 건물 파트가 이미 축이라 이 leaf 가 내지 않는다
 *
 * 수치는 계획서 §5 probe 실측(mock 세율, `makeMockRates`)이고 "현행" 열은 수정 전 이 파일을 먼저 돌려 확인했다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "./_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 취득 당시 토지 1억(㎡당 100만 × 100㎡)·건물 6천만, 양도 당시 토지 2.4억·건물 1.6억 */
const SB = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000,
  buildingStdPriceAtTransfer: 160_000_000,
};

/** 신축 2022-01-10 · 양도 2026-03-01 · 양도가 10억 · 주택공시가격 취득 2억/양도 4억 · 환산 */
function cell(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    transferPrice: 1_000_000_000,
    transferDate: D("2026-03-01"),
    acquisitionPrice: 0,
    acquisitionDate: D("2022-01-10"),
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: D("2022-01-10"),
    acquisitionCause: "purchase",
    ...over,
  } as Partial<TransferTaxInput>);
}
const withSb = (over: Partial<TransferTaxInput> = {}, sb: Record<string, unknown> = SB) =>
  cell({ ...over, selfBuiltHousing: sb } as Partial<TransferTaxInput>);
const APPRAISAL = { useEstimatedAcquisition: false, acquisitionMethod: "appraisal", appraisalValue: 300_000_000 } as const;

const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);
type R = ReturnType<typeof run>;
const echo = (r: R) => (r as unknown as { selfBuiltHousingPenalty?: Record<string, unknown> }).selfBuiltHousingPenalty;
const pick = (r: R) => ({ base: r.penaltyBase, pen: r.penaltyTax, det: r.determinedTax, lit: r.localIncomeTax, total: r.totalTax });

/**
 * 영 §164⑨ 공익수용(보상액 미입력 — 환산 분모가 바뀌지 않는다) 결합. PR-4 까지는 건물분 base 를 지원하지 않아 자산 전체 base(500,000,000 / 25,000,000 …)로 계산했다.
 * PR-A 부터는 다른 조합과 같다 — 입력 부재는 던지고, 입력이 있으면 건물분이다. 종전 수치는 아래 [A]·[B] 의 «종전» 주석에 남긴다.
 */
const EXPR = { transferCause: "public_expropriation" } as Partial<TransferTaxInput>;
const fallback = (over: Partial<TransferTaxInput> = {}) => cell({ ...EXPR, ...over });
const absent = (i: TransferTaxInput) => {
  try {
    run(i);
  } catch (e) {
    expect(e).toBeInstanceOf(TaxCalculationError);
    expect((e as TaxCalculationError).details).toMatchObject({ field: "selfBuiltHousing" });
    return;
  }
  throw new Error("던지지 않았다");
};

describe("[A] 입력 부재 — PR-4 엄격화: 던진다 · 영 §164⑨ 공익수용 결합도 PR-A 부터 던지고, 입력이 있으면 건물분이다", () => {
  it("S-A 일체 환산: 부재 → 던짐 · 공익수용 결합도 던짐(종전 500,000,000 / 25,000,000 / 총 197,837,200) → selfBuiltHousing 이 있으면 187,500,000 / 9,375,000 / 총 180,649,700", () => {
    absent(cell());
    absent(fallback());
    expect(pick(run(withSb(EXPR)))).toEqual({ base: 187_500_000, pen: 9_375_000, det: 154_852_000, lit: 16_422_700, total: 180_649_700 });
    expect(echo(run(withSb(EXPR)))).toBeDefined();
  });
  it("S-B 일체 감정(총액 3억): 부재 → 던짐 · 공익수용 결합도 던짐(종전 300,000,000 / 15,000,000 / 총 270,788,760) → 건물 감정가액 직접 1.1억이면 110,000,000 / 5,500,000 / 총 260,338,760", () => {
    absent(cell(APPRAISAL));
    absent(fallback(APPRAISAL));
    expect(pick(run(withSb({ ...EXPR, ...APPRAISAL }, { buildingAppraisalValue: 110_000_000 })))).toMatchObject({ base: 110_000_000, pen: 5_500_000, total: 260_338_760 });
  });
  it("X 증축 37,500,000 / 1,875,000 (이 축이 아니다 — 부재여도 던지지 않는다)", () => {
    const r = run(cell({ buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000 }));
    expect(r.penaltyBase).toBe(37_500_000);
    expect(r.penaltyTax).toBe(1_875_000);
  });
  it("지분 50%(양도가 5억): 부재 → 던짐 · 공익수용 결합도 던짐(종전 250,000,000 / 12,500,000 / 총 85,757,320) → 입력이 있으면 93,750,000 / 4,687,500 / 총 77,163,570", () => {
    const over = { transferPrice: 500_000_000, ownershipRatio: 0.5 };
    absent(cell(over));
    absent(fallback(over));
    expect(pick(run(withSb({ ...EXPR, ...over })))).toMatchObject({ base: 93_750_000, pen: 4_687_500, total: 77_163_570 });
  });
  it("양도차손(§97②2호 단서 swap): 부재 → 던짐 · 공익수용 결합도 던짐(종전 500,000,000 / 25,000,000 / 총 27,500,000) → 입력이 있으면 187,500,000 / 9,375,000 / 총 10,312,500", () => {
    const over = { capitalExpenditure: 1_200_000_000 };
    absent(cell(over));
    absent(fallback(over));
    expect(pick(run(withSb({ ...EXPR, ...over })))).toEqual({ base: 187_500_000, pen: 9_375_000, det: 0, lit: 937_500, total: 10_312_500 });
  });
  it("고가주택(15억·거주 48개월): 부재 → 던짐 · 공익수용 결합도 던짐(종전 500,000,000 / 25,000,000 / 총 61,599,340) → 입력이 있으면 187,500,000 / 9,375,000 / 총 44,411,840", () => {
    const hi = { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 48, transferPrice: 1_500_000_000, standardPriceAtTransfer: 600_000_000 };
    absent(cell(hi));
    absent(fallback(hi));
    expect(pick(run(withSb({ ...EXPR, ...hi }, { ...SB, landStdPriceAtTransfer: 360_000_000, buildingStdPriceAtTransfer: 240_000_000 })))).toMatchObject({ base: 187_500_000, pen: 9_375_000, total: 44_411_840 });
  });
  it("미등기: 부재 → 던짐 · 공익수용 결합도 던짐(종전 500,000,000 / 25,000,000 / 총 412,038,000) → 입력이 있으면 187,500,000 / 9,375,000 / 총 394,850,500", () => {
    absent(cell({ isUnregistered: true }));
    absent(fallback({ isUnregistered: true }));
    expect(pick(run(withSb({ ...EXPR, isUnregistered: true })))).toMatchObject({ base: 187_500_000, pen: 9_375_000, total: 394_850_500 });
  });
});

describe("[B] 신 산식 — 환산 건물분", () => {
  it("fx: B_acq 75,000,000 · B_tr 160,000,000 · S_b 400,000,000 → base 187,500,000 · 가산세 9,375,000 · 총 180,649,700", () => {
    const r = run(withSb());
    expect(pick(r)).toEqual({ base: 187_500_000, pen: 9_375_000, det: 154_852_000, lit: 16_422_700, total: 180_649_700 });
    expect(echo(r)).toMatchObject({
      method: "estimated",
      base: 187_500_000,
      penalty: 9_375_000,
      buildingType: "new",
      constructionDate: "2022-01-10",
      fifthAnniversary: "2027-01-10",
      housingSplit: {
        acquisitionHousing: 200_000_000,
        acquisitionLand: 125_000_000,
        acquisitionBuilding: 75_000_000,
        transferHousing: 400_000_000,
        transferLand: 240_000_000,
        transferBuilding: 160_000_000,
        saleBuilding: 400_000_000,
      },
      formula: { multiplicand: 400_000_000, numerator: 75_000_000, denominator: 160_000_000 },
    });
  });

  it("결정세액·양도차익은 불변 — 가산세와 지방소득세만 움직인다(Q-14)", () => {
    // 가산세 축이 없는 같은 거래(본인 신축 아님)로 양도차익·세액을 대조하고, 종전(PR-4) 자산 전체 base 총납부 197,837,200 과의 차이를 고정한다
    const off = run(cell({ isSelfBuilt: false }));
    const on = run(withSb());
    expect(on.transferGain).toBe(off.transferGain);
    expect(on.determinedTax).toBe(off.determinedTax);
    expect(on.calculatedTax).toBe(off.calculatedTax);
    expect(on.totalTax - 197_837_200).toBe(-17_187_500);
  });

  it("손실(결정세액 0)도 같은 축 — 9,375,000 / 지방소득세 937,500 / 총 10,312,500 (§114조의2②)", () => {
    const r = run(withSb({ capitalExpenditure: 1_200_000_000 }));
    expect(r.determinedTax).toBe(0);
    expect(pick(r)).toEqual({ base: 187_500_000, pen: 9_375_000, det: 0, lit: 937_500, total: 10_312_500 });
    expect(echo(r)).toMatchObject({ base: 187_500_000, penalty: 9_375_000 });
  });

  it("지분 50%(양도가 5억 · 기준시가는 스케일 없음) → 93,750,000 / 4,687,500 / 총 77,163,570", () => {
    const r = run(withSb({ transferPrice: 500_000_000, ownershipRatio: 0.5 }));
    expect(pick(r)).toMatchObject({ base: 93_750_000, pen: 4_687_500, total: 77_163_570 });
  });

  it("고가주택(15억 · 12억 초과분 안분은 base 와 무관) → 187,500,000 / 9,375,000 / 총 44,411,840", () => {
    const hi = { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 48, transferPrice: 1_500_000_000, standardPriceAtTransfer: 600_000_000 };
    const r = run(withSb(hi, { ...SB, landStdPriceAtTransfer: 360_000_000, buildingStdPriceAtTransfer: 240_000_000 }));
    expect(pick(r)).toMatchObject({ base: 187_500_000, pen: 9_375_000, total: 44_411_840 });
  });

  it("미등기도 같다 → 187,500,000 / 9,375,000", () => {
    const r = run(withSb({ isUnregistered: true }));
    expect(r.penaltyBase).toBe(187_500_000);
    expect(r.penaltyTax).toBe(9_375_000);
  });
});

describe("[C] 양도가액 건물분 S_b — 법정 서열 (소득세법 §100②③ · 영 §166⑥)", () => {
  const sale = (building: number) => ({ ...SB, sale: { landTransferPrice: 1_000_000_000 - building, buildingTransferPrice: building } });

  it("구분 기재 700/300 (안분값 400 대비 25% 차이 → 구분 기재 채택) → 140,625,000 / 7,031,250 / 총 178,071,575", () => {
    const r = run(withSb({}, sale(300_000_000)));
    expect(pick(r)).toMatchObject({ base: 140_625_000, pen: 7_031_250, total: 178_071_575 });
    expect((echo(r)?.housingSplit as { saleBuilding: number }).saleBuilding).toBe(300_000_000);
  });

  it("한쪽만 기재해도 반대쪽은 총액 − 입력값으로 확정된다 — 토지만 7억 / 건물만 3억 → 모두 140,625,000", () => {
    expect(run(withSb({}, { ...SB, sale: { landTransferPrice: 700_000_000 } })).penaltyBase).toBe(140_625_000);
    expect(run(withSb({}, { ...SB, sale: { buildingTransferPrice: 300_000_000 } })).penaltyBase).toBe(140_625_000);
  });
  it("§100③ 30% 차이여도 다른 법령상 제한(영 §166⑧)이면 구분 기재 유지 — 건물 280,000,000 + other_law → 131,250,000", () => {
    const sb = { ...SB, sale: { landTransferPrice: 720_000_000, buildingTransferPrice: 280_000_000, saleSplitExemption: "other_law" as const } };
    expect(run(withSb({}, sb)).penaltyBase).toBe(131_250_000);
  });
  it("§100③ 경계 — 건물 280,000,000(안분값 400,000,000 대비 정확히 30%) → 불분명 → 안분값 187,500,000", () => {
    expect(run(withSb({}, sale(280_000_000))).penaltyBase).toBe(187_500_000);
  });
  it("§100③ 경계 — 건물 281,000,000(29.75%) → 구분 기재 채택 → 131,718,750", () => {
    expect(run(withSb({}, sale(281_000_000))).penaltyBase).toBe(131_718_750);
  });
  it("§100③ 경계 — 건물 520,000,000(+30%) → 불분명 → 187,500,000 · 519,000,000(+29.75%) → 구분 기재 → 243,281,250", () => {
    expect(run(withSb({}, sale(520_000_000))).penaltyBase).toBe(187_500_000);
    expect(run(withSb({}, sale(519_000_000))).penaltyBase).toBe(243_281_250);
  });
});

describe("[D] 감정가액 — 건물 감정가액 직접 입력 / 구분 표시가 없으면 취득 당시 기준시가 비례 (Q-3 C)", () => {
  it("직접 입력 1.1억 → 5,500,000 · 총 260,338,760 (전체 3억이면 15,000,000)", () => {
    const r = run(withSb(APPRAISAL, { buildingAppraisalValue: 110_000_000 }));
    expect(pick(r)).toMatchObject({ base: 110_000_000, pen: 5_500_000, total: 260_338_760 });
    expect(echo(r)).toMatchObject({ method: "appraisal", base: 110_000_000, penalty: 5_500_000, appraisal: { mode: "direct" } });
    expect(echo(r)?.housingSplit).toBeUndefined();
  });
  it("비례(총액 3억 × N 6천만 ÷ (L 1억 + N 6천만)) → 112,500,000 / 5,625,000 / 총 260,476,260", () => {
    const r = run(withSb(APPRAISAL, { landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000 }));
    expect(pick(r)).toMatchObject({ base: 112_500_000, pen: 5_625_000, total: 260_476_260 });
    expect(echo(r)).toMatchObject({
      method: "appraisal",
      appraisal: { mode: "apportioned", totalAppraisal: 300_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 60_000_000 },
    });
  });
  it("직접 입력과 비례 입력이 함께 오면 직접 입력이 우선한다", () => {
    const r = run(withSb(APPRAISAL, { ...SB, buildingAppraisalValue: 110_000_000 }));
    expect(r.penaltyBase).toBe(110_000_000);
  });
  it("건물 감정가액이 감정가액 총액보다 크면 거부", () => {
    expect(() => run(withSb(APPRAISAL, { buildingAppraisalValue: 300_000_001 }))).toThrow(TaxCalculationError);
  });
  it("감정 + 손실 경로도 같은 축 (직접 1.1억)", () => {
    // 감정가액 3억 > 양도가 2억 → 실제 양도차손 (감정은 §97②2호 단서 swap 대상이 아니다)
    const r = run(withSb({ ...APPRAISAL, transferPrice: 200_000_000 }, { buildingAppraisalValue: 110_000_000 }));
    expect(r.transferGain).toBeLessThan(0);
    expect(r.determinedTax).toBe(0);
    expect(r.penaltyBase).toBe(110_000_000);
    expect(r.penaltyTax).toBe(5_500_000);
  });
});

describe("[E] 게이트 경계 — 열린 조합에서만 축을 낸다 (echo 로 확인)", () => {
  const on = (over: Partial<TransferTaxInput>, sb: Record<string, unknown> = SB) => echo(run(withSb(over, sb)));

  it("신축 5년 되는 날(2027-01-10)은 포함, 다음 날은 제외", () => {
    expect(on({ transferDate: D("2027-01-10") })).toMatchObject({ base: 187_500_000 });
    expect(on({ transferDate: D("2027-01-11") })).toBeUndefined();
    expect(run(withSb({ transferDate: D("2027-01-11") })).penaltyTax).toBe(0);
  });
  it("윤년 2/29 신축 → 5년 되는 날 2025-02-28 포함, 2025-03-01 제외 (addYears)", () => {
    const leap = { constructionDate: D("2020-02-29"), acquisitionDate: D("2020-02-29") };
    expect(on({ ...leap, transferDate: D("2025-02-28") })).toMatchObject({ fifthAnniversary: "2025-02-28" });
    expect(on({ ...leap, transferDate: D("2025-03-01") })).toBeUndefined();
  });
  it("환산 시행일 — 양도 2017-12-31 제외 / 2018-01-01 포함", () => {
    const early = { constructionDate: D("2016-06-01"), acquisitionDate: D("2016-06-01") };
    expect(on({ ...early, transferDate: D("2017-12-31") })).toBeUndefined();
    expect(on({ ...early, transferDate: D("2018-01-01") })).toMatchObject({ method: "estimated" });
  });
  it("감정 시행일 — 양도 2019-12-31 제외 / 2020-01-01 포함", () => {
    const early = { ...APPRAISAL, constructionDate: D("2016-06-01"), acquisitionDate: D("2016-06-01") };
    const sb = { buildingAppraisalValue: 110_000_000 };
    expect(on({ ...early, transferDate: D("2019-12-31") }, sb)).toBeUndefined();
    expect(on({ ...early, transferDate: D("2020-01-01") }, sb)).toMatchObject({ method: "appraisal", base: 110_000_000 });
  });
  it("실지거래가액·매매사례가액은 조문 대상이 아니다 — 입력이 와도 축을 내지 않는다(가산세 0)", () => {
    const actual = { useEstimatedAcquisition: false, acquisitionMethod: "actual", acquisitionPrice: 300_000_000 } as const;
    const sales = { useEstimatedAcquisition: false, acquisitionMethod: "salesCase", similarSalesValue: 300_000_000 } as const;
    expect(on(actual)).toBeUndefined();
    expect(run(withSb(actual)).penaltyTax).toBe(0);
    expect(on(sales)).toBeUndefined();
    expect(run(withSb(sales)).penaltyTax).toBe(0);
  });
  it("게이트가 닫힌 조합은 필수 칸이 비어도 요구하지 않는다(거짓 요구 금지) — 5년 경과·실가", () => {
    expect(() => run(withSb({ transferDate: D("2027-01-11") }, {}))).not.toThrow();
    expect(() => run(withSb({ useEstimatedAcquisition: false, acquisitionMethod: "actual", acquisitionPrice: 300_000_000 }, {}))).not.toThrow();
  });
});

describe("[F] 변하지 않는 셀 — 이미 건물분이거나 이 축이 아니다", () => {
  it("비주택 건물 단독 500,000,000 / 25,000,000", () => {
    expect(pick(run(cell({ propertyType: "building" })))).toMatchObject({ base: 500_000_000, pen: 25_000_000 });
  });
  it("증축 — selfBuiltHousing 없이 증축부분 한정 base 37,500,000 / 1,875,000 (Q-4 제외)", () => {
    const r = run(cell({ buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000 }));
    expect(r.penaltyBase).toBe(37_500_000);
    expect(r.penaltyTax).toBe(1_875_000);
  });
  it("증축에 selfBuiltHousing 을 보내면 거부 — 받고 무시하지 않는다", () => {
    expect(() => run(withSb({ buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000 }))).toThrow(TaxCalculationError);
  });
  const SPLIT: Partial<TransferTaxInput> = {
    acquisitionDate: D("2021-03-10"),
    constructionDate: D("2021-03-10"),
    transferDate: D("2024-06-01"),
    landAcquisitionDate: D("2015-05-01"),
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
    standardPriceAtAcquisition: undefined,
    standardPriceAtTransfer: undefined,
    useEstimatedAcquisition: false,
    acquisitionMethod: "actual",
  };
  it("분리 취득(건물 파트 환산) 225,000,000 / 11,250,000 — 건물 파트 축 그대로", () => {
    const r = run(cell(SPLIT));
    expect(r.penaltyBase).toBe(225_000_000);
    expect(r.penaltyTax).toBe(11_250_000);
  });
  it("분리 취득의 건물 파트가 실가이면 가산세 0 — 동적 split 에서는 이 축이 끼어들지 않는다", () => {
    const base = cell({ ...SPLIT, buildingAcqMode: "actual", buildingAcquisitionPrice: 150_000_000 });
    expect(run(base).penaltyTax).toBe(0);
    expect(run({ ...base, selfBuiltHousing: SB } as TransferTaxInput).penaltyTax).toBe(0);
    expect(echo(run({ ...base, selfBuiltHousing: SB } as TransferTaxInput))).toBeUndefined();
  });
  it("분리 취득의 건물 파트가 환산이면 selfBuiltHousing 이 와도 건물 파트 축이 그대로 — 225,000,000 / 11,250,000", () => {
    const r = run(cell({ ...SPLIT, selfBuiltHousing: SB } as Partial<TransferTaxInput>));
    expect(r.penaltyBase).toBe(225_000_000);
    expect(r.penaltyTax).toBe(11_250_000);
    expect(echo(r)).toBeUndefined();
  });
  it("분리 계산 중이면 자산 수준 게이트가 열려 있어도(건물 파트 실가 + 자산 환산) selfBuiltHousing 이 base 를 바꾸지 않는다 — 이익·손실 두 경로 모두", () => {
    const est = { useEstimatedAcquisition: true, acquisitionMethod: "estimated", standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 400_000_000 } as Partial<TransferTaxInput>;
    const part = { ...SPLIT, ...est, buildingAcqMode: "actual", buildingAcquisitionPrice: 150_000_000, transferPrice: 1_000_000_000 } as Partial<TransferTaxInput>;
    const loss = { ...part, transferPrice: 250_000_000, landTransferPrice: 150_000_000, buildingTransferPrice: 100_000_000, landStandardPriceAtTransfer: 450_000_000, buildingStandardPriceAtTransfer: 300_000_000 } as Partial<TransferTaxInput>;
    for (const over of [part, loss]) {
      const off = run(cell(over));
      const on = run(cell({ ...over, selfBuiltHousing: SB } as Partial<TransferTaxInput>));
      expect(on.splitDetail).toBeDefined();
      expect(pick(on)).toEqual(pick(off));
      expect(echo(on)).toBeUndefined();
    }
    expect(run(cell(loss)).transferGain).toBeLessThan(0);
    expect(run(cell(part)).penaltyBase).toBe(350_000_000); // 현행 거동(기록) — 이 PR 이 바꾸지 않는다
  });
  it("PHD(최초공시 전) 건물 파트 base 169,332,955 / 8,466,647", () => {
    const r = run(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: PHD_TRANSFER_PRICE,
        transferDate: D("2023-02-16"),
        acquisitionDate: D("2014-09-14"),
        landAcquisitionDate: D("2013-06-01"),
        acquisitionPrice: 0,
        useEstimatedAcquisition: true,
        acquisitionMethod: "estimated",
        expenses: 0,
        isOneHousehold: true,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
        landSplitMode: "apportioned",
        preHousingDisclosure: PHD_INPUT,
        isSelfBuilt: true,
        buildingType: "new",
        constructionDate: D("2019-01-01"),
      } as Partial<TransferTaxInput>),
    );
    expect(r.penaltyBase).toBe(169_332_955);
    expect(r.penaltyTax).toBe(8_466_647);
  });
  it("부담부증여 K-5 신축 50,000,000 / 2,500,000 — §159 스텝의 건물분", () => {
    const bgInput = (extra: Partial<TransferTaxInput> = {}) =>
      baseTransferInput({
        propertyType: "housing",
        transferDate: D("2024-03-01"),
        acquisitionDate: D("2021-01-01"),
        transferPrice: 0,
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: false,
        transferType: "burdened_gift",
        isOneHousehold: false,
        householdHousingCount: 2,
        isSelfBuilt: true,
        buildingType: "new",
        constructionDate: D("2021-01-01"),
        burdenedGiftInfo: {
          valuationMode: "sangjeungbeop_market",
          acquisitionMethod: "converted",
          marketValueAtTransfer: 500_000_000,
          lendingDepositTotal: 0,
          mortgageDebtAmount: 200_000_000,
          annualRentTotal: 0,
          mortgageSetAmount: 200_000_000,
          landStdPriceAtTransfer: 0,
          buildingStdPriceAtTransfer: 400_000_000,
          landStdPriceAtAcquisition: 0,
          buildingStdPriceAtAcquisition: 100_000_000,
        },
        ...extra,
      } as Partial<TransferTaxInput>);
    const r = run(bgInput());
    expect(r.penaltyBase).toBe(50_000_000);
    expect(r.penaltyTax).toBe(2_500_000);
    // 받아서 닿을 수 없는 조합 — 다른 이유로 던지는 것이 아니라 이 입력이 사유여야 한다
    expect(() => run(bgInput({ selfBuiltHousing: SB } as Partial<TransferTaxInput>))).toThrow(/selfBuiltHousing/);
  });
  it("5년 경과 → 가산세 0 (base 만 환산 값)", () => {
    const r = run(cell({ transferDate: D("2027-01-11") }));
    expect(r.penaltyBase).toBe(500_000_000);
    expect(r.penaltyTax).toBe(0);
  });
});

describe("[G] 입력 거부 — 있는데 닿을 수 없는 조합은 조용히 무시하지 않는다", () => {
  const invalid = (i: TransferTaxInput) => {
    try {
      run(i);
    } catch (e) {
      expect(e).toBeInstanceOf(TaxCalculationError);
      return (e as TaxCalculationError).details as { field?: string } | undefined;
    }
    throw new Error("거부되지 않았다");
  };

  it("비주택 건물", () => {
    expect(invalid(withSb({ propertyType: "building" }))?.field).toBe("selfBuiltHousing");
  });
  it("본인 신축이 아닌 자산 (isSelfBuilt=false)", () => {
    expect(invalid(withSb({ isSelfBuilt: false }))?.field).toBe("selfBuiltHousing");
  });
  it("취득원인이 매매가 아님 (이월과세·상속·증여)", () => {
    for (const cause of ["carryover_gift", "inheritance", "gift"] as const)
      expect(invalid(withSb({ acquisitionCause: cause }))?.field).toBe("selfBuiltHousing");
  });
  it("겸용주택(mixedUse)", () => {
    expect(invalid(withSb({ mixedUse: {} } as unknown as Partial<TransferTaxInput>))?.field).toBe("selfBuiltHousing");
  });
  it("PHD(preHousingDisclosure)와 함께", () => {
    expect(invalid(withSb({ preHousingDisclosure: PHD_INPUT } as Partial<TransferTaxInput>))?.field).toBe("selfBuiltHousing");
  });
  it("환산 — 취득 당시 토지·건물 / 양도 당시 토지·건물 기준시가 중 하나라도 비면 거부(자동으로 채우지 않는다)", () => {
    for (const key of Object.keys(SB)) {
      const sb: Record<string, unknown> = { ...SB };
      delete sb[key];
      expect(invalid(withSb({}, sb))?.field, key).toBe(`selfBuiltHousing.${key === "landArea" ? "landPricePerSqmAtAcquisition" : key}`);
    }
  });
  it("환산 — 주택공시가격(취득·양도)이 비면 거부", () => {
    expect(invalid(withSb({ standardPriceAtAcquisition: undefined }))?.field).toBe("standardPriceAtAcquisition");
    expect(invalid(withSb({ standardPriceAtTransfer: undefined }))?.field).toBe("standardPriceAtTransfer");
  });
  it("영 §164⑨ 공익수용 특례(환산 분모 변경)와 결합한다 — 거부하지 않는다(종전 «결합은 지원하지 않습니다» 거부 → 250,000,000 / 12,500,000)", () => {
    const expr = { transferCause: "public_expropriation", housingCompensationTotal: 300_000_000, housingCompensationBasisTotal: 350_000_000 } as Partial<TransferTaxInput>;
    expect(() => run(cell(expr))).toThrow(); // 입력 부재는 던진다(자산 전체 base 로 흘러가지 않는다)
    expect(() => run(withSb(expr))).not.toThrow();
    expect(pick(run(withSb(expr)))).toMatchObject({ base: 250_000_000, pen: 12_500_000, total: 116_650_306 });
  });
  it("감정 — 건물 감정가액도 비례 입력도 없으면 거부", () => {
    expect(invalid(withSb(APPRAISAL, {}))?.field).toBe("selfBuiltHousing.buildingAppraisalValue");
  });
});

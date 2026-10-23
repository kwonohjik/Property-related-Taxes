/**
 * anchor — 일체 주택 **본인 신축** × §114조의2: 입력 부재 시 엔진 엄격화 (Q-12 PR-4 · 사용자 확정 Q-2)
 *
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md (§3.3 · §9 PR-4)
 *
 * 규칙
 *  · 건물분 base 입력(`selfBuiltHousing`)이 **필요한데 없으면** 엔진이 던진다(INVALID_INPUT → route 400). 종전(PR-1~3)은 관대하게 자산 전체 base 로 계산했다.
 *  · 던지는 집합 = UI 술어(`selfBuiltHousingScope`)가 카드를 띄우는 집합 — 화면이 칸을 보여주지 않는 조합에서 엔진이 던지면 사용자가 빠져나갈 수 없다(dead-end).
 *      throw 조건 = housing ∧ 본인 신축(증축 아님) ∧ 매매 ∧ 부담부증여·겸용·PHD 아님 ∧ 환산|감정 ∧ 5년·시행일 게이트 개방 ∧ **분리 계산 중 아님(엔진이 실제로 splitActive 인지)**
 *  · 영 §164⑨ 공익수용·공매 × 일체 주택 본인 신축: PR-A(docs/00-pm/self-built-housing-164-9-plan.md)부터 **다른 조합과 같다** — 입력 부재면 던지고, 있으면 건물분 base(환산은 H_T′ 를 같은 비례 규칙으로 나눔 · [S3]).
 *
 * 수치는 PR-1 anchor 와 같은 픽스처다(신축 2022-01-10 · 양도 2026-03-01 · 양도가 10억 · 주택공시가격 2억/4억).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { PHD_INPUT, PHD_TRANSFER_PRICE } from "./_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const SB = {
  landPricePerSqmAtAcquisition: 1_000_000,
  landArea: 100,
  buildingStdPriceAtAcquisition: 60_000_000,
  landStdPriceAtTransfer: 240_000_000,
  buildingStdPriceAtTransfer: 160_000_000,
};

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
const APPRAISAL = { useEstimatedAcquisition: false, acquisitionMethod: "appraisal", appraisalValue: 300_000_000 } as const;
const run = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const pick = (r: ReturnType<typeof run>) => ({ base: r.penaltyBase, pen: r.penaltyTax, total: r.totalTax });
const echo = (r: ReturnType<typeof run>) => (r as unknown as { selfBuiltHousingPenalty?: unknown }).selfBuiltHousingPenalty;

const SPLIT = {
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
} as Partial<TransferTaxInput>;
/** 분리 계산 중 + 자산 수준 환산 게이트도 열림(건물 파트 실가) — 이익 / 손실 */
const SPLIT_PART = {
  ...SPLIT,
  useEstimatedAcquisition: true,
  acquisitionMethod: "estimated",
  standardPriceAtAcquisition: 200_000_000,
  standardPriceAtTransfer: 400_000_000,
  buildingAcqMode: "actual",
  buildingAcquisitionPrice: 150_000_000,
  transferPrice: 1_000_000_000,
} as Partial<TransferTaxInput>;
const SPLIT_LOSS = {
  ...SPLIT_PART,
  transferPrice: 250_000_000,
  landTransferPrice: 150_000_000,
  buildingTransferPrice: 100_000_000,
  landStandardPriceAtTransfer: 450_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
} as Partial<TransferTaxInput>;

function thrown(i: TransferTaxInput): TaxCalculationError {
  try {
    run(i);
  } catch (e) {
    expect(e).toBeInstanceOf(TaxCalculationError);
    return e as TaxCalculationError;
  }
  throw new Error("던지지 않았다");
}

const notices = (r: ReturnType<typeof run>) => (r.warnings ?? []).filter((w) => /§164⑨/.test(w) && /일체 주택/.test(w));

describe("[S1] 입력 부재 → 던진다 (닿는 조합: 이익·손실·지분·고가·미등기)", () => {
  const CASES: [string, Partial<TransferTaxInput>][] = [
    ["환산 일체 주택", {}],
    ["감정 일체 주택", { ...APPRAISAL }],
    ["양도차손(§114조의2② 산출세액 0)", { capitalExpenditure: 1_200_000_000 }],
    ["지분 50%", { transferPrice: 500_000_000, ownershipRatio: 0.5 }],
    ["고가주택 15억", { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 48, transferPrice: 1_500_000_000, standardPriceAtTransfer: 600_000_000 }],
    ["미등기", { isUnregistered: true }],
    ["신축·증축 구분 미선택(buildingType 없음) — ⑧ 이 구분 선택을 먼저 요구하는 입력", { buildingType: undefined }],
    ["취득원인 미지정(매매로 본다)", { acquisitionCause: undefined }],
    ["신축 5년 되는 날(2027-01-10) 당일", { transferDate: D("2027-01-10") }],
  ];
  it.each(CASES)("%s → INVALID_INPUT · field selfBuiltHousing", (_n, over) => {
    const e = thrown(cell(over));
    expect(e.code).toBe(TaxErrorCode.INVALID_INPUT);
    expect((e.details as { field?: string } | undefined)?.field).toBe("selfBuiltHousing");
    // 무엇을 보내야 하는지 알려준다
    expect(e.message).toMatch(/selfBuiltHousing/);
    expect(e.message).toMatch(/건물/);
  });

  it("오류 메시지는 방식별로 보낼 것을 명시한다 — 환산: 취득·양도 당시 토지·건물 기준시가 / 감정: 건물 감정가액", () => {
    expect(thrown(cell()).message).toMatch(/환산취득가액.*㎡당 개별공시지가.*건물 기준시가/s);
    expect(thrown(cell({ ...APPRAISAL })).message).toMatch(/감정가액.*건물 감정가액/s);
  });

  it("입력이 있으면 던지지 않는다(PR-1 동작 그대로) — 환산 fx 187,500,000 / 9,375,000", () => {
    const r = run(cell({ selfBuiltHousing: SB } as Partial<TransferTaxInput>));
    expect(pick(r)).toMatchObject({ base: 187_500_000, pen: 9_375_000 });
  });
});

describe("[S2] 닿지 않는 조합 → 던지지 않고 종전 그대로 (UI 가 칸을 안 여는 집합)", () => {
  it("게이트가 닫힘 — 실지거래가액·매매사례·5년 경과(다음 날)·환산 시행일 전·감정 시행일 전", () => {
    expect(() => run(cell({ useEstimatedAcquisition: false, acquisitionMethod: "actual", acquisitionPrice: 300_000_000 }))).not.toThrow();
    expect(() => run(cell({ useEstimatedAcquisition: false, acquisitionMethod: "salesCase", similarSalesValue: 300_000_000 }))).not.toThrow();
    expect(run(cell({ transferDate: D("2027-01-11") })).penaltyTax).toBe(0);
    const early = { constructionDate: D("2016-06-01"), acquisitionDate: D("2016-06-01") };
    expect(() => run(cell({ ...early, transferDate: D("2017-12-31") }))).not.toThrow();
    expect(() => run(cell({ ...early, ...APPRAISAL, transferDate: D("2019-12-31") }))).not.toThrow();
  });

  it("본인 신축이 아님 · 비주택 건물 · 증축 · 부담부증여 · 겸용 · 매매 외 취득", () => {
    expect(() => run(cell({ isSelfBuilt: false }))).not.toThrow();
    expect(run(cell({ propertyType: "building" })).penaltyTax).toBe(25_000_000);
    const ext = run(cell({ buildingType: "extension", extensionFloorArea: 100, extensionStdPriceAtAcquisition: 15_000_000 }));
    expect(pick(ext)).toMatchObject({ base: 37_500_000, pen: 1_875_000 });
    expect(() => run(cell({ acquisitionCause: "inheritance" }))).not.toThrow();
    expect(() => run(cell({ mixedUse: {} } as unknown as Partial<TransferTaxInput>))).not.toThrow();
  });

  it("분리 계산 중 — 토지·건물 취득일 분리(건물 파트 환산이 축)·PHD: 던지지 않고 건물 파트 base 그대로", () => {
    const r = run(cell(SPLIT));
    expect(pick(r)).toMatchObject({ base: 225_000_000, pen: 11_250_000 });
    // 자산 수준 환산 게이트가 열려 있어도 건물 파트가 이미 축 — 이익·손실 두 경로 모두 던지지 않는다
    expect(run(cell(SPLIT_PART)).splitDetail).toBeDefined();
    expect(run(cell(SPLIT_LOSS)).transferGain).toBeLessThan(0);

    const phd = baseTransferInput({
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
    } as Partial<TransferTaxInput>);
    expect(run(phd).penaltyBase).toBe(169_332_955);
  });

  it("1세대 1주택 12억 이하 전액 비과세 — 가산세 단계에 가지 않는다", () => {
    const hi = { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 48, transferPrice: 1_000_000_000 };
    expect(() => run(cell(hi))).not.toThrow();
  });
});

describe("[S3] 영 §164⑨ 공익수용·공매 × 일체 주택 본인 신축 — 건물분 base = H_T′ × N_T ÷ (L_T+N_T) (PR-A)", () => {
  const EXPR = { transferCause: "public_expropriation" } as Partial<TransferTaxInput>;
  const EXPR_FULL = { ...EXPR, housingCompensationTotal: 300_000_000, housingCompensationBasisTotal: 350_000_000 } as Partial<TransferTaxInput>;
  const EXPR_NOT_FIRED = { ...EXPR, housingCompensationTotal: 500_000_000, housingCompensationBasisTotal: 500_000_000 } as Partial<TransferTaxInput>;
  const AUCTION = { isAuctionTransfer: true, auctionPrice: 300_000_000 } as Partial<TransferTaxInput>;
  const S3억 = { transferPrice: 300_000_000 };
  const withSb = (over: Partial<TransferTaxInput>, sb: object = SB) => cell({ ...over, selfBuiltHousing: sb } as Partial<TransferTaxInput>);
  const housing = (r: ReturnType<typeof run>) => (echo(r) as { housingSplit?: Record<string, unknown> } | undefined)?.housingSplit;

  it("A 공익수용 S=3억(H_T′ 3억) → 75,000,000 / 3,750,000 / 총 19,959,720 (종전 자산 전체 200,000,000 / 10,000,000 / 26,834,720)", () => {
    const r = run(withSb({ ...EXPR_FULL, ...S3억 }));
    expect(pick(r)).toEqual({ base: 75_000_000, pen: 3_750_000, total: 19_959_720 });
    expect(housing(r)).toMatchObject({ transferHousing: 300_000_000, transferLand: 180_000_000, transferBuilding: 120_000_000 });
    expect(housing(r)?.sec164_9).toEqual({ kind: "expropriation", standardHousing: 400_000_000, candidates: { compensation: 300_000_000, basis: 350_000_000 } });
  });
  it("B 공매·경락 S=3억 → 75,000,000 / 3,750,000 / 총 19,959,720 + 2호 echo", () => {
    const r = run(withSb({ ...AUCTION, ...S3억 }));
    expect(pick(r)).toEqual({ base: 75_000_000, pen: 3_750_000, total: 19_959_720 });
    expect(housing(r)?.sec164_9).toEqual({ kind: "auction", standardHousing: 400_000_000, candidates: { auction: 300_000_000 } });
  });
  it("C 특례 불발(보상액·보상기초 5억 ≥ H_T 4억) → 187,500,000 / 9,375,000 / 총 180,649,700 — 특례 없음과 같은 값 · echo 는 불발에도 싣는다(Q-7)", () => {
    const r = run(withSb(EXPR_NOT_FIRED));
    expect(pick(r)).toEqual({ base: 187_500_000, pen: 9_375_000, total: 180_649_700 });
    expect(pick(run(withSb({})))).toEqual(pick(r));
    expect(housing(r)).toMatchObject({ transferHousing: 400_000_000, transferBuilding: 160_000_000 });
    expect(housing(r)?.sec164_9).toMatchObject({ kind: "expropriation", standardHousing: 400_000_000 });
    expect(housing(run(withSb({})))?.sec164_9).toBeUndefined();
  });
  it("D 원 픽스처 S=10억·보상 3억/3.5억 → 250,000,000 / 12,500,000 / 총 116,650,306", () => {
    expect(pick(run(withSb(EXPR_FULL)))).toEqual({ base: 250_000_000, pen: 12_500_000, total: 116_650_306 });
  });
  it("E 양도가액 구분 기재(토지 2억/건물 1억) → 건물분 양도가액 1억이 그대로 — 62,500,000 / 3,125,000 / 총 19,272,220", () => {
    const r = run(withSb({ ...EXPR_FULL, ...S3억 }, { ...SB, sale: { landTransferPrice: 200_000_000, buildingTransferPrice: 100_000_000 } }));
    expect(pick(r)).toEqual({ base: 62_500_000, pen: 3_125_000, total: 19_272_220 });
  });
  it("F 양도차손(§114조의2② 손실 경로, 결정세액 0) → 같은 분모 — 75,000,000 / 3,750,000 / 총 4,125,000", () => {
    const r = run(withSb({ ...EXPR_FULL, ...S3억, capitalExpenditure: 500_000_000 }));
    expect(r.determinedTax).toBe(0);
    expect(pick(r)).toEqual({ base: 75_000_000, pen: 3_750_000, total: 4_125_000 });
    expect(housing(r)).toMatchObject({ transferHousing: 300_000_000 });
  });
  it("G 지분 50%(양도가 1.5억, 기준시가·보상 물건 전체) → 37,500,000 / 1,875,000 / 총 7,398,600", () => {
    expect(pick(run(withSb({ ...EXPR_FULL, transferPrice: 150_000_000, ownershipRatio: 0.5 })))).toEqual({ base: 37_500_000, pen: 1_875_000, total: 7_398_600 });
  });
  it("단일 소스 — echo.transferHousing 은 양도차익 분모(§164⑨ detail.denominator)와 같다: 1호·2호·불발·특례 없음 (이익 경로) · 손실 경로는 같은 입력의 이익 경로 분모", () => {
    const denom = (r: ReturnType<typeof run>) => {
      const x = r as unknown as { housingExpropriationValuationDetail?: { denominator: number }; auctionValuationDetail?: { denominator: number } };
      return x.housingExpropriationValuationDetail?.denominator ?? x.auctionValuationDetail?.denominator ?? 400_000_000;
    };
    for (const over of [EXPR_FULL, EXPR_NOT_FIRED, AUCTION, {}]) {
      const r = run(withSb(over as Partial<TransferTaxInput>));
      expect(housing(r)?.transferHousing, JSON.stringify(over)).toBe(denom(r));
      // 손실 경로(결과에 detail 이 실리지 않는다)는 같은 입력의 이익 경로 분모와 같아야 한다
      const loss = run(withSb({ ...over, capitalExpenditure: 1_200_000_000 } as Partial<TransferTaxInput>));
      expect(loss.determinedTax, JSON.stringify(over)).toBe(0);
      expect(housing(loss)?.transferHousing, JSON.stringify(over)).toBe(denom(r));
    }
  });
  it("경계 — 보상액 = H_T 정확히 / H_T − 1: 분모 4억(불변) / 399,999,999 (건물분은 안분 규칙대로 160,000,000 · 잔액 흡수)", () => {
    const eq = run(withSb({ ...EXPR, housingCompensationTotal: 400_000_000, housingCompensationBasisTotal: 400_000_000 }));
    expect(housing(eq)).toMatchObject({ transferHousing: 400_000_000, transferBuilding: 160_000_000 });
    const m1 = run(withSb({ ...EXPR, housingCompensationTotal: 399_999_999, housingCompensationBasisTotal: 400_000_000 }));
    expect(housing(m1)).toMatchObject({ transferHousing: 399_999_999 });
    expect((housing(m1)!.transferLand as number) + (housing(m1)!.transferBuilding as number)).toBe(399_999_999);
  });

  it("입력 부재 → 던진다 (환산·감정 × 공익수용·공매 — 더는 자산 전체 base 로 흘러가지 않는다)", () => {
    for (const over of [EXPR, EXPR_FULL, EXPR_NOT_FIRED, AUCTION, { ...APPRAISAL, ...EXPR }, { ...APPRAISAL, ...AUCTION }, { ...EXPR_FULL, capitalExpenditure: 1_200_000_000 }]) {
      const e = thrown(cell(over as Partial<TransferTaxInput>));
      expect(e.code, JSON.stringify(over)).toBe(TaxErrorCode.INVALID_INPUT);
      expect((e.details as { field?: string } | undefined)?.field).toBe("selfBuiltHousing");
    }
  });
  it("감정 × 공익수용·공매·stale 공매 플래그 — 양도 당시 기준시가를 쓰지 않아 특례와 무관: 건물 감정가액 직접 1.1억 → 5,500,000 · echo 에 sec164_9 없음", () => {
    for (const over of [EXPR_FULL, AUCTION, { ...EXPR_FULL, ...AUCTION }]) {
      const r = run(withSb({ ...APPRAISAL, ...over }, { buildingAppraisalValue: 110_000_000 }));
      expect(pick(r)).toMatchObject({ base: 110_000_000, pen: 5_500_000 });
      expect(notices(r)).toHaveLength(0);
    }
    // 양도차익은 특례 유/무 동일 — 감정은 분모를 쓰지 않는다
    const gain = (o: Partial<TransferTaxInput>) => run(withSb({ ...APPRAISAL, ...o }, { buildingAppraisalValue: 110_000_000 })).transferGain;
    expect(gain(EXPR_FULL)).toBe(gain({}));
  });
  it("stale 공매 플래그 — 환산 ∧ 공매 플래그는 1호 분모를 읽고, 감정이면 플래그가 남아 있어도 분모를 안 바꾼다", () => {
    const est = run(withSb({ ...AUCTION, ...S3억 }));
    expect(housing(est)?.transferHousing).toBe(300_000_000);
    const app = run(withSb({ ...APPRAISAL, ...AUCTION }, { buildingAppraisalValue: 110_000_000 }));
    expect(housing(app)).toBeUndefined();
  });

  it("공익수용이어도 게이트가 닫히면(5년 경과·실가) 가산세 자체가 없다 — 입력을 요구하지도 않는다", () => {
    expect(run(cell({ ...EXPR, transferDate: D("2027-01-11") })).penaltyTax).toBe(0);
    expect(() => run(cell({ ...EXPR, useEstimatedAcquisition: false, acquisitionMethod: "actual", acquisitionPrice: 300_000_000 }))).not.toThrow();
  });
  it("분리 계산 중(건물 파트가 이미 축)이면 공익수용이어도 던지지 않고 건물 파트 base 그대로 — 이익·손실 두 경로", () => {
    for (const over of [SPLIT_PART, SPLIT_LOSS]) {
      const r = run(cell({ ...over, ...EXPR }));
      expect(r.splitDetail).toBeDefined();
      expect(notices(r)).toHaveLength(0);
    }
  });
  it("🔴 F-1 해소 — 종전엔 이 조합이 UI 술어에 막혀 «엔진은 계산 가능한데 화면이 안 연다»: selfBuiltHousing 을 직접 보내도 던지지 않는다(환산 × 공익수용)", () => {
    expect(() => run(withSb(EXPR_FULL))).not.toThrow();
  });
});

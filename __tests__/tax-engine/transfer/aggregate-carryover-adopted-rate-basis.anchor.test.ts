/**
 * anchor: 다건 세율군 분류·세율 재계산은 **이월과세 §97의2가 채택한 시나리오**를 따라간다
 *
 * ── 무엇이 어긋나 있었나 ────────────────────────────────────────────────
 * 단건 엔진(`transfer-tax.ts` STEP 0.475)은 `workingInput`을 **채택 시나리오의 입력**으로
 * 갈아탄 뒤 세율을 정한다:
 *   · 시나리오 A(이월과세 적용)  → `acquisitionDate` = **증여자 취득일** · cause `"gift"`
 *     (`transfer-tax-carryover.ts` `inputABase`)
 *   · 시나리오 B(§97의2② 배제) → `acquisitionDate` = **증여 등기접수일** · cause `"purchase"`
 *     (같은 파일 `buildInputB` — 「이 줄을 carryover_gift로 바꾸면 과소과세」라고 못박은 그 줄)
 *
 * 그런데 다건 엔진(`transfer-tax-aggregate.ts` M-1/M-2)은 **원본 item**을 그대로 보고 있었다.
 * 원본은 `acquisitionCause === "carryover_gift"`이므로 §104②2호 판정
 * (`transfer-rate-holding-basis.ts` `resolveRateBasisAcquisitionDate`)이
 * **채택 결과와 무관하게 최상위 `donorAcquisitionDate`의 유무만으로** 갈렸다.
 *
 * 소비자가 둘이라 세액에 그대로 도달한다:
 *   · `classifyRateGroup`            — §104⑤ 버킷 · §102② 통산 범위 · 기본공제 배분 우선순위
 *   · `aggregateByGroup` → `calcTax` — `correctedSingleInput`이 곧 `taxRateInput`
 *
 * ── 실측 (아래 픽스처 · mock 세율) ──────────────────────────────────────
 *   토지 10억 양도 · 증여자 2010-01-01 취득 · 2025-09-01 증여 · 2026-06-01 양도
 *
 *   | 케이스                      | 단건(정본)  | 일괄(수정 전) | 일괄(수정 후) |
 *   |----------------------------|-------------|---------------|---------------|
 *   | A 채택 · 최상위 미배선      | 228,660,000 | **315,000,000** | 228,660,000 |
 *   | A 채택 · 최상위 배선        | 228,660,000 |   228,660,000   | 228,660,000 |
 *   | B 채택 · 최상위 미배선      | 350,000,000 |   350,000,000   | 350,000,000 |
 *   | B 채택 · 최상위 배선        | 350,000,000 | **258,060,000** | 350,000,000 |
 *
 * 두 오차의 **방향이 정확히 반대**다(+86,340,000 / −91,940,000). 그래서 최상위
 * `donorAcquisitionDate` 배선(④ `lib/calc/transfer-tax-api.ts`의 primary↔companion 비대칭)을
 * 손대는 것으로는 고칠 수 없다 — 한쪽을 맞추면 반대쪽이 깨진다. 교정은 **채택 결과를 반영하는**
 * 층에서만 성립하고, 고친 뒤에는 그 배선이 세율군에 **아무 영향도 주지 않는다**(C-5가 고정).
 *
 * ── 도출값의 근거 — 추정이 아니다 ───────────────────────────────────────
 * C-3·C-6은 「A 채택과 **같은 사실**(2010-01-01 취득 · 취득가 1억)을 가진 순수 매매 자산」을
 * 대조군으로 둔다. 현행 엔진이 그 동등 입력에 **이미** 228,660,000 / 378,660,000을 내고 있다
 * (memory `feedback_sibling_path_already_implements_rule` · C-2 대조군 패턴).
 *
 * 🔒 **단건은 이 수정으로 움직이지 않는다.** 추가된 `adoptedRateBasis`는 단건이 이미 쓴 입력을
 *    되비추는 echo이고, 교정은 다건 M-1에서만 일어난다. C-1·C-4가 단건 값을 못으로 박는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/** 증여자 취득일 — 양도일까지 16년(§104② 본문 기준 장기) */
const DONOR_ACQ = D("2010-01-01");
/** 증여 등기접수일 — 양도일까지 9개월(초일불산입 §104①3호 구간) */
const GIFT_REG = D("2025-09-01");
const TRANSFER_DATE = D("2026-06-01");

function land(id: string, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: TRANSFER_DATE,
    acquisitionDate: GIFT_REG,
    acquisitionPrice: 0,
    transferPrice: 1_000_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    ...o,
  };
}

/**
 * 이월과세 자산.
 * @param wireTopLevelDonor 최상위 `donorAcquisitionDate` 배선 여부 —
 *   ④에서 primary는 안 싣고(`transfer-tax-api.ts`) companion은 싣는(`-api-helpers.ts`) **비대칭**의 재현.
 */
function carryoverLand(
  id: string,
  o: { donorAcquisitionPrice: number; giftDateValuation: number; wireTopLevelDonor: boolean },
): TransferTaxItemInput {
  return land(id, {
    acquisitionCause: "carryover_gift",
    ...(o.wireTopLevelDonor ? { donorAcquisitionDate: DONOR_ACQ } : {}),
    carryoverTaxation: {
      giftRegistryDate: GIFT_REG,
      donorAcquisitionDate: DONOR_ACQ,
      donorAcquisitionPrice: o.donorAcquisitionPrice,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: o.giftDateValuation,
    },
  });
}

/** A 채택 — 증여자 취득가 1억(A 세액 크다) vs 증여시 평가액 9억(B 세액 작다) → §97의2②3호 미발동 */
const ADOPT_A = { donorAcquisitionPrice: 100_000_000, giftDateValuation: 900_000_000 };
/** B 채택 — 증여자 취득가 9억(A 세액 작다) vs 증여시 평가액 3억 → ②3호 발동, 이월과세 배제 */
const ADOPT_B = { donorAcquisitionPrice: 900_000_000, giftDateValuation: 300_000_000 };

function single(item: TransferTaxItemInput) {
  const asInput = item as unknown as Record<string, unknown>;
  return calculateTransferTax(
    { ...asInput, annualBasicDeductionUsed: 2_500_000 } as never,
    mockRates,
  );
}

function aggregate(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("이월과세 A 채택 — 일괄이 단건과 같아진다", () => {
  it("C-1 (단건 대조군): A 채택 · 증여자 취득일 기산 누진 42% → 228,660,000", () => {
    const r = single(carryoverLand("C", { ...ADOPT_A, wireTopLevelDonor: false }));
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(r.appliedRate).toBe(0.42);
    expect(r.determinedTax).toBe(228_660_000);
  });

  it("C-2: 일괄 세율군은 progressive이고 세액은 단건과 일치한다 (종전 short_term · 315,000,000)", () => {
    const a = aggregate([carryoverLand("C", { ...ADOPT_A, wireTopLevelDonor: false })]);
    expect(a.properties[0].rateGroup).toBe("progressive");
    expect(a.determinedTax).toBe(228_660_000);
  });

  it("C-3 (동등 입력 대조군): 2010-01-01 취득·취득가 1억 순수 매매 자산과 같은 값", () => {
    const equivalent = aggregate([
      land("E", { acquisitionDate: DONOR_ACQ, acquisitionPrice: 100_000_000 }),
    ]);
    expect(equivalent.properties[0].rateGroup).toBe("progressive");
    expect(equivalent.determinedTax).toBe(228_660_000);
  });
});

describe("이월과세 B 채택 (§97의2②3호 배제) — 일괄이 단건과 같아진다", () => {
  it("C-4 (단건 대조군): B 채택 · 증여 등기접수일 기산 단기 50% → 350,000,000", () => {
    const r = single(carryoverLand("C", { ...ADOPT_B, wireTopLevelDonor: true }));
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(r.appliedRate).toBe(0.5);
    expect(r.determinedTax).toBe(350_000_000);
  });

  it("C-5: 최상위 donorAcquisitionDate 배선 여부와 무관하게 short_term · 350,000,000", () => {
    // ④ primary(미배선) ↔ companion(배선) 비대칭이 세율군에 **누수되지 않는다**.
    // 종전에는 배선분만 progressive로 빠져 258,060,000(−91,940,000 과소)이었다.
    for (const wireTopLevelDonor of [false, true]) {
      const a = aggregate([carryoverLand("C", { ...ADOPT_B, wireTopLevelDonor })]);
      expect(a.properties[0].rateGroup).toBe("short_term");
      expect(a.determinedTax).toBe(350_000_000);
    }
  });
});

describe("§104⑤ 버킷 — 채택 A 자산이 진성 단기 자산과 합쳐지지 않는다", () => {
  /** 진성 단기 토지 — 2025-10-01 취득 5억 양도(단건 150,000,000 · 50%) */
  const shortTermLand = land("S", {
    acquisitionDate: D("2025-10-01"),
    acquisitionPrice: 200_000_000,
    transferPrice: 500_000_000,
  });

  it("C-6: [이월과세 A 채택 토지, 진성 단기 토지] = [동등 매매 토지, 진성 단기 토지]", () => {
    const withCarryover = aggregate([
      carryoverLand("C", { ...ADOPT_A, wireTopLevelDonor: false }),
      shortTermLand,
    ]);
    const withEquivalent = aggregate([
      land("E", { acquisitionDate: DONOR_ACQ, acquisitionPrice: 100_000_000 }),
      shortTermLand,
    ]);

    expect(withCarryover.properties.map((p) => p.rateGroup)).toEqual([
      "progressive",
      "short_term",
    ]);
    // 종전: 두 자산이 모두 short_term으로 분류돼 한 버킷에 합산 → 465,000,000 (+86,340,000)
    expect(withCarryover.determinedTax).toBe(378_660_000);
    expect(withCarryover.determinedTax).toBe(withEquivalent.determinedTax);
  });
});

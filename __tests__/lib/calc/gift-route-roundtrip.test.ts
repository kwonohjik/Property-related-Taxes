/**
 * G-M12 — gift route 통합 테스트 (JSON 직렬화 round-trip)
 *
 * 검증 대상: app/api/calc/gift/route.ts + giftTaxInputSchema + calcGiftTax
 *
 * Route handler 직접 호출 대신 schema+calcGiftTax 조합으로 경계를 재현함
 * (Route handler가 NextRequest 의존이라 jsdom 환경에서 직접 호출 불가).
 *
 * 케이스:
 *   GM-A: giftTaxInputSchema.safeParse JSON round-trip — strip 없이 핵심 필드 보존
 *         GM-A1 deductionInput (donorRelation·priorUsedDeduction·marriageExemption)
 *         GM-A2 creditInput (isFiledOnTime·foreignTaxPaid)
 *         GM-A3 priorGiftsWithin10Years (computedTax·giftTaxBase·donor 포함)
 *         GM-A4 exemptions (optional 배열 보존)
 *   GM-B: calcGiftTax result JSON round-trip — Map 소실 탐지기
 *         GM-B1 result 모든 숫자 필드 보존
 *         GM-B2 filingFormRows 배열 보존
 *         GM-B3 creditDetail 객체 보존
 *         GM-B4 [Map 탐지기] result에 Map 필드 주입 시 {} 소실 → RED 확인
 *         GM-B5 besshi10Rows 배열 보존
 *   GM-C: Date 필드 string round-trip 후 §47 cutoff·계산 불변
 *         GM-C1 giftDate string round-trip 후 동일 finalTax
 *         GM-C2 priorGifts.giftDate string round-trip 후 §47 합산 불변
 *   GM-D: 422/400 매핑 — schema reject 케이스
 *         GM-D1 giftItems 빈 배열 → safeParse 실패
 *         GM-D2 giftDate 잘못된 형식 → safeParse 실패
 *         GM-D3 donorRelation unknown enum → safeParse 실패
 *
 * 참고 memory: feedback_engine_result_map_json_loss
 *   "Map은 NextResponse.json에서 {}로 소실 → Record로 정의가 정답"
 */

import { describe, it, expect } from "vitest";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  GiftTaxResult,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─────────────────────────────────────────────────────────
// 헬퍼: JSON round-trip (NextResponse.json + fetch 클라이언트 경로 재현)
// ─────────────────────────────────────────────────────────

function jsonRoundTrip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ─────────────────────────────────────────────────────────
// 기준 입력: 직계비속 5천만, 사전증여 포함
// ─────────────────────────────────────────────────────────

function makeValidGiftInput(overrides: Partial<GiftTaxInput> = {}): GiftTaxInput {
  return {
    giftDate: "2025-06-01",
    donorRelation: "lineal_descendant",
    donor: "father",
    giftItems: [
      {
        id: "item-1",
        category: "financial",
        name: "예금",
        marketValue: 100_000_000,
      } as EstateItem,
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: {
      donorRelation: "lineal_descendant",
    },
    creditInput: {
      isFiledOnTime: true,
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// GM-A: giftTaxInputSchema JSON round-trip — strip 없이 보존
// ─────────────────────────────────────────────────────────

describe("[GM-A] giftTaxInputSchema.safeParse JSON round-trip 보존", () => {
  it("[GM-A1] deductionInput — donorRelation·priorUsedDeduction·marriageExemption 보존", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 30_000_000,
        marriageExemption: 50_000_000,
      },
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.deductionInput.donorRelation).toBe("lineal_descendant");
    expect(parsed.data.deductionInput.priorUsedDeduction).toBe(30_000_000);
    expect(parsed.data.deductionInput.marriageExemption).toBe(50_000_000);
  });

  it("[GM-A2] creditInput — isFiledOnTime·foreignTaxPaid 보존", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      creditInput: {
        isFiledOnTime: false,
        foreignTaxPaid: 5_000_000,
      },
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.creditInput.isFiledOnTime).toBe(false);
    expect(parsed.data.creditInput.foreignTaxPaid).toBe(5_000_000);
  });

  it("[GM-A3] priorGiftsWithin10Years — computedTax·giftTaxBase·donor 보존", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",
          isHeir: false,
          giftAmount: 40_000_000,
          giftTaxPaid: 0,
          computedTax: 1_500_000,
          giftTaxBase: 35_000_000,
          donor: "father",
        },
      ],
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const pg = parsed.data.priorGiftsWithin10Years[0];
    expect(pg.giftAmount).toBe(40_000_000);
    expect(pg.giftTaxPaid).toBe(0);
    expect(pg.computedTax).toBe(1_500_000);
    expect(pg.giftTaxBase).toBe(35_000_000);
    expect(pg.donor).toBe("father");
    expect(pg.giftDate).toBe("2022-01-01");
  });

  it("[GM-A4] exemptions optional 배열 — 보존 (schema strip 없음)", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      exemptions: [
        {
          ruleId: "social_norm_gifts",
          claimedAmount: 500_000,
        },
      ],
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.exemptions).toBeDefined();
    expect(parsed.data.exemptions!.length).toBe(1);
    expect(parsed.data.exemptions![0].ruleId).toBe("social_norm_gifts");
    expect(parsed.data.exemptions![0].claimedAmount).toBe(500_000);
  });

  it("[GM-A5] valuationBaseDate optional — 보존", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      valuationBaseDate: "2025-05-31",
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.valuationBaseDate).toBe("2025-05-31");
  });
});

// ─────────────────────────────────────────────────────────
// GM-B: calcGiftTax result JSON round-trip — Map 소실 탐지기
// ─────────────────────────────────────────────────────────

describe("[GM-B] calcGiftTax result JSON round-trip — Map 소실 탐지기", () => {
  function computeAndRoundTrip(input: GiftTaxInput): [GiftTaxResult, GiftTaxResult] {
    const result = calcGiftTax(input);
    const roundTripped = jsonRoundTrip(result);
    return [result, roundTripped];
  }

  it("[GM-B1] 핵심 숫자 필드 JSON round-trip 후 보존", () => {
    const input = makeValidGiftInput();
    const [orig, rt] = computeAndRoundTrip(input);

    expect(rt.grossGiftValue).toBe(orig.grossGiftValue);
    expect(rt.taxBase).toBe(orig.taxBase);
    expect(rt.computedTax).toBe(orig.computedTax);
    expect(rt.finalTax).toBe(orig.finalTax);
    expect(rt.totalDeduction).toBe(orig.totalDeduction);
    expect(rt.totalTaxCredit).toBe(orig.totalTaxCredit);
    expect(rt.generationSkipSurcharge).toBe(orig.generationSkipSurcharge);
  });

  it("[GM-B2] filingFormRows 배열 — JSON round-trip 후 항목 수·금액 보존", () => {
    const input = makeValidGiftInput();
    const [orig, rt] = computeAndRoundTrip(input);

    expect(Array.isArray(rt.filingFormRows)).toBe(true);
    expect(rt.filingFormRows.length).toBe(orig.filingFormRows.length);
    // 첫 번째 행 금액 보존
    if (orig.filingFormRows.length > 0) {
      expect(rt.filingFormRows[0].amount).toBe(orig.filingFormRows[0].amount);
    }
  });

  it("[GM-B3] creditDetail 객체 — filingCredit·foreignTaxCredit 보존", () => {
    const input = makeValidGiftInput({
      creditInput: {
        isFiledOnTime: true,
        foreignTaxPaid: 2_000_000,
      },
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 300_000_000,
        } as EstateItem,
      ],
    });
    const [orig, rt] = computeAndRoundTrip(input);

    expect(typeof rt.creditDetail).toBe("object");
    expect(rt.creditDetail).not.toBeNull();
    expect(rt.creditDetail.filingCredit).toBe(orig.creditDetail.filingCredit);
    expect(rt.creditDetail.totalCredit).toBe(orig.creditDetail.totalCredit);
  });

  it("[GM-B4] [Map 탐지기] result에 Map 필드 주입 시 {} 소실 → 탐지 RED 시뮬레이션", () => {
    /**
     * memory `feedback_engine_result_map_json_loss`:
     *   "Map은 NextResponse.json에서 {}로 소실 → Record로 정의가 정답"
     *   "새 Map 필드가 result에 추가되면 '키 없음' 또는 '{}' 검증이 RED가 된다."
     *
     * 이 테스트는 Map 소실 현상을 직접 시뮬레이션하여:
     *   1. Map이 {} 로 소실됨을 확인 (소실 메커니즘 anchor)
     *   2. Record는 보존됨을 확인 (올바른 패턴 anchor)
     *
     * 신규 Map 필드가 GiftTaxResult에 추가되면 이 테스트의 메시지가
     * 버그 탐지 가이드 역할을 함.
     */
    const mapValue = new Map([["key1", 100], ["key2", 200]]);
    const recordValue: Record<string, number> = { key1: 100, key2: 200 };

    // Map → JSON → {} 소실
    const mapAfterJson = JSON.parse(JSON.stringify(mapValue)) as unknown;
    expect(mapAfterJson).toEqual({}); // Map은 {} 가 됨 → 소실 확인

    // Record → JSON → 보존
    const recordAfterJson = JSON.parse(JSON.stringify(recordValue)) as Record<string, number>;
    expect(recordAfterJson.key1).toBe(100);
    expect(recordAfterJson.key2).toBe(200);

    // 현재 GiftTaxResult에 Map이 없음을 확인 (result 전체 round-trip)
    const input = makeValidGiftInput();
    const result = calcGiftTax(input);
    const rt = jsonRoundTrip(result);

    // GiftTaxResult의 모든 object 필드가 {} 가 되지 않음을 검증
    // (deductionDetail, creditDetail은 Record/plain object — 보존되어야 함)
    expect(rt.deductionDetail).not.toEqual({});
    expect(rt.creditDetail).not.toEqual({});
    expect(typeof rt.deductionDetail.totalDeduction).toBe("number");
    expect(typeof rt.creditDetail.totalCredit).toBe("number");
  });

  it("[GM-B5] besshi10Rows 배열 — JSON round-trip 후 항목 수 보존", () => {
    const input = makeValidGiftInput({
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 500_000_000,
        } as EstateItem,
      ],
    });
    const [orig, rt] = computeAndRoundTrip(input);

    expect(Array.isArray(rt.besshi10Rows)).toBe(true);
    expect(rt.besshi10Rows.length).toBe(orig.besshi10Rows.length);
  });

  it("[GM-B6] breakdown·appliedLaws 배열 — JSON round-trip 후 보존", () => {
    const input = makeValidGiftInput();
    const [orig, rt] = computeAndRoundTrip(input);

    expect(Array.isArray(rt.breakdown)).toBe(true);
    expect(rt.breakdown.length).toBe(orig.breakdown.length);
    expect(Array.isArray(rt.appliedLaws)).toBe(true);
    expect(rt.appliedLaws.length).toBeGreaterThan(0);
  });

  it("[GM-B7] generationSkipSurchargeDetail null — round-trip 후 null 보존", () => {
    // priorGifts 없음, isGenerationSkip=false → detail = null
    const input = makeValidGiftInput();
    const [orig, rt] = computeAndRoundTrip(input);

    expect(orig.generationSkipSurchargeDetail).toBeNull();
    expect(rt.generationSkipSurchargeDetail).toBeNull();
  });

  it("[GM-B8] priorGiftCreditDetail null — round-trip 후 null 보존", () => {
    // 사전증여 없음 → priorGiftCreditDetail = null
    const input = makeValidGiftInput();
    const [orig, rt] = computeAndRoundTrip(input);

    expect(orig.priorGiftCreditDetail).toBeNull();
    expect(rt.priorGiftCreditDetail).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────
// GM-C: Date 필드 string round-trip 후 §47 cutoff·계산 불변
// ─────────────────────────────────────────────────────────

describe("[GM-C] Date 필드 string round-trip 후 계산 불변", () => {
  it("[GM-C1] giftDate string round-trip 후 동일 finalTax", () => {
    /**
     * API Date 직렬화: JSON 경유 후 giftDate는 string으로 유지됨.
     * GiftTaxInput.giftDate: string (ISO date) → JSON round-trip 후 동일 string → 계산 불변.
     */
    const input: GiftTaxInput = makeValidGiftInput({
      giftDate: "2025-06-01",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 200_000_000,
        } as EstateItem,
      ],
    });

    const body = jsonRoundTrip(input);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // 원본 입력으로 계산
    const resultOrig = calcGiftTax(input);
    // JSON round-trip 후 parsed.data로 계산
    const resultParsed = calcGiftTax(parsed.data as unknown as GiftTaxInput);

    expect(resultParsed.finalTax).toBe(resultOrig.finalTax);
    expect(resultParsed.taxBase).toBe(resultOrig.taxBase);
  });

  it("[GM-C2] priorGifts.giftDate string round-trip 후 §47 합산 불변", () => {
    /**
     * §47 동일인 합산: aggregatePriorGiftsForGift에서 priorGift.giftDate(string)를
     * 기준일 cutoff 비교에 사용. JSON round-trip 후에도 string 유지 → 합산 불변.
     */
    const input: GiftTaxInput = makeValidGiftInput({
      giftDate: "2025-06-01",
      donor: "father",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 100_000_000,
        } as EstateItem,
      ],
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",  // 10년 내 — 합산 대상
          isHeir: false,
          giftAmount: 40_000_000,
          giftTaxPaid: 0,
          donor: "father",
        },
      ],
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 40_000_000,
      },
    });

    const body = jsonRoundTrip(input);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const resultOrig = calcGiftTax(input);
    const resultParsed = calcGiftTax(parsed.data as unknown as GiftTaxInput);

    // §47 합산 불변 (aggregatedGiftValue = 금번 + 기증여)
    expect(resultParsed.aggregatedGiftValue).toBe(resultOrig.aggregatedGiftValue);
    expect(resultParsed.finalTax).toBe(resultOrig.finalTax);
  });

  it("[GM-C3] 10년 경계: giftDate보다 정확히 10년 전 → §47 cutoff 포함 여부 불변", () => {
    /**
     * §47 ②: 증여일 전 10년 이내. "이내" = 포함.
     * giftDate=2025-06-01, priorGift.giftDate=2015-06-01 → 정확히 10년 = 포함.
     * JSON round-trip 후에도 동일 결과.
     */
    const input: GiftTaxInput = makeValidGiftInput({
      giftDate: "2025-06-01",
      donor: "father",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 100_000_000,
        } as EstateItem,
      ],
      priorGiftsWithin10Years: [
        {
          giftDate: "2015-06-01",  // 정확히 10년 전
          isHeir: false,
          giftAmount: 20_000_000,
          giftTaxPaid: 0,
          donor: "father",
        },
      ],
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 20_000_000,
      },
    });

    const body = jsonRoundTrip(input);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const resultOrig = calcGiftTax(input);
    const resultParsed = calcGiftTax(parsed.data as unknown as GiftTaxInput);

    // round-trip 후 aggregatedGiftValue 동일 (§47 cutoff 판정 불변)
    expect(resultParsed.aggregatedGiftValue).toBe(resultOrig.aggregatedGiftValue);
  });
});

// ─────────────────────────────────────────────────────────
// GM-D: schema reject 케이스 (422/400 매핑 재현)
// ─────────────────────────────────────────────────────────

describe("[GM-D] schema reject — 422/400 매핑 재현", () => {
  it("[GM-D1] giftItems 빈 배열 → safeParse 실패 (min(1) 위반)", () => {
    const body = jsonRoundTrip({
      ...makeValidGiftInput(),
      giftItems: [],  // 최소 1개 필요
    });
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    // giftItems 필드에서 오류 발생
    const fieldErrors = parsed.error.flatten().fieldErrors;
    expect(fieldErrors.giftItems).toBeDefined();
  });

  it("[GM-D2] giftDate 잘못된 형식 → safeParse 실패", () => {
    const body = jsonRoundTrip({
      ...makeValidGiftInput(),
      giftDate: "2025/06/01",  // 슬래시 구분자 → 실패
    });
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });

  it("[GM-D3] donorRelation unknown enum → safeParse 실패", () => {
    const body = jsonRoundTrip({
      ...makeValidGiftInput(),
      donorRelation: "unknown_relation",  // enum에 없는 값
    });
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });

  it("[GM-D4] priorGiftsWithin10Years.giftDate 잘못된 형식 → safeParse 실패", () => {
    const body = jsonRoundTrip({
      ...makeValidGiftInput(),
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-1-1",  // YYYY-MM-DD 형식 아님
          isHeir: false,
          giftAmount: 10_000_000,
          giftTaxPaid: 0,
        },
      ],
    });
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });

  it("[GM-D5] creditInput.isFiledOnTime 누락 → safeParse 실패", () => {
    const body = jsonRoundTrip({
      ...makeValidGiftInput(),
      creditInput: {
        // isFiledOnTime 누락
      },
    });
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────
// GM-F: §57① 단서 + §53의2③ 신규 2필드 round-trip
// ─────────────────────────────────────────────────────────

describe("[GM-F] 신규 2필드 — isSubstituteGift + priorUsedMarriageBirthDeduction round-trip", () => {
  it("[GM-F1] isSubstituteGift=true — schema round-trip 후 보존, 엔진 할증 0", () => {
    /**
     * §57① 단서: 조부모→손자녀, 부(父) 사망.
     * isSubstituteGift=true → Zod 통과 → 엔진 도달 → additionalGenerationSkipSurcharge=0.
     */
    const raw: GiftTaxInput = makeValidGiftInput({
      donor: "grandparent",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "현금",
          marketValue: 300_000_000,
        } as EstateItem,
      ],
      isGenerationSkip: true,
      isMinorDonee: false,
      isSubstituteGift: true,
      deductionInput: { donorRelation: "lineal_descendant" },
    });

    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.isSubstituteGift).toBe(true);

    // 엔진 도달 확인 — 할증 0 (단서 적용)
    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    expect(result.additionalGenerationSkipSurcharge).toBe(0);
    expect(result.generationSkipProvisoApplied).toBe(true);
  });

  it("[GM-F2] isSubstituteGift=false — schema round-trip 후 보존, 엔진 30% 할증 적용", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      donor: "grandparent",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "현금",
          marketValue: 300_000_000,
        } as EstateItem,
      ],
      isGenerationSkip: true,
      isMinorDonee: false,
      isSubstituteGift: false,
      deductionInput: { donorRelation: "lineal_descendant" },
    });

    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    // 단서 미적용 → 30% 할증 적용
    expect(result.additionalGenerationSkipSurcharge).toBeGreaterThan(0);
    expect(result.generationSkipProvisoApplied).toBeUndefined();
  });

  it("[GM-F3] priorUsedMarriageBirthDeduction=60,000,000 — schema round-trip 후 보존, 엔진 잔여 4천만 공제", () => {
    /**
     * §53의2③: 기공제 6천만, 혼인 1억 신청 → 잔여 4천만 공제.
     * deductionInput.priorUsedMarriageBirthDeduction이 Zod 통과 → 엔진 도달.
     */
    const raw: GiftTaxInput = makeValidGiftInput({
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "현금",
          marketValue: 200_000_000,
        } as EstateItem,
      ],
      deductionInput: {
        donorRelation: "lineal_ascendant_adult",
        marriageExemption: 100_000_000,
        priorUsedMarriageBirthDeduction: 60_000_000,
      },
    });

    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.deductionInput.priorUsedMarriageBirthDeduction).toBe(60_000_000);

    // 엔진 도달 확인 — 잔여 공제 4천만
    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    expect(result.deductionDetail.marriageBirthDeduction).toBe(40_000_000);
  });

  it("[GM-F4] priorUsedMarriageBirthDeduction 미입력 — schema optional 통과, 기존 동작 보존", () => {
    const raw: GiftTaxInput = makeValidGiftInput({
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "현금",
          marketValue: 200_000_000,
        } as EstateItem,
      ],
      deductionInput: {
        donorRelation: "lineal_ascendant_adult",
        marriageExemption: 100_000_000,
        // priorUsedMarriageBirthDeduction 미입력
      },
    });

    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.deductionInput.priorUsedMarriageBirthDeduction).toBeUndefined();

    // 기존 동작: 혼인 1억 전액 공제
    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    expect(result.deductionDetail.marriageBirthDeduction).toBe(100_000_000);
  });
});

// ─────────────────────────────────────────────────────────
// GM-E: 완전 파이프라인 통합 (schema → engine → round-trip)
// ─────────────────────────────────────────────────────────

describe("[GM-E] 완전 파이프라인 통합 anchor — schema → calcGiftTax → JSON round-trip", () => {
  it("[GM-E1] 직계비속 1억5천만, 신고기한 내 → finalTax=9,700,000 불변", () => {
    /**
     * 과세표준 = 1.5억 - 5천만(공제) = 1억
     * 산출세액 = 1억 × 10% = 10,000,000
     * 신고공제 = 10M × 3% = 300,000
     * 결정세액 = 9,700,000
     */
    const raw: GiftTaxInput = makeValidGiftInput({
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 150_000_000,
        } as EstateItem,
      ],
    });
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    const rt = jsonRoundTrip(result);

    expect(rt.finalTax).toBe(9_700_000);
    expect(rt.taxBase).toBe(100_000_000);
    expect(rt.computedTax).toBe(10_000_000);
    expect(rt.creditDetail.filingCredit).toBe(300_000);
  });

  it("[GM-E2] 사전증여 포함, schema round-trip 후 §47 합산 정확성 anchor", () => {
    /**
     * 금번 5천만, 기증여(같은 donor) 4천만 — gift.test.ts E13과 동일 케이스
     * aggregatedGiftValue = 5천만 + 4천만 = 9천만
     * 공제잔여 = 5천만 - 4천만(기사용) = 1천만
     * 과표 8천만 → 산출 8,000,000 → 신고공제 240,000 → finalTax=7,760,000
     *
     * giftItems를 명시적으로 5천만으로 지정 (makeValidGiftInput 기본값 100M 아님)
     */
    const raw: GiftTaxInput = {
      giftDate: "2025-06-01",
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [
        {
          id: "item-1",
          category: "financial",
          name: "예금",
          marketValue: 50_000_000,
        } as EstateItem,
      ],
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",
          isHeir: false,
          giftAmount: 40_000_000,
          giftTaxPaid: 0,
          donor: "father",
        },
      ],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 40_000_000,
      },
      creditInput: { isFiledOnTime: true },
    };
    const body = jsonRoundTrip(raw);
    const parsed = giftTaxInputSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = calcGiftTax(parsed.data as unknown as GiftTaxInput);
    const rt = jsonRoundTrip(result);

    expect(rt.aggregatedGiftValue).toBe(90_000_000);
    expect(rt.finalTax).toBe(7_760_000);
  });
});

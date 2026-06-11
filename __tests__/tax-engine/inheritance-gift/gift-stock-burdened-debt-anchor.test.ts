/**
 * 증여세 주식 부담부증여 §47① — 특례 스트림 채무 차감 Anchor
 *
 * 법령 근거 (KoreanLaw 현행본 대조 완료):
 *   상증법 §47① — 증여세 과세가액 = 증여재산가액 − "그 증여재산에 담보된 채무로서 수증자가 인수한 금액"
 *   조특법 §30의5⑬(§30의6⑤ 준용) — "이 조에서 달리 정하지 아니한 것은 상증법에 따른다"
 *     → 가업승계 특례 "증여세 과세가액(한도)" 산정에도 §47① 채무 차감 적용 (법문 해석 기준, 예규 미확보)
 *
 * 설계: 특례 자산 채무는 orchestrator 레이어에서 specialItemsNetValue로 차감 후 한도·공제·세율 적용.
 *   (gift-special-stream.ts 무변경 — calcSpecialTreatmentStream에 순가액 전달)
 *
 * 수치는 §26 누진(1억 10% / 5억 20%·누진공제 1천만 / 10억 30%·6천만 / 30억 40%·1.6억 / 50%·4.6억)
 *   + §53 직계비속 5천만 + §69 3% + 가업 10억 공제·10%/120억 초과 20%로 원 단위 수동 계산 후 toBe 고정.
 *
 * Pre-Do 순서: A-5(현행 기통과 — 단일 스트림 기처리 실증)를 구현 전 먼저 통과 확인 →
 *   A-1~A-4·A-6(특례 스트림 채무 미차감으로 실패) 확보 → 엔진 Do → 전체 녹색.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  GiftDeductionInput,
  GiftTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 가업 특례 자산은 주식만 가능(§30의6①). 평가액 투명성을 위해 marketValue(시가, §60① 우선) 사용
// — 엔진 anchor는 Zod 미경유라 unlistedStockData legacy 필수 제약 무관, 평가액 = marketValue 직접.
function makeStock(
  id: string,
  marketValue: number,
  opts: { isSpecial?: boolean; assumedDebt?: number } = {},
): EstateItem {
  return {
    id,
    category: "unlisted_stock",
    name: `주식${id}`,
    marketValue,
    ...(opts.isSpecial === undefined
      ? {}
      : { isSpecialTreatmentAsset: opts.isSpecial }),
    ...(opts.assumedDebt === undefined
      ? {}
      : { assumedDebtForGift: opts.assumedDebt }),
  } as EstateItem;
}

const BASE_CREDIT: GiftTaxCreditInput = { isFiledOnTime: true };
const BASE_DEDUCTION: GiftDeductionInput = {
  donorRelation: "lineal_descendant",
};

function makeInput(overrides: Partial<GiftTaxInput>): GiftTaxInput {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_descendant",
    donor: "father",
    giftItems: [],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: BASE_DEDUCTION,
    creditInput: BASE_CREDIT,
    ...overrides,
  };
}

function familyCredit(
  overrides: Partial<GiftTaxCreditInput> = {},
): GiftTaxCreditInput {
  return { ...BASE_CREDIT, specialTreatment: "family_business", ...overrides };
}

describe("§47① 주식 부담부증여 — 특례(가업승계) 스트림 채무 차감", () => {
  it("[A-1] 가업 주식 50억 − 채무 5억, 영위 15년 → 350,000,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 5_000_000_000, { assumedDebt: 500_000_000 }),
        ],
        creditInput: familyCredit({ familyBusinessYears: 15 }),
      }),
    );
    // net 45억 − 10억 공제 = 35억 × 10% = 350,000,000 (§69 배제)
    expect(r.specialStreamTax).toBe(350_000_000);
    expect(r.ordinaryStreamTax).toBe(0);
    expect(r.finalTax).toBe(350_000_000);
    // debtAssumed(별지 ㉒)는 일반 스트림 채무만 → 0. 특례 채무는 specialStreamDebt로 분리
    expect(r.debtAssumed).toBe(0);
    expect(r.specialStreamDebt).toBe(500_000_000);
  });

  it("[A-2] 가업 50억 − 채무 5억 + 일반 주식 30억 별도, 영위 15년 → 1,339,400,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 5_000_000_000, { isSpecial: true, assumedDebt: 500_000_000 }),
          makeStock("b", 3_000_000_000, { isSpecial: false }),
        ],
        creditInput: familyCredit({ familyBusinessYears: 15 }),
      }),
    );
    // 특례: net 45억 → 3.5억. 일반: 30억 − §53 5천만 = 29.5억 → ×40% − 1.6억 = 10.2억 → §69 3% → 989,400,000
    expect(r.specialStreamTax).toBe(350_000_000);
    expect(r.ordinaryStreamTax).toBe(989_400_000);
    expect(r.finalTax).toBe(1_339_400_000);
    // 채무는 특례 자산에만 → 일반 debtAssumed 0, specialStreamDebt 500M
    expect(r.debtAssumed).toBe(0);
    expect(r.specialStreamDebt).toBe(500_000_000);
  });

  it("[A-3] 가업 주식 150억 − 채무 20억, 영위 15년 → 1,200,000,000 (정확히 120억 과표)", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 15_000_000_000, { assumedDebt: 2_000_000_000 }),
        ],
        creditInput: familyCredit({ familyBusinessYears: 15 }),
      }),
    );
    // net 130억 − 10억 = 정확히 120억 → 10%만 → 1,200,000,000 (채무 0이면 16억 — 20% 구간)
    expect(r.specialStreamTax).toBe(1_200_000_000);
    expect(r.finalTax).toBe(1_200_000_000);
  });

  it("[A-4] 가업 주식 30억 − 채무 35억 → 0 (음수 가드 + 경고)", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 3_000_000_000, { assumedDebt: 3_500_000_000 }),
        ],
        creditInput: familyCredit({ familyBusinessYears: 15 }),
      }),
    );
    expect(r.specialStreamTax).toBe(0);
    expect(r.finalTax).toBe(0);
    expect(
      r.warnings.some((w) => w.includes("채무") && w.includes("초과")),
    ).toBe(true);
  });

  it("[A-5] 일반 비상장 20억 − 채무 5억 (특례 미선택) → 407,400,000 (현행 기통과 기준선)", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 2_000_000_000, { assumedDebt: 500_000_000 }),
        ],
      }),
    );
    // 단일 스트림: net 15억 − §53 5천만 = 14.5억 → ×40% − 1.6억 = 4.2억 → §69 3% → 407,400,000
    expect(r.finalTax).toBe(407_400_000);
    expect(r.debtAssumed).toBe(500_000_000);
  });

  it("[A-6] 가업 350억 − 채무 30억, 영위 미입력(10년·한도 300억) → 5,201,400,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 35_000_000_000, { assumedDebt: 3_000_000_000 }),
        ],
        creditInput: familyCredit(),
      }),
    );
    // net 320억: 한도 300억 → 과표 290억 → 120억×10% + 170억×20% = 4,600,000,000
    // 초과 20억 일반 이관 → 19.5억 → ×40% − 1.6억 = 6.2억 → §69 3% → 601,400,000
    expect(r.specialStreamTax).toBe(4_600_000_000);
    expect(r.ordinaryStreamTax).toBe(601_400_000);
    expect(r.finalTax).toBe(5_201_400_000);
  });

  it("[A-7] §47③ 토글 OFF여도 채무 차감 (표시 전용 정책, PR #117 동일)", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          makeStock("a", 5_000_000_000, {
            assumedDebt: 500_000_000,
          }),
        ],
        creditInput: familyCredit({ familyBusinessYears: 15 }),
      }),
    );
    // burdenedGiftDebtConfirmed 미설정(false)이어도 엔진은 차감 → A-1과 동일
    expect(r.specialStreamTax).toBe(350_000_000);
  });
});

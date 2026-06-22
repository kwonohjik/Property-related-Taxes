/**
 * 동시증여 다중 건 세액 계산 오케스트레이터 (상증령 §46①2호)
 *
 * 법령 근거:
 *   상증법 §4의2①  : 납세의무자 = 수증자 (같은 날 다수 증여도 수증자 동일)
 *   상증법 §47②    : 동일인(직계존속 + 그 배우자) 10년 합산 — getDonorGroup 단일 소스
 *   상증령 §46①2호 : 동시증여 시 공제 한도를 과세가액 비율로 안분
 *   상증법 §53     : 증여재산공제 한도 (관계별)
 *   상증법 §57①    : 세대생략 30% 할증 / 미성년 + 20억 초과 40% 할증
 *   상증법 §69     : 신고세액공제 3%
 *
 * 알고리즘:
 *   STEP 1: 동일인 합산 가드 (getDonorGroup 일치 → 병합 + 경고)
 *   STEP 2 PASS1: 각 건 calcGiftTax (simultaneousGifts 미주입) → netCurrentGiftValue 취득
 *   STEP 2 PASS2: 같은 공제그룹 피어 netCurrentGiftValue를 simultaneousGifts에 주입 후 재계산
 *
 * @returns GiftTaxResult[] — 신고서 수와 동일 길이. Σ finalTax는 호출자 책임.
 *
 * Pure Engine: DB 호출 없음. 입력 검증 없음 (Orchestrator/Zod 담당).
 */

import type { GiftTaxInput, GiftTaxResult } from "./types/inheritance-gift.types";
import type { GiftTaxEngineOptions } from "./gift-tax";
import { calcGiftTax } from "./gift-tax";
import { getDonorGroup } from "./gift-prior-aggregation";
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";

// ============================================================
// 공개 API
// ============================================================

export function calcSimultaneousGifts(
  gifts: GiftTaxInput[],
  options?: GiftTaxEngineOptions,
): GiftTaxResult[] {
  if (gifts.length === 0) return [];
  if (gifts.length === 1) {
    // 단건 — 오케스트레이터 없이 직접 위임
    return [calcGiftTax(gifts[0], options)];
  }

  // ─────────────────────────────────────────────
  // STEP 1: 동일인 합산 가드
  //   정상 경로(UI 차단)에서는 발동하지 않음 — 비정상 입력 방어.
  //   같은 getDonorGroup 건이 2개 이상 들어오면 1건으로 병합 + 경고.
  // ─────────────────────────────────────────────
  const { mergedGifts, mergeWarnings } = mergeSameDonorGroupGifts(gifts);

  /** 병합 경고를 GiftTaxResult.warnings에 prepend하는 헬퍼 */
  const withMergeWarnings = (result: GiftTaxResult): GiftTaxResult => {
    if (mergeWarnings.length === 0) return result;
    return { ...result, warnings: [...mergeWarnings, ...result.warnings] };
  };

  if (mergedGifts.length === 1) {
    // 병합 후 단건 — 직접 계산 (병합 경고 합체)
    return [withMergeWarnings(calcGiftTax(mergedGifts[0], options))];
  }

  // ─────────────────────────────────────────────
  // STEP 2 PASS 1: simultaneousGifts 미주입 상태로 각 건 계산 → netCurrentGiftValue 취득
  //   §46①2호 안분 분모는 "순 과세가액(평가액 − 비과세 − 채무)" 비율.
  //   비과세 추정 금지 (memory: feedback_no_silent_apportion_fallback) → PASS1 정확 산출.
  // ─────────────────────────────────────────────
  const pass1Results: GiftTaxResult[] = mergedGifts.map((g) =>
    calcGiftTax(
      {
        ...g,
        deductionInput: {
          ...g.deductionInput,
          // PASS1: simultaneousGifts 제거 → 단건 경로로 각 건 netCurrentGiftValue 정확 산출
          simultaneousGifts: undefined,
        },
      },
      options,
    ),
  );

  // ─────────────────────────────────────────────
  // STEP 2 PASS 2: netCurrentGiftValue를 simultaneousGifts에 주입 후 재계산
  //   공제그룹(deriveDonorRelation 기준) 일치 건만 안분 주입.
  //   완전 별도 그룹(sameGroupPeers 없음) 건은 simultaneousGifts = undefined.
  // ─────────────────────────────────────────────
  const pass2Inputs = mergedGifts.map((gift, i) => {
    const donorRelationI = deriveDonorRelation(
      gift.donor,
      gift.isMinorDonee ?? false,
    );

    // 같은 공제그룹 피어 (i 제외)
    const sameGroupPeers = mergedGifts
      .map((g, j) => ({ g, j }))
      .filter(({ g, j }) => {
        if (j === i) return false;
        const rel = deriveDonorRelation(g.donor, g.isMinorDonee ?? false);
        return rel === donorRelationI;
      });

    if (sameGroupPeers.length === 0) {
      // 완전 별도 그룹 — 안분 없음
      return {
        ...gift,
        deductionInput: {
          ...gift.deductionInput,
          donorRelation: donorRelationI,
          simultaneousGifts: undefined,
        },
      };
    }

    // 피어들의 PASS1 netCurrentGiftValue를 simultaneousGifts에 주입
    const simultaneousGifts = sameGroupPeers.map(({ g, j }) => ({
      donorRelation: deriveDonorRelation(g.donor, g.isMinorDonee ?? false),
      taxableValue: pass1Results[j].netCurrentGiftValue ?? 0,
    })).filter((sg) => sg.taxableValue > 0);

    return {
      ...gift,
      deductionInput: {
        ...gift.deductionInput,
        donorRelation: donorRelationI,
        simultaneousGifts: simultaneousGifts.length > 0 ? simultaneousGifts : undefined,
      },
    };
  });

  // PASS 2 계산
  return pass2Inputs.map((input) => calcGiftTax(input, options));
}

// ============================================================
// 내부 헬퍼: 동일인 합산 가드
// ============================================================

/** 병합 결과 (병합된 GiftTaxInput + 오케스트레이터가 결과 warnings에 합체할 경고) */
interface MergeResult {
  mergedGifts: GiftTaxInput[];
  /** 병합 발생 시 각 건 결과 warnings에 prepend할 경고 (건 인덱스와 무관하게 전체 공유) */
  mergeWarnings: string[];
}

/**
 * 같은 getDonorGroup 건을 1건으로 병합.
 * 정상 경로(UI 차단)에서는 발동하지 않음 — 비정상 입력 방어.
 *
 * 병합 규칙:
 *   - giftItems, priorGiftsWithin10Years: concat
 *   - exemptions: concat
 *   - priorUsedDeduction: 같은 그룹이므로 이론상 동일해야 함 → max() 취하되 경고 추가
 *   - 스칼라 필드 (donor, giftDate, isMinorDonee, deductionInput, creditInput): 첫 번째 건 기준
 */
function mergeSameDonorGroupGifts(gifts: GiftTaxInput[]): MergeResult {
  // 그룹별 버킷 (순서 보존)
  const groupOrder: string[] = [];
  const groupBuckets = new Map<string, GiftTaxInput[]>();

  for (const gift of gifts) {
    const group = getDonorGroup(gift.donor);
    if (!groupBuckets.has(group)) {
      groupBuckets.set(group, []);
      groupOrder.push(group);
    }
    groupBuckets.get(group)!.push(gift);
  }

  const mergeWarnings: string[] = [];

  const mergedGifts = groupOrder.map((group) => {
    const bucket = groupBuckets.get(group)!;
    if (bucket.length === 1) return bucket[0];

    // 동일인 병합
    const base = bucket[0];
    mergeWarnings.push(
      `동일인(같은 그룹 ${group}) 건이 ${bucket.length}건 자동 합산됨 — UI에서 한 카드로 입력하세요.`,
    );

    const mergedGiftItems = bucket.flatMap((g) => g.giftItems);
    const mergedPriorGifts = bucket.flatMap(
      (g) => g.priorGiftsWithin10Years ?? [],
    );
    const mergedExemptions = (() => {
      const all = bucket.flatMap((g) => g.exemptions ?? []);
      return all.length > 0 ? all : undefined;
    })();

    // priorUsedDeduction: 같은 그룹이므로 동일값이어야 함. 안전하게 max() 적용.
    const maxPriorUsed = Math.max(
      ...bucket.map((g) => g.deductionInput.priorUsedDeduction ?? 0),
    );
    const hasDifferentPriorUsed = bucket.some(
      (g) => (g.deductionInput.priorUsedDeduction ?? 0) !== maxPriorUsed,
    );
    if (hasDifferentPriorUsed) {
      mergeWarnings.push(
        `동일인(그룹 ${group}) 건들의 priorUsedDeduction이 서로 다릅니다. 최댓값(${maxPriorUsed.toLocaleString()})을 사용합니다.`,
      );
    }

    return {
      ...base,
      giftItems: mergedGiftItems,
      priorGiftsWithin10Years: mergedPriorGifts,
      exemptions: mergedExemptions,
      deductionInput: {
        ...base.deductionInput,
        priorUsedDeduction: maxPriorUsed > 0 ? maxPriorUsed : undefined,
      },
    } satisfies GiftTaxInput;
  });

  return { mergedGifts, mergeWarnings };
}

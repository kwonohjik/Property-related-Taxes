/**
 * inheritance-legal-share.ts — 민법 법정상속분 산정
 *
 * 협의분할(heirAllocations) 미입력 자산을 법정상속분으로 자동 배분하기 위한
 * 정수 분자/공통 분모 계산. number ratio(0.4285…) 금지 — 정밀도 손실·정수 연산 정책.
 *
 * 법령 (KoreanLaw 검증):
 *   - 민법 §1000 상속순위: 1 직계비속 → 2 직계존속 → 3 형제자매 → 4 4촌 이내 방계
 *   - 민법 §1003① 배우자: 1·2순위와만 공동상속, 없으면 단독 (3·4순위와는 공동 안 함)
 *   - 민법 §1009① 동순위 균분, ② 배우자는 직계비속·직계존속과 공동 시 5할 가산 (1.5:1)
 *
 * 디자인: docs/02-design/features/heir-allocation-legal-share.engine.design.md §4
 */

import type { Heir } from "./types/inheritance-gift.types";

export interface LegalShare {
  heirId: string;
  /** 정수 분자 (분모는 LegalShareResult.denominator 공통) */
  numerator: number;
}

export interface LegalShareResult {
  shares: LegalShare[];
  /** 공통 분모. shares가 비면 1 */
  denominator: number;
}

/**
 * 법정상속분 산정. legatee(수유자)·corporate(영리법인)·isHeir===false 제외.
 * 반환 비율은 Σnumerator === denominator (자가검증 대상).
 */
export function computeLegalShares(heirs: Heir[]): LegalShareResult {
  const eligible = heirs.filter(
    (h) =>
      h.relation !== "legatee" &&
      h.relation !== "corporate" &&
      h.isHeir !== false,
  );

  const spouse = eligible.find((h) => h.relation === "spouse");
  const children = eligible.filter((h) => h.relation === "child");
  const ascendants = eligible.filter((h) => h.relation === "lineal_ascendant");
  const siblings = eligible.filter((h) => h.relation === "sibling");
  const others = eligible.filter((h) => h.relation === "other");

  // 최선순위 혈족 그룹(배우자 제외) + 배우자 공동상속 여부
  let blood: Heir[] = [];
  let spouseSharesWithBlood = false; // §1009② 5할 가산 대상(1·2순위)
  if (children.length > 0) {
    blood = children;
    spouseSharesWithBlood = true;
  } else if (ascendants.length > 0) {
    blood = ascendants;
    spouseSharesWithBlood = true;
  } else if (spouse) {
    // 배우자 있고 1·2순위 없음 → 배우자 단독 (§1003① — 3·4순위와 공동 안 함)
    blood = [];
  } else if (siblings.length > 0) {
    blood = siblings;
  } else if (others.length > 0) {
    blood = others;
  }

  const shares: LegalShare[] = [];

  if (spouse && spouseSharesWithBlood) {
    // 배우자 3 : 각 혈족 2 (§1009② 1.5:1)
    const n = blood.length;
    const denominator = 2 * n + 3;
    shares.push({ heirId: spouse.id, numerator: 3 });
    for (const b of blood) shares.push({ heirId: b.id, numerator: 2 });
    return { shares, denominator };
  }

  if (spouse) {
    // 배우자 단독 (혈족 없음 또는 3·4순위만 — §1003①)
    shares.push({ heirId: spouse.id, numerator: 1 });
    return { shares, denominator: 1 };
  }

  if (blood.length > 0) {
    // 배우자 없음 — 혈족 균분 (§1009①)
    for (const b of blood) shares.push({ heirId: b.id, numerator: 1 });
    return { shares, denominator: blood.length };
  }

  // 배부 가능 상속인 없음 (legatee·corporate만)
  return { shares: [], denominator: 1 };
}

/**
 * 금액을 법정상속분으로 배분. floor 안분 + 마지막(최다 분자) 상속인 잔액 흡수.
 * @returns Map<heirId, amount>
 */
export function distributeByLegalShares(
  amount: number,
  legal: LegalShareResult,
): Map<string, number> {
  const result = new Map<string, number>();
  if (legal.shares.length === 0 || legal.denominator <= 0 || amount <= 0) {
    return result;
  }
  let allocated = 0;
  // 잔액 흡수 대상 = 분자 최대(동률이면 마지막) 상속인
  let absorbIdx = 0;
  for (let i = 0; i < legal.shares.length; i++) {
    if (legal.shares[i].numerator >= legal.shares[absorbIdx].numerator) {
      absorbIdx = i;
    }
  }
  legal.shares.forEach((s, i) => {
    if (i === absorbIdx) return; // 잔액 흡수자는 마지막에
    const portion = Math.floor((amount * s.numerator) / legal.denominator);
    result.set(s.heirId, (result.get(s.heirId) ?? 0) + portion);
    allocated += portion;
  });
  const absorber = legal.shares[absorbIdx];
  result.set(
    absorber.heirId,
    (result.get(absorber.heirId) ?? 0) + (amount - allocated),
  );
  return result;
}

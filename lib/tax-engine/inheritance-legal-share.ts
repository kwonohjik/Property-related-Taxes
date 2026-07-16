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
 * 상속인 판정 (대습 포함) — legatee(수유자)·corporate(영리법인) 제외, isHeir===false 제외.
 * 단 대습상속인(substituteGroupId 보유)은 isHeir 값과 무관하게 상속인으로 취급한다.
 *   며느리·사위를 "기타"로 추가하면 isHeir:false가 자동으로 붙는데(HeirComposition),
 *   이후 대습 전환(substituteGroupId 세팅) 시 HeirEditor 토글이 숨겨져 false가 잔존한다.
 *   이 false 잔재로 대습상속인이 상속인 판정에서 탈락하면 §21② '배우자 단독상속' 오판 →
 *   일괄공제 5억이 부당 배제된다 (C-1). substituteGroupId 조건으로 방어.
 */
export function isRealHeir(h: Heir): boolean {
  return (
    h.relation !== "legatee" &&
    h.relation !== "corporate" &&
    (h.isHeir !== false || h.substituteGroupId != null)
  );
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

  // 대습상속(민법 §1001) 입력이 있으면 확장 경로. 없으면 기존 단순 경로(회귀 0).
  if (heirs.some((h) => h.substituteGroupId != null)) {
    return computeLegalSharesWithSubstitute(heirs, eligible);
  }

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

// ============================================================
// 대습상속 확장 (민법 §1001·§1003②·§1010) — 2026-06-09
// ============================================================

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

/**
 * 대습상속인을 실제 상속인으로 편입한 법정상속분 산정.
 *
 * 알고리즘 (설계 §B):
 *  1. substituteGroupId 보유 heir는 normal 그룹에서 제외(4촌 others falling 차단).
 *  2. 피대습 슬롯 = 대습 그룹 1개 = 1슬롯(생존자와 동일 numerator).
 *  3. 활성 순위(§1000/§1003①) 결정 → base 분모·슬롯 numerator(배우자공동 1·2순위=2 / 균분=1).
 *  4. §1010② 그룹 내부 재분배: 통일 가중치 spouse=3·descendant=2, S_g=Σweight.
 *     commonExtra=Π(S_g). 멤버 numerator = perSlotNum × weight × (commonExtra / S_g).
 *     비대습(생존·배우자·base) numerator ×= commonExtra. 최종 GCD 약분.
 */
function computeLegalSharesWithSubstitute(
  heirs: Heir[],
  eligible: Heir[],
): LegalShareResult {
  const eligibleNormal = eligible.filter((h) => h.substituteGroupId == null);

  const spouse = eligibleNormal.find((h) => h.relation === "spouse");
  const survChildren = eligibleNormal.filter((h) => h.relation === "child");
  const survAscend = eligibleNormal.filter(
    (h) => h.relation === "lineal_ascendant",
  );
  const survSiblings = eligibleNormal.filter((h) => h.relation === "sibling");
  const survOthers = eligibleNormal.filter((h) => h.relation === "other");

  // 대습상속인 그룹 (substituteForRelation별, isHeir!==false)
  const subHeirs = heirs.filter(
    (h) => h.substituteGroupId != null && h.isHeir !== false,
  );
  const groupsByRel = (rel: "child" | "sibling"): Map<string, Heir[]> => {
    const m = new Map<string, Heir[]>();
    for (const h of subHeirs) {
      if (h.substituteForRelation !== rel) continue;
      const arr = m.get(h.substituteGroupId!) ?? [];
      arr.push(h);
      m.set(h.substituteGroupId!, arr);
    }
    return m;
  };
  const childGroups = groupsByRel("child");
  const siblingGroups = groupsByRel("sibling");

  const childSlots = survChildren.length + childGroups.size;
  const siblingSlots = survSiblings.length + siblingGroups.size;

  // 활성 순위 결정 (기존 :50-63 순서 = §1000/§1003①)
  let activeSurvivors: Heir[] = [];
  let activeGroups = new Map<string, Heir[]>();
  let spouseSharesWithBlood = false;
  if (childSlots > 0) {
    activeSurvivors = survChildren;
    activeGroups = childGroups;
    spouseSharesWithBlood = true;
  } else if (survAscend.length > 0) {
    activeSurvivors = survAscend;
    spouseSharesWithBlood = true; // 직계존속은 대습 없음(2순위)
  } else if (spouse) {
    // 배우자 단독 (1·2순위 없음 — 3·4순위와 비공동 §1003①)
    return { shares: [{ heirId: spouse.id, numerator: 1 }], denominator: 1 };
  } else if (siblingSlots > 0) {
    activeSurvivors = survSiblings;
    activeGroups = siblingGroups;
  } else if (survOthers.length > 0) {
    activeSurvivors = survOthers;
  }

  const slotCount = activeSurvivors.length + activeGroups.size;
  if (slotCount === 0) {
    return spouse
      ? { shares: [{ heirId: spouse.id, numerator: 1 }], denominator: 1 }
      : { shares: [], denominator: 1 };
  }

  // base 분모·슬롯 numerator
  let baseDenom: number;
  let spouseNum: number;
  let perSlotNum: number;
  if (spouse && spouseSharesWithBlood) {
    baseDenom = 2 * slotCount + 3; // 배우자 3 : 슬롯 2씩
    spouseNum = 3;
    perSlotNum = 2;
  } else {
    baseDenom = slotCount; // 혈족 균분 §1009①
    spouseNum = 0;
    perSlotNum = 1;
  }

  // §1010② 그룹 내부 가중치 S_g + commonExtra
  const groupS = new Map<string, number>();
  for (const [gid, members] of activeGroups) {
    let s = 0;
    for (const m of members) s += m.substituteRole === "spouse" ? 3 : 2;
    groupS.set(gid, s);
  }
  let commonExtra = 1;
  for (const s of groupS.values()) commonExtra *= s;

  const denominator = baseDenom * commonExtra;
  const shares: LegalShare[] = [];
  if (spouse && spouseNum > 0) {
    shares.push({ heirId: spouse.id, numerator: spouseNum * commonExtra });
  }
  for (const surv of activeSurvivors) {
    shares.push({ heirId: surv.id, numerator: perSlotNum * commonExtra });
  }
  for (const [gid, members] of activeGroups) {
    const s = groupS.get(gid)!;
    for (const m of members) {
      const w = m.substituteRole === "spouse" ? 3 : 2;
      shares.push({
        heirId: m.id,
        numerator: perSlotNum * w * (commonExtra / s),
      });
    }
  }

  // GCD 약분
  const g = shares.reduce((acc, sh) => gcd(acc, sh.numerator), denominator);
  if (g > 1) {
    for (const sh of shares) sh.numerator /= g;
    return { shares, denominator: denominator / g };
  }
  return { shares, denominator };
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

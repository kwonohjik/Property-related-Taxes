/**
 * 조특법 §133 감면 종합한도 Pure Engine
 *
 * 유형별 연간 한도를 단일 소스로 관리하고 `applyAnnualLimits(...)` 순수 함수로
 * 금액 Map을 입력받아 한도 적용 후 Map을 반환한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 *
 * 근거 조문:
 *   - 조세특례제한법 §133 — 감면 종합한도
 *     · ① 자경농지(§69) + 축산업(§69의2) + 어업(§69의3) 등: 1년 1억원 종합한도
 *     · ② 공익사업용 토지 수용(§77·§77의2): 1년 2억원, 5년 3억원 누적
 *   - 조특법 §127 ② — 감면 중복배제 (자산 내, 본 모듈과 별개)
 *
 * 본 모듈은 **연간 한도만** 적용한다. 5년 누적 한도는 호출 측에서 과거 감면 이력을
 * 주입해 외부에서 체크해야 한다 (현재 범위 외).
 */

/** 감면 유형별 한도 그룹 정의 */
export interface LimitGroup {
  /** 같은 한도를 공유하는 감면 유형 식별자 집합 */
  types: readonly string[];
  /** 연간 한도 (원). 0·Infinity면 무한 */
  annualLimit: number;
  /** 법적 근거 (표시용) */
  legalBasis: string;
}

/** 기본 §133 한도 그룹 (2024년 기준) */
export const DEFAULT_LIMIT_GROUPS: readonly LimitGroup[] = [
  {
    // 자경농지·축산업·어업 1년 1억원 종합한도
    types: [
      "self_farming",
      "self_farming_inherited",
      "self_farming_incorp",
      "livestock",
      "fishing",
    ],
    annualLimit: 100_000_000,
    legalBasis: "조특법 §133 ①",
  },
  {
    // 공익사업용 토지 수용 1년 2억원 별도 한도
    types: ["public_expropriation"],
    annualLimit: 200_000_000,
    legalBasis: "조특법 §133 ①",
  },
] as const;

/** 유형별 한도 조회 결과 */
export interface LimitLookup {
  annualLimit: number;
  legalBasis: string;
  groupTypes: readonly string[];
}

/**
 * 감면 유형의 한도 그룹을 조회한다. 정의되지 않은 유형은 한도 없음(Infinity)으로 처리.
 */
export function lookupLimit(
  type: string,
  groups: readonly LimitGroup[] = DEFAULT_LIMIT_GROUPS,
): LimitLookup {
  for (const g of groups) {
    if (g.types.includes(type)) {
      return { annualLimit: g.annualLimit, legalBasis: g.legalBasis, groupTypes: g.types };
    }
  }
  return { annualLimit: Number.POSITIVE_INFINITY, legalBasis: "", groupTypes: [] };
}

/**
 * 유형별 감면액 Map에 §133 연간 한도를 적용하여 capping된 Map을 반환한다.
 *
 * 주의: 그룹 내 여러 유형이 동시에 존재하면 **그룹 전체 합계가 한도를 공유**한다.
 * 예: self_farming + self_farming_incorp 동시 존재 시 두 값의 합이 1억원을 넘으면
 *     비율대로 안분하여 capping한다.
 *
 * @param rawByType - 재계산된 원시 감면세액 Map (유형 → 금액)
 * @param groups - 한도 그룹 정의. 기본값은 DEFAULT_LIMIT_GROUPS.
 * @returns {cappedByType, capInfoByType} — 한도 적용된 금액 Map + 유형별 한도 정보
 */
export function applyAnnualLimits(
  rawByType: Map<string, number>,
  groups: readonly LimitGroup[] = DEFAULT_LIMIT_GROUPS,
): {
  cappedByType: Map<string, number>;
  capInfoByType: Map<string, { annualLimit: number; legalBasis: string; cappedByLimit: boolean }>;
} {
  const cappedByType = new Map<string, number>();
  const capInfoByType = new Map<
    string,
    { annualLimit: number; legalBasis: string; cappedByLimit: boolean }
  >();

  // 그룹 단위로 처리
  const processedTypes = new Set<string>();
  for (const group of groups) {
    // 이 그룹에 속하는 유형 중 rawByType에 존재하는 것만 추출
    const typesInGroup = group.types.filter((t) => rawByType.has(t));
    if (typesInGroup.length === 0) continue;

    const totalRaw = typesInGroup.reduce((s, t) => s + (rawByType.get(t) ?? 0), 0);
    const totalCapped = Math.min(totalRaw, group.annualLimit);
    const cappedByLimit = totalCapped < totalRaw;

    if (totalRaw <= 0) {
      for (const t of typesInGroup) {
        cappedByType.set(t, 0);
        capInfoByType.set(t, {
          annualLimit: group.annualLimit,
          legalBasis: group.legalBasis,
          cappedByLimit: false,
        });
        processedTypes.add(t);
      }
      continue;
    }

    // 비율 안분 (원 미만 절사, 말단 보정)
    let accumulated = 0;
    for (let i = 0; i < typesInGroup.length; i++) {
      const t = typesInGroup[i];
      const raw = rawByType.get(t) ?? 0;
      let capped: number;
      if (i === typesInGroup.length - 1) {
        capped = totalCapped - accumulated;
      } else {
        capped = Math.floor((totalCapped * raw) / totalRaw);
        accumulated += capped;
      }
      cappedByType.set(t, capped);
      capInfoByType.set(t, {
        annualLimit: group.annualLimit,
        legalBasis: group.legalBasis,
        cappedByLimit,
      });
      processedTypes.add(t);
    }
  }

  // 그룹에 속하지 않는 유형은 한도 없음 — 원시값 그대로
  for (const [t, v] of rawByType.entries()) {
    if (processedTypes.has(t)) continue;
    cappedByType.set(t, v);
    capInfoByType.set(t, {
      annualLimit: Number.POSITIVE_INFINITY,
      legalBasis: "",
      cappedByLimit: false,
    });
  }

  return { cappedByType, capInfoByType };
}

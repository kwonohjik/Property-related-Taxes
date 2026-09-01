/**
 * 조특법 §133 감면 종합한도 Pure Engine
 *
 * 유형별 연간 한도를 단일 소스로 관리하고 `applyAnnualLimits(...)` 순수 함수로
 * 금액 Map을 입력받아 한도 적용 후 Map을 반환한다.
 * 5년 누적 한도는 `applyFiveYearLimits(...)` 로 연간 한도 적용 후 추가 capping한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 *
 * 근거 조문:
 *   - 조세특례제한법 §133 — 감면 종합한도
 *     · ① 자경농지(§69) + 축산업(§69의2) + 어업(§69의3) 등: 1년 1억원, 5년 2억원 종합한도
 *     · ② 공익사업용 토지 수용(§77·§77의2·§77의3): 1년 2억원, 5년 3억원 누적
 *       — 법률 제20778호(공포·시행 2025-03-14)로 **신설**. 같은 법 부칙 §15①이
 *         「이 법 시행일이 속하는 **과세연도**에 양도하는 경우부터」로 정해
 *         **2025-01-01 양도분부터** 적용된다. 2024년 이전 양도분은 ①의 1억을 공유한다.
 *   - 조특법 §127⑦ — 감면 중복배제 (자산 내, 본 모듈과 별개)
 */

import { safeMultiplyThenDivide } from "./tax-utils";

/** 감면 유형별 한도 그룹 정의 */
export interface LimitGroup {
  /** 같은 한도를 공유하는 감면 유형 식별자 집합 */
  types: readonly string[];
  /** 연간 한도 (원). 0·Infinity면 무한 */
  annualLimit: number;
  /** 5년 누적 한도 (원). 미설정 시 무한 */
  fiveYearLimit?: number;
  /**
   * 5년 누적 한도를 **실제로 받는** 유형 (미설정 시 `types` 전체).
   *
   * 연간 한도군과 5년 한도군의 열거가 조문에서 다르기 때문에 필요하다 — 개정 전
   * §133①1호(연간)는 §77의3을 포함하지만 ①2호나목(5년)은 **§77의3을 열거하지 않는다**.
   * 한 그룹에 뭉뚱그리면 §77의3에 법 근거 없는 5년 한도를 씌우게 된다(D7-03).
   */
  fiveYearTypes?: readonly string[];
  /** 법적 근거 (표시용) */
  legalBasis: string;
}

/**
 * §133 한도 그룹 **기본값** — 2025 이후(개정 후) 구조다.
 *
 * ⚠️ 주석이 「2024년 기준」이라 적혀 있었으나 두 번째 그룹은 §133②(연 2억·5년 3억)로
 *   **2025 이후 구조**다 — 주석↔값 드리프트였다. 2024년 이전 양도의 정본은
 *   `buildLimitGroups(2024)`가 내는 **단일 그룹**(자경 + §77 계열이 §133①의 1억을 공유)이다.
 *
 * 🔴 이 상수를 **기본값으로 받는 경로에 의존하지 말 것.** `applyAnnualLimits`·
 *   `applyFiveYearLimits`·`lookupLimit`은 `groups` 인자를 생략하면 이 값을 쓰는데,
 *   그러면 양도연도와 무관하게 2025 구조가 적용된다. 실사용 경로 3곳
 *   (`transfer-tax-reduction-cap.ts` · `transfer-tax-aggregate-reduction-step.ts` ×2)은
 *   전부 `buildLimitGroups(transferYear)`를 명시적으로 넘긴다 — 새 호출부도 그렇게 할 것.
 */
export const DEFAULT_LIMIT_GROUPS: readonly LimitGroup[] = [
  {
    // 자경농지·축산업·어업 1년 1억원, 5년 2억원 종합한도 (§133① — 연도 불변)
    types: [
      "self_farming",
      "self_farming_inherited",
      "self_farming_incorp",
      "livestock",
      "fishing",
    ],
    annualLimit: 100_000_000,
    fiveYearLimit: 200_000_000,
    legalBasis: "조특법 §133 ①",
  },
  {
    // 공익사업용 토지 수용 1년 2억원, 5년 3억원 별도 한도 (§133② — **2025 과세연도부터**)
    types: ["public_expropriation"],
    annualLimit: 200_000_000,
    fiveYearLimit: 300_000_000,
    legalBasis: "조특법 §133 ②",
  },
] as const;

/** 개정 전·후 공통 — 자경농지·축산·어업 유형 */
const SELF_FARMING_TYPES = [
  "self_farming",
  "self_farming_inherited",
  "self_farming_incorp",
  "livestock",
  "fishing",
  /**
   * 아래 둘은 **과거 감면 이력 전용** 유형이다 — 당해연도 감면 계산기는 아직 §70·§69의4를
   * 구현하지 않지만, §133①1호·2호나목이 이들을 자경 계열과 **같은 한도군**으로 열거하므로
   * 5년 누적 합산에서 빠지면 `priorGroupSum`이 과소 계상돼 한도가 늦게 걸린다
   * (= 감면 과다 인정 · 코드리뷰 CA-04 실측 50,000,000 과다).
   *
   * ⚠️ §133①2호는 「**가목**(5개 과세기간 §70 단독 1억)과 **나목**(§66~§70 합산 2억) 중
   *    큰 금액」이라는 중첩 서브그룹 구조인데, 현재 `LimitGroup`은 그룹당 `fiveYearLimit`
   *    단일 값만 지원해 가목을 표현하지 못한다. 나목만 반영한 상태다 — 가목 모델링과
   *    §70 evaluator 신설은 별도 과제.
   */
  "farmland_substitute_70",
  "self_cultivated_forest_69_4",
] as const;

/** §77·§77의2·§77의3 (비자발적 양도) 유형 */
const INVOLUNTARY_TYPES = [
  "public_expropriation",
  "gb_designated_land",
  "replacement_land_comp",
] as const;

/**
 * 양도연도별 §133 한도 그룹.
 *
 * 🔴 **그룹 «구성» 자체가 연도로 갈린다** — 금액만 갈리는 게 아니다(코드리뷰 D7-03).
 *
 * | 시점 | 조문 구조 | 그룹 |
 * |---|---|---|
 * | 개정 전 | §133①1호가 자경(§66~§69 등)과 **§77·§77의2·§77의3을 같은 열거·같은 합계액**으로 묶어 과세기간별 1억원. §133②는 **토지분할 의제**(한도 아님). | **1개 그룹** 연 1억 / 5년 2억 |
 * | 2025 개정 | §133①에서 §77 계열이 **삭제**되고 §133②가 신설(연 2억·5년 3억), 종전 ②는 ③으로 밀림. | **2개 그룹** |
 *
 * 개정 전 5년(①2호나목)의 열거는 「제66조부터 제69조까지, 제69조의2부터 제69조의4까지,
 * 제70조, **제77조 또는 제77조의2**」로 **§77의3이 빠져 있다** → `fiveYearTypes`로 제외한다.
 *
 * 경계는 감면율(§77①)·한도와 **같은 개정 패키지**라 `>= 2025`를 공유한다
 * (부칙 「시행일이 속하는 과세연도부터」 — `docs/00-pm/transfer-expropriation-77-133-2025-amendment.plan.md:7`).
 * 조문 실측: KoreanLaw MST 267555 `efYd=20250101`(개정 전) vs `efYd=20250401`(개정 후).
 *
 * anchor: `__tests__/tax-engine/transfer/aggregate-limit-groups-by-year.anchor.test.ts`
 */
export function buildLimitGroups(transferYear: number): readonly LimitGroup[] {
  if (transferYear >= 2025) {
    return [
      DEFAULT_LIMIT_GROUPS[0], // 자경농지·축산·어업 (§133① — 연도 불변 1억/2억)
      {
        types: INVOLUNTARY_TYPES,
        annualLimit: 200_000_000,
        fiveYearLimit: 300_000_000,
        legalBasis: "조특법 §133②",
      },
    ] as const;
  }
  // 개정 전 — 자경과 §77 계열이 §133①의 **하나의 1억원**을 공유한다.
  return [
    {
      types: [...SELF_FARMING_TYPES, ...INVOLUNTARY_TYPES],
      annualLimit: 100_000_000,
      fiveYearLimit: 200_000_000,
      // ①2호나목에 §77의3(gb_designated_land)이 없다 — 5년 한도 대상에서 제외.
      fiveYearTypes: [...SELF_FARMING_TYPES, "public_expropriation", "replacement_land_comp"],
      legalBasis: "조특법 §133 ①",
    },
  ] as const;
}

/**
 * §133 한도군에 등장하는 **모든** 감면 유형 (연도 변형 합집합).
 *
 * 과거 감면 이력(⑤ UI 드롭다운·⑫ Zod enum)이 이 집합을 **전부 담아야** 한다 —
 * 하나라도 빠지면 그 조문 이력을 입력할 경로가 없어 5년 누적 한도가 과소 적용된다
 * (코드리뷰 D8-03 §77의2·§77의3 · CA-04 §70·§69의4).
 * anchor가 포함관계를 강제한다:
 * `__tests__/tax-engine/transfer/prior-reduction-usage-coverage.anchor.test.ts`
 */
export const ALL_LIMIT_GROUP_TYPES: readonly string[] = [
  ...new Set([...buildLimitGroups(2024), ...buildLimitGroups(2025)].flatMap((g) => g.types)),
];

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
        // 한도 3억 × 원시감면 10억 = 3e17 > 2^53 → 부동소수 정밀도 손실.
        // `safeMultiplyThenDivide`가 초과 시 BigInt로 우회한다 (D8-09).
        capped = safeMultiplyThenDivide(totalCapped, raw, totalRaw);
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

// ─────────────────────────────────────────────────────────────
// §133 5년 누적 한도 (applyFiveYearLimits)
// ─────────────────────────────────────────────────────────────

/** 과거 과세연도 감면 이력 1건 */
export interface PriorReductionRecord {
  /** 과세연도 (YYYY) */
  year: number;
  /** 감면 유형 */
  type: string;
  /** 감면세액 (원, 음수 불가) */
  amount: number;
}

/** applyFiveYearLimits 반환값의 유형별 정보 */
export interface FiveYearCapInfo {
  /** 연간 한도 적용 후 입력값 */
  annuallyCapped: number;
  /** 5년 누적 한도 적용 후 최종값 */
  fiveYearCapped: number;
  /** 5년 한도에 걸려 추가 차감된 금액 */
  fiveYearCutAmount: number;
  /** 5년 누적 한도 (원). Infinity면 미적용 */
  fiveYearLimit: number;
  /** 과거 4개 연도 그룹 누적액 */
  priorGroupSum: number;
  /** 잔여 허용 한도 (= fiveYearLimit − priorGroupSum). 0 이하면 이미 소진 */
  remaining: number;
  /** 5년 한도 초과 여부 */
  cappedByFiveYear: boolean;
  /** 법적 근거 */
  legalBasis: string;
}

/**
 * 연간 한도 적용 후 금액 Map에 §133 5년 누적 한도를 추가로 적용한다.
 *
 * - 대상 연도: `transferYear - 4` ~ `transferYear - 1` (양도연도 포함 5년 윈도우에서 과거 4년)
 * - 그룹 단위로 과거 누적액을 합산하여 잔여 한도를 계산한다.
 * - 잔여 한도가 당해 연간 capping 금액보다 작으면 잔여 한도로 추가 capping.
 * - 그룹 내 복수 유형은 비율 안분한다(연간 한도 처리와 동일 방식).
 *
 * @param annuallyCappedByType - `applyAnnualLimits` 결과 (연간 한도 적용 완료 Map)
 * @param priorReductionUsage  - 과거 감면 이력 (사용자 직접 입력)
 * @param transferYear         - 당해 양도 과세연도 (YYYY)
 * @param groups               - 한도 그룹. 기본값 DEFAULT_LIMIT_GROUPS
 */
export function applyFiveYearLimits(
  annuallyCappedByType: Map<string, number>,
  priorReductionUsage: PriorReductionRecord[],
  transferYear: number,
  groups: readonly LimitGroup[] = DEFAULT_LIMIT_GROUPS,
): {
  fiveYearCappedByType: Map<string, number>;
  fiveYearCapInfoByType: Map<string, FiveYearCapInfo>;
} {
  const fiveYearCappedByType = new Map<string, number>(annuallyCappedByType);
  const fiveYearCapInfoByType = new Map<string, FiveYearCapInfo>();

  // 과거 4개 과세연도만 필터
  const minYear = transferYear - 4;
  const maxYear = transferYear - 1;
  const priorFiltered = priorReductionUsage.filter(
    (r) => r.year >= minYear && r.year <= maxYear && r.amount > 0,
  );

  for (const group of groups) {
    if (!group.fiveYearLimit) continue;

    // 이 그룹에 속하는 유형 중 annuallyCappedByType에 존재하는 것
    // 5년 한도군은 연간 한도군과 열거가 다를 수 있다(개정 전 §77의3 — D7-03).
    const fiveYearScope = group.fiveYearTypes ?? group.types;
    const typesInGroup = fiveYearScope.filter((t) => annuallyCappedByType.has(t));
    if (typesInGroup.length === 0) continue;

    // 과거 4년 그룹 누적액 (이 그룹에 속하는 모든 유형의 합)
    const priorGroupSum = priorFiltered
      .filter((r) => fiveYearScope.includes(r.type))
      .reduce((s, r) => s + r.amount, 0);

    const remaining = Math.max(0, group.fiveYearLimit - priorGroupSum);

    // 당해 연간 한도 후 그룹 합계
    const currentGroupTotal = typesInGroup.reduce(
      (s, t) => s + (annuallyCappedByType.get(t) ?? 0),
      0,
    );

    const fiveYearGroupCapped = Math.min(currentGroupTotal, remaining);
    const cappedByFiveYear = fiveYearGroupCapped < currentGroupTotal;

    if (currentGroupTotal <= 0) {
      for (const t of typesInGroup) {
        fiveYearCapInfoByType.set(t, {
          annuallyCapped: annuallyCappedByType.get(t) ?? 0,
          fiveYearCapped: 0,
          fiveYearCutAmount: 0,
          fiveYearLimit: group.fiveYearLimit,
          priorGroupSum,
          remaining,
          cappedByFiveYear: false,
          legalBasis: group.legalBasis,
        });
      }
      continue;
    }

    // 비율 안분 (원 미만 절사, 말단 보정)
    let accumulated = 0;
    for (let i = 0; i < typesInGroup.length; i++) {
      const t = typesInGroup[i];
      const annual = annuallyCappedByType.get(t) ?? 0;
      let capped: number;
      if (i === typesInGroup.length - 1) {
        capped = fiveYearGroupCapped - accumulated;
      } else {
        // 동상 — 5년 한도 안분도 같은 자릿수 위험이 있다 (D8-09).
        capped = safeMultiplyThenDivide(fiveYearGroupCapped, annual, currentGroupTotal);
        accumulated += capped;
      }
      fiveYearCappedByType.set(t, capped);
      fiveYearCapInfoByType.set(t, {
        annuallyCapped: annual,
        fiveYearCapped: capped,
        fiveYearCutAmount: annual - capped,
        fiveYearLimit: group.fiveYearLimit,
        priorGroupSum,
        remaining,
        cappedByFiveYear,
        legalBasis: group.legalBasis,
      });
    }
  }

  // 5년 한도 그룹에 속하지 않는 유형은 그대로 — capInfo만 채움
  for (const [t, v] of annuallyCappedByType.entries()) {
    if (fiveYearCapInfoByType.has(t)) continue;
    fiveYearCapInfoByType.set(t, {
      annuallyCapped: v,
      fiveYearCapped: v,
      fiveYearCutAmount: 0,
      fiveYearLimit: Number.POSITIVE_INFINITY,
      priorGroupSum: 0,
      remaining: Number.POSITIVE_INFINITY,
      cappedByFiveYear: false,
      legalBasis: "",
    });
  }

  return { fiveYearCappedByType, fiveYearCapInfoByType };
}

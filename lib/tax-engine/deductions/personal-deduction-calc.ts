/**
 * 상속세 「그 밖의 인적공제」 계산 (상증법 §20)
 *
 * 4종 인적공제 (§20①):
 *   ① 자녀공제   — 1인당 5,000만원 (1호, 태아 포함)
 *   ② 미성년자공제 — (19 − 연령) × 1,000만원 (2호, 태아 포함)
 *   ③ 연로자공제 — 65세 이상 1인당 5,000만원 (3호, 배우자·자녀 제외)
 *   ④ 장애인공제 — 성별·연령별 기대여명 × 1,000만원 (4호)
 *
 * 중복공제(상호배제) — §20① 후단:
 *   1호(자녀) + 2호(미성년) 합산 가능 / 4호(장애인) + 1·2·3호·§19 합산 가능.
 *   그 외 불가 → 연로자(3호)는 배우자공제·자녀공제와 합산 불가(대상 제외).
 * §20③: 2호·4호 적용 시 1년 미만의 기간은 1년으로 한다.
 *
 * 법령 근거: 상증법 §20 (mst 276123, 시행 2026-01-02) — KoreanLaw 본문 축자 확인.
 */

import { differenceInYears } from "date-fns";
import { INH } from "../legal-codes";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import type {
  CalculationStep,
  Heir,
  CohabitantDependent,
} from "../types/inheritance-gift.types";
import type { PersonalDeductionDetail } from "../types/inheritance-deduction-detail.types";
import { calcMinorPersonalDeduction } from "../tax-utils";
import { getLifeExpectancyByGender } from "../data/life-expectancy-2023";

// 성별·연령별 기대여명 헬퍼 재노출 (단일 출처 — data/life-expectancy-2023.ts)
export { getLifeExpectancyByGender } from "../data/life-expectancy-2023";

// ============================================================
// 단가 상수
// ============================================================

/** 자녀공제 1인당 (§20①1호): 5,000만원 */
const CHILD_DEDUCTION_PER_PERSON = 50_000_000;

/** 연로자공제 1인당 (§20①3호): 5,000만원 */
const ELDER_DEDUCTION_PER_PERSON = 50_000_000;

/** 연로자 기준 나이: 65세 이상 */
const ELDER_AGE_THRESHOLD = 65;

/** 미성년자·장애인 공제 단가 (§20①2호·4호): 1,000만원/년 */
const PER_YEAR_DEDUCTION = 10_000_000;

/** 미성년자 연령 기준 (§20①2호 "19세가 될 때까지", 민법 §4 성년 19세) */
const MINOR_AGE_LIMIT = 19;

// ============================================================
// ① 자녀공제 (§20①1호)
// ============================================================

export interface ChildDeductionResult {
  count: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 자녀공제: 1인당 5,000만원 × 자녀 수
 * 자녀 = 직계비속(child) 관계 상속인 + 태아(isFetus, 2023.1.1.~ §20①1호).
 * (계모자·적모서자 관계자는 자녀공제 대상 아님 — PDF 해석사례 재삼46014-100. 현재 relation 구분
 *  없이 child 카운트 유지: 입력 UI에 계모자/적모서자 관계가 없어 오인 위험 낮음.)
 */
export function calcChildrenDeduction(heirs: Heir[]): ChildDeductionResult {
  const children = heirs.filter(
    (h) => h.relation === "child" || h.isFetus === true,
  );
  const count = children.length;
  const totalDeduction = count * CHILD_DEDUCTION_PER_PERSON;

  return {
    count,
    totalDeduction,
    breakdown: [
      {
        label: `자녀공제 ${count}명 × 5,000만원`,
        amount: totalDeduction,
        lawRef: INH.PERSONAL_DEDUCTION,
      },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ② 미성년자공제 (§20①2호)
// ============================================================

export interface MinorDeductionResult {
  perHeir: {
    heirId: string;
    name?: string;
    age: number;
    remainingYears: number;
    deduction: number;
  }[];
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 미성년자공제: (19 − 연령) × 1,000만원
 * 대상: 상속인(배우자 제외) 및 동거가족 중 19세 미만 + 태아(만 0세 간주).
 * §20③ "1년 미만 1년" → calcMinorPersonalDeduction의 floor 산식이 자동 충족.
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcMinorDeduction(
  heirs: Heir[],
  baseDate: string,
): MinorDeductionResult {
  const perHeir: MinorDeductionResult["perHeir"] = [];

  for (const heir of heirs) {
    // 배우자는 미성년자공제 대상 제외 (§20①2호 "상속인(배우자는 제외한다)")
    if (heir.relation === "spouse") continue;

    let age: number;
    let deduction: number;

    if (heir.isFetus === true) {
      // 태아 = 출생 전 → 만 0세 간주 (§20①2호 태아 포함) → (19−0)×1천만 = 1.9억
      age = 0;
      deduction = MINOR_AGE_LIMIT * PER_YEAR_DEDUCTION;
    } else if (heir.birthDate) {
      deduction = calcMinorPersonalDeduction(heir.birthDate, baseDate);
      if (deduction <= 0) continue;
      // differenceInYears: 공제액 산정과 동일 기준의 만 나이
      age = differenceInYears(new Date(baseDate), new Date(heir.birthDate));
    } else {
      continue;
    }

    perHeir.push({
      heirId: heir.id,
      name: heir.name,
      age,
      remainingYears: deduction / PER_YEAR_DEDUCTION,
      deduction,
    });
  }

  const totalDeduction = perHeir.reduce((s, r) => s + r.deduction, 0);

  return {
    perHeir,
    totalDeduction,
    breakdown: perHeir.map((r) => ({
      label: `미성년자공제 (만${r.age}세): (19-${r.age})년 × 1,000만원`,
      amount: r.deduction,
      lawRef: INH.PERSONAL_DEDUCTION,
    })),
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ③ 연로자공제 (§20①3호)
// ============================================================

export interface ElderDeductionResult {
  count: number;
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 연로자공제: 65세 이상 1인당 5,000만원
 * 대상: 상속인(배우자 제외) 및 동거가족 중 65세 이상.
 *   §20①3호 "상속인(배우자는 제외한다)" + §20① 후단(1호↔3호 합산 불가)
 *   → 배우자(spouse)·자녀(child)는 연로자공제 대상에서 제외.
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcElderDeduction(
  heirs: Heir[],
  baseDate: string,
): ElderDeductionResult {
  const base = new Date(baseDate);

  const elderHeirs = heirs.filter((h) => {
    if (!h.birthDate) return false;
    // §20①3호 배우자 제외 + §20① 후단(자녀공제와 합산 불가) → 자녀 제외
    if (h.relation === "spouse" || h.relation === "child") return false;
    const age = differenceInYears(base, new Date(h.birthDate));
    return age >= ELDER_AGE_THRESHOLD;
  });

  const count = elderHeirs.length;
  const totalDeduction = count * ELDER_DEDUCTION_PER_PERSON;

  return {
    count,
    totalDeduction,
    breakdown: [
      {
        label: `연로자공제 ${count}명 × 5,000만원 (65세 이상, 배우자·자녀 제외)`,
        amount: totalDeduction,
        lawRef: INH.PERSONAL_DEDUCTION,
      },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// ④ 장애인공제 (§20①4호)
// ============================================================

export interface DisabledDeductionResult {
  perHeir: {
    heirId: string;
    name?: string;
    gender: "male" | "female" | undefined;
    age: number;
    lifeExpectancy: number;
    deduction: number;
  }[];
  totalDeduction: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

/**
 * 장애인공제: 성별·연령별 기대여명(년) × 1,000만원 (§20①4호)
 * 대상: 상속인 및 동거가족 중 장애인 (배우자 포함 — 4호+§19 합산 가능).
 * 기대여명: 통계청 2023 생명표 (getLifeExpectancyByGender, Math.ceil 올림 §20③).
 * 성별 미입력 시 계산 불가 → TaxCalculationError (1차 게이트는 validation ⑧, 자동추정 금지).
 *
 * @param heirs 상속인 목록
 * @param baseDate 상속개시일 (YYYY-MM-DD)
 */
export function calcDisabledDeduction(
  heirs: Heir[],
  baseDate: string,
): DisabledDeductionResult {
  const base = new Date(baseDate);
  const perHeir: DisabledDeductionResult["perHeir"] = [];

  for (const heir of heirs) {
    if (!heir.isDisabled) continue;

    let age = 0;
    let lifeExpectancy = 0;
    if (heir.birthDate) {
      age = differenceInYears(base, new Date(heir.birthDate));
      if (!heir.gender) {
        // §20①4호 "성별·연령별 기대여명" — 성별 없으면 표 조회 불가 (자동추정 금지).
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          "장애인공제(§20①4호): 상속인 성별 미입력 — 성별·연령별 기대여명 산정 불가.",
        );
      }
      lifeExpectancy = getLifeExpectancyByGender(heir.gender, age);
    }

    const deduction = lifeExpectancy * PER_YEAR_DEDUCTION;
    perHeir.push({
      heirId: heir.id,
      name: heir.name,
      gender: heir.gender,
      age,
      lifeExpectancy,
      deduction,
    });
  }

  const totalDeduction = perHeir.reduce((s, r) => s + r.deduction, 0);

  return {
    perHeir,
    totalDeduction,
    breakdown: perHeir.map((r) => ({
      label: `장애인공제 (${
        r.gender === "male" ? "남" : r.gender === "female" ? "여" : "-"
      } 만${r.age}세): 기대여명 ${r.lifeExpectancy}년 × 1,000만원`,
      amount: r.deduction,
      lawRef: INH.PERSONAL_DEDUCTION,
    })),
    appliedLaws: [INH.PERSONAL_DEDUCTION],
  };
}

// ============================================================
// 인적공제 합계 (4종 합산) + PersonalDeductionDetail echo (G7)
// ============================================================

export interface PersonalDeductionSummary {
  childDeduction: number;
  minorDeduction: number;
  elderDeduction: number;
  disabledDeduction: number;
  total: number;
  breakdown: CalculationStep[];
  appliedLaws: string[];
  /** G7 — 결과 화면 4종 분해 표시용 echo (엔진 산식 변경 0) */
  detail: PersonalDeductionDetail;
}

/**
 * CohabitantDependent → Heir 정규화 (P1 — 시령 §18① 동거가족).
 * lineal_descendant(손자녀)는 HeirRelation에 없어 "other"로 매핑
 *   (자녀공제·연로자 child제외 회피 — 동거가족 손자녀는 자녀 아님).
 * lineal_ascendant·sibling은 HeirRelation에 존재 → 그대로.
 */
function toPersonalHeir(d: CohabitantDependent): Heir {
  return {
    id: d.id,
    name: d.name,
    birthDate: d.birthDate,
    isDisabled: d.isDisabled,
    gender: d.gender,
    relation: d.relation === "lineal_descendant" ? "other" : d.relation,
  };
}

/**
 * 인적공제 4종 합산 (§20).
 * 대상 = 상속인(legatee·corporate 제외, G5) + 동거가족(시령§18①, 옵션 B).
 *
 * @param heirs 상속인 목록 (legatee·corporate 포함 — 내부에서 필터)
 * @param baseDate 상속개시일 (YYYY-MM-DD) — 상속인·동거가족 공통 나이 기준일
 * @param cohabitantDependents 비상속인 동거가족 (P1)
 */
export function calcPersonalDeductions(
  heirs: Heir[],
  baseDate: string,
  cohabitantDependents?: CohabitantDependent[],
): PersonalDeductionSummary {
  // G5: 수유자(legatee)·영리법인(corporate)은 인적공제 대상 아님 (inheritance-deductions.ts:551 realHeirs와 동일 패턴)
  const activeHeirs = heirs.filter(
    (h) => h.relation !== "legatee" && h.relation !== "corporate",
  );
  // 동거가족 정규화 (시령 §18①) — 인적공제 대상에 합산
  const normalized = (cohabitantDependents ?? []).map(toPersonalHeir);
  const cohabitantIds = new Set(normalized.map((d) => d.id));
  const targets = [...activeHeirs, ...normalized];

  const child = calcChildrenDeduction(targets);
  const minor = calcMinorDeduction(targets, baseDate);
  const elder = calcElderDeduction(targets, baseDate);
  const disabled = calcDisabledDeduction(targets, baseDate);

  const total =
    child.totalDeduction +
    minor.totalDeduction +
    elder.totalDeduction +
    disabled.totalDeduction;

  const detail: PersonalDeductionDetail = {
    childCount: child.count,
    childDeduction: child.totalDeduction,
    minorPerHeir: minor.perHeir.map((r) => ({
      heirId: r.heirId,
      name: r.name,
      age: r.age,
      remainingYears: r.remainingYears,
      deduction: r.deduction,
      isCohabitant: cohabitantIds.has(r.heirId),
    })),
    minorDeduction: minor.totalDeduction,
    elderCount: elder.count,
    elderDeduction: elder.totalDeduction,
    disabledPerHeir: disabled.perHeir.map((r) => ({
      heirId: r.heirId,
      name: r.name,
      gender: r.gender,
      age: r.age,
      lifeExpectancy: r.lifeExpectancy,
      deduction: r.deduction,
      isCohabitant: cohabitantIds.has(r.heirId),
    })),
    disabledDeduction: disabled.totalDeduction,
    total,
  };

  return {
    childDeduction: child.totalDeduction,
    minorDeduction: minor.totalDeduction,
    elderDeduction: elder.totalDeduction,
    disabledDeduction: disabled.totalDeduction,
    total,
    breakdown: [
      ...child.breakdown,
      ...minor.breakdown,
      ...elder.breakdown,
      ...disabled.breakdown,
      { label: "인적공제 합계", amount: total, lawRef: INH.PERSONAL_DEDUCTION },
    ],
    appliedLaws: [INH.PERSONAL_DEDUCTION],
    detail,
  };
}

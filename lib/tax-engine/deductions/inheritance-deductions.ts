/**
 * 상속공제 7종 + §24 종합한도 (상증법 §18~§23의2·§24)
 *
 * 적용 순서:
 *   배우자공제(§19) + max(기초공제(§18)+인적공제(§20①), 일괄공제(§21) 5억) + 금융공제(§22) + 재해공제(§23) + 동거주택공제(§23의2)
 *   → §24 종합한도 적용 (= 상속세 과세가액 - 상속인·수유자에 대한 사전증여재산)
 *
 * §24 종합한도: 상속공제 총액 ≤ (상속세 과세가액 - 상속인·수유자의 사전증여재산가액)
 *
 * 영농상속공제 관련 함수는 800줄 정책에 따라 inheritance-farming-deduction.ts로 분리 (2026-05-31).
 */

import { INH } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type {
  CalculationStep,
  EstateItem,
  Heir,
  InheritanceDeductionInput,
  InheritanceDeductionResult,
} from "../types/inheritance-gift.types";
import type {
  LumpSumComparisonDetail,
  SpouseDeductionDetail,
  FinancialDeductionDetail,
  CohabitDeductionDetail,
} from "../types/inheritance-deduction-detail.types";
import {
  calcFamilyBusinessDeductionDirect,
  calcFamilyBusinessDeductionLegacy,
  calcFamilyBusinessDeductionPhase2,
  resolveFamilyBusinessRequirements,
  resolveFamilyBusinessHeirId,
} from "./family-business";
import {
  calcPersonalDeductions,
} from "./personal-deduction-calc";
import { calcLegalShareRatios } from "../tax-utils";

// 영농 관련 함수 re-export (분리된 모듈 — 외부 import 경로 무변경)
export {
  evaluateFarmingEligibility,
  evaluateFarmingEligibilityForHeir,
  deriveQualifiedHeirIds,
  resolveEffectiveQualifiedHeirIds,
  calcFarmingDeduction,
} from "./inheritance-farming-deduction";

// ============================================================
// 공제 한도 상수
// ============================================================

/** 기초공제 (§18 ①): 2억원 */
const BASIC_DEDUCTION = 200_000_000;

/** 배우자공제 최소값 (§19 ②): 5억원 */
const SPOUSE_MIN = 500_000_000;

/** 배우자공제 최댓값 (§19 ②): 30억원 */
const SPOUSE_MAX = 3_000_000_000;

/** 일괄공제 (§21): 5억원 */
const LUMP_SUM_DEDUCTION = 500_000_000;

/** 금융재산공제 최댓값 (§22): 2억원 */
const FINANCIAL_MAX = 200_000_000;

/** 금융재산공제 무조건 공제 상한 (§22 ①1호): 2,000만원 */
const FINANCIAL_FULL_EXEMPT_MAX = 20_000_000;

/** 금융재산공제 중간구간 상한 (§22 ①2호): 1억원 */
const FINANCIAL_MID_MAX = 100_000_000;

/** 금융재산공제 중간구간 고정액: 2,000만원 */
const FINANCIAL_MID_FIXED = 20_000_000;

/** 금융재산공제 초과구간 공제율: 20% */
const FINANCIAL_OVER_RATE = 0.20;

/**
 * 동거주택공제 율·한도 (§23의2① + 개정연혁, PDF 상속증여세 2026 p.351 "Min(㉮율, ㉯한도)").
 * KoreanLaw 검증(mst 276123 §23의2①): "담보된 피상속인 채무액을 뺀 가액"에 율을 적용, 한도 적용.
 *
 *   ~2008.12.31:          제도 부재 (0 / 0)  — 2009.1.1. 최초 상속분부터 적용
 *   2009.1.1.~2015.12.31:  40% / 5억
 *   2016.1.1.~2019.12.31:  80% / 5억
 *   2020.1.1.~:           100% / 6억
 *
 * string(YYYY-MM-DD) 비교 — cohabitShareRate 기존 패턴 일관, Date 변환 금지.
 */
function cohabitRateAndCap(deathDate?: string): { rate: number; cap: number } {
  const d = deathDate ?? "9999-12-31";
  if (d >= "2020-01-01") return { rate: 1.0, cap: 600_000_000 };
  if (d >= "2016-01-01") return { rate: 0.8, cap: 500_000_000 };
  if (d >= "2009-01-01") return { rate: 0.4, cap: 500_000_000 };
  return { rate: 0, cap: 0 }; // 2009.1.1. 이전 상속 — 동거주택 상속공제 제도 부재
}

// ============================================================
// 개별 공제 계산 함수
// ============================================================

/**
 * 기초공제 (§18 ①): 2억원 정액
 * 거주자 상속에 항상 적용. 영농·가업 상속공제 선택 시에도 중복 적용.
 */
export function calcBasicDeduction(): number {
  return BASIC_DEDUCTION;
}

/**
 * 배우자공제 (§19)
 * - 배우자가 실제 상속받은 금액과 법정상속분 중 작은 금액
 * - 최소값 5억, 최댓값 30억
 *
 * E5: 중간값(legalShareCapped·actualAmountCapped·baseBeforeFloor·floorApplied) 반환 추가.
 *
 * @param spouseActualAmount 배우자 실제 상속금액 (미입력 시 법정상속분으로 산정)
 * @param totalEstateValue 상속세 과세가액 (법정상속분 계산 기준)
 * @param heirs 상속인 목록 (배우자 존재 여부 및 법정상속분 산정)
 */
export function calcSpouseDeduction(
  spouseActualAmount: number | undefined,
  totalEstateValue: number,
  heirs: Heir[],
  legalShareOverride?: number,
): {
  deduction: number;
  breakdown: CalculationStep[];
  // E5 중간값 — spouseDeductionDetail 조립용
  legalShareCapped: number;
  actualAmountCapped: number;
  baseBeforeFloor: number;
  floorApplied: boolean;
} {
  const spouseHeir = heirs.find((h) => h.relation === "spouse");
  if (!spouseHeir) {
    return {
      deduction: 0,
      breakdown: [{ label: "배우자 없음 — 배우자공제 미적용", amount: 0 }],
      legalShareCapped: 0,
      actualAmountCapped: 0,
      baseBeforeFloor: 0,
      floorApplied: false,
    };
  }

  let legalShareAmount: number;
  if (legalShareOverride !== undefined) {
    // Phase D: 직접 입력 — PDF 책 1862 표 산식 외부 계산값 사용
    legalShareAmount = legalShareOverride;
  } else {
    // 법정상속분 산정 — 잔여분은 배우자에게 우선 배분 (PRD §19 명세)
    const ratioMap = calcLegalShareRatios(heirs);
    const allocations = heirs.map((h) => ({
      id: h.id,
      amount: Math.floor(totalEstateValue * (ratioMap.get(h.id) ?? 0)),
    }));
    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const remainder = totalEstateValue - totalAllocated;
    const spouseFloor = allocations.find((a) => a.id === spouseHeir.id)?.amount ?? 0;
    legalShareAmount = spouseFloor + remainder;
  }

  // 실제 상속금액 미입력 시 법정상속분 적용
  const actualAmount = spouseActualAmount ?? legalShareAmount;

  // E5: 30억 한도 각각 적용
  const legalShareCapped = Math.min(legalShareAmount, SPOUSE_MAX);
  const actualAmountCapped = Math.min(actualAmount, SPOUSE_MAX);

  // 공제 기준: min(실제capped, 법정상속분capped)
  const baseBeforeFloor = Math.min(actualAmountCapped, legalShareCapped);

  // 최소값·최댓값 적용
  const floorApplied = baseBeforeFloor < SPOUSE_MIN;
  const deduction = Math.max(SPOUSE_MIN, baseBeforeFloor);

  return {
    deduction,
    breakdown: [
      { label: "법정상속분", amount: legalShareAmount, lawRef: INH.SPOUSE_DEDUCTION },
      { label: "배우자 실제 상속금액", amount: actualAmount },
      { label: "공제 기준액 (min)", amount: baseBeforeFloor },
      {
        label: `배우자공제 (min(5억,기준) ~ max 30억)`,
        amount: deduction,
        lawRef: INH.SPOUSE_DEDUCTION,
      },
    ],
    legalShareCapped,
    actualAmountCapped,
    baseBeforeFloor,
    floorApplied,
  };
}

/**
 * 금융재산공제 (§22)
 * 3구간:
 *   ≤ 2천만: 전액 (100%)
 *   2천만 < x ≤ 1억: 2천만원 고정
 *   1억 < x: 20% (최대 2억)
 *
 * E2: rawDeduction 변수 분리 + detail 반환.
 * rows[]는 orchestrator(inheritance-tax.ts)가 estateItems/debtItems 집계 후 주입.
 */
export function calcFinancialDeduction(netFinancialAssets: number): {
  deduction: number;
  breakdown: CalculationStep[];
  detail: FinancialDeductionDetail;
} {
  if (netFinancialAssets <= 0) {
    return {
      deduction: 0,
      breakdown: [],
      detail: {
        rows: [],
        netFinancial: netFinancialAssets,
        bracket: "tier1",
        rate: 1.0,
        rawDeduction: 0,
        cap: FINANCIAL_MAX,
        cappedDeduction: 0,
      },
    };
  }

  let rawDeduction: number;
  let bracket: "tier1" | "tier2" | "tier3";
  let rate: number;
  let note: string;

  if (netFinancialAssets <= FINANCIAL_FULL_EXEMPT_MAX) {
    // tier1: ≤ 2천만 → 전액
    rawDeduction = netFinancialAssets;
    bracket = "tier1";
    rate = 1.0;
    note = "2천만원 이하 — 전액 공제";
  } else if (netFinancialAssets <= FINANCIAL_MID_MAX) {
    // tier2: 2천만 초과~1억 이하 → 2천만원 고정
    rawDeduction = FINANCIAL_MID_FIXED;
    bracket = "tier2";
    rate = 0; // 고정액이므로 율 표현 불가 → 0
    note = "2천만~1억 구간 — 2천만원 고정 공제";
  } else {
    // tier3: 1억 초과 → 20% (최대 2억)
    rawDeduction = applyRate(netFinancialAssets, FINANCIAL_OVER_RATE);
    bracket = "tier3";
    rate = FINANCIAL_OVER_RATE;
    note = "1억 초과 — 20% 공제 (최대 2억)";
  }

  const cappedDeduction = Math.min(rawDeduction, FINANCIAL_MAX);

  return {
    deduction: cappedDeduction,
    breakdown: [
      { label: "순금융재산", amount: netFinancialAssets },
      { label: `금융재산공제 (${note})`, amount: cappedDeduction, lawRef: INH.FINANCIAL_DEDUCTION },
    ],
    detail: {
      rows: [], // orchestrator가 estateItems/debtItems 집계 후 주입
      netFinancial: netFinancialAssets,
      bracket,
      rate,
      rawDeduction,
      cap: FINANCIAL_MAX,
      cappedDeduction,
    },
  };
}

/**
 * 동거주택 상속공제 (§23의2)
 * 공제액 = 주택 공시가격 × 80% 또는 100%, 최대 6억
 * (요건 확인은 UI에서 체크박스로 처리, 여기서는 금액만 계산)
 *
 * E3: detail: CohabitDeductionDetail 반환 추가.
 */
export function calcCohabitationDeduction(
  cohabitHouseStdPrice: number,
  securedDebt = 0,
  deathDate?: string,
): {
  deduction: number;
  breakdown: CalculationStep[];
  detail: CohabitDeductionDetail;
} {
  // §23의2① 상속개시일 기준 율·한도
  const { rate, cap } = cohabitRateAndCap(deathDate);
  // 담보채무 차감 개정(법률 제14388호, 2016.12.20.) — 2017.1.1. 이후 상속분부터 적용 (부칙2).
  // KoreanLaw time_travel(20160101↔20170101) 검증: 2017 시행본에 "담보된 피상속인의 채무액을 뺀 가액" 문구 신설.
  // string(YYYY-MM-DD) 비교, deathDate undefined=차감(legacy) — §16⑤ G3 패턴 일관.
  const applySecuredDebt = deathDate === undefined || deathDate >= "2017-01-01";
  const effectiveSecuredDebt = applySecuredDebt ? securedDebt : 0;
  const base = Math.max(0, cohabitHouseStdPrice - effectiveSecuredDebt);
  if (base <= 0) {
    return {
      deduction: 0,
      breakdown: [],
      detail: {
        housingValue: cohabitHouseStdPrice,
        securedDebt: effectiveSecuredDebt,
        base: 0,
        rate,
        rawDeduction: 0,
        cap,
        cappedDeduction: 0,
      },
    };
  }

  const rawDeduction = applyRate(base, rate);
  const cappedDeduction = Math.min(rawDeduction, cap);

  return {
    deduction: cappedDeduction,
    breakdown: [
      { label: "동거주택 공시가격", amount: cohabitHouseStdPrice },
      ...(effectiveSecuredDebt > 0
        ? [
            {
              label: "− 담보된 피상속인 채무 (§23의2①)",
              amount: -effectiveSecuredDebt,
              lawRef: INH.COHABIT_DEDUCTION,
            },
          ]
        : []),
      {
        label: `동거주택공제 (${Math.round(rate * 100)}%, 최대 ${cap / 100_000_000}억)`,
        amount: cappedDeduction,
        lawRef: INH.COHABIT_DEDUCTION,
      },
    ],
    detail: {
      housingValue: cohabitHouseStdPrice,
      securedDebt: effectiveSecuredDebt,
      base,
      rate,
      rawDeduction,
      cap,
      cappedDeduction,
    },
  };
}

// 가업상속공제 계산은 family-business.ts 의 calcFamilyBusinessDeductionPhase2 /
// calcFamilyBusinessDeductionDirect / calcFamilyBusinessDeductionLegacy 로 일원화됨
// (구 calcFamilyBusinessDeduction 단일 600억 함수 + FAMILY_BUSINESS_MAX_10Y 상수는
//  배우자공제 중복적용 정합·개정연혁 한도 정밀화로 삭제 — 계획서 §5-9 dead-code 정리).

// ============================================================
// §24 종합한도 — 800줄 정책으로 inheritance-deduction-limit.ts 분리 (re-export 보존)
// ============================================================

export {
  applyDeductionLimit,
  SECTION24_GIFT_DEDUCTION_THRESHOLD,
  computePriorGiftDeductionForLimit,
} from "./inheritance-deduction-limit";
import { applyDeductionLimit } from "./inheritance-deduction-limit";

// ============================================================
// 통합 공제 계산 (7종 + §24 한도)
// ============================================================

// 분리된 영농 함수들을 내부에서 사용하기 위한 import
import {
  calcFarmingDeduction as _calcFarmingDeduction,
} from "./inheritance-farming-deduction";
// §23 재해손실공제 (상속세 — §54 증여세 disasterLossDeduction과 별개)
import { calcCasualtyLossDeduction } from "./casualty-loss-deduction";

/**
 * 상속공제 전체 계산
 *
 * E6: lumpSumComparisonDetail 조립 + financial/cohabit/limit detail을 result에 주입 + rawTotalDeduction 노출.
 *
 * @param input 공제 입력
 * @param taxableEstateValue 상속세 과세가액 (배우자 법정상속분·§24 한도 계산에 사용)
 * @param priorGiftToHeirTotal 상속인에 대한 사전증여재산가액 합계 (§24 한도)
 */
export function calcInheritanceDeductions(
  input: InheritanceDeductionInput,
  taxableEstateValue: number,
  priorGiftToHeirTotal: number,
  limitParams?: {
    totalPriorGiftAmount?: number;
    priorGiftDeductionTotal?: number;
    legateeAmountNonHeir?: number;
    disasterLossDeduction?: number;
  },
  familyBusinessAux?: {
    /** §18의2② 200% 가드 산정용 — 가업상속공제 미적용 시 산출세액 (가업상속인 부담분). orchestrator 1차 산정값. */
    taxIfNoFBD?: number;
    /** EstateItem.familyBusinessCategory 자동 합산용. */
    estateItems?: EstateItem[];
  },
): InheritanceDeductionResult {
  // 인적공제(미성년자·연로자·장애인)는 상속개시일 현재 나이 기준 (상증법 §20).
  // deathDate가 제공된 경우 해당 날짜를, 없으면 오늘로 fallback.
  const baseDate = input.deathDate ?? new Date().toISOString().slice(0, 10);

  // ① 기초공제
  const basicDeduction = calcBasicDeduction();

  // ② 배우자공제 (Phase D: spouseLegalShareOverride 우선)
  const spouseResult = calcSpouseDeduction(
    input.spouseActualAmount,
    taxableEstateValue,
    input.heirs,
    input.spouseLegalShareOverride,
  );
  const spouseDeduction = spouseResult.deduction;

  // ③ 인적공제 (4종 합산)
  const personalResult = calcPersonalDeductions(
    input.heirs,
    baseDate,
    input.cohabitantDependents,
  );
  const personalDeductionTotal = personalResult.total;

  // ④ 일괄공제 vs 기초+인적 — §21① "큰 금액으로 공제받을 수 있다" 자동 적용.
  //    일괄공제(§21) = max(기초공제§18 + 그 밖의 인적공제§20①, 5억). 배우자공제(§19)는 비교 대상 아님.
  //    합리적 납세자는 항상 큰 금액을 선택하므로 토글 없이 자동 max (2026-05-31 preferLumpSum 토글 제거).
  //    기초+인적이 5억을 초과(인적공제 다수)하는 경우만 항목별이 자동 선택됨.
  const itemizedTotal = basicDeduction + personalDeductionTotal;
  // §21② 배우자가 단독으로 상속받는 경우 → 일괄공제 배제, 기초+인적공제만 적용.
  //    상속인이 배우자 1인(다른 순위 상속인·공동상속인 부존재 또는 전원 상속포기)인 경우.
  //    수유자(legatee)·영리법인 수증자(corporate)는 상속인이 아니므로 제외하고 판정.
  const realHeirs = input.heirs.filter(
    (h) => h.relation !== "legatee" && h.relation !== "corporate",
  );
  const isSpouseSoleHeir =
    realHeirs.length > 0 && realHeirs.every((h) => h.relation === "spouse");
  // §21① 단서: 정기신고(§67)·기한후신고(국기법 §45의3) 모두 없는 완전 무신고 시 일괄공제 5억 고정.
  //   (기초+인적이 5억을 초과해도 5억만. 기한후신고는 단서 미해당 → 본문 max 유지.)
  //   우선순위 §21②(배우자단독) > §21①단서(무신고) > 본문 max. KoreanLaw mst 276123 §21①.
  const isUnfiled = input.isUnfiled === true;
  const chosenMethod: "lump_sum" | "itemized" = isSpouseSoleHeir
    ? "itemized" // §21② 최우선 — 일괄공제(단서 5억 포함) 배제
    : isUnfiled
      ? "lump_sum" // §21① 단서 — 무신고 5억 고정
      : LUMP_SUM_DEDUCTION >= itemizedTotal
        ? "lump_sum" // 본문 max
        : "itemized";
  const lumpSumForcedByUnfiled = !isSpouseSoleHeir && isUnfiled;
  const chosenBasicPersonal =
    chosenMethod === "lump_sum" ? LUMP_SUM_DEDUCTION : itemizedTotal;

  // E6: lumpSumComparisonDetail 조립
  const lumpSumComparisonDetail: LumpSumComparisonDetail = {
    basicDeduction,
    personalDeductionTotal,
    itemizedSubtotal: itemizedTotal,
    lumpSumAmount: LUMP_SUM_DEDUCTION,
    selectedAmount: chosenBasicPersonal,
    selectedMethod: chosenMethod,
    spouseSoleHeirExclusion: isSpouseSoleHeir,
    forcedByUnfiled: lumpSumForcedByUnfiled,
  };

  // ⑤ 금융재산공제
  const financialResult = calcFinancialDeduction(input.netFinancialAssets ?? 0);
  const financialDeduction = financialResult.deduction;

  // ⑥ 동거주택공제 (Phase E: 직접 입력 모드)
  let cohabitDeductionDetail: CohabitDeductionDetail;
  let cohabitResult: { deduction: number; breakdown: CalculationStep[] };
  if (input.cohabitDirectAmount !== undefined && input.cohabitDirectAmount > 0) {
    // directAmount 모드: 사용자가 율·차감 적용한 최종액 입력 → rate 미적용, 상속개시일 기준 한도만 적용.
    const { cap } = cohabitRateAndCap(baseDate);
    const capped = Math.min(input.cohabitDirectAmount, cap);
    cohabitResult = {
      deduction: capped,
      breakdown: [
        {
          label: `동거주택공제 (직접 입력, 한도 ${cap / 100_000_000}억)`,
          amount: capped,
          lawRef: INH.COHABIT_DEDUCTION,
        },
      ],
    };
    // directAmount 모드: 내부 산식은 단순 — housingValue=directAmount, securedDebt=0, base=directAmount, rate=1.0
    cohabitDeductionDetail = {
      housingValue: input.cohabitDirectAmount,
      securedDebt: 0,
      base: input.cohabitDirectAmount,
      rate: 1.0,
      rawDeduction: input.cohabitDirectAmount,
      cap,
      cappedDeduction: capped,
    };
  } else {
    // §23의2① 담보채무(저당) 차감 — buildInput이 deriveCohabitHouseStdPrice로 cohabitSecuredDebt 주입.
    // cohabitHouseStdPrice는 gross(공시가격), securedDebt는 본 함수가 단일 차감(deductions.ts:294). deathDate로 80%/100% historical 분기.
    const cohabitFull = calcCohabitationDeduction(
      input.cohabitHouseStdPrice ?? 0,
      input.cohabitSecuredDebt ?? 0,
      baseDate,
    );
    cohabitResult = { deduction: cohabitFull.deduction, breakdown: cohabitFull.breakdown };
    cohabitDeductionDetail = cohabitFull.detail;
  }
  const cohabitationDeduction = cohabitResult.deduction;

  // ⑦ 영농공제 (§18의3 + 시행령 §16, 2026-05-21 정밀화 + v4.1.1 D8 residence echo)
  const farmingResult = _calcFarmingDeduction(
    input.farmingAssetValue ?? 0,
    input.farming,
    familyBusinessAux?.estateItems,
    input.deathDate,
  );
  const farmingDeduction = farmingResult.deduction;
  const farmingDetail = farmingResult.detail;

  // ⑧ 가업상속공제 (§18의2 + 상증령 §15, 2026-05-21 정밀화)
  //    분기 우선순위: Phase E directAmount > Phase B familyBusiness 객체 > legacy familyBusinessValue+Years
  const bizPhaseResult = (() => {
    if (input.familyBusinessDirectAmount !== undefined && input.familyBusinessDirectAmount > 0) {
      return calcFamilyBusinessDeductionDirect(
        input.familyBusinessDirectAmount,
        INH.FAMILY_BUSINESS_DEDUCTION,
      );
    }
    if (input.familyBusiness) {
      // 요건 자동판정(Phase 1): 가업상속인 birthDate를 heirs[heirId]에서 도출(없으면 familyBusiness.heirBirthDate).
      //   heirs·baseDate(상속개시일) 모두 스코프 내 → 스레딩 불필요. (eligibility-autoderive.engine.design.md)
      //   H-3 fix: heirId가 undefined일 때 자연인 1명이면 자동선택 fallback (resolveFamilyBusinessHeirId).
      //   UI display fallback(FamilyBusinessHeirSelector effectiveHeirId)과 동일 규칙 — 3중 패턴.
      const resolvedHeirId = resolveFamilyBusinessHeirId(
        input.heirs,
        input.familyBusiness.heirId,
      );
      const heirBirthDate =
        input.heirs.find((h) => h.id === resolvedHeirId)?.birthDate ??
        input.familyBusiness.heirBirthDate;
      const resolved = resolveFamilyBusinessRequirements(
        input.familyBusiness,
        heirBirthDate,
        baseDate,
      );
      return calcFamilyBusinessDeductionPhase2({
        input: resolved.resolvedInput,
        estateItems: familyBusinessAux?.estateItems,
        familyBusinessValueOverride: input.familyBusinessValue,
        taxIfNoFBD: familyBusinessAux?.taxIfNoFBD ?? 0,
        lawRef: INH.FAMILY_BUSINESS_DEDUCTION,
        resolvedMeta: { filingDeadline: resolved.filingDeadline, source: resolved.source },
      });
    }
    return calcFamilyBusinessDeductionLegacy(
      input.familyBusinessValue ?? 0,
      input.familyBusinessYears,
      INH.FAMILY_BUSINESS_DEDUCTION,
      input.deathDate, // 개정연혁 한도 (계획서 §5-6) — 미입력 시 현행본
    );
  })();
  const familyBusinessDeduction = bizPhaseResult.deduction;
  const familyBusinessDetail = bizPhaseResult.detail;
  const bizResult = { deduction: familyBusinessDeduction, breakdown: bizPhaseResult.detail.breakdown };

  // §23 재해손실공제 (상속공제 7종 중 하나 — §23의2 동거주택 앞, 조문 순서)
  const casualtyResult = calcCasualtyLossDeduction(input.casualtyLoss, baseDate);
  const casualtyLossDeduction = casualtyResult.deduction;

  // 배우자 + 기초/일괄 + 나머지 합계
  const rawTotal =
    spouseDeduction +
    chosenBasicPersonal +
    financialDeduction +
    casualtyLossDeduction +
    cohabitationDeduction +
    farmingDeduction +
    familyBusinessDeduction;

  // §24 종합한도 적용 — Phase D 분자 보정 (limitParams) 우선
  const limitResult = applyDeductionLimit(
    rawTotal,
    taxableEstateValue,
    priorGiftToHeirTotal,
    limitParams,
  );
  const { limitedDeduction, ceiling, wasCapped, ceilingDetail } = limitResult;

  // breakdown 구성
  const breakdown: CalculationStep[] = [
    ...(chosenMethod === "lump_sum"
      ? [{ label: lumpSumForcedByUnfiled ? `일괄공제 — 무신고 5억 고정 (${INH.LUMP_SUM} 단서)` : `일괄공제 (${INH.LUMP_SUM})`, amount: LUMP_SUM_DEDUCTION, lawRef: INH.LUMP_SUM }]
      : [
          { label: `기초공제 (${INH.BASIC_DEDUCTION})`, amount: basicDeduction, lawRef: INH.BASIC_DEDUCTION },
          ...personalResult.breakdown.slice(0, -1), // 합계 행 제외
        ]),
    ...spouseResult.breakdown,
    ...financialResult.breakdown,
    ...(casualtyLossDeduction > 0
      ? [{ label: `재해손실공제 (${INH.DISASTER_DEDUCTION})`, amount: casualtyLossDeduction, lawRef: INH.DISASTER_DEDUCTION }]
      : []),
    ...cohabitResult.breakdown,
    ...farmingResult.breakdown,
    ...bizResult.breakdown,
    { label: "공제 소계", amount: rawTotal },
    {
      label: `§24 종합한도 (과세가액 ${taxableEstateValue.toLocaleString()} - 사전증여 ${priorGiftToHeirTotal.toLocaleString()})`,
      amount: ceiling,
      lawRef: INH.DEDUCTION_LIMIT,
    },
    ...(wasCapped
      ? [{ label: "한도 초과 — 종합한도 적용", amount: limitedDeduction, lawRef: INH.DEDUCTION_LIMIT }]
      : []),
    { label: "최종 상속공제액", amount: limitedDeduction },
  ];

  // E6: spouseDeductionDetail 기본 조립 (legalShareTable·actualAmountTable은 orchestrator patch)
  const spouseDeductionDetail: SpouseDeductionDetail = {
    legalShareTable: undefined, // orchestrator(Phase D)가 채움
    actualAmountTable: undefined, // orchestrator가 estateItems/debtItems 집계 후 채움
    capAmount: SPOUSE_MAX,
    legalShareCapped: spouseResult.legalShareCapped,
    actualAmountCapped: spouseResult.actualAmountCapped,
    baseBeforeFloor: spouseResult.baseBeforeFloor,
    floorApplied: spouseResult.floorApplied,
    deduction: spouseDeduction,
  };

  return {
    basicDeduction:
      chosenMethod === "itemized" ? basicDeduction : 0,
    spouseDeduction,
    personalDeductionTotal:
      chosenMethod === "itemized" ? personalDeductionTotal : 0,
    lumpSumDeduction: chosenMethod === "lump_sum" ? LUMP_SUM_DEDUCTION : 0,
    financialDeduction,
    casualtyLossDeduction,
    casualtyLossDeductionDetail: casualtyResult.detail,
    cohabitationDeduction,
    farmingDeduction,
    farmingDetail,
    familyBusinessDeduction,
    familyBusinessDetail,
    totalDeduction: limitedDeduction,
    chosenMethod,
    lumpSumExcludedBySpouseSoleHeir: isSpouseSoleHeir,
    lumpSumForcedByUnfiled,
    breakdown,
    appliedLaws: [
      INH.BASIC_DEDUCTION,
      INH.SPOUSE_DEDUCTION,
      INH.PERSONAL_DEDUCTION,
      INH.LUMP_SUM,
      INH.FINANCIAL_DEDUCTION,
      ...(casualtyLossDeduction > 0 ? [INH.DISASTER_DEDUCTION] : []),
      INH.COHABIT_DEDUCTION,
      INH.FARMING_DEDUCTION,
      INH.FAMILY_BUSINESS_DEDUCTION,
      INH.DEDUCTION_LIMIT,
    ],
    // E6 detail 노출
    lumpSumComparisonDetail,
    spouseDeductionDetail,
    financialDeductionDetail: financialResult.detail,
    cohabitDeductionDetail,
    deductionLimitDetail: ceilingDetail,
    rawTotalDeduction: rawTotal,
    // G7 — §20 인적공제 4종 분해 echo (결과 화면 펼침용)
    personalDeductionDetail: personalResult.detail,
  };
}

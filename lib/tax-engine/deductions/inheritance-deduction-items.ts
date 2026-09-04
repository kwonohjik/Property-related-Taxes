import { INH } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep, Heir } from "../types/inheritance-gift.types";
import type {
  FinancialDeductionDetail,
  CohabitDeductionDetail,
} from "../types/inheritance-deduction-detail.types";
import { calcLegalShareRatios } from "../tax-utils";

// ============================================================
// 공제 한도 상수
// ============================================================

/** 기초공제 (§18 ①): 2억원 */
export const BASIC_DEDUCTION = 200_000_000;

/** 배우자공제 최소값 (§19 ②): 5억원 */
export const SPOUSE_MIN = 500_000_000;

/** 배우자공제 최댓값 (§19 ②): 30억원 */
export const SPOUSE_MAX = 3_000_000_000;

/** 일괄공제 (§21): 5억원 */
export const LUMP_SUM_DEDUCTION = 500_000_000;

/** 금융재산공제 최댓값 (§22): 2억원 */
export const FINANCIAL_MAX = 200_000_000;

/** 금융재산공제 무조건 공제 상한 (§22 ①1호): 2,000만원 */
export const FINANCIAL_FULL_EXEMPT_MAX = 20_000_000;

/** 금융재산공제 중간구간 상한 (§22 ①2호): 1억원 */
export const FINANCIAL_MID_MAX = 100_000_000;

/** 금융재산공제 중간구간 고정액: 2,000만원 */
export const FINANCIAL_MID_FIXED = 20_000_000;

/** 금융재산공제 초과구간 공제율: 20% */
export const FINANCIAL_OVER_RATE = 0.20;

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
export function cohabitRateAndCap(deathDate?: string): { rate: number; cap: number } {
  const d = deathDate ?? "9999-12-31";
  if (d >= "2020-01-01") return { rate: 1.0, cap: 600_000_000 };
  if (d >= "2016-01-01") return { rate: 0.8, cap: 500_000_000 };
  if (d >= "2009-01-01") return { rate: 0.4, cap: 500_000_000 };
  return { rate: 0, cap: 0 }; // 2009.1.1. 이전 상속 — 동거주택 상속공제 제도 부재
}

// ============================================================
// G5·G3·G4 헬퍼 re-export (800줄 정책 — inheritance-cohabit-helpers.ts 분리)
// ============================================================

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
 * 공제액 = 주택 공시가격 × 율(시기별), 최대 한도(시기별)
 * (요건 확인은 UI에서 체크박스로 처리, 여기서는 금액만 계산)
 *
 * Phase 2 (2026-06-07): G3 동거연수 echo, G4 면적한도 차감 echo 추가.
 *   - cohabitYearsEcho: calcCohabitYears 계산 결과 (cohabitStartDate 입력 시)
 *   - ancillaryLandLimitReduction: applyAncillaryLandLimit 차감액 (G4 입력 시)
 *   두 필드 모두 undefined 허용 (미입력 시 기존 동작 무변경)
 */
export function calcCohabitationDeduction(
  cohabitHouseStdPrice: number,
  securedDebt = 0,
  deathDate?: string,
  cohabitYearsEcho?: CohabitDeductionDetail["cohabitYears"],
  ancillaryLandLimitReduction?: number,
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
        cohabitYears: cohabitYearsEcho,
        ancillaryLandLimitReduction,
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
      cohabitYears: cohabitYearsEcho,
      ancillaryLandLimitReduction,
    },
  };
}

// 가업상속공제 계산은 family-business.ts 의 calcFamilyBusinessDeductionPhase2 /
// calcFamilyBusinessDeductionDirect / calcFamilyBusinessDeductionLegacy 로 일원화됨
// (구 calcFamilyBusinessDeduction 단일 600억 함수 + FAMILY_BUSINESS_MAX_10Y 상수는
//  배우자공제 중복적용 정합·개정연혁 한도 정밀화로 삭제 — 계획서 §5-9 dead-code 정리).

/**
 * 단기재상속세액공제 (상증법 §30)
 *
 * 상속 개시 후 10년 이내에 다시 상속이 발생한 경우
 * 전(前) 상속 때의 산출세액 중 재상속분 상당액의 일정 비율을 공제.
 *
 * 산식(§30②1호 약분): 전의 산출세액 × (재상속분 재산가액 ÷ 전의 상속재산가액) × 공제율
 * 재산별 구분 계산(집행기준 30-22-1 ②): 재상속 재산을 종류별로 각각 floor 계산 후 합산.
 *
 * 공제율(§30②2호 — 경과 구간별):
 *   1년 이내 100% / 2년 이내 90% / 3년 이내 80% / … / 10년 이내 10% / 10년 초과 0%
 */

import { differenceInYears, addYears, parseISO } from "date-fns";
import { TAX_CREDIT } from "../legal-codes";
import { applyRate, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  ShortTermReinheritAsset,
  ShortTermReinheritPerAsset,
} from "../types/inheritance-tax-credit.types";

// ============================================================
// 경과 구간별 공제율 테이블 (§30②2호)
// ============================================================

/** 단기재상속 공제율 (구간(band) → 비율, 0.0 ~ 1.0) */
const SHORT_TERM_CREDIT_RATES: { maxYears: number; rate: number }[] = [
  { maxYears: 1, rate: 1.0 },
  { maxYears: 2, rate: 0.9 },
  { maxYears: 3, rate: 0.8 },
  { maxYears: 4, rate: 0.7 },
  { maxYears: 5, rate: 0.6 },
  { maxYears: 6, rate: 0.5 },
  { maxYears: 7, rate: 0.4 },
  { maxYears: 8, rate: 0.3 },
  { maxYears: 9, rate: 0.2 },
  { maxYears: 10, rate: 0.1 },
];

// ============================================================
// 공제율 조회
// ============================================================

/**
 * 공제율 구간(band)에 해당하는 단기재상속 공제율 반환. 10년 초과 시 0.
 *
 * @param band 공제율 구간 정수 (deriveShortTermReinheritBand 결과 또는 legacy 수동 입력).
 *   "N년 이내" = band N. band 0(동일일) → 100%.
 */
export function getShortTermReinheritRate(band: number): number {
  if (band <= 0) return 1.0; // 동일일(부부 동시사망 등): 1년 이내 = 100%
  for (const { maxYears, rate } of SHORT_TERM_CREDIT_RATES) {
    if (band <= maxYears) return rate;
  }
  return 0; // 10년 초과
}

// ============================================================
// 공제율 구간 자동 도출 (1차·2차 상속개시일)
// ============================================================

/**
 * 1차·2차 상속개시일로 §30②2호 공제율 구간(band)을 도출.
 *
 * 법령 "N년 이내" = 1차 상속개시일 + N년이 되는 날까지(경계 포함). 따라서 올림 banding:
 *   - 기간이 (N-1, N]년이면 band N. 정확히 N년이면 band N(경계 포함).
 *
 * 예: 2020-07-05 → 2022-10-10 = 2년 3개월 → band 3 ("3년 이내") → 80%.
 *     2020-07-05 → 2022-07-05 = 정확히 2년 → band 2 ("2년 이내") → 90%.
 *     동일일 → band 0 → 100%.
 *
 * @param priorDeathDate 1차 상속개시일 (YYYY-MM-DD)
 * @param currentDeathDate 2차(현재) 상속개시일 (YYYY-MM-DD)
 */
export function deriveShortTermReinheritBand(
  priorDeathDate: string,
  currentDeathDate: string,
): number {
  const prior = parseISO(priorDeathDate);
  const current = parseISO(currentDeathDate);
  const fullYears = differenceInYears(current, prior); // 버림(완성 연수)
  const anniversary = addYears(prior, fullYears);
  return current > anniversary ? fullYears + 1 : fullYears;
}

// ============================================================
// 세액공제 계산
// ============================================================

export interface ShortTermReinheritInput {
  /** 전의 상속세 산출세액 (§30②1호 계수, 1차 상속 전체). */
  priorTaxPaid: number;
  /** 공제율 구간(band) — deriveShortTermReinheritBand 결과 또는 legacy 수동 입력. */
  elapsedYears: number;
  /** 당해 상속세 산출세액 (§30② 한도 보조 방어 — orchestrator가 §30③ remainingTax로 재클램핑). */
  currentComputedTax: number;
  /**
   * 재상속분 재산 배열 (재산별 구분 — 집행기준 30-22-1 ②).
   * 1건+ AND 전의 상속재산가액(분모) > 0 이면 재산별 floor 계산·합산.
   */
  assets?: ShortTermReinheritAsset[];
  /**
   * legacy 단일 분자 — 재상속분의 재산가액 (§30②1호). assets 미입력 시 fallback.
   */
  shortTermReinheritAssetValue?: number;
  /**
   * 전의 상속재산가액 = 1차 총상속재산(채무공제 전) — §30②1호 분모.
   * 미입력/0 시 전부재상속(분수=1) fallback.
   */
  shortTermReinheritPriorEstateValue?: number;
}

export interface ShortTermReinheritResult {
  /** §30② 한도(보조) 적용 후 공제세액 합. orchestrator가 §30③ remainingTax로 추가 클램핑. */
  creditAmount: number;
  creditRate: number;
  /** 적용 공제율 구간 (= elapsedYears echo). */
  band: number;
  /** 재산별 표 (legacy lump·전부재상속 = 1행). */
  perAsset: ShortTermReinheritPerAsset[];
  /** 안분 분수 적용 여부 (전부재상속=false). */
  prorationApplied: boolean;
  breakdown: CalculationStep[];
}

/**
 * 단기재상속세액공제 계산 (§30)
 *
 * 재산별: credit_i = floor(전의 산출세액 × priorValue_i / 전의 상속재산가액) × 공제율, 합산.
 * legacy lump(assets 미입력): 단일 분자 shortTermReinheritAssetValue 사용.
 * 전부재상속(분자·분모 미입력): 분수=1 → credit = floor(전의 산출세액 × 공제율).
 *
 * floor 일관(D5): safeMultiplyThenDivide(BigInt floor) + applyRate(floor). 교재 round 표기와 ±1~수원 차이는
 * 정책상 허용(Math.round 금지). anchor는 엔진 floor 값으로 고정.
 */
export function calcShortTermReinheritCredit(
  input: ShortTermReinheritInput,
): ShortTermReinheritResult {
  const {
    priorTaxPaid,
    elapsedYears,
    currentComputedTax,
    assets,
    shortTermReinheritAssetValue,
    shortTermReinheritPriorEstateValue,
  } = input;

  const creditRate = getShortTermReinheritRate(elapsedYears);

  // 해당 없음: 10년 초과 또는 전 산출세액 없음
  if (creditRate === 0 || priorTaxPaid <= 0) {
    return {
      creditAmount: 0,
      creditRate: 0,
      band: elapsedYears,
      perAsset: [],
      prorationApplied: false,
      breakdown: [
        {
          label: "단기재상속세액공제 — 해당 없음 (10년 초과 또는 전 산출세액 없음)",
          amount: 0,
          lawRef: TAX_CREDIT.SHORT_TERM_REINH,
        },
      ],
    };
  }

  const priorEstateValue = shortTermReinheritPriorEstateValue;
  const hasPriorEstate = priorEstateValue !== undefined && priorEstateValue > 0;

  // ── 재상속분 재산 목록 정규화 ────────────────────────────────────────
  // 1) assets 배열(재산별 구분) — 분모 > 0
  // 2) legacy 단일 분자(shortTermReinheritAssetValue) — 분모 > 0
  // 3) 둘 다 없거나 분모 0 → 전부재상속(분수=1)
  let normalizedAssets: ShortTermReinheritAsset[] = [];
  let prorationApplied = false;

  if (assets && assets.length > 0 && hasPriorEstate) {
    normalizedAssets = assets.filter((a) => a.priorValue > 0);
    prorationApplied = normalizedAssets.length > 0;
  } else if (
    shortTermReinheritAssetValue !== undefined &&
    shortTermReinheritAssetValue > 0 &&
    hasPriorEstate
  ) {
    normalizedAssets = [{ priorValue: shortTermReinheritAssetValue }];
    prorationApplied = true;
  }

  const perAsset: ShortTermReinheritPerAsset[] = [];
  let creditAmount = 0;

  if (prorationApplied) {
    // §30②1호 약분: 재산별 floor(전 산출세액 × priorValue / 전 상속재산가액) × 공제율
    normalizedAssets.forEach((a, i) => {
      const base = safeMultiplyThenDivide(priorTaxPaid, a.priorValue, priorEstateValue!);
      const credit = applyRate(base, creditRate);
      creditAmount += credit;
      perAsset.push({
        name: a.name?.trim() || `재상속재산 ${i + 1}`,
        priorValue: a.priorValue,
        base,
        credit,
      });
    });
  } else {
    // 분수=1 전부재상속: base = priorTaxPaid
    const credit = applyRate(priorTaxPaid, creditRate);
    creditAmount = credit;
    perAsset.push({
      name: "재상속재산(전부)",
      priorValue: priorEstateValue ?? priorTaxPaid,
      base: priorTaxPaid,
      credit,
    });
  }

  const rawCredit = creditAmount;
  // §30② 보조 한도(당해 산출세액) — §30③ 실제 한도는 orchestrator remainingTax로 재클램핑.
  const finalCredit = Math.min(rawCredit, currentComputedTax);

  // ── breakdown ─────────────────────────────────────────────────
  const breakdown: CalculationStep[] = [
    {
      label: "전의 상속세 산출세액",
      amount: priorTaxPaid,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    },
  ];

  if (prorationApplied) {
    breakdown.push({
      label: `재상속분 안분 (재산 ${perAsset.length}건, 전의 상속재산가액 ${priorEstateValue!.toLocaleString()}) — §30②1호`,
      amount: rawCredit,
      lawRef: TAX_CREDIT.SHORT_TERM_REINH,
    });
  }

  breakdown.push({
    label: `단기재상속 공제율 (경과 구간 ${elapsedYears}년 → ${creditRate * 100}%)`,
    amount: rawCredit,
    lawRef: TAX_CREDIT.SHORT_TERM_REINH,
  });

  if (rawCredit > currentComputedTax) {
    breakdown.push({
      label: "당해 산출세액 한도 적용 (§30②)",
      amount: finalCredit,
      note: `원래 공제액 ${rawCredit.toLocaleString()} → 한도 초과로 ${currentComputedTax.toLocaleString()} 적용`,
    });
  }

  return {
    creditAmount: finalCredit,
    creditRate,
    band: elapsedYears,
    perAsset,
    prorationApplied,
    breakdown,
  };
}

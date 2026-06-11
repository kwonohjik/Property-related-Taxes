/**
 * 하이브리드 감면 (5년 내 세액감면 100% + 5년 후 소득금액 공제) — §98의7 · §99의2 (P2)
 *
 * 효과 2-경로 (양 조문 본문 동형):
 * - 취득일부터 5년 이내 양도 → 양도소득세 100% 세액감면 (calcReductions 후보 — §127⑦ max)
 *   농특세 = 감면세액 × 20% (농특세법 §2①1호 — finalize STEP 8.7)
 * - 5년 후 양도 → 5년간 발생 양도소득금액 공제 ("초과금액은 없는 것" — income-deduction-router)
 *   5년 발생분 = 령 §40① 준용 (령 §98의6④·§99의2⑦) — calcSignedAllocation 재사용
 * - 중과 배제: 소령 §167의3①5호(§98의5~§98의8·§99의2 열거)·§167의10①2호 — 효과 경로 무관
 *
 * 법령 (KoreanLaw 2026-06-11 원문):
 * - §98의7: 내국인 · 2012.9.24 현재 미분양(2012.9.23까지 미계약+선착순 — 령 §98의6①) ·
 *   취득가 9억 이하(실거래가, 취득세·부대비용 불포함 — 령②1호) · 2012.9.24~12.31 최초
 *   매매계약(계약금 한정) · 입주사실 주택 제외(령②2호) · 해제 후 재계약 제외(령②3·4호).
 *   ⚠️ 위임 시행령은 조번호가 어긋난 령 §98의6 (령 §98의6① "법 제98조의7제1항" 확정).
 * - §99의2: 거주자 또는 비거주자 · 신축주택등(령①1~9호 — 오피스텔 9호 포함)/감면대상기존주택
 *   (1세대1주택자 — 령③) · 6억 이하 "이거나" 전용 85㎡ 이하 (둘 다 초과 시만 제외 — 령②1호·⑤1호) ·
 *   2013.4.1~12.31 최초 매매계약+취득(자기건설은 동기간 사용승인 — 령①8호) ·
 *   오피스텔 사후요건(주민등록/임대등록 — 령②4호) · 확인 날인 매매계약서 제출 "경우에만 적용"(법④) ·
 *   가격급등지역(법③)은 령 위임 규정 부재 실측 — 지정 지역 없음.
 */

import { applyRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import {
  calcSignedAllocation,
  isWithin5YearsCheck,
  type New993FormulaStep,
  type New993SignCase,
} from "./new-99-3";

// UTC 자정 파싱 (T suffix 금지 — JSON 경유 입력과 동일 기준, P1 선례)
export const UNSOLD_98_7_CONTRACT_FROM = new Date("2012-09-24");
export const UNSOLD_98_7_CONTRACT_TO = new Date("2012-12-31");
/** 법 §98의7① — 취득가액 한도 (9억) */
export const UNSOLD_98_7_PRICE_LIMIT = 900_000_000;
export const UNSOLD_99_2_CONTRACT_FROM = new Date("2013-04-01");
export const UNSOLD_99_2_CONTRACT_TO = new Date("2013-12-31");
/** 법 §99의2① — 6억 이하 OR 전용 85㎡ 이하 (둘 다 초과 시만 제외 — 령 §99의2②1호) */
export const UNSOLD_99_2_PRICE_LIMIT = 600_000_000;
export const UNSOLD_99_2_AREA_LIMIT_SQM = 85;
/** 세액감면율·공제율 (100%) */
export const UNSOLD_HYBRID_RATE = 1.0;

export type UnsoldHybridId =
  | "unsold_98_7"
  | "unsold_99_2"
  | "unsold_98_3"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_2"
  | "unsold_98_4"
  | "unsold_98";

export interface UnsoldHybridIneligibleReason {
  code: string;
  message: string;
  legalBasis: string;
}

export interface UnsoldHybridResult {
  id: UnsoldHybridId;
  isEligible: boolean;
  ineligibleReasons: UnsoldHybridIneligibleReason[];
  isWithin5Years: boolean;
  /** 5년 내 = 세액감면 / 5년 후 = 공제 / §98의2 = 특칙(장특 표2) / §98 = 세율 20% (P5) */
  effectCategory: "tax_amount" | "income_deduction" | "lthd_rate_special" | "flat_rate_20";
  /** 감면·공제율 echo (1.0) */
  taxReductionRate: number;
  /** 5년 내 세액감면액 — calcReductions 경로에서 채움 (router 평가 시 0) */
  reductionAmount: number;
  /** 5년 후 공제할 양도소득금액 (소득금액 한도 — "초과금액은 없는 것") */
  reducibleTransferIncome: number;
  fiveYearRatio: number;
  signCase: New993SignCase;
  formulaSteps: New993FormulaStep[];
  /** 농특세 (finalize에서 채움 — 양 경로) */
  taxReductionForRuralSurtax: number;
  ruralSurtax: number;
  /** 농특세 비과세 (농특세령 §4⑦1호 — §98의3·§98의5만 true, P3) */
  ruralSurtaxExempt: boolean;
  legalBasis: string;
}

// ─────────────────────────────────────────────────────────────────
// §98의7 — 9억 이하 미분양 (내국인)
// ─────────────────────────────────────────────────────────────────

export interface Unsold987Input {
  transferDate: Date;
  /** 미분양주택 취득일 (= 양도 자산 취득일 — 모드 1) */
  acquisitionDate: Date;
  /** 최초 매매계약일 — 시한 2012.9.24~12.31 */
  contractDate?: Date;
  /** 취득가액 (원) — 9억 한도 (취득세·부대비용 제외 실거래가, 령 §98의6②1호) */
  acquisitionPrice?: number;
  /** 내국인 (법① — 거주자 한정 아님). 기본 true */
  isDomestic?: boolean;
  /** 2012.9.24 현재 미분양 (2012.9.23까지 미계약 + 선착순 — 령 §98의6①) */
  isUnsoldAtCutoff?: boolean;
  /** 사업주체등과 최초 매매계약 + 계약금 납부 (법① · 령 §98의6③) */
  isFirstContract?: boolean;
  /** 매매계약일 현재 입주 사실 없는 주택 (령 §98의6②2호) — true = 입주사실 없음(적격) */
  isNotOccupiedAtContract?: boolean;
  /** 계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 아님 (령 §98의6②3·4호) */
  isNotRecontract?: boolean;
  /** 양도소득금액 (양도차익 − 장특공제) */
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

// ─────────────────────────────────────────────────────────────────
// §99의2 — 신축·미분양·1세대1주택자 주택 (거주자·비거주자)
// ─────────────────────────────────────────────────────────────────

export type Unsold992HouseType = "new_or_unsold" | "self_built" | "existing_one_house";

export interface Unsold992Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 대상 주택 유형 — 령① 신축·미분양 / 령①8호 자기건설 / 령③ 감면대상기존주택 */
  houseType?: Unsold992HouseType;
  /** 최초 매매계약일 — new_or_unsold·existing (시한 2013.4.1~12.31) */
  contractDate?: Date;
  /** 사용승인·사용검사일 (임시 포함) — self_built (령 §99의2①8호) */
  usageApprovalDate?: Date;
  /** 실거래 취득가액 (원) — 취득세·부대비용 제외 (령②1호 후단) */
  acquisitionPrice?: number;
  /** 연면적(공동주택·오피스텔은 전용면적, ㎡) */
  exclusiveAreaSqm?: number;
  /** (new_or_unsold) 신축주택등 해당 확인 — 령 §99의2①1~9호 */
  meetsHouseTypeRequirement?: boolean;
  /** (self_built) 정비사업조합원 관리처분 취득·멸실 재건축 아님 (령①8호 가·나목) */
  isNotExcludedSelfBuilt?: boolean;
  /** (existing) 1세대1주택 양도자 요건 — 2013.4.1 현재 1세대 + 계약일 1주택 + 등기 2년 (령③) */
  meetsOneHouseSellerRequirement?: boolean;
  /** 오피스텔 여부 (령①9호·③1호) */
  isOfficetel?: boolean;
  /** 오피스텔 사후요건 — 주민등록(60일 후~양도일) 또는 60일 내 임대등록 (령②4호·⑤3호) */
  meetsOfficetelRequirement?: boolean;
  /** 계약 해제 후 본인·배우자 등 재계약 아님 (령②2·3호·⑤2호) */
  isNotRecontract?: boolean;
  /** 시장·군수·구청장 확인 날인 매매계약서 보유 (법④ — "제출한 경우에만 적용") */
  hasConfirmationSeal?: boolean;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

// ─────────────────────────────────────────────────────────────────
// 공통 효과 코어
// ─────────────────────────────────────────────────────────────────

export function ineligibleHybrid(
  id: UnsoldHybridId,
  reasons: UnsoldHybridIneligibleReason[],
  legalBasis: string,
  rate: number = UNSOLD_HYBRID_RATE,
  ruralSurtaxExempt: boolean = false,
): UnsoldHybridResult {
  return {
    id,
    isEligible: false,
    ineligibleReasons: reasons,
    isWithin5Years: false,
    effectCategory: "income_deduction",
    taxReductionRate: rate,
    reductionAmount: 0,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "ineligible",
    formulaSteps: [],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt,
    legalBasis,
  };
}
const ineligible = ineligibleHybrid;

export interface HybridEffectInput {
  id: UnsoldHybridId;
  legalBasis: string;
  articleLabel: string;
  transferDate: Date;
  acquisitionDate: Date;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
  /** 5년 후 안분 시 령 인용 (령 §40① 준용 근거) */
  allocationLegalBasis: string;
  /** 감면·공제율 (P2 조문 1.0 / §98의3 과밀 0.6 / §98의5 인하율별 / §98의6 0.5) */
  rate?: number;
  /** 농특세 비과세 (농특세령 §4⑦1호 — §98의3·§98의5) */
  ruralSurtaxExempt?: boolean;
  /** 5년 내 세액감면 허용 여부 (§98의6 2호만 false — 법 ① "제1호의 요건을 갖춘 주택에 한정") */
  allowWithin5YTaxAmount?: boolean;
  /** allowWithin5YTaxAmount=false + 5년 내 양도 시 불적격 사유 */
  within5YIneligibleReason?: UnsoldHybridIneligibleReason;
}

/** 5년 분기 + 효과 산출 — 요건 통과 후 호출 (P3에서 rate 일반화) */
export function computeHybridEffect(input: HybridEffectInput): UnsoldHybridResult {
  const rate = input.rate ?? UNSOLD_HYBRID_RATE;
  const ruralSurtaxExempt = input.ruralSurtaxExempt ?? false;
  const ratePct = Math.round(rate * 100);
  const isWithin5Years = isWithin5YearsCheck(input.acquisitionDate, input.transferDate);
  const formulaSteps: New993FormulaStep[] = [];

  if (isWithin5Years) {
    // §98의6 2호: 5년 내 세액감면은 1호 한정 — 2호는 5년 내 양도 시 혜택 없음 (P3 검토 #1)
    if (input.allowWithin5YTaxAmount === false) {
      return ineligible(
        input.id,
        [input.within5YIneligibleReason ?? {
          code: "NO_WITHIN_5Y_BENEFIT",
          message: "취득일부터 5년 이내 양도에는 세액감면이 적용되지 않습니다.",
          legalBasis: input.legalBasis,
        }],
        input.legalBasis,
        rate,
        ruralSurtaxExempt,
      );
    }
    // 5년 내 — 세액감면 (감면액은 calcReductions에서 산출세액 × rate 산출)
    formulaSteps.push({
      label: `취득일부터 5년 이내 양도 — 양도소득세 ${ratePct}% 세액감면`,
      value: 0,
      formula: `${input.articleLabel} — 양도소득세의 100분의 ${ratePct}에 상당하는 세액을 감면 (감면세액 단계 적용)`,
    });
    return {
      id: input.id,
      isEligible: true,
      ineligibleReasons: [],
      isWithin5Years: true,
      effectCategory: "tax_amount",
      taxReductionRate: rate,
      reductionAmount: 0,
      reducibleTransferIncome: 0,
      fiveYearRatio: 1,
      signCase: "within_5_years",
      formulaSteps,
      taxReductionForRuralSurtax: 0,
      ruralSurtax: 0,
      ruralSurtaxExempt,
      legalBasis: input.legalBasis,
    };
  }

  // 5년 후 — 5년간 발생 양도소득금액 공제 (기준시가 안분 — 령 §40① 준용)
  const stdAtAcq = input.standardPriceAtAcquisition ?? 0;
  const stdAt5Y = input.standardPriceAt5Years ?? 0;
  const stdAtTransfer = input.standardPriceAtTransfer ?? 0;
  if (stdAtAcq <= 0 || stdAt5Y <= 0 || stdAtTransfer <= 0) {
    return ineligible(
      input.id,
      [{
        code: "MISSING_STD_PRICE",
        message: "5년 후 양도 안분에 필요한 기준시가(취득시·5년시점·양도시)가 입력되지 않았습니다 (조특령 §40① 준용 — 자동 안분 불가).",
        legalBasis: input.allocationLegalBasis,
      }],
      input.legalBasis,
      rate,
      ruralSurtaxExempt,
    );
  }
  const allocation = calcSignedAllocation(input.transferIncome, stdAt5Y - stdAtAcq, stdAtTransfer - stdAtAcq);
  const allocated = Math.min(allocation.reducibleIncome, Math.max(0, input.transferIncome));
  const reducible = Math.min(applyRate(allocated, rate), Math.max(0, input.transferIncome));
  formulaSteps.push({
    label: "5년간 발생 양도소득금액 (기준시가 안분)",
    value: allocated,
    formula: `양도소득금액 ${input.transferIncome.toLocaleString()} × (5년시점 기준시가 ${stdAt5Y.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()}) ÷ (양도시 기준시가 ${stdAtTransfer.toLocaleString()} − 취득시 기준시가 ${stdAtAcq.toLocaleString()})`,
  });
  formulaSteps.push({
    label: rate === 1
      ? "과세대상소득금액에서 공제 (초과금액은 없는 것)"
      : `과세대상소득금액에서 공제 (5년간 발생분 × ${ratePct}%, 초과금액은 없는 것)`,
    value: reducible,
    formula: rate === 1
      ? `5년간 발생분 ${allocated.toLocaleString()}을 과세대상소득금액에서 공제`
      : `5년간 발생분 ${allocated.toLocaleString()} × ${ratePct}% = ${reducible.toLocaleString()}을 과세대상소득금액에서 공제`,
  });
  return {
    id: input.id,
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    effectCategory: "income_deduction",
    taxReductionRate: rate,
    reductionAmount: 0,
    reducibleTransferIncome: reducible,
    fiveYearRatio: allocation.ratio,
    signCase: allocation.signCase,
    formulaSteps,
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt,
    legalBasis: input.legalBasis,
  };
}

// ─────────────────────────────────────────────────────────────────
// §98의7 evaluator
// ─────────────────────────────────────────────────────────────────

export function evaluateUnsold987(input: Unsold987Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_7;
  const reasons: UnsoldHybridIneligibleReason[] = [];

  if (input.isDomestic === false) {
    reasons.push({
      code: "NOT_DOMESTIC",
      message: "내국인이 아닌 경우 §98의7이 적용되지 않습니다 (법 ① 본문).",
      legalBasis,
    });
  }
  if (!input.contractDate) {
    reasons.push({
      code: "MISSING_CONTRACT_DATE",
      message: "최초 매매계약일이 입력되지 않았습니다 (2012.9.24~2012.12.31 시한 판정에 필요).",
      legalBasis,
    });
  } else if (
    input.contractDate.getTime() < UNSOLD_98_7_CONTRACT_FROM.getTime() ||
    input.contractDate.getTime() > UNSOLD_98_7_CONTRACT_TO.getTime()
  ) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "최초 매매계약일이 2012.9.24~2012.12.31 시한 외입니다 (법 §98의7①).",
      legalBasis,
    });
  }
  if (input.acquisitionPrice === undefined || input.acquisitionPrice <= 0) {
    reasons.push({
      code: "MISSING_PRICE",
      message: "취득가액이 입력되지 않았습니다 (9억 한도 검증 — 취득세·부대비용 제외 실거래가).",
      legalBasis,
    });
  } else if (input.acquisitionPrice > UNSOLD_98_7_PRICE_LIMIT) {
    reasons.push({
      code: "PRICE_LIMIT_EXCEEDED",
      message: "취득가액이 9억원을 초과합니다 (법 §98의7① · 령 §98의6②1호).",
      legalBasis: "조특령 §98의6②1호",
    });
  }
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의7①).",
      legalBasis,
    });
  }
  if (input.isUnsoldAtCutoff !== true) {
    reasons.push({
      code: "NOT_UNSOLD_AT_CUTOFF",
      message: "2012.9.24 현재 미분양 요건(입주자 계약일 경과 단지에서 2012.9.23까지 분양계약 미체결 + 선착순 공급)이 확인되지 않았습니다 (조특령 §98의6①).",
      legalBasis: "조특령 §98의6①",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결하고 계약금을 납부한 요건이 확인되지 않았습니다 (법 §98의7① · 령 §98의6③).",
      legalBasis,
    });
  }
  if (input.isNotOccupiedAtContract !== true) {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message: "매매계약일 현재 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의6②2호).",
      legalBasis: "조특령 §98의6②2호",
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님이 확인되지 않았습니다 (조특령 §98의6②3·4호).",
      legalBasis: "조특령 §98의6②3·4호",
    });
  }
  if (reasons.length > 0) return ineligible("unsold_98_7", reasons, legalBasis);

  return computeHybridEffect({
    id: "unsold_98_7",
    legalBasis,
    articleLabel: "조특법 §98의7①",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의6④",
  });
}

// ─────────────────────────────────────────────────────────────────
// §99의2 evaluator
// ─────────────────────────────────────────────────────────────────

export function evaluateUnsold992(input: Unsold992Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_99_2;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  const houseType = input.houseType ?? "new_or_unsold";

  // 1) 시한 — 자기건설은 사용승인일, 그 외 매매계약일 (2013.4.1~12.31)
  if (houseType === "self_built") {
    if (!input.usageApprovalDate) {
      reasons.push({
        code: "MISSING_USAGE_APPROVAL",
        message: "자기건설 주택의 사용승인·사용검사일이 입력되지 않았습니다 (2013.4.1~2013.12.31 시한 판정 — 조특령 §99의2①8호).",
        legalBasis: "조특령 §99의2①8호",
      });
    } else if (
      input.usageApprovalDate.getTime() < UNSOLD_99_2_CONTRACT_FROM.getTime() ||
      input.usageApprovalDate.getTime() > UNSOLD_99_2_CONTRACT_TO.getTime()
    ) {
      reasons.push({
        code: "OUT_OF_CONTRACT_PERIOD",
        message: "사용승인·사용검사일이 2013.4.1~2013.12.31 과세특례 취득기간 외입니다 (조특령 §99의2①8호).",
        legalBasis: "조특령 §99의2①8호",
      });
    }
  } else {
    if (!input.contractDate) {
      reasons.push({
        code: "MISSING_CONTRACT_DATE",
        message: "최초 매매계약일이 입력되지 않았습니다 (2013.4.1~2013.12.31 시한 판정에 필요).",
        legalBasis,
      });
    } else if (
      input.contractDate.getTime() < UNSOLD_99_2_CONTRACT_FROM.getTime() ||
      input.contractDate.getTime() > UNSOLD_99_2_CONTRACT_TO.getTime()
    ) {
      reasons.push({
        code: "OUT_OF_CONTRACT_PERIOD",
        message: "최초 매매계약일이 2013.4.1~2013.12.31 시한 외입니다 (법 §99의2①).",
        legalBasis,
      });
    }
  }

  // 2) 가액·면적 — 6억 이하 "이거나" 전용 85㎡ 이하 (둘 다 초과 시만 제외 — 령②1호·⑤1호)
  const hasPrice = input.acquisitionPrice !== undefined && input.acquisitionPrice > 0;
  const hasArea = input.exclusiveAreaSqm !== undefined && input.exclusiveAreaSqm > 0;
  if (!hasPrice) {
    reasons.push({
      code: "MISSING_PRICE",
      message: "실거래 취득가액이 입력되지 않았습니다 (6억 이하 OR 85㎡ 이하 판정 — 취득세·부대비용 제외).",
      legalBasis,
    });
  }
  if (!hasArea) {
    reasons.push({
      code: "MISSING_AREA",
      message: "연면적(공동주택·오피스텔은 전용면적)이 입력되지 않았습니다 (6억 이하 OR 85㎡ 이하 판정).",
      legalBasis,
    });
  }
  if (
    hasPrice && hasArea &&
    input.acquisitionPrice! > UNSOLD_99_2_PRICE_LIMIT &&
    input.exclusiveAreaSqm! > UNSOLD_99_2_AREA_LIMIT_SQM
  ) {
    reasons.push({
      code: "PRICE_AND_AREA_EXCEEDED",
      message: "취득가액이 6억원을 초과하고 연면적(전용면적)도 85㎡를 초과합니다 — 둘 중 하나라도 충족하면 적용되나 모두 초과하여 제외됩니다 (조특령 §99의2②1호·⑤1호).",
      legalBasis: "조특령 §99의2②1호",
    });
  }

  // 3) 양도 시점
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §99의2①).",
      legalBasis,
    });
  }

  // 4) 유형별 자격 토글
  if (houseType === "new_or_unsold" && input.meetsHouseTypeRequirement !== true) {
    reasons.push({
      code: "NOT_QUALIFIED_HOUSE_TYPE",
      message: "신축주택등 요건(사업주체·주택건설사업자·주택도시보증공사·시공자·기업구조조정리츠·신탁업자가 공급하는 주택 또는 오피스텔 — 조특령 §99의2①1~9호)이 확인되지 않았습니다.",
      legalBasis: "조특령 §99의2①",
    });
  }
  if (houseType === "self_built" && input.isNotExcludedSelfBuilt !== true) {
    reasons.push({
      code: "SELF_BUILT_EXCLUDED",
      message: "정비사업조합원이 관리처분계획에 따라 취득한 주택·멸실 후 재건축한 주택이 아님이 확인되지 않았습니다 (조특령 §99의2①8호 가·나목).",
      legalBasis: "조특령 §99의2①8호",
    });
  }
  if (houseType === "existing_one_house" && input.meetsOneHouseSellerRequirement !== true) {
    reasons.push({
      code: "NOT_ONE_HOUSE_SELLER",
      message: "1세대1주택자의 주택 요건(2013.4.1 현재 1세대 + 매매계약일 현재 1주택 + 취득 등기일부터 계약일까지 2년 이상 — 일시적 2주택 포함)이 확인되지 않았습니다 (조특령 §99의2③).",
      legalBasis: "조특령 §99의2③",
    });
  }
  // 5) 오피스텔 사후요건 (령②4호·⑤3호)
  if (input.isOfficetel === true && input.meetsOfficetelRequirement !== true) {
    reasons.push({
      code: "OFFICETEL_REQUIREMENT_NOT_MET",
      message: "오피스텔 사후요건(취득일부터 60일 지난 날부터 양도일까지 취득자·임차인 주민등록 유지 또는 취득일부터 60일 이내 임대용 주택 등록)이 확인되지 않았습니다 (조특령 §99의2②4호).",
      legalBasis: "조특령 §99의2②4호",
    });
  }
  // 6) 재계약 제외
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함)가 다시 계약한 주택이 아님이 확인되지 않았습니다 (조특령 §99의2②2·3호·⑤2호).",
      legalBasis: "조특령 §99의2②2·3호",
    });
  }
  // 7) 확인 날인 (법④ — "제출한 경우에만 적용")
  if (input.hasConfirmationSeal !== true) {
    reasons.push({
      code: "NO_CONFIRMATION_SEAL",
      message: "시장·군수·구청장의 감면 대상 주택 확인 날인을 받은 매매계약서가 확인되지 않았습니다 — 확인 날인 계약서를 관할 세무서장에게 제출한 경우에만 적용됩니다 (법 §99의2④).",
      legalBasis: "조특법 §99의2④",
    });
  }

  if (reasons.length > 0) return ineligible("unsold_99_2", reasons, legalBasis);

  return computeHybridEffect({
    id: "unsold_99_2",
    legalBasis,
    articleLabel: "조특법 §99의2①",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §99의2⑦",
  });
}

// ─────────────────────────────────────────────────────────────────
// reduction payload → Input 매핑 (router·calcReductions 공용)
// ─────────────────────────────────────────────────────────────────

/** reduction variant 멤버 — 구조적 타이핑 (stub.types 직접 import 회피) */
export interface ReductionLike {
  type: string;
  [key: string]: unknown;
}

export function toHybridDate(v: unknown): Date | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export interface HybridEvalContext {
  transferDate: Date;
  acquisitionDate: Date;
  /** 자산-수준 매매계약일 fallback */
  assetContractDate?: Date;
  standardPriceAtTransfer?: number;
  transferIncome: number;
}

export function evaluateHybridFromReduction(
  r: ReductionLike,
  ctx: HybridEvalContext,
): UnsoldHybridResult | undefined {
  if (r.type === "unsold_98_7") {
    return evaluateUnsold987({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate987) ?? ctx.assetContractDate,
      acquisitionPrice: r.acquisitionPrice987 as number | undefined,
      isDomestic: (r.isDomestic987 as boolean | undefined) ?? true,
      isUnsoldAtCutoff: r.isUnsoldAtCutoff987 as boolean | undefined,
      isFirstContract: r.isFirstContract987 as boolean | undefined,
      isNotOccupiedAtContract: r.isNotOccupiedAtContract987 as boolean | undefined,
      isNotRecontract: r.isNotRecontract987 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition987 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years987 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer987 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  if (r.type === "unsold_99_2") {
    return evaluateUnsold992({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      houseType: r.houseType992 as Unsold992HouseType | undefined,
      contractDate: toHybridDate(r.contractDate992) ?? ctx.assetContractDate,
      usageApprovalDate: toHybridDate(r.usageApprovalDate992),
      acquisitionPrice: r.acquisitionPrice992 as number | undefined,
      exclusiveAreaSqm: r.exclusiveAreaSqm992 as number | undefined,
      meetsHouseTypeRequirement: r.meetsHouseTypeRequirement992 as boolean | undefined,
      isNotExcludedSelfBuilt: r.isNotExcludedSelfBuilt992 as boolean | undefined,
      meetsOneHouseSellerRequirement: r.meetsOneHouseSellerRequirement992 as boolean | undefined,
      isOfficetel: r.isOfficetel992 as boolean | undefined,
      meetsOfficetelRequirement: r.meetsOfficetelRequirement992 as boolean | undefined,
      isNotRecontract: r.isNotRecontract992 as boolean | undefined,
      hasConfirmationSeal: r.hasConfirmationSeal992 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition992 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years992 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer992 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  return undefined;
}

/**
 * calcReductions 진입점 — 5년 내 세액감면 후보 (§127⑦ max 패턴).
 * eligible && tax_amount일 때만 reductionAmount = 산출세액 × 100% 채움.
 */
export function evaluateHybridTaxAmountFromReductions(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: {
    transferDate: Date;
    acquisitionDate?: Date;
    assetContractDate?: Date;
    calculatedTax: number;
  },
): UnsoldHybridResult | undefined {
  if (!reductions || !ctx.acquisitionDate) return undefined;
  const r = reductions.find((x) => x.type === "unsold_98_7" || x.type === "unsold_99_2") as
    | ReductionLike
    | undefined;
  if (!r) return undefined;
  const detail = evaluateHybridFromReduction(r, {
    transferDate: ctx.transferDate,
    acquisitionDate: ctx.acquisitionDate,
    assetContractDate: ctx.assetContractDate,
    transferIncome: 0, // tax_amount 판정에는 소득금액 불요 (5년 후 경로는 router가 담당)
  });
  if (!detail) return undefined;
  if (detail.isEligible && detail.effectCategory === "tax_amount") {
    return { ...detail, reductionAmount: applyRate(ctx.calculatedTax, detail.taxReductionRate) };
  }
  return detail;
}

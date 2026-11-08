/**
 * P3 하이브리드 감면 — 조특법 §98의6 (2026-06-12)
 *
 * - §98의6: 준공후미분양 (사용검사·승인 후 2011.3.29 현재 미계약+선착순 — 령 §98의5②) — 50%.
 *   1호: 사업주체등이 ~2011.12.31 임대계약+2년 임대 후 최초 매매계약 취득 (5년 내 50% 세액감면 가능)
 *   2호: 최초 매매계약 취득 후 5년 임대 (등록 후 기산 령⑤ — 5년 내 세액감면 없음, 법 ① "제1호 한정")
 *   제외: 기준시가 합계 6억 초과 또는 연면적(전용) 149 초과 (취득/최초 임대개시 당시 — 령② 단서).
 *   농특세 과세.
 *
 * `unsold-hybrid-p3.ts`(747줄)에서 조문별로 분리 (동작 변경 없음 — 순수 이동). §98의6 상수·
 * `Unsold986Input`·`evaluateUnsold986`이 여기 있고, `unsold-hybrid-p3.ts`가 같은 이름으로 재수출한다.
 *
 * 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 * suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 * 특칙 대상 ID 목록(RATE_SPECIAL_REDUCTION_IDS)과 통합 dispatcher(evaluateAnyHybridFromReduction ·
 * evaluateAnyHybridTaxAmount)는 `unsold-hybrid-p3.ts`에 남아 있다.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { computeHybridEffect } from "./unsold-hybrid";
import { ineligibleHybrid } from "./unsold-hybrid";
import type { UnsoldHybridIneligibleReason } from "./unsold-hybrid";
import type { UnsoldHybridResult } from "./unsold-hybrid";
import { fullMonthsBetween } from "./unsold-98-8";
import { unsold986AcquisitionGateReasons } from "./unsold-98-period-gates";

// UTC 자정 파싱 (T suffix 금지)
export const UNSOLD_98_6_RENTAL_CONTRACT_TO = new Date("2011-12-31");
export const UNSOLD_98_6_RATE = 0.5;
/** 령 §98의5② 단서 — 주택+부수토지 기준시가 합계 6억·연면적(전용) 149 (초과 시 제외 — OR) */
export const UNSOLD_98_6_STD_SUM_LIMIT = 600_000_000;
export const UNSOLD_98_6_FLOOR_LIMIT = 149;
export const UNSOLD_98_6_RENTAL_MONTHS = 60;

// ─────────────────────────────────────────────────────────────────
// §98의6
// ─────────────────────────────────────────────────────────────────

export interface Unsold986Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 1호: 사업주체등 2년 임대 후 취득 / 2호: 취득 후 5년 임대 */
  hoType?: "seller_rented" | "buyer_rented";
  /** 거주자 또는 국내사업장 없는 비거주자(법 ① — US-42). false면 적용 주체 아님. 미제공은 true */
  isEligibleSubject?: boolean;
  /** 최초 매매계약일 */
  contractDate?: Date;
  /** 주택+부수토지 기준시가 합계 (원) — 취득 당시 (1호는 최초 임대개시 당시). 6억 초과 제외 */
  stdPriceSumAtBase?: number;
  /** 연면적 (공동주택 전용, ㎡) — 149 초과 제외 */
  floorAreaSqm?: number;
  /** 준공후미분양 확인 (사용검사·승인 후 2011.3.29 현재 미계약 + 선착순 — 령②) */
  isUnsoldAfterCompletion?: boolean;
  /** 사업주체등과 최초 매매계약 */
  isFirstContract?: boolean;
  /** 준공 후 입주사실 없음 (령③1호) */
  isNotOccupiedAfterCompletion?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령③2·3호) */
  isNotRecontract?: boolean;
  /** (1호) 사업주체등이 2011.12.31까지 임대계약 체결 + 2년 이상 임대 확인 */
  sellerRented2Years?: boolean;
  /** (2호) 임대계약 체결일 (~2011.12.31 한정) */
  rentalContractDate?: Date;
  /** (2호) 임대개시일 — 사업자등록+임대사업자등록 후 (령⑤1호 기산) */
  rentalStartDate?: Date;
  /** (2호) 임대종료일 — 미입력 시 양도일까지 계속 */
  rentalEndDate?: Date;
  /** (2호) 상속 합산 피상속인 임대기간 (개월 — 령⑤2호) */
  inheritedRentalMonths?: number;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

export function evaluateUnsold986(input: Unsold986Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_6;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  const hoType = input.hoType ?? "seller_rented";
  const rate = UNSOLD_98_6_RATE;
  if (input.isEligibleSubject === false) {
    reasons.push({
      code: "NOT_ELIGIBLE_SUBJECT",
      message: "국내사업장이 있는 비거주자는 적용되지 않습니다 — 적용 주체는 거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자입니다 (법 §98의6①).",
      legalBasis,
    });
  }

  // 1) 기준시가 합계 6억 + 연면적 149 (초과 시 제외 — OR, 령② 단서)
  if (input.stdPriceSumAtBase === undefined || input.stdPriceSumAtBase <= 0) {
    reasons.push({
      code: "MISSING_STD_SUM",
      message: `주택과 부수토지의 기준시가 합계(${hoType === "seller_rented" ? "최초 임대개시 당시" : "취득 당시"})가 입력되지 않았습니다 (조특령 §98의5② 단서 — 6억 한도).`,
      legalBasis: "조특령 §98의5②",
    });
  } else if (input.stdPriceSumAtBase > UNSOLD_98_6_STD_SUM_LIMIT) {
    reasons.push({
      code: "STD_SUM_LIMIT_EXCEEDED",
      message: "주택과 부수토지의 기준시가 합계가 6억원을 초과합니다 (조특령 §98의5② 단서).",
      legalBasis: "조특령 §98의5②",
    });
  }
  if (input.floorAreaSqm === undefined || input.floorAreaSqm <= 0) {
    reasons.push({
      code: "MISSING_AREA",
      message: "연면적(공동주택은 전용면적)이 입력되지 않았습니다 (149㎡ 한도 검증).",
      legalBasis: "조특령 §98의5②",
    });
  } else if (input.floorAreaSqm > UNSOLD_98_6_FLOOR_LIMIT) {
    reasons.push({
      code: "AREA_LIMIT_EXCEEDED",
      message: "연면적(전용면적)이 149㎡를 초과합니다 (조특령 §98의5② 단서).",
      legalBasis: "조특령 §98의5②",
    });
  }
  // 2) 양도 시점 · 「2011.3.29. 현재 준공후미분양」 취득일 하한(US-22)
  reasons.push(...unsold986AcquisitionGateReasons(input.acquisitionDate));
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "준공후미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의6①).",
      legalBasis,
    });
  }
  // 3) 자격 토글 공통
  if (input.isUnsoldAfterCompletion !== true) {
    reasons.push({
      code: "NOT_UNSOLD_AFTER_COMPLETION",
      message: "준공후미분양 요건(사용검사·사용승인 후 2011.3.29 현재 분양계약 미체결 + 선착순 공급)이 확인되지 않았습니다 (조특령 §98의5②).",
      legalBasis: "조특령 §98의5②",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (법 §98의6①).",
      legalBasis,
    });
  }
  if (input.isNotOccupiedAfterCompletion !== true) {
    reasons.push({
      code: "OCCUPIED_AFTER_COMPLETION",
      message: "준공 후 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의5③1호).",
      legalBasis: "조특령 §98의5③1호",
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의5③2·3호).",
      legalBasis: "조특령 §98의5③2·3호",
    });
  }
  // 4) 호별 임대 요건
  if (hoType === "seller_rented") {
    if (input.sellerRented2Years !== true) {
      reasons.push({
        code: "SELLER_RENTAL_NOT_CONFIRMED",
        message: "사업주체등이 2011.12.31까지 임대계약을 체결하여 2년 이상 임대한 주택임이 확인되지 않았습니다 (법 §98의6①1호).",
        legalBasis,
      });
    }
  } else {
    if (!input.rentalContractDate) {
      reasons.push({
        code: "MISSING_RENTAL_CONTRACT_DATE",
        message: "임대계약 체결일이 입력되지 않았습니다 (2011.12.31 이전 임대계약 체결에 한정 — 법 §98의6①2호).",
        legalBasis,
      });
    } else if (input.rentalContractDate.getTime() > UNSOLD_98_6_RENTAL_CONTRACT_TO.getTime()) {
      reasons.push({
        code: "RENTAL_CONTRACT_TOO_LATE",
        message: "임대계약 체결일이 2011.12.31 이후입니다 (법 §98의6①2호 — 2011.12.31 이전 체결에 한정).",
        legalBasis,
      });
    }
    let rentalMonths = 0;
    if (!input.rentalStartDate) {
      reasons.push({
        code: "MISSING_RENTAL_START",
        message: "임대개시일이 입력되지 않았습니다 (사업자등록과 임대사업자등록 후 임대를 개시한 날부터 기산 — 조특령 §98의5⑤1호).",
        legalBasis: "조특령 §98의5⑤",
      });
    } else {
      const rentalEnd = input.rentalEndDate ?? input.transferDate;
      rentalMonths = fullMonthsBetween(input.rentalStartDate, rentalEnd) + (input.inheritedRentalMonths ?? 0);
      if (rentalMonths < UNSOLD_98_6_RENTAL_MONTHS) {
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `임대기간이 5년(60개월) 미만입니다 (인정 임대기간 ${rentalMonths}개월 — 등록 후 임대개시일부터 기산${input.inheritedRentalMonths ? `, 피상속인 ${input.inheritedRentalMonths}개월 합산` : ""}).`,
          legalBasis: "조특령 §98의5⑤",
        });
      }
    }
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_6", reasons, legalBasis, rate, false);

  return computeHybridEffect({
    id: "unsold_98_6",
    legalBasis,
    articleLabel: hoType === "seller_rented" ? "조특법 §98의6①1호" : "조특법 §98의6①2호",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의5④",
    rate,
    ruralSurtaxExempt: false,
    // 5년 내 세액감면은 1호 한정 (법 ① "제1호의 요건을 갖춘 주택에 한정한다")
    allowWithin5YTaxAmount: hoType === "seller_rented",
    within5YIneligibleReason: {
      code: "NO_WITHIN_5Y_BENEFIT",
      message: "취득일부터 5년 이내 양도 시 세액감면은 제1호(사업주체등이 2년 이상 임대한 주택을 취득) 요건을 갖춘 주택에 한정됩니다 — 제2호(취득 후 5년 임대)는 5년이 지난 후 양도분 차감만 적용됩니다 (법 §98의6①).",
      legalBasis,
    },
  });
}

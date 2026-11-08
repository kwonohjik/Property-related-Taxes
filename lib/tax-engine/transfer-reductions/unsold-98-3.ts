/**
 * P3 하이브리드 감면 — 조특법 §98의3 (2026-06-12)
 *
 * - §98의3: 서울 밖(지정지역 제외) 미분양 — 100% (수도권과밀억제권역 60%, 대지 660·연면적(전용)
 *   149 이내 한정 — 령 §98의3①단서, 과밀 판정 = 매매계약일 현재 령④). 거주자 2009.2.12~2010.2.11 /
 *   국내사업장 없는 비거주자 2009.3.16~2010.2.11. ② 자기건설(동기간 착공+사용승인, 조합원·멸실 제외).
 *   농특세 비과세 (농특세령 §4⑦1호).
 *
 * `unsold-hybrid-p3.ts`(747줄)에서 조문별로 분리 (동작 변경 없음 — 순수 이동). §98의3 상수·
 * `Unsold983Input`·`evaluateUnsold983`이 여기 있고, `unsold-hybrid-p3.ts`가 같은 이름으로 재수출한다.
 *
 * 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 * suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 * 특칙 대상 ID 목록(RATE_SPECIAL_REDUCTION_IDS)과 통합 dispatcher(evaluateAnyHybridFromReduction ·
 * evaluateAnyHybridTaxAmount)는 `unsold-hybrid-p3.ts`에 남아 있다.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { round2 } from "../area-utils";
import { computeHybridEffect } from "./unsold-hybrid";
import { ineligibleHybrid } from "./unsold-hybrid";
import type { UnsoldHybridIneligibleReason } from "./unsold-hybrid";
import type { UnsoldHybridResult } from "./unsold-hybrid";
import { unsold983TransferGateReasons } from "./unsold-98-period-gates";

// UTC 자정 파싱 (T suffix 금지)
export const UNSOLD_98_3_PERIOD_FROM_RESIDENT = new Date("2009-02-12");
export const UNSOLD_98_3_PERIOD_FROM_NONRESIDENT = new Date("2009-03-16");
export const UNSOLD_98_3_PERIOD_TO = new Date("2010-02-11");
/** 령 §98의3①단서 — 과밀억제권역 한정 면적 (대지 660·연면적(전용) 149 이내) */
export const UNSOLD_98_3_OVERCON_LAND_LIMIT = 660;
export const UNSOLD_98_3_OVERCON_FLOOR_LIMIT = 149;
export const UNSOLD_98_3_OVERCON_RATE = 0.6;

// ─────────────────────────────────────────────────────────────────
// §98의3
// ─────────────────────────────────────────────────────────────────

export interface Unsold983Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 거주자 / 국내사업장 없는 비거주자 (소법 §120) — 시한 시작일 분기. 국내사업장 있는 비거주자는 적용 주체가 아니다(US-42) */
  residencyType?: "resident" | "nonresident_no_pe" | "nonresident_with_pe";
  /** 사업주체 취득(법①) / 자기건설(법②) */
  houseType?: "purchased" | "self_built";
  /** 최초 매매계약일 — purchased (시한: 거주자 2009.2.12~ / 비거주자 2009.3.16~ ~2010.2.11) */
  contractDate?: Date;
  /** 착공일 — self_built (동기간 내) */
  constructionStartDate?: Date;
  /** 사용승인·사용검사일 (임시 포함) — self_built (동기간 내) */
  usageApprovalDate?: Date;
  /** 서울 밖 + 지정지역(소법 §104의2) 아님 — 통합 확인 */
  isOutsideSeoulNotDesignated?: boolean;
  /** 수도권과밀억제권역 (매매계약일 현재 — 령④). ON 시 60% + 면적 한정 */
  isOverconcentration?: boolean;
  /** 대지면적 (㎡) — 과밀 시 660 이내 한정 */
  landAreaSqm?: number;
  /** 주택 연면적(공동주택 전용, ㎡) — 과밀 시 149 이내 한정 */
  floorAreaSqm?: number;
  /**
   * 계약서상 계약금 전액 완납일 — purchased + 취득일이 2010.2.11 이후일 때만 필수 (US-21).
   * 법 §98의3① 「2010년 2월 11일까지 매매계약을 체결하고 계약금을 납부한 경우를 포함」을
   * 국세청이 「계약금을 완납한 경우」로 해석(부동산거래관리과-262, 2010.2.18).
   */
  downPaymentCompletedDate?: Date;
  /** 미분양 확인 (령①1~8호 — 2009.2.11까지 미계약 선착순 공급분·2009.2.12 이후 입주자 계약일 도래분·건축주·신탁업자 공급분 등) */
  isUnsoldConfirmed?: boolean;
  /** 사업주체(20호 미만 주택건설사업자 포함)와 최초 매매계약 */
  isFirstContract?: boolean;
  /** 매매계약일 현재 입주사실 없음 (령②1호) */
  isNotOccupiedAtContract?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령②2·3호) */
  isNotRecontract?: boolean;
  /** 자기건설 — 조합원 관리처분·멸실 재건축 아님 (법②단서) */
  isNotExcludedSelfBuilt?: boolean;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

export function evaluateUnsold983(input: Unsold983Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_3;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  const houseType = input.houseType ?? "purchased";
  const isOvercon = input.isOverconcentration === true;
  const rate = isOvercon ? UNSOLD_98_3_OVERCON_RATE : 1.0;
  const from =
    input.residencyType === "nonresident_no_pe"
      ? UNSOLD_98_3_PERIOD_FROM_NONRESIDENT
      : UNSOLD_98_3_PERIOD_FROM_RESIDENT;

  // 0) 주체 — 법 ①「거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자」(US-42)
  if (input.residencyType === "nonresident_with_pe") {
    reasons.push({
      code: "NOT_ELIGIBLE_SUBJECT",
      message: "국내사업장이 있는 비거주자는 적용되지 않습니다 — 적용 주체는 거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자입니다 (법 §98의3①).",
      legalBasis,
    });
  }
  // 1) 시한 — purchased: 매매계약일 / self_built: 착공일 AND 사용승인일 (법②)
  if (houseType === "self_built") {
    if (!input.constructionStartDate || !input.usageApprovalDate) {
      reasons.push({
        code: "MISSING_SELF_BUILT_DATES",
        message: "자기건설 주택의 착공일과 사용승인·사용검사일이 모두 입력되어야 합니다 (법 §98의3② — 2009.2.12~2010.2.11 기간 내 착공·사용승인).",
        legalBasis,
      });
    } else {
      const within = (d: Date) =>
        d.getTime() >= UNSOLD_98_3_PERIOD_FROM_RESIDENT.getTime() &&
        d.getTime() <= UNSOLD_98_3_PERIOD_TO.getTime();
      if (!within(input.constructionStartDate) || !within(input.usageApprovalDate)) {
        reasons.push({
          code: "OUT_OF_CONTRACT_PERIOD",
          message: "착공일·사용승인일이 2009.2.12~2010.2.11 기간 외입니다 (법 §98의3②).",
          legalBasis,
        });
      }
    }
  } else {
    if (!input.contractDate) {
      reasons.push({
        code: "MISSING_CONTRACT_DATE",
        message: "최초 매매계약일이 입력되지 않았습니다 (거주자 2009.2.12~2010.2.11 / 국내사업장 없는 비거주자 2009.3.16~2010.2.11).",
        legalBasis,
      });
    } else if (
      input.contractDate.getTime() < from.getTime() ||
      input.contractDate.getTime() > UNSOLD_98_3_PERIOD_TO.getTime()
    ) {
      reasons.push({
        code: "OUT_OF_CONTRACT_PERIOD",
        message:
          input.residencyType === "nonresident_no_pe"
            ? "최초 매매계약일이 비거주자 적용기간(2009.3.16~2010.2.11) 외입니다 (법 §98의3①2호)."
            : "최초 매매계약일이 거주자 적용기간(2009.2.12~2010.2.11) 외입니다 (법 §98의3①1호).",
        legalBasis,
      });
    }
  }

  // 1-2) 계약금 완납 — 취득일이 2010.2.11 이후면 「2010.2.11까지 계약 체결 + 계약금 납부」 확장 사유에 의존한다.
  //      국세청은 「납부」를 「완납」으로 본다(부동산거래관리과-262, 2010.2.18) → 완납일이 2010.2.11 이내여야 한다 (US-21).
  if (
    houseType === "purchased" &&
    input.acquisitionDate.getTime() > UNSOLD_98_3_PERIOD_TO.getTime()
  ) {
    if (!input.downPaymentCompletedDate) {
      reasons.push({
        code: "MISSING_DOWN_PAYMENT_DATE",
        message: "취득일이 2010.2.11 이후이므로 계약서상 계약금 전액 완납일이 필요합니다 (법 §98의3① 「2010년 2월 11일까지 매매계약을 체결하고 계약금을 납부한 경우」 — 계약금 완납으로 해석).",
        legalBasis,
      });
    } else if (input.downPaymentCompletedDate.getTime() > UNSOLD_98_3_PERIOD_TO.getTime()) {
      reasons.push({
        code: "DOWN_PAYMENT_AFTER_DEADLINE",
        message: "계약금 전액 완납일이 2010.2.11 이후입니다 — 계약금 일부를 2010.2.12 이후 납부한 경우 적용되지 않습니다 (법 §98의3①, 부동산거래관리과-262).",
        legalBasis,
      });
    }
  }

  // 2) 지역 — 서울 밖 + 지정지역 아님
  if (input.isOutsideSeoulNotDesignated !== true) {
    reasons.push({
      code: "NOT_OUTSIDE_SEOUL",
      message: "서울특별시 밖의 지역(소득세법 §104의2 지정지역 제외)에 있는 주택임이 확인되지 않았습니다 (법 §98의3① 본문).",
      legalBasis,
    });
  }
  // 3) 과밀억제권역 — 면적 한정 (대지 660 이내 AND 연면적 149 이내)
  //    령 §98의3① 단서: 「수도권과밀억제권역 안의 지역인 경우에는 대지면적이 660제곱미터 이내이고,
  //    주택의 연면적이 149제곱미터(공동주택의 경우에는 전용면적 149제곱미터) 이내인 주택에 한정한다」.
  //    자기건설(법②)도 같은 면적 한정을 받는다 — 국세청 재산세과-1450(2009.7.15)·재산세과-1537(2009.7.27)
  //    회신 3항(2026-11 US-03). 령⑤ 단서는 ②주택의 제출서류만 대체한다. 면적 비교는 round2() 후.
  if (isOvercon) {
    if (!(input.landAreaSqm !== undefined && input.landAreaSqm > 0) ||
        !(input.floorAreaSqm !== undefined && input.floorAreaSqm > 0)) {
      reasons.push({
        code: "MISSING_AREA",
        message: "수도권과밀억제권역 주택은 대지면적과 연면적(공동주택은 전용면적)을 입력해야 합니다 (조특령 §98의3①단서 — 660㎡·149㎡ 이내 한정).",
        legalBasis: "조특령 §98의3①단서",
      });
    } else if (
      round2(input.landAreaSqm) > UNSOLD_98_3_OVERCON_LAND_LIMIT ||
      round2(input.floorAreaSqm) > UNSOLD_98_3_OVERCON_FLOOR_LIMIT
    ) {
      reasons.push({
        code: "AREA_LIMIT_EXCEEDED",
        message: "수도권과밀억제권역 주택은 대지면적 660㎡ 이내이고 연면적(전용면적) 149㎡ 이내인 경우에 한정됩니다 (조특령 §98의3①단서).",
        legalBasis: "조특령 §98의3①단서",
      });
    }
  }
  // 4) 양도 시점 — 시행일 게이트(US-20: 거주자 2009.3.25. / 비거주자 2009.5.21. 이후 양도)
  reasons.push(...unsold983TransferGateReasons(input.transferDate, input.residencyType));
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의3①).",
      legalBasis,
    });
  }
  // 5) 자격 토글 — 미분양 확인은 령 §98의3① 각 호 주택(=사업주체 취득)에만 해당한다.
  //    법 §98의3② 자기건설 신축주택은 령 §98의3⑤ 단서가 착공신고서 사본·사용승인 확인서류로
  //    증빙을 갈음하므로 미분양 확인 요건 자체가 적용되지 않는다.
  if (houseType === "purchased" && input.isUnsoldConfirmed !== true) {
    reasons.push({
      code: "NOT_UNSOLD_CONFIRMED",
      message: "미분양주택 요건(령 §98의3①1~8호 — 2009.2.11까지 분양계약 미체결 후 선착순 공급분, 2009.2.12 이후 입주자 계약일 도래분, 주택건설사업자·주택도시보증공사·시공자·기업구조조정리츠·건축주·신탁업자 공급분 등)이 확인되지 않았습니다 (조특령 §98의3①).",
      legalBasis: "조특령 §98의3①",
    });
  }
  if (houseType === "purchased" && input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체(20호 미만 주택건설사업자·시공자·기업구조조정리츠·건축주·신탁업자 포함)와 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (법 §98의3①).",
      legalBasis,
    });
  }
  if (houseType === "purchased" && input.isNotOccupiedAtContract !== true) {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message: "매매계약일 현재 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의3②1호).",
      legalBasis: "조특령 §98의3②1호",
    });
  }
  if (houseType === "purchased" && input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의3②2·3호).",
      legalBasis: "조특령 §98의3②2·3호",
    });
  }
  if (houseType === "self_built" && input.isNotExcludedSelfBuilt !== true) {
    reasons.push({
      code: "SELF_BUILT_EXCLUDED",
      message: "정비사업조합원이 관리처분계획에 따라 취득한 주택·멸실 후 재건축한 주택이 아님이 확인되지 않았습니다 (법 §98의3②단서).",
      legalBasis,
    });
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_3", reasons, legalBasis, rate, true);

  return computeHybridEffect({
    id: "unsold_98_3",
    legalBasis,
    articleLabel: isOvercon ? "조특법 §98의3① (수도권과밀억제권역 60%)" : "조특법 §98의3①",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의3③",
    rate,
    ruralSurtaxExempt: true, // 농특세령 §4⑦1호
  });
}

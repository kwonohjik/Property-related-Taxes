/**
 * 합산배제 추징 계산기 타입 (종합부동산세법 §17⑤1호 · 시행령 §10)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5
 */

import type { RentalExclusionInput } from "./comprehensive-exclusion.types";
import type { RecaptureAnnualInterest } from "./comprehensive.types";

/** §10③2호 — 말소 근거: 민간임대주택법 §6①11호(자진말소) · §6⑤(자동말소) · 그 밖 */
export type RecaptureCancelClause = "6①11호" | "6⑤" | "other";

/** §10③3호 — 당초 임대주택이 멸실돼 새로 취득하게 된 원인 */
export type RecaptureReplacementCause =
  | "redevelopment_reconstruction" // 도시정비법 재개발·재건축
  | "small_scale_redevelopment" //    빈집·소규모주택정비법 소규모주택정비사업
  | "remodeling"; //                  주택법 리모델링

/** §10③3호 가목 — 새 주택의 등록 신청 유형(종전 민간임대주택법 기준) */
export type RecaptureNewHousingApplicationKind =
  | "long_general_apartment_purchase" // 종전 장기일반민간임대 중 아파트를 임대하는 민간매입임대
  | "short_term" //                    종전 단기민간임대
  | "other";

/** §10③ 추징 배제 사유 입력 — 사유별로 필요한 사실이 다르다 */
export type RecaptureExemptionInput =
  /** 해당 없음 / §10③ 밖의 사유 */
  | { reason: "other" }
  /** §10③1호 — 최소 임대의무기간이 지난 뒤 5% 요건을 못 갖추게 됨 */
  | {
      reason: "rent_over_5pct";
      registrationType: RentalExclusionInput["registrationType"];
      /** 임대 기산일(§3⑦1호 — 최초 임대한 날) */
      rentalStartDate: Date;
      /** 지자체 등록 신청일 — 7호 나목·8호 가목2) 의무기간 8년/10년 구분(없으면 10년 + 확인 필요) */
      rentalApplicationDate?: Date;
      rentalRegistrationDate: Date;
      /** 5% 요건을 충족하지 않게 된 날(5% 초과 계약일) */
      ceasedDate: Date;
    }
  /** §10③2호 — 민간임대주택법 §6①11호·⑤에 따른 등록 말소 */
  | { reason: "registration_cancelled"; cancelClause: RecaptureCancelClause }
  /** §10③3호 — 정비사업·리모델링으로 새로 취득한 주택 */
  | {
      reason: "replacement_housing";
      cause: RecaptureReplacementCause;
      /** 당초 합산배제 임대주택이 단기민간임대주택이었는가(나목 괄호 — 단기면 모든 주택) */
      originalKind: "short_term" | "other";
      newHousing: {
        completionDate: Date;
        isApartment: boolean;
        registeredAsRental: boolean;
        /** 2020.7.11. 이후 등록 신청(변경신고 포함) 사실 — 가목. 없으면 null */
        application?: { kind: RecaptureNewHousingApplicationKind; date: Date } | null;
      };
    };

export type RecaptureExemptionClause = "10③1호" | "10③2호" | "10③3호 가목" | "10③3호 나목";

/** §10③ 추징 배제 판정 결과 */
export interface RecaptureExemptionResult {
  /** 추징하지 않는가 */
  exempt: boolean;
  /** 배제 근거 호(배제일 때만) */
  clause: RecaptureExemptionClause | null;
  /** 배제 근거 조문(배제일 때만) — `COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_*` */
  legalBasis: string | null;
  /**
   * 배제가 이 과세연도분부터만 적용된다 — 그 전 연도분은 추징한다(null이면 모든 연도).
   * 10·11호의 §10③1호: 2025.6.4. 이후 납세의무가 성립하는 경우부터(부칙<제35352호> §2②) → 2026년분부터.
   */
  fromTaxYear: number | null;
  /** 사유를 입력했으나 배제가 성립하지 않은 이유 */
  failReasons: string[];
  /** 확인 필요 안내 */
  notices: string[];
}

export interface RecaptureInput {
  /** 추징할 세액의 고지일(§10②1호의 종기) */
  noticeDate: Date;
  /** 연도별 경감받은 세액(§10①) — 연도는 중복 없이 */
  rows: { taxYear: number; amount: number }[];
  exemption: RecaptureExemptionInput;
}

export interface RecaptureResult {
  /**
   * 금액을 계산했는가 — 고지일이 이자 규정 시작(2009.2.4.) 전이면 false
   * (엔진은 던지지 않는다. 거부는 API Zod의 몫).
   */
  calculated: boolean;
  /** §10③에 따라 추징하지 않는가(true면 금액은 0) — 일부 연도만 배제되면 false이고 `exemptTaxYears`에 그 연도가 있다 */
  exempt: boolean;
  exemption: RecaptureExemptionResult;
  /** §10③에 따라 추징하지 않는 과세연도(입력 순서) — 전부 배제면 모든 연도, 배제가 아니면 빈 배열 */
  exemptTaxYears: number[];
  /** 추징 세액 합계(§10①) — 배제면 0 */
  totalRecoveryTax: number;
  /** 이자상당가산액(§10②) — 배제면 0 */
  interestAmount: number;
  totalPayable: number;
  recoveryPeriodYears: number;
  /** 연도별 산출근거(구간 포함) — 배제거나 계산 불가면 빈 배열 */
  annualInterest: RecaptureAnnualInterest[];
  /** 계산하지 못한 이유 */
  failReasons: string[];
  /** 확인 필요 안내(기한 이월·구간별 절사·공휴일 표 한계·배제 판정의 시기 등) */
  notices: string[];
}

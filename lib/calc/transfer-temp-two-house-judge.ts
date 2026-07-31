/**
 * 일시적 2주택 §155① 요건 UI 자동판정 — 입력단계 판정 카드용.
 *
 * 엔진 로직 단일소스 재사용:
 *  - 타이밍(1년·3년): `judgeTemporaryTwoHouseTiming` (transfer-tax-exemption.ts)
 *  - waiver(§154①1·2가·3호): `resolveExemptionProviso` + `TEMP_TWO_HOUSE_PROVISO_REASONS`
 * 산식 재정의 없음. 최종 비과세 판정은 계산 결과가 확정(이 카드는 입력단계 안내).
 */
import {
  judgeTemporaryTwoHouseTiming,
  resolveExemptionProviso,
} from "@/lib/tax-engine/transfer-tax-exemption";
import { TEMP_TWO_HOUSE_PROVISO_REASONS } from "@/lib/tax-engine/legal-codes/transfer";
import type { TemporaryTwoHouseDelayReason } from "@/lib/tax-engine/types/transfer.types";

/**
 * UI 판정 카드 표준 처분기한 — 2023.01.12 이후 양도분 3년(조정·비조정 공통, §155① 부칙).
 * 조정지역 종전 기한(2년, 2022-05-10 이전 양도)은 드물어 계산 결과에서 확정.
 */
export const TEMP_TWO_HOUSE_UI_DEADLINE_YEARS = 3;

/** §155⑯ 공공기관·법인 지방이전 — 「제1항 중 "3년"을 "5년"으로 본다」 */
export const PUBLIC_INSTITUTION_RELOCATION_UI_DEADLINE_YEARS = 5;

export type TempTwoHouseVerdict =
  | { status: "pending" } // 입력 부족 — 자산취득일·신규취득일·양도일 중 미입력
  | {
      status: "eligible" | "ineligible";
      oneYearThreshold: Date;
      oneYearMet: boolean;
      oneYearWaived: boolean;
      deadline: Date;
      threeYearMet: boolean;
      /** §155⑱ 사유로 기한 요건이 치유됐는지 — 카드가 "기한 초과이나 예외 적용"을 구분해 표시 */
      delayReasonApplied: boolean;
    };

/**
 * 폼 primitive → 일시적 2주택 요건 판정. previousAcquisitionDate는 양도 자산 취득일(단일소스).
 */
export function judgeTempTwoHouseFromForm(p: {
  previousAcquisitionDate: string; // = 양도 자산 취득일 (assets[0].acquisitionDate)
  newHouseAcquisitionDate: string;
  transferDate: string;
  // waiver 판정용 — mode=temporary_two_house에서 유효한 사유(1·2가·3호)만 실효
  provisoReason: string;
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  residencePeriodMonths: string;
  /** §155⑯ 공공기관 지방이전 — 기한 5년 + 1년 요건 면제 */
  publicInstitutionRelocation?: boolean;
  /** §155⑱ 처분기한 예외 사유 ("" = 해당 없음) */
  disposalDelayReason?: string;
}): TempTwoHouseVerdict {
  if (!p.previousAcquisitionDate || !p.newHouseAcquisitionDate || !p.transferDate) {
    return { status: "pending" };
  }
  const prev = new Date(p.previousAcquisitionDate);
  const nw = new Date(p.newHouseAcquisitionDate);
  const transfer = new Date(p.transferDate);
  // 부분 입력("2023-13-" 등) → Invalid Date → toISOString RangeError 방지: 유효하지 않으면 입력 부족 취급
  if ([prev, nw, transfer].some((d) => Number.isNaN(d.getTime()))) {
    return { status: "pending" };
  }

  // waiver — 엔진 resolveExemptionProviso 단일소스 재사용 (whitelist 사유 + proviso 조건충족)
  let oneYearWaived = false;
  if (p.provisoReason && TEMP_TWO_HOUSE_PROVISO_REASONS.has(p.provisoReason)) {
    const relax = resolveExemptionProviso({
      acquisitionDate: prev,
      transferDate: transfer,
      residencePeriodMonths: parseInt(p.residencePeriodMonths || "0", 10) || 0,
      wasRegulatedAtAcquisition: false, // resolveExemptionProviso 미사용 필드 — 타입 충족용
      oneHouseExemptionProviso: {
        reason: p.provisoReason as "rental_5yr_residence" | "expropriation" | "unavoidable",
        departureDate: p.provisoDepartureDate ? new Date(p.provisoDepartureDate) : undefined,
        expropriationDate: p.provisoExpropriationDate ? new Date(p.provisoExpropriationDate) : undefined,
        businessApprovalDate: p.provisoBusinessApprovalDate
          ? new Date(p.provisoBusinessApprovalDate)
          : undefined,
      },
    });
    oneYearWaived = relax === "both";
  }

  const t = judgeTemporaryTwoHouseTiming({
    previousAcquisitionDate: prev,
    newAcquisitionDate: nw,
    transferDate: transfer,
    // §155⑯이면 본문 "3년"이 "5년"으로 치환된다.
    deadlineYears: p.publicInstitutionRelocation
      ? PUBLIC_INSTITUTION_RELOCATION_UI_DEADLINE_YEARS
      : TEMP_TWO_HOUSE_UI_DEADLINE_YEARS,
    oneYearWaived,
    publicInstitutionRelocation: p.publicInstitutionRelocation,
    disposalDelayReason: (p.disposalDelayReason || undefined) as
      | TemporaryTwoHouseDelayReason
      | undefined,
  });

  return {
    status: t.overall ? "eligible" : "ineligible",
    oneYearThreshold: t.oneYearThreshold,
    oneYearMet: t.oneYearMet,
    // ⑯ 후단도 1년 면제 사유다 — 카드 문구가 "면제"를 표시해야 판정과 설명이 어긋나지 않는다.
    oneYearWaived: oneYearWaived || p.publicInstitutionRelocation === true,
    deadline: t.deadline,
    threeYearMet: t.threeYearMet,
    delayReasonApplied: !!p.disposalDelayReason,
  };
}

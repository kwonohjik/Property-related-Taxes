/**
 * 부득이한 사유 유예기간 사유별 법정기간 산정 (소득세법 시행령 §168조의14① + 시행규칙 §83조의5①)
 *
 * KoreanLaw 본문 검증(2026-06-16, mst=286211 §168조의14① · mst=286379 §83조의5①):
 * - §168조의14① 1~3호: event_window(사유 존속 기간 입력)
 * - §83조의5① 1·2·3·7·12호: event_window / 4호: 착공일~제공종료일 / 5호: 취득일+2년 ∪ 착공진행
 *   6·8·10·11호: 기산일+2년 / 9호: 멸실일+5년
 * - 단서: 부동산매매업 매매용부동산은 1·2호(건축허가·착공 제한) 배제.
 */
import { addYears } from "date-fns";
import type { DateInterval, GraceReasonCode } from "./types";

export type GraceLengthKind =
  | "fixed_from_anchor"   // 기산일 + N년
  | "event_window"        // 개시·종료 입력
  | "compound_5"          // 5호: 취득일+2년 ∪ 착공일~건설진행종료
  | "anchor_to_input_end"; // 4호: 착공일~제공종료일

export interface GraceReasonSpec {
  code: GraceReasonCode;
  lengthKind: GraceLengthKind;
  /** fixed_from_anchor의 N년 (6·8·10·11=2, 9=5) */
  fixedYears?: number;
  /** 기산일이 토지 취득일인 호(6호) — 사용자 입력 불요, ctx.acquisitionDate 사용 */
  anchorFromAcquisition?: boolean;
  /** §83의5① 단서 — 매매업 매매용부동산 배제 호(1·2호) */
  excludedForDealer: boolean;
  label: string;
  legalBasis: string;
}

export const GRACE_REASON_SPECS: Record<GraceReasonCode, GraceReasonSpec> = {
  // 시행령 §168조의14① 직접 (event_window)
  use_prohibited:        { code: "use_prohibited", lengthKind: "event_window", excludedForDealer: false, label: "법령상 사용 금지·제한", legalBasis: "소득세법 시행령 §168의14①1호" },
  protected_zone:        { code: "protected_zone", lengthKind: "event_window", excludedForDealer: false, label: "문화·자연유산 보호구역", legalBasis: "소득세법 시행령 §168의14①2호" },
  inherited_restricted:  { code: "inherited_restricted", lengthKind: "event_window", excludedForDealer: false, label: "사용제한 토지의 상속", legalBasis: "소득세법 시행령 §168의14①3호" },
  // 시행규칙 §83조의5① 1~12호
  building_permit_restricted:    { code: "building_permit_restricted", lengthKind: "event_window", excludedForDealer: true, label: "건축허가 제한 (1호)", legalBasis: "소득세법 시행규칙 §83의5①1호" },
  construction_start_restricted: { code: "construction_start_restricted", lengthKind: "event_window", excludedForDealer: true, label: "착공 제한 (2호)", legalBasis: "소득세법 시행규칙 §83의5①2호" },
  access_road:           { code: "access_road", lengthKind: "event_window", excludedForDealer: false, label: "사도·진입도로 (3호)", legalBasis: "소득세법 시행규칙 §83의5①3호" },
  public_open_space:     { code: "public_open_space", lengthKind: "anchor_to_input_end", excludedForDealer: false, label: "공공공지 제공 (4호)", legalBasis: "소득세법 시행규칙 §83의5①4호" },
  construction_in_progress: { code: "construction_in_progress", lengthKind: "compound_5", excludedForDealer: false, label: "건설 착공 (5호)", legalBasis: "소득세법 시행규칙 §83의5①5호" },
  mortgage_or_liquidation: { code: "mortgage_or_liquidation", lengthKind: "fixed_from_anchor", fixedYears: 2, anchorFromAcquisition: true, excludedForDealer: false, label: "저당권 실행·청산 분배 (6호)", legalBasis: "소득세법 시행규칙 §83의5①6호" },
  ownership_litigation:  { code: "ownership_litigation", lengthKind: "event_window", excludedForDealer: false, label: "소유권 소송 계속 (7호)", legalBasis: "소득세법 시행규칙 §83의5①7호" },
  urban_dev_buildable:   { code: "urban_dev_buildable", lengthKind: "fixed_from_anchor", fixedYears: 2, excludedForDealer: false, label: "도시개발 환지 건축가능 (8호)", legalBasis: "소득세법 시행규칙 §83의5①8호" },
  demolition:            { code: "demolition", lengthKind: "fixed_from_anchor", fixedYears: 5, excludedForDealer: false, label: "건축물 멸실·철거·붕괴 (9호)", legalBasis: "소득세법 시행규칙 §83의5①9호" },
  business_closure_relocation: { code: "business_closure_relocation", lengthKind: "fixed_from_anchor", fixedYears: 2, excludedForDealer: false, label: "휴·폐업·이전 (10호)", legalBasis: "소득세법 시행규칙 §83의5①10호" },
  natural_disaster_wasteland: { code: "natural_disaster_wasteland", lengthKind: "fixed_from_anchor", fixedYears: 2, excludedForDealer: false, label: "천재지변 황지화 (11호)", legalBasis: "소득세법 시행규칙 §83의5①11호" },
  other_justifiable:     { code: "other_justifiable", lengthKind: "event_window", excludedForDealer: false, label: "그 밖의 정당한 사유 (12호)", legalBasis: "소득세법 시행규칙 §83의5①12호" },
};

export interface GraceResolveContext {
  transferDate: Date;
  acquisitionDate: Date;
  isRealEstateDealerMatter: boolean;
}

/**
 * 사유코드·기산일·보조일 + ctx로 grace 구간 배열을 산출한다.
 * 단서 배제·기산일 부재 등 부적격이면 빈 배열. 종료일은 사유별 법정기간으로 자동 산정.
 */
export function resolveGraceIntervals(
  reasonCode: GraceReasonCode,
  anchorDate: Date | undefined,
  endDateInput: Date | undefined,
  secondaryDate: Date | undefined,
  ctx: GraceResolveContext,
): DateInterval[] {
  const spec = GRACE_REASON_SPECS[reasonCode];
  if (!spec) return [];
  // 단서: 부동산매매업 매매용부동산은 1·2호 가산 배제
  if (spec.excludedForDealer && ctx.isRealEstateDealerMatter) return [];

  switch (spec.lengthKind) {
    case "fixed_from_anchor": {
      const anchor = spec.anchorFromAcquisition ? ctx.acquisitionDate : anchorDate;
      if (!anchor || spec.fixedYears === undefined) return [];
      return [{ start: anchor, end: addYears(anchor, spec.fixedYears) }];
    }
    case "event_window":
    case "anchor_to_input_end": {
      // [개시일, 종료일] — 둘 다 입력 필수 (자동 안분 fallback 금지)
      if (!anchorDate || !endDateInput) return [];
      return [{ start: anchorDate, end: endDateInput }];
    }
    case "compound_5": {
      // 5호: [취득일, 취득일+2년] ∪ [착공일, 건설진행종료일(미입력 시 양도일까지 진행)]
      const intervals: DateInterval[] = [
        { start: ctx.acquisitionDate, end: addYears(ctx.acquisitionDate, 2) },
      ];
      if (secondaryDate) {
        intervals.push({ start: secondaryDate, end: endDateInput ?? ctx.transferDate });
      }
      return intervals;
    }
    default:
      return [];
  }
}

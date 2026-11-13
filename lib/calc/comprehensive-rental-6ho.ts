/**
 * 종부령 §3①6호 미분양매입임대주택 — 화면이 「무엇을 묻는가」의 단일 소스.
 * ⑤ 칸 표시(RentalExclusion6hoFields) · ⑧ 차단(validate6hoInputs) · ④ 전송(rental6hoApiFields)이 모두 `ho6Asks`를 쓴다.
 * 판정은 엔진 `lib/tax-engine/comprehensive-exclusion-6ho.ts` — 여기의 날짜 경계(2020.7.11.·2021 과세기준일)는 그 파일과 같아야 한다.
 * 가목 단서의 등록 신청일·아파트·변경신고 칸은 8호 나목 칸(store 필드)을 그대로 쓴다 — 6호에서는 `na8Asks`가 열지 않는다.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-6ho-unsold-purchase.plan.md
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import type { Na8Context } from "./comprehensive-rental-8na";

export const UNSOLD_6HO = "unsold_purchase";
/** 가목 단서 — 대통령령 제31085호(2020.10.7.) 부칙 §2 → 2021 과세기준일부터 */
const ERA_PROVISO = "2020-10-07";
const JULY_11_2020 = "2020-07-11";

export interface Ho6Asks {
  contract: boolean;
  /** 미분양 호수가 5호 미만일 때만 2·3·5호 호수를 묻는다 */
  otherUnits: boolean;
  kind: boolean;
  applicationDate: boolean;
  isApartment: boolean;
  converted: boolean;
  conversionDate: boolean;
}

const v = (s: string | undefined) => s ?? "";
const NO: Ho6Asks = {
  contract: false,
  otherUnits: false,
  kind: false,
  applicationDate: false,
  isApartment: false,
  converted: false,
  conversionDate: false,
};

/** 이 주택에서 물어야 하는 칸. 앞 칸 답에 따라 뒤 칸이 열린다(엔진의 판정 순서와 같다). */
export function ho6Asks(p: PropertyEntry, ctx: Na8Context): Ho6Asks {
  if (ctx.registrationType !== UNSOLD_6HO) return NO;
  const units = p.unsoldUnitCount;
  const proviso = ctx.assessmentDate >= ERA_PROVISO;
  const kind = p.rentalRegistrationKind ?? "";
  // 등록일이 7.11. 전이면 신청일도 그 전이다(신청일 ≤ 등록일) — 엔진 appliedAfterJuly11과 같은 규칙
  const regBefore = v(p.rentalRegistrationDate) !== "" && v(p.rentalRegistrationDate) < JULY_11_2020;
  const applicationDate = proviso && (kind === "short_term" || kind === "long_term_general") && !regBefore;
  const converted = proviso && (kind === "long_term_general" || kind === "public_support");
  return {
    contract: true,
    otherUnits: typeof units === "number" && units < 5,
    kind: proviso,
    applicationDate,
    // 2) 장기일반 — 신청일이 7.11. 이후일 때만 아파트 여부
    isApartment: applicationDate && kind === "long_term_general" && v(p.rentalApplicationDate) >= JULY_11_2020,
    converted,
    conversionDate: converted && p.convertedFromShortTerm === "yes",
  };
}

const tri = (s: "" | "yes" | "no" | undefined): boolean | null => (s === "yes" ? true : s === "no" ? false : null);

/** ④ — 6호일 때만 보낸다(다른 유형에서는 빈 객체 — 8호 나목 칸 값을 덮지 않는다). */
export function rental6hoApiFields(p: PropertyEntry, ctx: Na8Context) {
  if (ctx.registrationType !== UNSOLD_6HO) return {};
  const a = ho6Asks(p, ctx);
  return {
    unsoldContractDate: v(p.unsoldContractDate) || undefined,
    isUnsoldFirstComeSupply: tri(p.isUnsoldFirstComeSupply),
    unsoldDocsSubmitted: tri(p.unsoldDocsSubmitted),
    unsoldUnitCount: p.unsoldUnitCount,
    purchaseRental2hoCount: a.otherUnits ? p.purchaseRental2hoCount : undefined,
    existingRental3hoSameRegionCount: a.otherUnits ? p.existingRental3hoSameRegionCount : undefined,
    reitRental5hoCount: a.otherUnits ? p.reitRental5hoCount : undefined,
    rentalRegistrationKind: a.kind ? p.rentalRegistrationKind || undefined : undefined,
    rentalApplicationDate: a.applicationDate ? v(p.rentalApplicationDate) || undefined : undefined,
    isApartment: a.isApartment ? tri(p.isApartment) : undefined,
    convertedFromShortTerm: a.converted ? tri(p.convertedFromShortTerm) : undefined,
    shortTermConversionDate: a.conversionDate ? v(p.shortTermConversionDate) || undefined : undefined,
  };
}

const BASIS = "(종합부동산세법 시행령 §3①6호";

/** ⑧ — 보이는 칸이 비면 차단. 반환: 첫 오류 문구 또는 null. */
export function validate6hoInputs(p: PropertyEntry, ctx: Na8Context, label: string): string | null {
  const a = ho6Asks(p, ctx);
  if (!a.contract) return null;
  if (!v(p.unsoldContractDate)) return `${label}: 미분양주택 분양계약·계약금 납부일을 입력하세요 ${BASIS}).`;
  if (!p.isUnsoldFirstComeSupply) return `${label}: 선착순으로 공급된 미분양주택인지 고르세요 ${BASIS}).`;
  if (typeof p.unsoldUnitCount !== "number") {
    return `${label}: 같은 시·도의 미분양매입임대주택 호수를 입력하세요 ${BASIS} 후단·§3⑤).`;
  }
  if (
    a.otherUnits &&
    [p.purchaseRental2hoCount, p.existingRental3hoSameRegionCount, p.reitRental5hoCount].some((n) => typeof n !== "number")
  ) {
    return `${label}: 미분양매입임대가 5호 미만이면 2호·3호·5호 임대주택 호수를 입력하세요(없으면 0) ${BASIS} 후단).`;
  }
  if (!p.unsoldDocsSubmitted) return `${label}: 미분양주택 확인서·매매계약서 사본을 냈는지 고르세요 ${BASIS} 라목).`;
  if (a.kind && !p.rentalRegistrationKind) return `${label}: 민간임대주택 등록 종류를 고르세요 ${BASIS} 가목 단서).`;
  if (a.applicationDate && !v(p.rentalApplicationDate)) {
    return `${label}: 지자체 임대사업자 등록 신청일을 입력하세요 ${BASIS} 가목 단서 1)·2)).`;
  }
  if (a.isApartment && !p.isApartment) return `${label}: 아파트인지 고르세요 ${BASIS} 가목 단서 2)).`;
  if (a.converted && !p.convertedFromShortTerm) {
    return `${label}: 단기민간임대에서 변경신고한 주택인지 고르세요 ${BASIS} 가목 단서 3)).`;
  }
  if (a.conversionDate && !v(p.shortTermConversionDate)) {
    return `${label}: 단기 → 장기일반·공공지원 변경신고일을 입력하세요 ${BASIS} 가목 단서 3)).`;
  }
  return null;
}

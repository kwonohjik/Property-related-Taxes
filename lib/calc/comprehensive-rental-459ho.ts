/**
 * 종부령 §3①4호(미임대 민간건설·소유)·5호(부동산투자회사 2008 매입)·9호(분양전환공공임대 만료 후·소유) — 화면이 「무엇을 묻는가」의 단일 소스.
 * ⑤ 칸 표시(RentalExclusion459hoFields) · ⑧ 차단(validate459hoInputs) · ④ 전송(rental459hoApiFields)이 모두 `ho459`를 쓴다.
 * 판정은 엔진 `lib/tax-engine/comprehensive-exclusion-{4,5,9}ho.ts`. 빈 칸은 ⑧이 막는다(엔진은 「모름」=불성립).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

export type Ho459 = "4" | "5" | "9";
const HO_BY_TYPE: Record<string, Ho459> = {
  vacant_construction: "4",
  reit_purchase: "5",
  public_conversion_pending: "9",
};

/** 이 임대등록 유형이 4·5·9호인가. 아니면 null. */
export function ho459(registrationType: string): Ho459 | null {
  return HO_BY_TYPE[registrationType] ?? null;
}

/** §3① 각 호 외의 부분 「소유(제4호 또는 제9호)」 — 임대개시일을 묻지 않는다(선택) */
export function isOwnedRentalType(registrationType: string): boolean {
  const ho = ho459(registrationType);
  return ho === "4" || ho === "9";
}

/** 9호의 가격·30호 칸을 볼 바탕 유형(공공건설 1호 / 공공매입 2호). 9호가 아니면 받은 유형 그대로, 구분 모르면 null. */
export function priceRegistrationType(p: PropertyEntry, registrationType: string): string | null {
  if (registrationType !== "public_conversion_pending") return registrationType;
  if (p.conversionBase === "construction") return "public_construction";
  if (p.conversionBase === "purchase") return "public_purchase";
  return null;
}

const v = (s: string | undefined) => s ?? "";
const tri = (s: "" | "yes" | "no" | undefined): boolean | null => (s === "yes" ? true : s === "no" ? false : null);

/** ④ — 그 호일 때만 보낸다(다른 유형에서는 빈 객체 — 6호의 `reitRental5hoCount` 값을 덮지 않는다). */
export function rental459hoApiFields(p: PropertyEntry, registrationType: string) {
  const ho = ho459(registrationType);
  if (ho === "4") {
    return {
      usageApprovalDate: v(p.usageApprovalDate) || undefined,
      neverRentedSinceApproval: tri(p.neverRentedSinceApproval),
    };
  }
  if (ho === "5") {
    return {
      reitAcquisitionDate: v(p.reitAcquisitionDate) || undefined,
      reitRental5hoCount: p.reitRental5hoCount,
      reitPrice2008Under6eok: tri(p.reitPrice2008Under6eok),
    };
  }
  if (ho === "9") {
    return {
      conversionBase: p.conversionBase || undefined,
      isConversionPublicRental: tri(p.isConversionPublicRental),
      mandatoryPeriodEndDate: v(p.mandatoryPeriodEndDate) || undefined,
      conversionCompleted: tri(p.conversionCompleted),
    };
  }
  return {};
}

/** ⑧ — 보이는 칸이 비면 차단. 반환: 첫 오류 문구 또는 null. */
export function validate459hoInputs(p: PropertyEntry, registrationType: string, label: string): string | null {
  const ho = ho459(registrationType);
  if (!ho) return null;
  const basis = `(종합부동산세법 시행령 §3①${ho}호`;
  if (ho === "4") {
    if (!v(p.usageApprovalDate)) return `${label}: 사용승인일(사용검사필증을 받은 날)을 입력하세요 ${basis} 다목).`;
    if (!p.neverRentedSinceApproval) return `${label}: 사용승인 뒤 임대한 적이 있는지 고르세요 ${basis} 다목).`;
    return null;
  }
  if (ho === "5") {
    if (!v(p.reitAcquisitionDate)) return `${label}: 부동산투자회사 등이 취득한 날을 입력하세요 ${basis}).`;
    if (typeof p.reitRental5hoCount !== "number") return `${label}: 요건을 모두 갖춘 5호 매입임대주택 호수를 입력하세요 ${basis}).`;
    if (!p.reitPrice2008Under6eok) return `${label}: 2008년도 과세기준일 공시가격이 6억원 이하였는지 고르세요 ${basis} 가목).`;
    return null;
  }
  if (!p.conversionBase) return `${label}: 공공건설임대(1호)인지 공공매입임대(2호)인지 고르세요 ${basis}).`;
  if (!p.isConversionPublicRental) return `${label}: 분양전환공공임대주택인지 고르세요 ${basis}).`;
  if (!v(p.mandatoryPeriodEndDate)) return `${label}: 임대의무기간 만료일을 입력하세요 ${basis}).`;
  if (!p.conversionCompleted) return `${label}: 분양전환이 이루어졌는지 고르세요 ${basis}).`;
  return null;
}

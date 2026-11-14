/**
 * 소령 §167의3⑪ 기한 연장 사실 — ⑤ 노출 · ④ 전송 · ⑧ 검증의 **단일 술어** (2호·3호·§155⑳ 공용).
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「⑪ 제1항제2호가목2)ㆍ나목2)ㆍ라목8)ㆍ마목4) 및 같은 항 제3호
 * 후단에 따른 기한은 2027년 12월 31일로 한다. 다만, 해당 주택이 다음 각 호의 어느 하나에 해당하는 주택인
 * 경우에는 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 *
 * 입력은 3-state다(`AptDeadlineExtensionForm.status`) — 「모름」(기본 · 엔진은 기한 2027.12.31. + 확인 필요 고지) / 「연장 사유 없음」
 * (엔진 `confirmedNone` · 기한 2027.12.31. 확정) / 「연장 사유 있음」(날짜). 날짜와 「없음」은 상호 배타다 —
 * 값 정리는 ⑤ onChange가 하고(useEffect 미러링 금지), ④도 상태에 맞는 값만 싣는다.
 */
import { APT_DEADLINE_GATED_ARTICLES } from "@/lib/tax-engine/rental-article/rules";
import { judgeRental974AptDeadline } from "@/lib/tax-engine/transfer-reductions/rental-97-4-apt-deadline";
import { saMokTransferDeadline } from "@/lib/tax-engine/rental-article/rules";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { ARTICLE_BY_RENTAL_TYPE } from "@/lib/tax-engine/multi-house-surcharge-count";
import {
  deriveRentalArticle,
  isTerminationEligibleArticle,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { rentalUnitRegApplicationDate } from "./rental-succession";
import type { SharedRentalArticle } from "@/lib/tax-engine/rental-article/types";
import type { AptDeadlineExtensionForm, RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type AptDeadlineExtensionStatus = "unknown" | "none" | "has";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

const DATE_KEYS = [
  "dutyPeriodEndCancellationDate",
  "newRegulatedAreaAnnouncementDate",
  "relocationAnnouncementDate",
  "relocationAuthorizationDate",
] as const;

/**
 * ⑪3호 사업 사실이 있는가 — 인가·지정일 · 이전고시일 · 「이전고시 전」(엔진 `hasRelocationFact`의 폼판).
 * ⑤ 단서(협의·수용재결·매도청구소송) 질문 노출 · ④ 단서 전송 · ⑫ refine이 같은 조건을 쓴다.
 */
export function aptDeadlineRelocationFactPresent(ext: AptDeadlineExtensionForm | undefined): boolean {
  return !!(ext?.relocationAuthorizationDate || ext?.relocationAnnouncementDate || ext?.relocationNotYetAnnounced);
}

/** 「있음」의 근거가 되는 사실 — 날짜 하나 이상 또는 3호 「이전고시 전」 */
const hasAnyDate = (ext: AptDeadlineExtensionForm) =>
  DATE_KEYS.some((k) => !!ext[k]) || ext.relocationNotYetAnnounced === true;

/**
 * 폼 값 → 3-state. `status`가 없고 날짜만 있으면(#1914 저장분) 「있음」으로 읽는다 — ⑤·④·⑧이 같은 해석을 쓴다.
 */
export function aptDeadlineExtensionStatus(ext: AptDeadlineExtensionForm | undefined): AptDeadlineExtensionStatus {
  if (!ext) return "unknown";
  if (ext.status === "none") return "none";
  if (ext.status === "has" || hasAnyDate(ext)) return "has";
  return "unknown";
}

/** ⑤ 상태 전환 — 「없음」·「모름」은 날짜를 버리고, 「있음」은 남긴다(상호 배타 · onChange에서 정리). */
export function withAptDeadlineExtensionStatus(
  ext: AptDeadlineExtensionForm | undefined,
  next: AptDeadlineExtensionStatus,
): AptDeadlineExtensionForm | undefined {
  if (next === "unknown") return undefined;
  if (next === "none") return { status: "none" };
  return { ...ext, status: "has" };
}

/**
 * ④⑬ 엔진 `AptTransferDeadlineExtension`의 본문 모양. 「모름」·날짜 없는 「있음」은 키를 만들지 않는다
 * (엔진이 「모름」으로 읽어 기한 2027.12.31. + 확인 필요 고지 — 「있음」+빈 날짜는 ⑧이 막는다).
 */
export function aptDeadlineExtensionPayload(
  ext: AptDeadlineExtensionForm | undefined,
):
  | {
      confirmedNone?: true;
      dutyPeriodEndCancellationDate?: string;
      newRegulatedAreaAnnouncementDate?: string;
      relocationAnnouncementDate?: string;
      relocationAuthorizationDate?: string;
      relocationNotYetAnnounced?: true;
      relocationExpropriationTransfer?: boolean;
    }
  | undefined {
  const status = aptDeadlineExtensionStatus(ext);
  if (status === "none") return { confirmedNone: true };
  if (status !== "has" || !ext || !hasAnyDate(ext)) return undefined;
  const notYet = ext.relocationNotYetAnnounced === true;
  return {
    dutyPeriodEndCancellationDate: ext.dutyPeriodEndCancellationDate || undefined,
    newRegulatedAreaAnnouncementDate: ext.newRegulatedAreaAnnouncementDate || undefined,
    // 「이전고시 전」이면 이전고시일을 싣지 않는다(상호 배타 — ⑫ refine과 짝)
    relocationAnnouncementDate: notYet ? undefined : ext.relocationAnnouncementDate || undefined,
    relocationAuthorizationDate: ext.relocationAuthorizationDate || undefined,
    relocationNotYetAnnounced: notYet ? true : undefined,
    relocationExpropriationTransfer: aptDeadlineRelocationFactPresent(ext) ? ext.relocationExpropriationTransfer : undefined,
  };
}

/**
 * ⑧ 「연장 사유 있음」 입력이 덜 됐다 — 고칠 방법(문구)을 돌려준다. 완결이면 null.
 * - 사실(날짜 · 「이전고시 전」)이 하나도 없다: 그대로 보내면 「모름」으로 읽혀 선택이 조용히 사라진다.
 * - 3호 사업 사실은 있는데 이전고시일도 「이전고시 전」도 없다: 3호 기한을 정할 수 없다(사용자 결정 2026-10-04 —
 *   필수 입력 · ⑫ refine이 같은 조건으로 400).
 */
export function aptDeadlineExtensionIncomplete(ext: AptDeadlineExtensionForm | undefined): string | null {
  if (aptDeadlineExtensionStatus(ext) !== "has" || !ext) return null;
  if (!hasAnyDate(ext)) return "연장 사유를 하나 이상 입력하거나 「모름」·「연장 사유 없음」을 고르세요.";
  if (aptDeadlineRelocationFactPresent(ext) && !ext.relocationAnnouncementDate && !ext.relocationNotYetAnnounced) {
    return "3호 이전고시일을 입력하거나 「양도일 현재 이전고시 전」을 켜세요.";
  }
  return null;
}

const isGated = (article: SharedRentalArticle) => APT_DEADLINE_GATED_ARTICLES.includes(article);

/**
 * 2호(다주택 중과 축) — 명부 행·양도 주택 선언이 ⑪ 게이트 대상인가: 장기임대 선언 + 아파트 + 유형 가·나·라·마.
 * 사목(G)은 같은 목의 자체 양도기한이 대체한다(가목2) 단서 등) — 대상 아님. 유형 미선택(legacy)도 목을 모르므로 아님.
 */
export function rentalDeclarationAptDeadlineInScope(d: RentalDeclaration | undefined): boolean {
  return rentalDeclarationUrbanLifeQuestionInScope(d) && d?.isUrbanLifeHousingApartment !== true;
}

/**
 * 2호 — 「도시형 생활주택인 아파트인가」를 묻는 선언: 위 ⑪ 게이트 범위와 같다(가목2) 괄호 「도시형 생활주택인 아파트는 제외한다.
 * 이하 이 목, 나목2)ㆍ라목8) 및 마목4)에서 같다」가 바로 이 양도기한에만 걸린다). 「예」면 ⑪ 연장 사실은 묻지도 싣지도 않는다
 * (엔진 `check.ts` (m) 게이트 · `toNormalizedFromHouse`와 같은 조건). ⑤·④가 같은 술어를 쓴다.
 */
export function rentalDeclarationUrbanLifeQuestionInScope(d: RentalDeclaration | undefined): boolean {
  if (!d?.isLongTermRental || !d.isApartment || !d.rentalType) return false;
  return isGated(ARTICLE_BY_RENTAL_TYPE[d.rentalType]);
}

/**
 * §155⑳ 임대주택 카드 — 「도시형 생활주택인 아파트인가」를 묻는 호: 도출 목이 가·나·라·마 + 아파트 + §155㉓ 말소 경로가
 * 아님. 가목2) 괄호(「도시형 생활주택인 아파트는 제외한다. 이하 이 목, 나목2)ㆍ라목8) 및 마목4)에서 같다」)가 바로 이
 * 양도기한에만 걸리므로 범위가 양도기한 게이트와 같다. ⑤ 노출 · ④ 전송이 같은 술어를 쓴다.
 */
export function rentalUnitUrbanLifeQuestionInScope(u: RentalUnitForm | undefined): boolean {
  if (!u?.isApartment) return false;
  // 증여 승계는 증여자 등록 기준(G-3) — 엔진 `registrationBasis`와 같은 술어
  const article = deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, rentalUnitRegApplicationDate(u));
  if (!isGated(article)) return false;
  return !(u.rentalAutoTermination && isTerminationEligibleArticle(article));
}

/**
 * §155⑳ 임대주택 카드 — ⑪ 연장 사실을 묻는 호: 위 범위 + 도시형 생활주택인 아파트가 아님(엔진 `check.ts` (m) 게이트와 같은 조건 ·
 * ㉓ 말소 경로는 엔진 `skipAptTransferDeadlineGate`와 같은 조건). ⑤·④·⑧이 같은 술어를 쓴다.
 */
export function rentalUnitAptDeadlineInScope(u: RentalUnitForm | undefined): boolean {
  return rentalUnitUrbanLifeQuestionInScope(u) && u?.isUrbanLifeHousingApartment !== true;
}

/** §97의4 폼 중 가목2) 기한 판정에 쓰는 칸 */
export type Rental974DeadlineFormFacts = {
  rental974Category: string;
  isAutoCancelled974?: boolean;
  autoCancelledDate974?: string;
  isVoluntaryCancelled974?: boolean;
  voluntaryCancelledDate974?: string;
};

const ymd = (s?: string): Date | undefined => toOptionalDate(s);
const autoCancelOf = (r: Rental974DeadlineFormFacts) => (r.isAutoCancelled974 ? ymd(r.autoCancelledDate974) : undefined);
const voluntaryCancelOf = (r: Rental974DeadlineFormFacts) =>
  r.isVoluntaryCancelled974 ? ymd(r.voluntaryCancelledDate974) : undefined;

/**
 * 가목2) 단서 — 자진말소일이 사목 양도기한을 만드는가(2020.8.18. 이후 말소). 그러면 ⑪ 연장 사실은 쓰이지 않는다
 * (⑤ 연장 칸 숨김 · ⑧ 연장 입력 검사 생략 — 엔진 `judgeRental974AptDeadline`과 같은 분기).
 */
export function rental974SaMokApplies(r: Rental974DeadlineFormFacts): boolean {
  const v = voluntaryCancelOf(r);
  return r.rental974Category === "purchase_a" && v !== undefined && saMokTransferDeadline(v) !== null;
}

/**
 * 조특법 §97의4 감면 폼 — 소령 §167의3①2호 가목2) 아파트 여부가 **필수**인가(⑧ · ⑤ 미선택 경고).
 * 가목(민간매입) + 양도일이 아파트 여부를 모를 때의 기한 뒤 — 엔진 `MISSING_APARTMENT_974`와 같은 판정
 * (`judgeRental974AptDeadline` · 아파트 여부를 모르면 ④가 ⑪ 연장 사실을 싣지 않으므로 자동말소(⑪1호)·자진말소(사목)만 본다).
 * 질문 자체는 가목이면 늘 보이고(④도 가목이면 싣는다) 양도일로 숨기지 않는다 — 감면 변환(④)이 양도일을 모른다.
 */
export function rental974ApartmentAnswerRequired(r: Rental974DeadlineFormFacts, transferDate: string | undefined): boolean {
  const t = ymd(transferDate);
  if (r.rental974Category !== "purchase_a" || !t) return false;
  return !judgeRental974AptDeadline(t, {
    autoCancelledDate: autoCancelOf(r),
    voluntaryCancelledDate: voluntaryCancelOf(r),
  }).within;
}

/**
 * ⑧ §97의4 가목2) 입력 미완 — 고칠 칸과 문구. 완결이면 null.
 * - 아파트 여부 미선택: `rental974ApartmentAnswerRequired`일 때만(엔진 `MISSING_APARTMENT_974`와 같은 조건)
 * - 「연장 사유 있음」 입력 미완: 가목 + 아파트 + 사목 아님일 때(⑤ 노출과 같은 범위 — 미완 3호는 ⑫ refine이 400으로 막는다)
 */
export function rental974AptDeadlineIssue(
  r: Rental974DeadlineFormFacts & { isApartment974?: string; aptDeadlineExtension974?: AptDeadlineExtensionForm },
  transferDate: string | undefined,
): { key: "isApartment974" | "aptDeadlineExtension974"; message: string } | null {
  if (r.rental974Category !== "purchase_a") return null;
  if (!r.isApartment974 && rental974ApartmentAnswerRequired(r, transferDate)) {
    return {
      key: "isApartment974",
      message:
        "양도일이 아파트 양도기한(2027.12.31. 등 — 자진말소했으면 말소일부터 1년) 뒤입니다 — 아파트(도시형 생활주택 제외)인지 선택하세요 (소령 §167의3①2호 가목2)).",
    };
  }
  if (rental974SaMokApplies(r)) return null;
  const ext = r.isApartment974 === "yes" ? aptDeadlineExtensionIncomplete(r.aptDeadlineExtension974) : null;
  return ext ? { key: "aptDeadlineExtension974", message: `아파트 양도기한 연장 사유(소령 §167의3⑪) — ${ext}` } : null;
}

/**
 * 소령 §167의3⑪ 기한 연장 사실 — ⑤ 노출 · ④ 전송 · ⑧ 검증의 **단일 술어** (2호·3호·§155⑳ 공용).
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「⑪ 제1항제2호가목2)ㆍ나목2)ㆍ라목8)ㆍ마목4) 및 같은 항 제3호
 * 후단에 따른 기한은 2027년 12월 31일로 한다. 다만, 해당 주택이 다음 각 호의 어느 하나에 해당하는 주택인
 * 경우에는 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 *
 * 입력은 3-state다(`AptDeadlineExtensionForm.status`) — 「모름」(기본 · 엔진 판정 보류) / 「연장 사유 없음」
 * (엔진 `confirmedNone` · 기한 2027.12.31. 확정) / 「연장 사유 있음」(날짜). 날짜와 「없음」은 상호 배타다 —
 * 값 정리는 ⑤ onChange가 하고(useEffect 미러링 금지), ④도 상태에 맞는 값만 싣는다.
 */
import { APT_DEADLINE_GATED_ARTICLES } from "@/lib/tax-engine/rental-article/rules";
import { ARTICLE_BY_RENTAL_TYPE } from "@/lib/tax-engine/multi-house-surcharge-count";
import {
  deriveEffectiveRegDate,
  deriveRentalArticle,
  isTerminationEligibleArticle,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { SharedRentalArticle } from "@/lib/tax-engine/rental-article/types";
import type { AptDeadlineExtensionForm, RentalDeclaration } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type AptDeadlineExtensionStatus = "unknown" | "none" | "has";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

const DATE_KEYS = [
  "dutyPeriodEndCancellationDate",
  "newRegulatedAreaAnnouncementDate",
  "relocationAnnouncementDate",
] as const;

const hasAnyDate = (ext: AptDeadlineExtensionForm) => DATE_KEYS.some((k) => !!ext[k]);

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
 * (엔진이 「모름」으로 읽어 판정 보류 — 「있음」+빈 날짜는 ⑧이 막는다).
 */
export function aptDeadlineExtensionPayload(
  ext: AptDeadlineExtensionForm | undefined,
): { confirmedNone?: true; dutyPeriodEndCancellationDate?: string; newRegulatedAreaAnnouncementDate?: string; relocationAnnouncementDate?: string } | undefined {
  const status = aptDeadlineExtensionStatus(ext);
  if (status === "none") return { confirmedNone: true };
  if (status !== "has" || !ext || !hasAnyDate(ext)) return undefined;
  return {
    dutyPeriodEndCancellationDate: ext.dutyPeriodEndCancellationDate || undefined,
    newRegulatedAreaAnnouncementDate: ext.newRegulatedAreaAnnouncementDate || undefined,
    relocationAnnouncementDate: ext.relocationAnnouncementDate || undefined,
  };
}

/** ⑧ 「연장 사유 있음」을 골랐는데 날짜가 하나도 없다 — 그대로 보내면 「모름」으로 읽혀 선택이 조용히 사라진다. */
export function aptDeadlineExtensionDatesMissing(ext: AptDeadlineExtensionForm | undefined): boolean {
  return aptDeadlineExtensionStatus(ext) === "has" && !!ext && !hasAnyDate(ext);
}

const isGated = (article: SharedRentalArticle) => APT_DEADLINE_GATED_ARTICLES.includes(article);

/**
 * 2호(다주택 중과 축) — 명부 행·양도 주택 선언이 ⑪ 게이트 대상인가: 장기임대 선언 + 아파트 + 유형 가·나·라·마.
 * 사목(G)은 같은 목의 자체 양도기한이 대체한다(가목2) 단서 등) — 대상 아님. 유형 미선택(legacy)도 목을 모르므로 아님.
 */
export function rentalDeclarationAptDeadlineInScope(d: RentalDeclaration | undefined): boolean {
  if (!d?.isLongTermRental || !d.isApartment || !d.rentalType) return false;
  return isGated(ARTICLE_BY_RENTAL_TYPE[d.rentalType]);
}

/**
 * §155⑳ 임대주택 카드 — 도출 목이 가·나·라·마 + 아파트 + §155㉓ 말소 경로가 아님(㉓은 이 요건을 적용하지
 * 않는다 — 엔진 `skipAptTransferDeadlineGate`와 같은 조건).
 */
export function rentalUnitAptDeadlineInScope(u: RentalUnitForm | undefined): boolean {
  if (!u?.isApartment) return false;
  const effReg =
    u.businessRegistrationDate && u.rentalRegistrationDate
      ? deriveEffectiveRegDate({
          businessRegistrationDate: new Date(u.businessRegistrationDate),
          rentalRegistrationDate: new Date(u.rentalRegistrationDate),
        })
      : null;
  const article = deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, effReg);
  if (!isGated(article)) return false;
  return !(u.rentalAutoTermination && isTerminationEligibleArticle(article));
}

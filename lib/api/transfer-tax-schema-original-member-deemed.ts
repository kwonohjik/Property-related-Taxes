/**
 * ⑫ 원조합원(재개발·재건축 종전자산) 상속·증여 — 의제취득일 이후면 §163⑨ 평가액(①) 또는 §164④~⑦(②)이 있어야 한다
 * (⑧ `originalMemberClauseARequiredError`의 거울).
 *
 * 종전자산 취득가액은 영 §166① 「기존건물과 그 부수토지의 취득가액」이고, 상속·증여받은 것이면 영 §163⑨가 평가액을 실지거래가액으로 본다.
 * 평가액 채널 없이 오면 엔진이 「종전 부동산 실거래가」(`redevelopment` 취득가액 · 피상속인·증여자 쪽 금액)를 그대로 썼다
 * (실측: 단건 입주권 상속 413,535,000 ↔ 334,290,000 · 완공 아파트 291,310,000 ↔ 232,510,000 · 컴패니언 입주권 400,035,000 ↔ 283,050,000).
 *
 * - 단건: `inheritedAcquisition.reportedValue > 0`(④는 상속 공시가격·증여 신고가액을 여기 싣는다) 또는 `inheritedHouseValuation` 또는
 *   `pre1990Land`(토지 출자 · §164④ — 계획서 §16).
 * - 컴패니언 상속: `inheritanceValuation.publishedValueAtInheritance > 0` 또는 `inheritedHouseValuation`. 컴패니언 증여: `fixedAcquisitionPrice > 0`(증여 신고가액).
 * 의제취득일 전은 §166③ 3자 max 설계라, 부담부증여는 §159가 정해서, 승계조합원은 자기 규칙이 있어서 대상이 아니다.
 * ⚠️ 다건(`/api/calc/transfer/multi`)에는 걸지 않는다 — 다건 ④는 §163⑨ 페이로드 없이 `acquisitionPrice`에 평가액을 싣는다(확인 필요).
 * 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §14·§15.
 */
import { z } from "zod";
import { DEEMED_ACQUISITION_DATE } from "@/lib/calc/transfer-163-9-base-date";

type RedevLike = { isSuccessorMember?: boolean; originalAssetType?: string } | null | undefined;

type OriginalMemberLike = {
  acquisitionCause?: string;
  transferType?: string;
  burdenedGiftInfo?: unknown;
  isSuccessorRightToMoveIn?: boolean;
  redevelopment?: RedevLike;
  acquisitionDate?: string;
  inheritedHouseValuation?: unknown;
  pre1990Land?: unknown;
};

const isOriginalMemberDeemed = (kind: string | undefined, d: OriginalMemberLike, baseDate: string | undefined) =>
  (kind === "right_to_move_in" || kind === "redevelopment_apt") &&
  d.redevelopment != null &&
  d.isSuccessorRightToMoveIn !== true &&
  d.redevelopment.isSuccessorMember !== true &&
  (d.acquisitionCause === "inheritance" || d.acquisitionCause === "gift") &&
  d.transferType !== "burdened_gift" &&
  d.burdenedGiftInfo == null &&
  !!baseDate &&
  baseDate >= DEEMED_ACQUISITION_DATE;

const message = (cause: string | undefined, key: string) =>
  `${cause === "gift" ? "증여" : "상속"}받은 종전 부동산(원조합원)의 취득가액은 ${cause === "gift" ? "증여일" : "상속개시일"} 현재 평가액입니다 — ${key}(또는 §164④ pre1990Land · §164⑤~⑦ inheritedHouseValuation)가 필요하고, 종전 부동산 실거래가로는 계산하지 않습니다 (소득세법 시행령 §163⑨·§166①)`;

/** 단건 주 자산 */
export function refineOriginalMemberDeemedPrimary(
  d: OriginalMemberLike & { propertyType?: string; inheritedAcquisition?: { inheritanceStartDate?: string; reportedValue?: number } | null },
  ctx: z.RefinementCtx,
): void {
  const baseDate = d.inheritedAcquisition?.inheritanceStartDate ?? d.acquisitionDate;
  if (!isOriginalMemberDeemed(d.propertyType, d, baseDate)) return;
  if ((d.inheritedAcquisition?.reportedValue ?? 0) > 0 || d.inheritedHouseValuation != null || d.pre1990Land != null) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["inheritedAcquisition", "reportedValue"],
    message: message(d.acquisitionCause, "inheritedAcquisition.reportedValue"),
  });
}

/** 함께 양도 컴패니언 */
export function refineOriginalMemberDeemedCompanion(
  c: OriginalMemberLike & {
    assetKind?: string;
    fixedAcquisitionPrice?: number;
    inheritanceValuation?: { inheritanceDate?: string; publishedValueAtInheritance?: number } | null;
  },
  ctx: z.RefinementCtx,
  prefix: (string | number)[],
): void {
  const baseDate = c.inheritanceValuation?.inheritanceDate ?? c.acquisitionDate;
  if (!isOriginalMemberDeemed(c.assetKind, c, baseDate)) return;
  if (c.inheritedHouseValuation != null) return;
  const isGift = c.acquisitionCause === "gift";
  const value = isGift ? c.fixedAcquisitionPrice : c.inheritanceValuation?.publishedValueAtInheritance;
  if ((value ?? 0) > 0) return;
  const key = isGift ? "fixedAcquisitionPrice" : "inheritanceValuation.publishedValueAtInheritance";
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...prefix, ...key.split(".")],
    message: message(c.acquisitionCause, key),
  });
}

/**
 * ⑫ 원조합원 ② 채널 ↔ 출자 자산 종류 (단건) — 토지를 출자했으면 상속·증여받은 것은 토지라 ②는 §164④(`pre1990Land`)이고,
 * 주택을 출자했으면 §164⑤~§164⑦(`inheritedHouseValuation`)이다. 엔진은 `inheritedAcquisition.assetKind`로 축을 고른다.
 * 어긋난 직접 호출을 막는다(실측: 주택 출자 + `assetKind: land` + `pre1990Land` → §164④ 480,000,000 채택 · 토지 출자 완공 아파트 +
 * 주택 ② → §164⑦ 채택 86,143,333). 의제취득일·취득원인과 무관하다(채널 자체가 그 축의 것). 계획서 successor-right-carryover-contribution.plan.md §16 Q-2.
 */
export function refineOriginalMemberSec164Channel(
  d: OriginalMemberLike & { propertyType?: string; inheritedAcquisition?: { assetKind?: string } | null },
  ctx: z.RefinementCtx,
): void {
  const kind = d.propertyType;
  if (kind !== "right_to_move_in" && kind !== "redevelopment_apt") return;
  if (d.redevelopment == null || d.redevelopment.isSuccessorMember === true || d.isSuccessorRightToMoveIn === true) return;
  const original = d.redevelopment.originalAssetType;
  const iaKind = d.inheritedAcquisition?.assetKind;
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (original === "land") {
    const why = "토지를 출자한 원조합원의 종전자산은 토지입니다 — ②는 §164④(pre1990Land)이고";
    if (d.inheritedHouseValuation != null) issue(["inheritedHouseValuation"], `${why} §164⑤~⑦(주택)은 쓰지 않습니다 (소득세법 시행령 §163⑨1호·§166①)`);
    if (iaKind !== undefined && iaKind !== "land") issue(["inheritedAcquisition", "assetKind"], `${why} inheritedAcquisition.assetKind는 "land"여야 합니다 (소득세법 시행령 §163⑨1호)`);
  } else if (original === "housing") {
    const why = "주택을 출자한 원조합원의 종전자산은 주택입니다 — ②는 §164⑤~§164⑦(inheritedHouseValuation)이고";
    if (d.pre1990Land != null) issue(["pre1990Land"], `${why} 토지 §164④(pre1990Land)는 쓰지 않습니다 (소득세법 시행령 §163⑨2호·§166①)`);
    if (iaKind === "land") issue(["inheritedAcquisition", "assetKind"], `${why} inheritedAcquisition.assetKind는 주택이어야 합니다 (소득세법 시행령 §163⑨2호)`);
  }
}

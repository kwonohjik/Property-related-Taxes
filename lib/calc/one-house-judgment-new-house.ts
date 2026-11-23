/**
 * 판정 메뉴 §155① 신규 주택 도출 — 엔진 입장 짝(⑤ 카드·⑧·④ `temporaryTwoHouse`)과 양론 반대 입장 짝(④ `contestedTemporaryTwoHouse` · 2026-11 리뷰 D-79 안 A).
 * 두 짝은 같은 정본(`resolveTemporaryTwoHouse`)에 같은 인자를 넘기고 신규 주택 후보에서 빼는 행만 다르다.
 */
import { resolveTemporaryTwoHouse, type TemporaryTwoHouseDates } from "@/lib/calc/household-house-count";
import { declaredNewHouseOriginOf } from "@/lib/calc/declared-new-house-origin";
import { mergeContextOf } from "@/lib/calc/merge-house-origin";
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { temporaryTwoHouseCandidateExcludedIds } from "./temp-two-house-candidate-exclusion";
import { rentalResidenceCandidateHouseIds } from "./temp-two-house-candidate-exclusion";
import { contestedPairExcludedHouseIds } from "./temp-two-house-candidate-exclusion";
import { contestedGiftedPairExcludedHouseIds } from "./temp-two-house-candidate-exclusion";

/** §155① 신규 주택 — 명부에서 도출(④ 변환과 같은 정본 `resolveTemporaryTwoHouse`). */
export function judgmentDerivedNewHouse(form: OneHouseJudgmentFormData): TemporaryTwoHouseDates | undefined {
  return resolveJudgmentTemporaryTwoHouse(form, temporaryTwoHouseCandidateExcludedIds(form));
}

/**
 * 양론 C2·C7 **반대 입장**의 §155① 짝(2026-11 리뷰 D-79 안 A) — 엔진 입장 제외 행에 반대 입장이 더 빼는 행을 합쳐 같은 정본으로 다시 도출한다.
 * 쟁점이 없거나 주택 양도가 아니면 `undefined`(④가 키를 싣지 않는다), 다시 도출했는데 짝이 없으면 `null`.
 * 「일반주택보다 나중에 상속한 소수지분 + 신규주택」은 엔진 입장에서 나중 취득 행이 2채 이상이라 짝이 없고, 반대 입장에서만 짝이 선다.
 */
export function judgmentContestedNewHouse(form: OneHouseJudgmentFormData): TemporaryTwoHouseDates | null | undefined {
  if (!judgmentSaleIsHousing(form)) return undefined;
  const extra = contestedPairExcludedHouseIds(form);
  if (extra.size === 0) return undefined;
  return resolveJudgmentTemporaryTwoHouse(form, new Set([...temporaryTwoHouseCandidateExcludedIds(form), ...extra])) ?? null;
}

/**
 * 양론 C1(상속주택 지분 동일세대원 증여) **반대 입장(A)**의 §155① 짝(D-79 C1 변형) — 엔진 입장의 상속주택 제외 대신 A의 제외로 같은 정본을 다시 부른다.
 * A는 증여한 행을 일반 주택으로 보아 그 행(별도세대 상속)이 신규 주택 후보로 돌아온다. 쟁점이 없거나 주택 양도가 아니면 `undefined`, 짝이 없으면 `null`.
 */
export function judgmentContestedGiftedNewHouse(form: OneHouseJudgmentFormData): TemporaryTwoHouseDates | null | undefined {
  if (!judgmentSaleIsHousing(form)) return undefined;
  const excluded = contestedGiftedPairExcludedHouseIds(form);
  if (!excluded) return undefined;
  // 상속받은 주택의 취득시기는 상속개시일이다(「소득세법 시행령」 §162①5호). 행 「취득일」에 피상속인 취득일을 넣었으면(상속개시일보다 앞)
  //   신규 주택 선후·기한을 상속개시일로 본다 — 둘 중 늦은 날(조합원 권리를 상속받아 나중에 준공된 행은 준공일이 늦다).
  const houses = form.houses?.map((h) =>
    h.isInherited && h.inheritedGiftedToHouseholdMember && h.inheritedDate && h.inheritedDate > (h.acquisitionDate ?? "")
      ? { ...h, acquisitionDate: h.inheritedDate }
      : h,
  );
  return resolveJudgmentTemporaryTwoHouse({ ...form, houses }, excluded) ?? null;
}

/**
 * §155①2호 연혁 사실(폼 전역 칸 — 신규 주택 취득 당시 조정 여부·계약일·세대전원 전입일·임차인)이 가리키는 짝 — 엔진 입장 짝, 없으면 양론 반대 입장 짝
 * (C2·C7 → C1). 반대 입장 짝도 ④가 같은 칸으로 연혁 사실을 싣는다(`temporaryTwoHousePayloadOf`) — 엔진 입장 짝이 없을 때 ⑤가 그 칸을 열지 않으면 답할 길이
 * 없었다(D-79). ⑤ 질문 노출·⑧ 연혁 칸 검증이 이 한 짝을 읽는다. `contested`면 화면이 「다른 입장」의 짝이라고 밝힌다.
 */
export function judgmentEraFactsNewHouse(
  form: OneHouseJudgmentFormData,
): (TemporaryTwoHouseDates & { contested: boolean }) | undefined {
  const engine = judgmentDerivedNewHouse(form);
  if (engine) return { ...engine, contested: false };
  const other = judgmentContestedNewHouse(form) ?? judgmentContestedGiftedNewHouse(form);
  return other ? { ...other, contested: true } : undefined;
}

/** 양론 반대 입장 짝(C2·C7 · C1)의 신규 주택 행 — 엔진 입장 짝의 행과 같으면 뺀다. ⑧이 「다른 입장」 문구로 경위를 요구한다. */
export function judgmentContestedNewHouseRowIds(form: OneHouseJudgmentFormData): string[] {
  const engineRow = judgmentDerivedNewHouse(form)?.newHouseRowId;
  const ids = [judgmentContestedNewHouse(form)?.newHouseRowId, judgmentContestedGiftedNewHouse(form)?.newHouseRowId];
  return [...new Set(ids.filter((id): id is string => !!id && id !== engineRow))];
}

/** ⑧이 취득 경위를 요구하는 신규 주택 행 — 엔진 입장 짝 · 반대 입장 짝(D-79). ⑤ 질문 노출과 같은 집합이다. */
export function judgmentNewHouseOriginRowIds(form: OneHouseJudgmentFormData): string[] {
  const ids = [judgmentDerivedNewHouse(form)?.newHouseRowId, ...judgmentContestedNewHouseRowIds(form)];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

function resolveJudgmentTemporaryTwoHouse(
  form: OneHouseJudgmentFormData,
  excludedHouseIds: ReadonlySet<string>,
): TemporaryTwoHouseDates | undefined {
  const primary = form.assets?.[0];
  return resolveTemporaryTwoHouse({
    primaryKind: primary?.assetKind,
    // 양도 주택이 기존주택의 연장이면 헐기 전 주택 취득일이 종전주택 취득일이다(결정 #43 하위 2 · ⑤⑧과 같은 leaf).
    primaryAcquisitionDate: sellingHousePreviousDateOverride(primary, form.houses?.length) ?? primary?.acquisitionDate ?? "",
    houses: form.houses,
    transferDate: form.transferDate,
    legacyPrecedence: form.legacyHouseCountPrecedence === true,
    declaredSpecial: form.temporaryTwoHouseSpecial === true,
    declaredNewHouseDate: form.newHouseAcquisitionDate,
    declaredNewHouseOrigin: declaredNewHouseOriginOf(form), // 결정 #43-3 — 직접 선언 경로의 신규 주택 경위(미답 = not_collected)
    mergeContext: mergeContextOf(form), // D8 — 합가 세대는 같은 쪽 안에서 짝을 고른다
    excludedHouseIds,
    rentalResidenceHouseIds: rentalResidenceCandidateHouseIds(form),
  });
}

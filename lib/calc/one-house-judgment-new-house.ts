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

/** ⑧이 취득 경위를 요구하는 신규 주택 행 — 엔진 입장 짝 · 반대 입장 짝(D-79). ⑤ 질문 노출과 같은 집합이다. */
export function judgmentNewHouseOriginRowIds(form: OneHouseJudgmentFormData): string[] {
  const ids = [judgmentDerivedNewHouse(form)?.newHouseRowId, judgmentContestedNewHouse(form)?.newHouseRowId];
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

/**
 * 「소득세법 시행령」 §154⑧3호 동일세대 상속 통산 — **개시일 순서** 검사 (단일 leaf, E-2)
 *
 * 법문(실독 2026-09-27 · MST 286211): 「상속받은 주택으로서 상속인과 피상속인이 상속개시 당시
 * 동일세대인 경우에는 **상속개시 전에** 상속인과 피상속인이 동일세대로서 거주하고 **보유한** 기간」.
 * ⇒ 통산 개시일은 (1) 상속개시일(= 상속 자산의 취득일)보다 **앞서야** 하고, (2) 피상속인이 그 주택을
 *   취득한 날 **이후**여야 한다(보유 전에는 「보유한 기간」이 있을 수 없다).
 *
 * 🔴 종전에는 판정 메뉴 ⑧(`one-house-exemption-validate.ts`, C2 · PR #1794)만 두 검사를 했고
 *    계산기 ⑧은 **존재만** 봤다. 엔진(`resolveExemptionHoldingStartDate`)은 (1) 위반이면 값을 조용히
 *    버리고, (2) 위반이면 **그대로 기산일로 쓴다** — 피상속인 취득 전 기간까지 보유로 센다.
 *    같은 입력이 판정 메뉴에서는 막히고 계산기에서는 통과해 보유기간이 과다 산정됐다.
 *
 * 🔑 호출부: 계산기 `getAssetDateOrderError`(⑤ 인라인 경고 · ⑧ 단계 차단의 단일 진실) ·
 *    판정 메뉴 `validateStep3`. 게이트(주택 · 상속 · 동일세대)는 두 화면의 ⑤와 같다 —
 *    주택 여부는 호출부가 본다(두 화면이 「주택」을 판정하는 술어가 다르다).
 *
 * 개시일 **미입력**은 여기서 보지 않는다 — 두 호출부가 각자 필수값 문구로 이미 막는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { cohabitationResidenceMonthsCap } from "@/lib/tax-engine/one-house/residence-months";

export function sameHouseholdInheritanceOrderError(
  a: Pick<
    AssetForm,
    | "acquisitionCause"
    | "acquisitionDate"
    | "decedentAcquisitionDate"
    | "decedentSameHouseholdBeforeInheritance"
    | "decedentCohabitationHoldingStartDate"
  >,
): string | null {
  if (a.acquisitionCause !== "inheritance" || a.decedentSameHouseholdBeforeInheritance !== true) return null;
  const start = a.decedentCohabitationHoldingStartDate;
  if (!start) return null;
  // `YYYY-MM-DD` 문자열은 사전식 비교가 곧 시간순이다(폼 전역 규약).
  if (a.acquisitionDate && start >= a.acquisitionDate)
    return "동일세대 거주·보유 개시일은 상속개시일(취득일)보다 앞서야 합니다. (§154⑧3호 — 상속개시 전 기간)";
  if (a.decedentAcquisitionDate && start < a.decedentAcquisitionDate)
    return "동일세대 거주·보유 개시일이 피상속인 취득일보다 빠릅니다. 피상속인이 이 주택을 취득한 날 이후로 입력하세요.";
  return null;
}

/**
 * ⑧ §154⑧3호 상속개시 전 동일세대 거주 개월 상한(2026-11 리뷰 D-12) — 동일세대 개시일부터 상속개시일까지를 넘을 수 없다.
 * 엔진 클램프(`cohabitationResidenceMonthsCap`)와 같은 셈이다. 판정 메뉴·계산기·증여 부담부증여 ⑧과 ⑫ refine이 이 문구·기준을 쓴다.
 */
export function cohabitationResidenceMonthsError(
  a: Pick<
    AssetForm,
    | "acquisitionCause"
    | "acquisitionDate"
    | "decedentSameHouseholdBeforeInheritance"
    | "decedentCohabitationHoldingStartDate"
    | "decedentCohabitationResidenceMonths"
  >,
): string | null {
  if (a.acquisitionCause !== "inheritance" || a.decedentSameHouseholdBeforeInheritance !== true) return null;
  const months = Number.parseInt(a.decedentCohabitationResidenceMonths ?? "", 10);
  if (!Number.isFinite(months)) return null;
  const cap = cohabitationResidenceMonthsCap(toOptionalDate(a.decedentCohabitationHoldingStartDate), toOptionalDate(a.acquisitionDate));
  if (cap === undefined || months <= cap) return null;
  return `상속개시 전 동일세대 거주기간은 동일세대 거주·보유 개시일부터 상속개시일까지(${cap}개월)를 넘을 수 없습니다. (§154⑧3호)`;
}

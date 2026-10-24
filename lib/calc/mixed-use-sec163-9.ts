/**
 * 겸용주택 상속·증여 — 소득세법 시행령 §163⑨ 단서 **자산 합계 비교 구간** (PR-6 · 계획서
 * `docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md` §17).
 *
 * ④ 전송(`sec163_9Compare`) · ⑤ 시점 라벨·① 칸 안내 · ⑧ ① 짝 검사가 같은 술어를 쓴다.
 * 날짜는 ④의 상속·증여 플래그(`acquisitionByInheritance/Gift` — `transfer-tax-api-mixed-use.ts`)와 같은 `acquisitionDate`다 —
 * 그래야 「의제취득일 전 ⇔ 플래그 꺼짐(③ 경로)」이 정확히 맞물린다.
 */
import { DEEMED_ACQUISITION_DATE, HOUSE_FIRST_DISCLOSURE } from "./transfer-163-9-base-date";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { isMixedBgDeemedPath } from "./burdened-gift-mixed-use-scope";
import { SEC_163_9_GENERAL_BUILDING_FIRST_NOTICE } from "@/lib/tax-engine/transfer-split-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type MixedSec163_9Compare = { era: "pre_deemed" | "clause"; cause: "inheritance" | "gift"; commercialOutsideClause?: boolean };

export function mixedSec163_9CompareOf(asset: AssetForm): MixedSec163_9Compare | undefined {
  if (asset.assetKind !== "housing" || asset.isMixedUseHouse !== true) return undefined;
  // 부담부증여 — 시가 평가 × 상속·증여 취득(소령 §163⑨ 평가액 경로)의 단서 구간만 비교한다(PR-7b-7a-2). 기준시가 평가는 §159①1호 괄호라 §163⑨를 쓰지 않고,
  //   의제취득일 전은 엔진 MB-16이 막는다(PR-7b-7b).
  const bg = isMixedBurdenedGift(asset);
  if (bg && !isMixedBgDeemedPath(asset)) return undefined;
  const cause =
    asset.acquisitionCause === "inheritance" ? "inheritance" : asset.acquisitionCause === "gift" ? "gift" : undefined;
  const date = asset.acquisitionDate ?? "";
  if (!cause || !date) return undefined;
  if (date < DEEMED_ACQUISITION_DATE) return bg ? undefined : { era: "pre_deemed", cause };
  // 1985.1.1. 이후 개별주택가격 최초공시 전 — §163⑨ 단서 구간(Q-18 · Q-21). 상가분은 건물 기준시가 최초 고시(일반건물 2001-01-01)
  // 뒤면 단서 밖이다(Q-22 — 겸용 상가분을 일반건물로 본다 · 상업용 건물 고시(2005-01-01) 대상이면 2001~2004는 단서 안이라 확인 필요).
  if (date < HOUSE_FIRST_DISCLOSURE) {
    return date < SEC_163_9_GENERAL_BUILDING_FIRST_NOTICE
      ? { era: "clause", cause }
      : { era: "clause", cause, commercialOutsideClause: true };
  }
  return undefined;
}

/** ⑤ 취득시 기준시가 칸의 시점 라벨 — 의제취득일 전이면 의제취득일 기준(§164④~⑦의 「취득당시」 = 의제취득일, PR-3·PR-4와 같다). */
export function mixedAcqTimeLabel(asset: AssetForm, fallback: string): string {
  return mixedSec163_9CompareOf(asset)?.era === "pre_deemed" ? "의제취득일(1985.1.1.)" : fallback;
}

/** ⑤ ① 평가액 칸 안내 — 비교 구간이면 「두 칸 모두/모두 비움 · 합계로 비교」, 아니면 null(종전 문구). */
export function mixedSec163_9ReportedHint(asset: AssetForm): string | null {
  const cmp = mixedSec163_9CompareOf(asset);
  if (!cmp) return null;
  const kind = cmp.cause === "gift" ? "증여세" : "상속세";
  if (cmp.commercialOutsideClause) {
    return `${kind} 신고가액(상증법 §60~66 평가액) — 주택분·상가분을 모두 입력하거나 모두 비워 두세요. 상가분은 건물 기준시가 고시(2001.1.1.) 뒤 취득이라 신고가액을 그대로 쓰고, 주택분만 §164 기준시가와 합계로 비교합니다(소득세법 시행령 §163⑨).`;
  }
  const others = cmp.era === "pre_deemed" ? "§164 기준시가 합계·환산취득가액 합계" : "§164 기준시가 합계";
  const required = cmp.era === "pre_deemed" && cmp.cause === "gift" ? "주택분·상가분 모두 입력하세요" : "주택분·상가분을 모두 입력하거나 모두 비워 두세요";
  return `${kind} 신고가액(상증법 §60~66 평가액) — ${required}. 두 칸의 합계를 ${others}와 비교해 가장 큰 금액을 취득가액으로 씁니다(소득세법 시행령 §163⑨).`;
}

/** ⑤ 실제 필요경비 칸 안내 — 의제취득일 전이면 ③(환산)이 채택될 때 개산공제가 대신 붙는다. 아니면 null(종전 문구). */
export function mixedSec163_9ExpenseHint(asset: AssetForm): string | null {
  if (mixedSec163_9CompareOf(asset)?.era !== "pre_deemed") return null;
  return "신고가액(①)·§164 기준시가(②)가 채택되면 이 경비를 더하고, 환산취득가액(③)이 채택되면 이 칸 대신 개산공제(소득세법 시행령 §163⑥)를 적용합니다. 자본적지출·양도비가 있으면 입력하세요";
}

/**
 * 부담부증여 × 상속·증여 취득(시가)에서 ① 평가액이 **선택**인가 — 단서 구간(자산 합계 비교)이거나 PHD(§164⑦ 가액이 ②)면 두 칸 모두 입력하거나 모두 비운다(PR-6 Q-19).
 * 그 밖(본문)은 평가액이 유일한 취득가액이라 필수다. ⑤ 칸 제목·안내와 엔진 MB-11(`analyzeMixedBurdenedGift`)이 같은 조건이다(PR-7b-7a-2).
 */
export function mixedBgReportedOptional(asset: AssetForm): boolean {
  return isMixedBgDeemedPath(asset) && (asset.usePreHousingDisclosure === true || mixedSec163_9CompareOf(asset)?.era === "clause");
}

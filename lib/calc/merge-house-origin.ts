/**
 * 판정 메뉴 명부 — 행마다 **합가 전 보유 쪽**을 보여 주고 받기 위한 파생값 (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` 2단계.
 *
 * 🔑 분류는 엔진 `classifyMergeHouse`를 **그대로** 부른다 — 화면이 「합가 후 취득」을 따로
 *    계산하면 배지와 판정이 갈린다(`feedback_aggregate_display_rederives_engine_value`).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { classifyMergeHouse, type MergeHouseSide } from "@/lib/tax-engine/one-house/merge-composition";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/**
 * `secondMergeDate` — D4 **혼인·동거봉양 이중 합가**일 때 나중에 합친 날. `kind`·`mergeDate`는 먼저 합친 쪽이다.
 * 그때 소유 쪽에 「나중에 합친 쪽」(`second_merge_side` — 혼인이 먼저면 동거봉양으로 합친 가족, 동거봉양이 먼저면
 * 혼인한 배우자)이 더해지고, 합가 후 취득의 기준일은 이 날이다(엔진 `doubleMergeOrderOf` ·
 * `resolveDoubleMergeComposition`과 같은 규약 — 같은 날이면 혼인을 먼저 본다).
 */
export type MergeContext = { kind: "marriage" | "parental_care"; mergeDate: string; secondMergeDate?: string };

/**
 * 폼의 합가 사실 — 혼인·동거봉양이 둘 다 있으면 먼저 합친 쪽을 `kind`로, 나중 날을 `secondMergeDate`로 둔다
 * (D4 이중 합가 — 같은 날이면 혼인이 먼저). 합가일이 없으면 `undefined` — 명부에 소유 쪽 칸을 띄울 이유가 없다.
 */
export function mergeContextOf(form: {
  marriageDate?: string;
  parentalCareMergeDate?: string;
}): MergeContext | undefined {
  const m = form.marriageDate;
  const p = form.parentalCareMergeDate;
  if (m && p) {
    return m <= p
      ? { kind: "marriage", mergeDate: m, secondMergeDate: p }
      : { kind: "parental_care", mergeDate: p, secondMergeDate: m };
  }
  if (m) return { kind: "marriage", mergeDate: m };
  if (p) return { kind: "parental_care", mergeDate: p };
  return undefined;
}

/**
 * 행의 합가 전 위치. 취득일이 비어 있으면 날짜 판정을 못 하므로 입력값만 본다.
 * `undefined` = 합가 전 취득인데 아직 소유 쪽을 고르지 않았다.
 */
export function mergeHouseSideOf(
  house: Pick<HouseEntry, "acquisitionDate" | "mergeOrigin">,
  ctx: MergeContext,
): MergeHouseSide | undefined {
  // 「동거봉양으로 합친 가족 쪽」은 이중 합가에서만 뜻이 있다 — 단일 합가면 고르지 않은 것으로 본다(다시 고르게 한다).
  const origin = house.mergeOrigin === "second_merge_side" && !ctx.secondMergeDate ? undefined : house.mergeOrigin;
  const acq = toOptionalDate(house.acquisitionDate);
  const merge = toOptionalDate(ctx.secondMergeDate ?? ctx.mergeDate);
  if (!acq || !merge) return origin;
  return classifyMergeHouse(acq, merge, origin);
}

/** 명부 배지·편집 창 선택지 라벨 — 동거봉양은 부모·자녀 어느 쪽도 양도자일 수 있어 「합친 가족」이라 쓴다. */
export function mergeSideLabel(side: MergeHouseSide, kind: MergeContext["kind"]): string {
  if (side === "after_merge") return kind === "marriage" ? "혼인 후 취득" : "합가 후 취득";
  if (side === "seller_side") return "양도자 쪽";
  // 나중에 합친 쪽 — 혼인이 먼저면 동거봉양으로 합친 가족, 동거봉양이 먼저면 혼인한 배우자(이중 합가에서만 쓴다).
  if (side === "second_merge_side") return kind === "marriage" ? "동거봉양으로 합친 가족 쪽" : "혼인한 배우자 쪽";
  return kind === "marriage" ? "배우자 쪽" : "합친 가족 쪽";
}

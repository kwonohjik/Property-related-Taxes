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

export type MergeContext = { kind: "marriage" | "parental_care"; mergeDate: string };

/**
 * 폼의 합가 사실 — 혼인·동거봉양이 둘 다 있으면 혼인을 본다(엔진 `matchMergeApartFromWindow`와 같은 순서).
 * 합가일이 없으면 `undefined` — 명부에 소유 쪽 칸을 띄울 이유가 없다.
 */
export function mergeContextOf(form: {
  marriageDate?: string;
  parentalCareMergeDate?: string;
}): MergeContext | undefined {
  if (form.marriageDate) return { kind: "marriage", mergeDate: form.marriageDate };
  if (form.parentalCareMergeDate) return { kind: "parental_care", mergeDate: form.parentalCareMergeDate };
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
  const acq = toOptionalDate(house.acquisitionDate);
  const merge = toOptionalDate(ctx.mergeDate);
  if (!acq || !merge) return house.mergeOrigin;
  return classifyMergeHouse(acq, merge, house.mergeOrigin);
}

/** 명부 배지·편집 창 선택지 라벨 — 동거봉양은 부모·자녀 어느 쪽도 양도자일 수 있어 「합친 가족」이라 쓴다. */
export function mergeSideLabel(side: MergeHouseSide, kind: MergeContext["kind"]): string {
  if (side === "after_merge") return kind === "marriage" ? "혼인 후 취득" : "합가 후 취득";
  if (side === "seller_side") return "양도자 쪽";
  return kind === "marriage" ? "배우자 쪽" : "합친 가족 쪽";
}

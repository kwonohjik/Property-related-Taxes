/**
 * 겸용주택 — 양도가액 안분 기준(계약서 구분·감정가액) · 상가건물 감가상각비 · 건물 귀속 양도비의 **입력 범위 단일 술어** (폼 계층).
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.5 (Q-2·Q-9)
 *
 * ⑤ 화면 노출(`MixedUseSaleSplitSection`·`DepreciationField`·건물 귀속 양도비 칸) · ④ 전송(`buildMixedUsePayload`) ·
 * ⑧ 검증이 **이 함수 하나**를 쓴다 — 술어가 갈리면 「칸은 보이는데 전송이 안 되는」 침묵 소실이 생긴다.
 * 조합 제외 사유는 엔진 가드와 **같은 leaf**(`mixedSaleSplitBlockedReason`)에서 온다.
 *
 * 엔진이 구분하지 못하는 「함께 양도(자산 2건 이상)」만 이 계층이 추가로 막는다(Q-2 — 단건 겸용만).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { mixedSaleSplitBlockedReason } from "@/lib/tax-engine/mixed-use-sale-split";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";

export type MixedSaleSplitScope =
  /** 겸용주택이 아니다 — 칸도 안내도 없다. */
  | { status: "not_applicable" }
  | { status: "ok" }
  /** 겸용주택이지만 이 조합은 아직 받지 않는다 — 칸을 숨기고 이유를 알린다. */
  | { status: "blocked"; reason: string };

export interface MixedSaleSplitScopeCtx {
  /** 신고서의 자산이 1건뿐인가(`form.assets.length === 1`). 모르면 false — 안전측(받지 않음)이다. */
  isSingleAsset: boolean;
}

export function mixedSaleSplitScope(a: AssetForm, ctx: MixedSaleSplitScopeCtx): MixedSaleSplitScope {
  if (!(a.assetKind === "housing" && a.isMixedUseHouse)) return { status: "not_applicable" };
  if (!ctx.isSingleAsset) {
    return { status: "blocked", reason: "함께 양도하는 자산이 있으면 겸용주택의 이 입력을 아직 지원하지 않습니다." };
  }
  const reason = mixedSaleSplitBlockedReason({
    burdenedGift: isMixedBurdenedGift(a) || undefined,
    partialUsageChange: a.hasPartialUsageChange || undefined,
    usePreHousingDisclosure: a.usePreHousingDisclosure,
    transferCause: a.transferCause,
  });
  return reason ? { status: "blocked", reason } : { status: "ok" };
}

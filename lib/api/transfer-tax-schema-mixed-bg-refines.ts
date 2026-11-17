/**
 * ⑫ 겸용주택 × 부담부증여 — Zod superRefine (소령 §159 · 설계서 transfer-burdened-gift-mixed-use.engine.design.md §3.4).
 *
 * 판정은 **엔진 leaf 하나**(`collectMixedBurdenedGiftIssues`)다 — ⑧(화면)·엔진 throw·이 refine이 같은 함수를 부른다.
 * 따라서 «⑧ 통과 ↔ ⑫ 400» 모순이 생기지 않는다.
 */
import { z } from "zod";
import { collectMixedBurdenedGiftIssues, type MixedBgSource } from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { isMixedInheritedSplitDateStraddle } from "@/lib/tax-engine/mixed-use-inherited-split-date";
import { MIXED_INHERITED_SPLIT_DATE_MESSAGE } from "@/lib/tax-engine/mixed-use-inherited-split-date";

/**
 * 묶음이 **지분 분할 취득(축 B — 같은 물건의 지분 여럿)** 인가 — route(`bundled-route.ts`)·⑫ 양도가액 면제(`transfer-tax-schema.ts`)와 **같은 판정**이다:
 * 명시 플래그(`fractionalSplitBundle`)가 앞서고, 없으면 전 자산이 물건 전체 양도가액(`totalPropertyTransferPrice`)을 가진 모양이다.
 * 겸용 × 부담부증여 엔진 leaf가 이 판정으로 함께 양도(재배분 · PR-B)와 축 B(단건 규칙 · PR-C)를 가른다.
 */
export function isAxisBBundle(
  data: { fractionalSplitBundle?: boolean; totalPropertyTransferPrice?: number },
  companions: ReadonlyArray<{ totalPropertyTransferPrice?: number }>,
): boolean {
  if (companions.length === 0) return false;
  return data.fractionalSplitBundle ?? (data.totalPropertyTransferPrice !== undefined && companions.every((c) => c.totalPropertyTransferPrice !== undefined));
}

export function refineMixedUseBurdenedGift(
  data: {
    propertyType?: string;
    transferType?: string;
    acquisitionCause?: string;
    transferDate: string;
    ownershipRatio?: number;
    burdenedGiftInfo?: unknown;
    mixedUse?: unknown;
    companionAssets?: ReadonlyArray<unknown>;
    fractionalSplitBundle?: boolean;
    totalPropertyTransferPrice?: number;
  },
  ctx: z.RefinementCtx,
): void {
  const info = data.burdenedGiftInfo as BurdenedGiftInfo | undefined;
  if (data.propertyType !== "mixed-use-house") {
    // 귀속·구분 감정평가 선언은 겸용 전용 — 다른 자산에 실리면 조용히 무시되는 입력이 된다.
    if (info?.debtAttribution !== undefined || info?.housingAppraisal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["burdenedGiftInfo", info.debtAttribution !== undefined ? "debtAttribution" : "housingAppraisal"],
        message: "채무 귀속·구분 감정평가 선언은 겸용주택 부담부증여에서만 입력할 수 있습니다",
      });
    }
    return;
  }
  // 구 표식(`acquisitionCause: "burdened_gift"`)은 증여자의 취득원인을 알려 주지 않는다 — 취득원인 칸이 아니라 양도 형태로 보내야 한다.
  if (data.acquisitionCause === "burdened_gift") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acquisitionCause"],
      message: "겸용주택 부담부증여는 양도 형태(transferType=burdened_gift)로 보내고, 취득원인에는 증여자의 취득원인을 입력하세요",
    });
    return;
  }
  if (data.transferType !== "burdened_gift") {
    if (info?.debtAttribution !== undefined || info?.housingAppraisal !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["burdenedGiftInfo"],
        message: "채무 귀속·구분 감정평가 선언은 양도 형태가 부담부증여일 때만 입력할 수 있습니다",
      });
    }
    return;
  }
  // `burdenedGiftInfo` 부재·`mixedUse` 부재는 각자의 필수 refine이 막는다(중복 메시지 방지).
  if (!info || !data.mixedUse) return;
  const issues = collectMixedBurdenedGiftIssues({
    // ⑫ 겸용 서브객체(Zod 출력)는 판정 입력 `MixedBgSource`를 구조적으로 만족한다(날짜는 string — `DateLike`).
    ...(data.mixedUse as MixedBgSource),
    ownershipRatio: data.ownershipRatio,
    acquisitionCause: data.acquisitionCause,
    burdenedGift: info,
    transferDate: data.transferDate,
    isCompanion: (data.companionAssets?.length ?? 0) > 0,
    isAxisB: isAxisBBundle(data, (data.companionAssets ?? []) as ReadonlyArray<{ totalPropertyTransferPrice?: number }>),
  });
  for (const issue of issues) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  }
}

/**
 * 함께 양도(컴패니언) 겸용주택 × 부담부증여 — 판정은 **엔진 leaf 하나**(`collectMixedBurdenedGiftIssues`)다(PR-B · 종전에는 무조건 막았다).
 * 묶음 안 겸용은 채무를 신고 단위로 재배분한 값(`assumedDebtOverride`)·구분 불분명·보충적평가 승만 계산한다(MB-19~21). 지분 분할 취득(축 B)은 단건 규칙(④가 ×r한 채무·귀속)이고 시가 모드 담보 승만 막는다(MB-22 · PR-C).
 * 컴패니언 스키마에는 `transferType`이 있다 — 구 표식(`acquisitionCause=burdened_gift`)은 증여자의 취득원인을 알려 주지 않아 주 자산과 같이 거부한다.
 */
export function refineCompanionMixedUseBurdenedGift(
  companions: ReadonlyArray<{
    assetKind?: string;
    transferType?: string;
    acquisitionCause?: string;
    ownershipRatio?: number;
    burdenedGiftInfo?: unknown;
    mixedUse?: unknown;
  }>,
  ctx: z.RefinementCtx,
  opts: { transferDate: string; isAxisB: boolean },
): void {
  companions.forEach((c, i) => {
    if (c.assetKind !== "mixed_use_house") return;
    if (c.acquisitionCause === "burdened_gift") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companionAssets", i, "acquisitionCause"],
        message: "겸용주택 부담부증여는 양도 형태(transferType=burdened_gift)로 보내고, 취득원인에는 증여자의 취득원인을 입력하세요",
      });
      return;
    }
    if (c.transferType !== "burdened_gift") return;
    const info = c.burdenedGiftInfo as BurdenedGiftInfo | undefined;
    // 부담부증여인데 info가 없으면 겸용 BG seam이 켜지지 않아 일반 양도로 조용히 계산된다 — 컴패니언에는 이를 막는 다른 refine이 없다.
    if (!info) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "burdenedGiftInfo"], message: "부담부증여(transferType=burdened_gift)는 burdenedGiftInfo가 필요합니다" });
      return;
    }
    // `mixedUse` 부재는 ⑩ 겸용 필수 refine이 막는다(중복 메시지 방지).
    if (!c.mixedUse) return;
    const issues = collectMixedBurdenedGiftIssues({
      ...(c.mixedUse as MixedBgSource),
      ownershipRatio: c.ownershipRatio,
      acquisitionCause: c.acquisitionCause,
      burdenedGift: info,
      transferDate: opts.transferDate,
      isCompanion: true,
      isAxisB: opts.isAxisB,
    });
    for (const issue of issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, ...issue.path], message: issue.message });
    }
  });
}

/**
 * ⑫ 겸용주택 상속·증여 × 토지·건물 취득일 중 한쪽만 1985.1.1. 전 — 일반 양도도 막는다(사용자 결정 2026-10-24). 부담부증여는 위 collector(MB-16)가 막는다.
 * 판정은 엔진 leaf(`isMixedInheritedSplitDateStraddle`) — ⑧·엔진 가드와 같은 함수다.
 */
export function refineMixedUseInheritedSplitDate(
  data: { propertyType?: string; transferType?: string; acquisitionCause?: string; mixedUse?: unknown; companionAssets?: ReadonlyArray<unknown> },
  ctx: z.RefinementCtx,
): void {
  type Dates = { landAcquisitionDate?: string; buildingAcquisitionDate?: string } | undefined;
  const straddles = (cause: string | undefined, m: Dates) =>
    !!m && isMixedInheritedSplitDateStraddle(cause, m.landAcquisitionDate, m.buildingAcquisitionDate);
  if (data.propertyType === "mixed-use-house" && data.transferType !== "burdened_gift" && straddles(data.acquisitionCause, data.mixedUse as Dates)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mixedUse", "landAcquisitionDate"], message: MIXED_INHERITED_SPLIT_DATE_MESSAGE });
  }
  // 함께 양도하는 겸용(컴패니언)도 같다 — 컴패니언 겸용의 엔진 입력에는 취득원인이 실리지 않아(`mixed-use-part-cards.ts`) 엔진 가드가 닿지 않는다. 방어선은 이 refine이다.
  (data.companionAssets ?? []).forEach((raw, i) => {
    const c = raw as { assetKind?: string; acquisitionCause?: string; mixedUse?: unknown };
    if (c.assetKind === "mixed_use_house" && straddles(c.acquisitionCause, c.mixedUse as Dates)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "mixedUse", "landAcquisitionDate"], message: MIXED_INHERITED_SPLIT_DATE_MESSAGE });
    }
  });
}

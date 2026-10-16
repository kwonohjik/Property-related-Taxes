/**
 * ⑫ 겸용주택 × 부담부증여 — Zod superRefine (소령 §159 · 설계서 transfer-burdened-gift-mixed-use.engine.design.md §3.4).
 *
 * 판정은 **엔진 leaf 하나**(`collectMixedBurdenedGiftIssues`)다 — ⑧(화면)·엔진 throw·이 refine이 같은 함수를 부른다.
 * 따라서 «⑧ 통과 ↔ ⑫ 400» 모순이 생기지 않는다.
 */
import { z } from "zod";
import { collectMixedBurdenedGiftIssues, type MixedBgSource } from "@/lib/tax-engine/mixed-use-burdened-gift-prepare";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

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
  });
  for (const issue of issues) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  }
}

/**
 * 함께 양도(컴패니언) 겸용주택 × 부담부증여 — MB-6. 컴패니언 겸용은 서브엔진이 `mixedUse`만 읽고 채무 귀속(`debtAttribution`)을 싣는 입력 경로가 없어,
 * 열어 두면 §159 안분 없이 일반 양도로 계산된다(오류 없는 오산). 판정은 `transferType`(컴패니언 스키마에도 있다)과 구 표식 두 가지로 한다.
 */
export function refineCompanionMixedUseBurdenedGift(
  companions: ReadonlyArray<{ assetKind?: string; transferType?: string; acquisitionCause?: string; burdenedGiftInfo?: unknown }>,
  ctx: z.RefinementCtx,
): void {
  companions.forEach((c, i) => {
    if (c.assetKind !== "mixed_use_house") return;
    if (c.transferType !== "burdened_gift" && c.acquisitionCause !== "burdened_gift") return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companionAssets", i, "transferType"],
      message: "겸용주택 부담부증여는 공유지분·함께 양도(여러 물건)·지분 분할 취득과 함께 계산할 수 없습니다 — 단독 소유 단건만 지원합니다.",
    });
  });
}

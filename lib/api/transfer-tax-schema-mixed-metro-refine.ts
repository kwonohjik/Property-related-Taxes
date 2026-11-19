/**
 * ⑫ 겸용주택 「수도권 여부」 미선택 — Zod superRefine (NBL2611-V4-HS06 · 3-state).
 *
 * 판정은 **엔진 leaf 하나**(`isMixedMetroSelectionRequired`)다 — ⑧(`transfer-tax-validate-mixed-area.ts`)·엔진 가드와 같은 함수라 «⑧ 통과 ↔ ⑫ 400» 모순이 없다.
 * 종전에는 값이 없으면 엔진이 `?? true`(수도권 3배)로 계산해, API 직접 호출이 수도권 밖 부동산을 조용히 3배로 과세했다.
 * 배율이 갈리지 않는 입력(부수토지가 두 배율 한도 안 · 도시지역 밖 10배)은 값이 선택과 무관하므로 막지 않는다.
 */
import { z } from "zod";
import { isMixedMetroSelectionRequired, MIXED_METRO_REQUIRED_MESSAGE, type MixedMetroSource } from "@/lib/tax-engine/mixed-use-metro-required";
import { toOptionalDate } from "@/lib/api/date-coerce";

export function refineMixedMetroSelected(
  data: { propertyType?: string; transferDate: string; mixedUse?: unknown; companionAssets?: ReadonlyArray<unknown> },
  ctx: z.RefinementCtx,
): void {
  const transferDate = toOptionalDate(data.transferDate);
  const required = (m: unknown) => !!m && isMixedMetroSelectionRequired(m as MixedMetroSource, transferDate);
  if (data.propertyType === "mixed-use-house" && required(data.mixedUse)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mixedUse", "isMetropolitanArea"], message: MIXED_METRO_REQUIRED_MESSAGE });
  }
  // 함께 양도하는 겸용(컴패니언)도 같다 — 컴패니언 겸용도 같은 엔진 leaf(`calcMixedUseTransferTax`)를 거친다.
  (data.companionAssets ?? []).forEach((raw, i) => {
    const c = raw as { assetKind?: string; mixedUse?: unknown };
    if (c.assetKind === "mixed_use_house" && required(c.mixedUse)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "mixedUse", "isMetropolitanArea"], message: MIXED_METRO_REQUIRED_MESSAGE });
    }
  });
}

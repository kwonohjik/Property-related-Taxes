/**
 * 상속 취득가액 의제: zod 입력 → 엔진 입력 변환.
 * route.ts POST 핸들러에서 격리 (800줄 정책).
 */
import type { z } from "zod";
import type { inheritedAcquisitionSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";

export function buildInheritedAcquisition(
  ia: z.infer<typeof inheritedAcquisitionSchema>,
  transferDate: Date,
  transferPrice: number,
): InheritanceAcquisitionInput {
  const inheritanceDate = new Date(ia.inheritanceStartDate);
  const { assetKind } = ia;

  if (ia.mode === "pre-deemed") {
    return {
      inheritanceDate,
      assetKind,
      reportedValue: ia.reportedValue, // ① 상증법 평가액 (max(①,③) 후보)
      standardPriceAtDeemedDate: ia.standardPriceAtDeemedDate,
      standardPriceAtTransfer: ia.standardPriceAtTransfer,
      transferDate,
      transferPrice,
    };
  }

  // post-deemed
  return {
    inheritanceDate,
    assetKind,
    reportedValue: ia.reportedValue,
    reportedMethod: ia.reportedMethod,
    ...(ia.useSupplementaryHelper && {
      landAreaM2: ia.landAreaM2,
      publishedValueAtInheritance: ia.publishedValueAtInheritance,
    }),
  };
}

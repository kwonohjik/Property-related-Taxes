/**
 * 상속 취득가액 의제: zod 입력 → 엔진 입력 변환.
 * route.ts POST 핸들러에서 격리 (800줄 정책).
 */
import type { z } from "zod";
import type { inheritedAcquisitionSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { sec163_9AcquisitionShape } from "@/lib/api/transfer-tax-schema-sec163-9-shape";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";

export function buildInheritedAcquisition(
  ia: z.infer<typeof inheritedAcquisitionSchema>,
  transferDate: Date,
  transferPrice: number,
): InheritanceAcquisitionInput {
  const inheritanceDate = toDate(ia.inheritanceStartDate, "inheritedAcquisition.inheritanceStartDate");
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

/** ⑫ §163⑨ 운반 shape의 Zod 출력 — 주 자산·컴패니언 공통(`transfer-tax-schema-sec163-9-shape.ts`). */
type Sec163_9Source = {
  [K in keyof typeof sec163_9AcquisitionShape]?: z.infer<(typeof sec163_9AcquisitionShape)[K]>;
};

/**
 * ⑭ **§163⑨ 4키 → 엔진 입력** — 주 자산(`engine-input.ts`)과 컴패니언(`bundled-split-helpers.ts`)이 **같은 leaf**를 쓴다
 * (CP-3, 2026-09-30). 종전에는 주 자산 전용 인라인 변환이었고 컴패니언에는 운반 자체가 없었다.
 *
 * ⚠️ 일자는 `toDate` 필수 — JSON 경유 string이 그대로 도달하면 `Date < string` 비교가 침묵 false가 된다.
 * ⚠️ `transferPrice`는 **그 자산의** 양도가액이다 — pre-deemed ③(환산)의 분자다. 컴패니언은 §166⑥ 안분가액을 넘긴다.
 */
export function toEngineSec163_9Inputs(
  src: Sec163_9Source,
  transferDate: Date,
  transferPrice: number,
): Pick<
  TransferTaxInput,
  "pre1990Land" | "inheritedAcquisition" | "inheritedHouseValuation" | "commercialInheritanceValuation"
> {
  const p = src.pre1990Land;
  const h = src.inheritedHouseValuation;
  return {
    pre1990Land: p
      ? {
          acquisitionDate: toDate(p.acquisitionDate, "pre1990Land.acquisitionDate"),
          transferDate: toDate(p.transferDate, "pre1990Land.transferDate"),
          areaSqm: p.areaSqm,
          pricePerSqm_1990: p.pricePerSqm_1990,
          pricePerSqm_atTransfer: p.pricePerSqm_atTransfer,
          grade_1990_0830: p.grade_1990_0830,
          gradePrev_1990_0830: p.gradePrev_1990_0830,
          gradeAtAcquisition: p.gradeAtAcquisition,
          forceRatioCap: p.forceRatioCap,
        }
      : undefined,
    // 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨)
    inheritedAcquisition: src.inheritedAcquisition
      ? buildInheritedAcquisition(src.inheritedAcquisition, transferDate, transferPrice)
      : undefined,
    // 상속 주택 환산취득가 보조 입력 (§164⑤·§176조의2④)
    inheritedHouseValuation: h
      ? {
          ...h,
          inheritanceDate: toDate(h.inheritanceDate, "inheritedHouseValuation.inheritanceDate"),
          transferDate: toDate(h.transferDate, "inheritedHouseValuation.transferDate"),
          firstDisclosureDate: toOptionalDate(h.firstDisclosureDate),
        }
      : undefined,
    // 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 (§163⑨2호 max) — 숫자 payload(Date 변환 불요)
    ...(src.commercialInheritanceValuation
      ? { commercialInheritanceValuation: src.commercialInheritanceValuation }
      : {}),
  };
}

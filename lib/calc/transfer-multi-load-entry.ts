import type { CalculationRecord } from "@/lib/storage/types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";

/**
 * 다건 양도세 "이력 불러오기" 진입 헬퍼 (Phase 2).
 *
 * 이력 record를 다건 세션에 편입한다. 두 소스:
 *   - single → 자산 1건 append (form = record.inputData)
 *   - multi  → 세션 전체 replace (properties[] hydrate)
 * 기납부세액 자동채움은 **참고 추정**(§2-A 확정 basis ≠ 예정 basis) — 사용자 수동확정 필요.
 * bundled·부담부증여·general_building 등은 배제(classifyAmendableTransfer 가드 재사용 + bundled 명시 null).
 */

/** 불러오기 가능 여부 판별 — bundled는 명시적으로 배제(§166⑥ companion 편입 복잡성) */
export function classifyLoadableTransfer(record: CalculationRecord): "single" | "multi" | null {
  const kind = classifyAmendableTransfer(record);
  if (kind === "single" || kind === "multi") return kind;
  return null; // bundled·null → 불러오기 불가
}

/** record에서 기납부세액 참고 추정(국세·지방) 추출 */
export function extractLoadPriorPaid(
  record: CalculationRecord,
  kind: "single" | "multi",
): { national: number; local: number } {
  const rd = record.resultData as {
    determinedTax?: number;
    localIncomeTax?: number;
    result?: { determinedTax?: number; localIncomeTax?: number };
  } | null;
  if (!rd) return { national: 0, local: 0 };
  if (kind === "single") {
    return { national: rd.result?.determinedTax ?? 0, local: rd.result?.localIncomeTax ?? 0 };
  }
  return { national: rd.determinedTax ?? 0, local: rd.localIncomeTax ?? 0 };
}

/** single record → 새 자산(PropertyItem). 라벨은 호출부에서 순번 부여. */
export function buildPropertyFromSingleRecord(record: CalculationRecord, label: string): PropertyItem {
  const form = record.inputData as unknown as TransferFormData;
  return {
    propertyId: generatePropertyId(),
    propertyLabel: label,
    form,
    completionPercent: calcPropertyCompletion(form),
    sourceCalculationId: record.id,
  };
}

/** multi record → properties[] (전체 replace용). 각 자산에 sourceCalculationId 표기. */
export function buildPropertiesFromMultiRecord(record: CalculationRecord): PropertyItem[] {
  const input = record.inputData as unknown as MultiTransferFormData;
  return (input.properties ?? []).map((p) => ({
    ...p,
    sourceCalculationId: p.sourceCalculationId ?? record.id,
  }));
}

/** 미입력(빈) 자산 여부 — 마운트 auto-add된 blank property 정리용 */
export function isBlankProperty(p: PropertyItem): boolean {
  return p.completionPercent === 0 && !p.form?.transferDate;
}

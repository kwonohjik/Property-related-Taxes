import type { CalculationRecord } from "@/lib/storage/types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { calculationRepository } from "@/lib/storage/calculation-repository";

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
  // 자산별 예정신고 세액 포착 — 신고일 필터 기납부세액(§111③) 산정용(computeAutoPriorPaid)
  const pp = extractLoadPriorPaid(record, "single");
  return {
    propertyId: generatePropertyId(),
    propertyLabel: label,
    form,
    completionPercent: calcPropertyCompletion(form),
    sourceCalculationId: record.id,
    priorPaidNational: pp.national,
    priorPaidLocal: pp.local,
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

/**
 * 자산별 예정세액(priorPaidNational/Local) backfill — 신고일 필터 기납부세액(§111③) 산정 self-heal.
 *
 * priorPaidNational 포착(buildPropertyFromSingleRecord) 이전에 로드된 자산·저장 이력은 이 필드가 없어
 * computeAutoPriorPaid가 0을 반환한다. 각 자산의 sourceCalculationId로 원본 단건 record를 되살려 채운다.
 * 이미 값이 있거나 sourceCalculationId가 없으면(수동 추가) 그대로 둔다. record 조회 실패도 무변경.
 */
export async function backfillPriorPaid(properties: PropertyItem[]): Promise<PropertyItem[]> {
  return Promise.all(
    properties.map(async (p) => {
      if (p.priorPaidNational !== undefined || !p.sourceCalculationId) return p;
      try {
        const rec = await calculationRepository.get(p.sourceCalculationId);
        // 단건 record만 자산별 standalone 예정세액 보유(다건 record는 aggregate 결과뿐)
        if (!rec || classifyLoadableTransfer(rec) !== "single") return p;
        const pp = extractLoadPriorPaid(rec, "single");
        return { ...p, priorPaidNational: pp.national, priorPaidLocal: pp.local };
      } catch {
        return p;
      }
    }),
  );
}

import type { CalculationRecord } from "@/lib/storage/types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { extractTaxYear } from "./cross-104-5-history";

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
    /**
     * 🔑 **원본 변경 감지의 기준선** — `record.inputHash`를 **그대로** 싣는다.
     *
     * ⚠️ `?? await computeInputHash(record.inputData)` 폴백을 넣지 말 것. 이 함수가 async가
     *   되면 `enterMultiAggregate`(`transfer-aggregate-entry.ts:107`)가 **동기 함수**라
     *   그 호출 사슬 전체가 async로 번진다. `inputHash`가 없는 구 record는 `undefined`로 두고
     *   `detectStaleSources`가 「판정 불가」로 다룬다.
     */
    sourceInputHash: record.inputHash,
    priorPaidNational: pp.national,
    priorPaidLocal: pp.local,
  };
}

/**
 * multi record → properties[] (전체 replace용).
 *
 * 🔴 **`?? record.id` 폴백을 되살리지 말 것.** 다건 record는 그 안의 자산에 대해 **원본이
 *   아니다** — 담고 있던 용기다. 폴백이 있으면 원본이 없는 **수동 추가 자산**이
 *   「원본 있음」으로 위장하고, 재저장될 때마다 그 표지가 굳는다
 *   (계획서 `multi-replace-source-provenance.plan.md` §2 G-1·G-2).
 *
 *   지금은 하류 3곳이 전부 `classifyLoadableTransfer(rec) !== "single"`로 걸러 내 **우연히**
 *   무해했다. 그 가드가 넓어지는 순간 활성화된다 — `reloadPropertyFromSource`가 다건을
 *   허용하면 수동 자산의 `form`(= `TransferFormData`)에 `MultiTransferFormData`가 덮인다.
 *
 * 🔑 「이 세션이 어느 다건에서 왔는가」는 **폼 수준** `loadedFromRecordId`가 들고,
 *   「이미 로드함」 배지는 `buildExistingSourceIds`가 둘을 합쳐 만든다.
 */
export function buildPropertiesFromMultiRecord(record: CalculationRecord): PropertyItem[] {
  const input = record.inputData as unknown as MultiTransferFormData;
  return (input.properties ?? []).map((p) => ({ ...p }));
}

/**
 * 「이미 로드함」 배지가 쓰는 id 집합 — **자산 출처 ∪ 세션 출처**.
 *
 * `MultiTransferHistoryLoadModal`이 `has(r.id)`로 배지를 띄운다. 두 축을 합치는 자리가
 * 여기뿐이라 순수 함수로 꺼내 둔다(컴포넌트 안 `useMemo`에 있으면 테스트가 닿지 않는다).
 */
export function buildExistingSourceIds(
  form: Pick<MultiTransferFormData, "properties"> & { loadedFromRecordId?: string },
): Set<string> {
  const ids = new Set<string>(
    (form.properties ?? []).map((p) => p.sourceCalculationId).filter(Boolean) as string[],
  );
  if (form.loadedFromRecordId) ids.add(form.loadedFromRecordId);
  return ids;
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

// ============================================================
// 원본 record 변경 감지 (계획서 `multi-aggregate-stale-source-snapshot.plan.md`)
// ============================================================

/**
 * 판정 불가 사유 구분.
 *   · `source_changed` — 원본 record가 편입 이후 **바뀌었다**(확정)
 *   · `unknown`        — 기준선이나 현재 해시가 없어 **알 수 없다**(레거시 세션·구 record)
 */
export type StaleSourceReason = "source_changed" | "unknown";

export interface StaleSourceInfo {
  propertyId: string;
  propertyLabel: string;
  reason: StaleSourceReason;
  /**
   * 재편입하면 합산 과세기간을 벗어나는 경우의 **원본 양도연도**.
   *
   * 엔진 `validateInput`이 「양도일 연도(…)가 과세기간(…)과 다릅니다」로 **예외를 던지므로**
   * (`transfer-tax-aggregate-helpers.ts:47~51`) 버튼을 눌러선 안 된다. UI가 사유를 표시하고 막는다.
   */
  blockedByTaxYear?: number;
}

/**
 * 합산에 편입된 자산 중 **원본 record가 바뀐 것**을 찾는다.
 *
 * 🔑 **비교 축은 하나뿐이다** — `record.inputHash` ↔ `property.sourceInputHash`.
 *   둘 다 저장소가 **같은 대상(`record.inputData`)에 대해 계산한 값**이라 잡음이 없다.
 *
 * ⛔ **`computeInputHash(property.form)`과 비교하지 말 것.** 두 실측 사실이 그 축을 죽인다:
 *   · 저장 시 `inputData`에 키가 덧붙는다 — `use-auto-save-calculation.ts:103`
 *     (`{ ...inputData, buildingStdSnapshots }`) ⇒ `record.inputData ≠ formData`
 *   · 편집 왕복이 **기본값 키를 덧붙인다** — `syncToWizardStore`가 `resetWizard()` 후
 *     `updateFormData`를 부르고 그 구현이 `{ ...state.formData, ...data }`
 *     (`calc-wizard-store.ts:280`) ⇒ **사용자가 아무것도 안 고쳐도 해시가 바뀐다**
 *   ⇒ 「로컬 편집함」과 「폼이 정규화됨」을 구분할 수 없어 정상 편집마다 오탐이 난다.
 *
 * 규약은 `backfillPriorPaid`와 같다 — `sourceCalculationId`가 없으면 건너뛰고,
 * record 조회 실패·삭제·단건 아님도 **조용히 통과**한다(throw 금지).
 *
 * ⚠️ 결과는 **파생값이라 store에 넣지 않는다.** `MultiTransferFormData`에 넣으면
 *   `partialize`가 sessionStorage에 persist하고 다건 자동저장 `inputData`를 타고
 *   **이력 record에까지 저장**된다(`multi-transfer-tax-store.ts`의 `setAutoBackupPropertyId`
 *   주석이 경고하는 함정). 호출부의 지역 state로 둘 것.
 */
export async function detectStaleSources(
  properties: PropertyItem[],
  taxYear: number,
): Promise<StaleSourceInfo[]> {
  const found = await Promise.all(
    properties.map(async (p): Promise<StaleSourceInfo | null> => {
      if (!p.sourceCalculationId) return null; // 수동 추가 자산 — 원본이 없다
      let rec;
      try {
        rec = await calculationRepository.get(p.sourceCalculationId);
      } catch {
        return null;
      }
      if (!rec || classifyLoadableTransfer(rec) !== "single") return null;

      const reason: StaleSourceReason | null =
        !p.sourceInputHash || !rec.inputHash
          ? "unknown"
          : rec.inputHash !== p.sourceInputHash
            ? "source_changed"
            : null;
      if (reason === null) return null;

      const srcYear = extractTaxYear(rec);
      return {
        propertyId: p.propertyId,
        propertyLabel: p.propertyLabel,
        reason,
        ...(srcYear !== null && srcYear !== taxYear ? { blockedByTaxYear: srcYear } : {}),
      };
    }),
  );
  return found.filter((x): x is StaleSourceInfo => x !== null);
}

/** 원본 record를 되살린다 — 없거나 단건이 아니면 `null`(호출부가 무변경을 택한다). */
async function loadSourceRecord(property: PropertyItem): Promise<CalculationRecord | null> {
  if (!property.sourceCalculationId) return null;
  try {
    const rec = await calculationRepository.get(property.sourceCalculationId);
    return rec && classifyLoadableTransfer(rec) === "single" ? rec : null;
  } catch {
    return null;
  }
}

/**
 * **다시 불러오기** — 원본 record의 현재 입력으로 자산을 갱신한다.
 *
 * 🔒 `propertyId`·`propertyLabel`·`sourceCalculationId`는 **보존**한다 — 합산 화면의 순번과
 *   provenance가 바뀌면 사용자가 어느 자산인지 잃는다.
 * 🔒 `priorPaidNational/Local`은 **덮지 않는다** — 사용자가 수동 확정했을 수 있다
 *   (`backfillPriorPaid`와 같은 「값이 있으면 그대로」 규약).
 * ⚠️ 이 함수는 **로컬 편집을 덮는다.** 호출부가 그 사실을 먼저 알려야 한다
 *   (「합산 화면에서 고친 내용이 있으면 사라집니다」).
 */
export async function reloadPropertyFromSource(property: PropertyItem): Promise<PropertyItem> {
  const rec = await loadSourceRecord(property);
  if (!rec) return property;
  const form = rec.inputData as unknown as TransferFormData;
  const pp = extractLoadPriorPaid(rec, "single");
  return {
    ...property,
    form,
    completionPercent: calcPropertyCompletion(form),
    sourceInputHash: rec.inputHash,
    priorPaidNational: property.priorPaidNational ?? pp.national,
    priorPaidLocal: property.priorPaidLocal ?? pp.local,
  };
}

/**
 * **그대로 두기** — 폼은 건드리지 않고 기준선만 현재 원본에 맞춘다.
 *
 * 「판정 불가(레거시)」 배너를 닫는 수단이다. 별도 dismiss 플래그가 필요 없는 이유 —
 * 이 함수와 `reloadPropertyFromSource`가 **둘 다 `sourceInputHash`를 확정**하므로
 * 어느 쪽을 골라도 배너가 다시 뜨지 않는다.
 */
export async function adoptSourceBaseline(property: PropertyItem): Promise<PropertyItem> {
  const rec = await loadSourceRecord(property);
  if (!rec?.inputHash) return property;
  return { ...property, sourceInputHash: rec.inputHash };
}

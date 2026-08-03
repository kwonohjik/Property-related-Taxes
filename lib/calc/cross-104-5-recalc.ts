/**
 * §104⑤ 크로스 — **이력 재계산** (C-3d-1)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3d-recalc.plan.md`
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * 크로스 합산은 이력의 **호별 값**(`clause1Bucket*`·`clause8*`/`clause9*`)을 읽는다. 그런데
 * 부동산 **단건**(`mode:"single"`) 결과에는 호 정보가 없고(`candidateClauses` 미노출 ·
 * `appliedRate`로 역추론 불가), 주식 **구 버전 이력**에도 아직 echo가 없다.
 * ⇒ 저장된 **`inputData`(폼)** 로 다시 계산해 그 값을 얻는다.
 *
 * 📌 **단건을 다자산으로 태워도 값은 바뀌지 않는다**(계획서 V-1 — 5케이스 실측).
 *   재계산은 「다른 값을 만드는 것」이 아니라 **호별 echo를 얻는 것**이다.
 *   ⚠️ 다만 5케이스는 감면·가산세를 포함하지 않았다 ⇒ 호출자는 재계산 전후를 **비교**해
 *     달라지면 알린다(계획서 X-2·X-5). 「불변이라 가정」하지 않는다.
 *
 * 🔒 **`mode:"mixed-use"`(겸용주택)는 지원하지 않는다**(W-1) — 단건 전용 경로
 *   (`transfer-tax-mixed-use.ts`)라 다자산으로 옮기면 4부분 안분이 달라질 수 있는데
 *   **실측하지 않았다**. 안전측으로 제외한다.
 */
import {
  callMultiTransferTaxAPI,
} from "./multi-transfer-tax-api";
import { callStockTransferTaxAPI } from "./stock-transfer-tax-api";
import {
  defaultMultiTransferFormData,
  type MultiTransferFormData,
  type PropertyItem,
} from "@/lib/stores/multi-transfer-tax-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { CalculationRecord } from "@/lib/storage/types";
import { extractTaxYear } from "./cross-104-5-history";

/** 재계산 가능 여부 — 불가하면 사유를 그대로 화면에 쓴다 */
export type RecalcEligibility =
  | { ok: true; kind: "multi" | "single" }
  | { ok: false; reason: string };

/**
 * 부동산 이력이 재계산 가능한가.
 *
 * - 다자산 이력(`inputData.__multiTransfer`) → `properties`가 그대로 있다
 * - 단건 이력 → `PropertyItem` **하나**로 감싼다
 *   (`mode:"single"`은 **assets 1건**이다 — 2건 이상이면 `bundled`이고 그쪽은 이미
 *    `aggregated`를 품고 있어 재계산이 불필요하다. `transfer-tax-api.ts:726`)
 * - `mode:"mixed-use"` → ❌ 미지원(W-1)
 */
export function checkRealEstateRecalc(record: CalculationRecord): RecalcEligibility {
  const input = (record.inputData ?? {}) as Record<string, unknown>;
  const result = (record.resultData ?? {}) as Record<string, unknown>;

  if (result.mode === "mixed-use") {
    return {
      ok: false,
      reason:
        "겸용주택(주택·상가 겸용) 계산은 합산 화면에서 다시 계산할 수 없습니다. " +
        "양도소득세 다건 계산기에서 직접 계산해 주세요.",
    };
  }
  if (input.__multiTransfer === true) {
    if (!Array.isArray(input.properties) || input.properties.length === 0) {
      return { ok: false, reason: "저장된 자산 목록이 비어 있어 다시 계산할 수 없습니다." };
    }
    return { ok: true, kind: "multi" };
  }
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    return { ok: false, reason: "저장된 입력이 비어 있어 다시 계산할 수 없습니다." };
  }
  return { ok: true, kind: "single" };
}

/**
 * 부동산 재계산 → `AggregateTransferResult`(호별 echo 포함).
 *
 * ⚠️ `annualBasicDeductionUsed`는 **문자열**로 넣는다 —
 *   `multi-transfer-tax-api.ts:267`이 `parseAmount(...)`로 파싱한다(계획서 X-1).
 */
export async function recalcRealEstate(
  record: CalculationRecord,
  opts: { annualBasicDeductionUsed?: number } = {},
): Promise<AggregateTransferResult> {
  const eligibility = checkRealEstateRecalc(record);
  if (!eligibility.ok) throw new Error(eligibility.reason);

  const input = (record.inputData ?? {}) as Record<string, unknown>;
  const used = String(opts.annualBasicDeductionUsed ?? 0);

  if (eligibility.kind === "multi") {
    const form = input as unknown as MultiTransferFormData;
    const properties = form.properties;
    return callMultiTransferTaxAPI({ ...form, annualBasicDeductionUsed: used }, properties);
  }

  // 단건 폼 → PropertyItem 하나. 나머지 필드는 **기본값 상수**에서 가져온다(복제 금지 — W-4).
  const singleForm = input as unknown as TransferFormData;
  const taxYear = extractTaxYear(record) ?? new Date().getFullYear();
  const multiForm: MultiTransferFormData = {
    ...defaultMultiTransferFormData,
    taxYear,
    annualBasicDeductionUsed: used,
    properties: [],
  };
  const properties: PropertyItem[] = [
    {
      propertyId: "recalc-1",
      propertyLabel: typeof record.title === "string" && record.title.trim() ? record.title : "자산 1",
      form: singleForm,
      completionPercent: 100,
      sourceCalculationId: record.id,
    },
  ];
  return callMultiTransferTaxAPI(multiForm, properties);
}

/**
 * 기타자산(주식 마법사) 재계산 → `StockTransferResult`(호별 echo 포함).
 *
 * 구 버전 이력은 `clause1Bucket*`·`clause9*`가 없는데, 폼을 그대로 다시 태우면 C-3a echo가 붙는다.
 *
 * ⚠️ `realEstateGroupBasicDeductionUsed`도 **문자열**이다 —
 *   `stock-transfer-tax-api.ts:589`가 `parseIntOrZero(...)`로 파싱한다(X-1).
 */
export async function recalcOtherAsset(
  record: CalculationRecord,
  opts: { realEstateGroupBasicDeductionUsed?: number } = {},
): Promise<StockTransferResult> {
  const input = record.inputData;
  if (!input || typeof input !== "object") {
    throw new Error("저장된 입력이 없어 다시 계산할 수 없습니다.");
  }
  const form = {
    ...(input as unknown as StockTransferFormData),
    realEstateGroupBasicDeductionUsed: String(opts.realEstateGroupBasicDeductionUsed ?? 0),
  };
  return callStockTransferTaxAPI(form);
}

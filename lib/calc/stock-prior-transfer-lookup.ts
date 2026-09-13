/**
 * 과점주주 특정주식 — **기신고 이력 조회·합산** Mediator (UI ↔ Storage ↔ Engine leaf)
 *
 * 영 §158② 재계산은 **한 건의 신고에 다섯 값**을 요구한다: 양도가액 · 취득가액 · 필요경비 ·
 * 누적 양도비율 · **기납부세액**(영 §168②). 손으로 합산하면 그 다섯이 서로 어긋나도
 * **아무 게이트가 잡지 못한다**. 이력에서 고르면 다섯이 **한 소스에서 파생**된다.
 *
 * ## 선례 — 증여세 사전증여 §47 합산과 같은 형태다
 *
 * | | 사전증여 | **여기** |
 * |---|---|---|
 * | 합산 창 | 10년 (§47②) | **3년** (영 §158②) |
 * | 그룹 키 | 동일인(증여자) | **동일 법인**(`securityCode` → `securityName`) |
 * | 기납부 인용 | §28 | **영 §168②** 「대주주로서 납부하였거나 납부할 세액」 |
 * | Mediator | `prior-gift-lookup.ts` | 이 파일 |
 *
 * ## 책임 경계 (`history-lookup-modal` 4-레이어 표준)
 *
 * - 후보 함수는 `records` 인자만 받는다 — repository 호출은 **모달 책임**이다.
 * - 손상 레코드는 `warnings` 에 기록하고 **조용히 건너뛴다**(throw 금지).
 * - 3년 창 판정은 **엔진 leaf** `block-shareholder-gate.ts` 를 재사용한다 — 여기서 다시 쓰면
 *   수동 입력 경로(PA-5)와 판정이 갈린다([[feedback_shared_predicate_argument_parity]]).
 *
 * ## 🔴 이력의 `resultData` 는 «항상» 단건 형태다
 *
 * `StockTransferTaxCalculator.tsx:165-167` 이 다건 계산 후에도
 * `setResult(agg.items[agg.items.length - 1] ?? null)` 로 **마지막 종목을 대표**로 저장한다.
 * `AggregateStockTransferResult` 는 이력에 저장되지 않는다.
 *
 * ⇒ mediator 는 **한 형태만** 다루면 된다. 대신 **다건 신고의 «비대표» 종목은 이력에 없다** —
 *   모달이 그 한계를 문구로 알리고, 수동 입력 경로를 반드시 남긴다.
 */

import type { CalculationRecord } from "@/lib/storage/types";
import { isWithinAggregationWindow } from "@/lib/tax-engine/stock-transfer/block-shareholder-gate";

// ============================================================
// 공개 타입
// ============================================================

export interface PriorStockTransferCandidate {
  /** `record.id` — 선택 후 `blockShareholderSourceIds` 로 전달 */
  calculationId: string;
  /** ISO YYYY-MM-DD */
  transferDate: string;
  clientId: string | null;
  /** 동일 법인 판정 키 (표시용) */
  securityName: string;
  securityCode?: string;
  /** 양도 주식수 — 누적 양도비율 **분자** */
  shareCount: number;
  transferPrice: number;
  acquisitionPrice: number;
  /** 필요경비 (⚠️ result 필드명은 `expenses` 다 — `necessaryExpense` 아님) */
  expenses: number;
  /** 영 §168② 차감 후보 — **§94①3호로 과세된 건만** 합산한다(아래 플래그 참조) */
  calculatedTax: number;
  appliedSection94: string;
  /**
   * 이미 `①4다`(기타자산·과점주주)로 신고된 건인가.
   *
   * 🔴 그런 회차의 세액은 「**대주주로서**」 낸 것이 아니라 **기타자산으로** 낸 것이라
   *    영 §168② 문언에 닿지 않는다 ⇒ **기납부 합산에서 제외**한다.
   *    다만 양도가액·주식수 합산에는 필요할 수 있으므로 **선택 자체는 막지 않는다**(배지로 경고).
   */
  wasAlreadyBlockShareholder: boolean;
  createdAt: string;
  title: string;
}

export type StockLookupWarningReason =
  | "different_security"
  | "exceed_3y"
  | "future_date"
  | "different_client"
  | "result_missing";

export interface StockLookupWarning {
  calculationId: string;
  reason: StockLookupWarningReason;
  message: string;
}

export interface StockPriorTransferLookupResult {
  candidates: PriorStockTransferCandidate[];
  warnings: StockLookupWarning[];
}

export interface StockPriorTransferLookupContext {
  /** 최종(이번) 양도일 — 3년 창 기산점 */
  transferDate: Date;
  /** 이번 신고의 법인 — 동일 법인 판정 키 */
  securityName: string;
  securityCode?: string;
  /** 세무사 모드 격리 (null = 본인) */
  clientId: string | null;
  /** 이미 선택된 건(중복 제시 방지) */
  excludeIds?: readonly string[];
}

// ============================================================
// 내부 헬퍼
// ============================================================

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** ISO(YYYY-MM-DD) 앞 10자만 취한다 — 저장 형태가 Date 직렬화일 수 있다. */
function isoDate(v: unknown): string {
  const s = str(v);
  if (s) return s.slice(0, 10);
  return "";
}

/**
 * 동일 법인 판정 — **종목코드 우선, 없으면 종목명**.
 *
 * 코드는 있으면 확실하지만 비상장은 대개 비어 있다. 이름은 표기 흔들림(「(주)」·공백)이
 * 있으므로 정규화 후 비교한다.
 */
function isSameCorporation(
  a: { name: string; code?: string },
  b: { name: string; code?: string },
): boolean {
  if (a.code && b.code) return a.code === b.code;
  // ㈜(U+327C 합자)·(주)·주식회사 를 모두 지운다 — 같은 법인이 세 표기로 저장될 수 있다.
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/㈜|\(주\)|주식회사/g, "");
  return norm(a.name) !== "" && norm(a.name) === norm(b.name);
}

// ============================================================
// 후보 추출
// ============================================================

/**
 * 영 §158② — 합산 후보 추출. **5축**으로 거른다:
 *
 * | 축 | 조건 | 불합격 |
 * |---|---|---|
 * | 세목 | `taxType === "stock_transfer"` | (조용히 제외) |
 * | 법인 | 종목코드 우선, 없으면 종목명 | `different_security` |
 * | 창 | 소급 **3년** 내 (엔진 leaf 위임) | `exceed_3y` |
 * | 방향 | 이번 양도일 **이전** | `future_date` |
 * | 의뢰인 | `clientId` 일치 | `different_client` |
 */
export function filterPriorStockTransferCandidates(
  records: readonly CalculationRecord[],
  ctx: StockPriorTransferLookupContext,
): StockPriorTransferLookupResult {
  const candidates: PriorStockTransferCandidate[] = [];
  const warnings: StockLookupWarning[] = [];
  const excluded = new Set(ctx.excludeIds ?? []);

  for (const rec of records) {
    if (rec.taxType !== "stock_transfer") continue;
    if (excluded.has(rec.id)) continue;

    const input = (rec.inputData ?? {}) as Record<string, unknown>;
    const result = (rec.resultData ?? {}) as Record<string, unknown>;

    const securityName = str(input.securityName);
    const securityCode = str(input.securityCode) || undefined;

    if (
      !isSameCorporation(
        { name: securityName, code: securityCode },
        { name: ctx.securityName, code: ctx.securityCode },
      )
    ) {
      warnings.push({
        calculationId: rec.id,
        reason: "different_security",
        message: `다른 법인(${securityName || "종목명 없음"}) — 합산 대상이 아닙니다`,
      });
      continue;
    }

    if (rec.clientId !== ctx.clientId) {
      warnings.push({
        calculationId: rec.id,
        reason: "different_client",
        message: "다른 의뢰인의 계산입니다",
      });
      continue;
    }

    const dateStr = isoDate(input.transferDate);
    const d = dateStr ? new Date(dateStr) : undefined;
    if (!d || Number.isNaN(d.getTime())) {
      warnings.push({
        calculationId: rec.id,
        reason: "result_missing",
        message: "양도일이 없어 합산 기간을 판정할 수 없습니다",
      });
      continue;
    }
    if (d.getTime() > ctx.transferDate.getTime()) {
      warnings.push({
        calculationId: rec.id,
        reason: "future_date",
        message: `이번 양도일(${ctx.transferDate.toISOString().slice(0, 10)}) 이후 건입니다`,
      });
      continue;
    }
    // 3년 창 — 엔진 leaf 단일 소스. 여기서 다시 계산하지 않는다.
    if (!isWithinAggregationWindow(d, ctx.transferDate)) {
      warnings.push({
        calculationId: rec.id,
        reason: "exceed_3y",
        message: `양도일(${dateStr})이 소급 3년을 넘어 영 §158② 합산 대상이 아닙니다`,
      });
      continue;
    }

    // 결과가 비었으면 합산에 쓸 값이 없다 — 조용히 건너뛰지 않고 사유를 남긴다.
    const transferPrice = num(result.transferPrice);
    const shareCount = num(result.shareCount);
    if (transferPrice <= 0 || shareCount <= 0) {
      warnings.push({
        calculationId: rec.id,
        reason: "result_missing",
        message: "계산 결과(양도가액·주식수)가 없어 합산할 수 없습니다",
      });
      continue;
    }

    const appliedSection94 = str(result.appliedSection94);
    candidates.push({
      calculationId: rec.id,
      transferDate: dateStr,
      clientId: rec.clientId,
      securityName,
      ...(securityCode ? { securityCode } : {}),
      shareCount,
      transferPrice,
      acquisitionPrice: num(result.acquisitionPrice),
      expenses: num(result.expenses),
      calculatedTax: num(result.calculatedTax),
      appliedSection94,
      wasAlreadyBlockShareholder: appliedSection94 === "①4다",
      createdAt: rec.createdAt,
      title: rec.title,
    });
  }

  // 양도일 오름차순 — 「최초 양도일」이 맨 앞에 오게 한다.
  candidates.sort((a, b) =>
    a.transferDate === b.transferDate
      ? a.createdAt.localeCompare(b.createdAt)
      : a.transferDate.localeCompare(b.transferDate),
  );
  return { candidates, warnings };
}

// ============================================================
// 선택 → 합산
// ============================================================

/** 모달이 폼에 되돌려 줄 값 — **전부 폼 단위**(금액·주식수는 정수 문자열, 비율은 % 문자열). */
export interface BlockShareholderAggregation {
  /** 선택 건 양도가액 합계 (당회차 **제외**) */
  priorTransferPrice: number;
  priorAcquisitionPrice: number;
  priorExpenses: number;
  priorShareCount: number;
  /** 영 §168② — **§94①3호로 과세된 건만** 합산 */
  priorMajorShareholderTax: number;
  /** 영 §158② 합산기간 최초 양도일 (ISO) — 선택 건 중 가장 이른 날 */
  aggregationFirstTransferDate: string;
  /** 기납부 합산에서 **제외된** 건 (이미 `①4다`) — 모달이 배지로 알린다 */
  excludedFromPriorTaxIds: string[];
  sourceIds: string[];
}

/**
 * 선택된 후보를 합산한다. **당회차는 포함하지 않는다** — 호출부가 자기 입력과 더한다.
 *
 * 🔴 `priorMajorShareholderTax` 는 **「3호로 과세된 건」만** 더한다(영 §168② 「**대주주로서**
 *    납부하였거나 납부할 세액」). 이미 `①4다` 로 신고된 회차는 기타자산으로 낸 것이라
 *    그 문언에 닿지 않는다.
 */
export function aggregatePriorStockTransfers(
  selected: readonly PriorStockTransferCandidate[],
): BlockShareholderAggregation {
  const excludedFromPriorTaxIds: string[] = [];
  let priorMajorShareholderTax = 0;
  let priorTransferPrice = 0;
  let priorAcquisitionPrice = 0;
  let priorExpenses = 0;
  let priorShareCount = 0;
  let first = "";

  for (const c of selected) {
    priorTransferPrice += c.transferPrice;
    priorAcquisitionPrice += c.acquisitionPrice;
    priorExpenses += c.expenses;
    priorShareCount += c.shareCount;
    if (c.wasAlreadyBlockShareholder) {
      excludedFromPriorTaxIds.push(c.calculationId);
    } else {
      priorMajorShareholderTax += c.calculatedTax;
    }
    if (!first || c.transferDate < first) first = c.transferDate;
  }

  return {
    priorTransferPrice,
    priorAcquisitionPrice,
    priorExpenses,
    priorShareCount,
    priorMajorShareholderTax,
    aggregationFirstTransferDate: first,
    excludedFromPriorTaxIds,
    sourceIds: selected.map((c) => c.calculationId),
  };
}

/**
 * 요건③ 누적 양도비율(%) — `(선택 건 주식수 + 당회차 주식수) ÷ 발행주식총수 × 100`.
 *
 * 분모는 「**해당 법인의 주식등 합계액**」이다(법 §94①4다 · 영 §158② 후단 ·
 * 국세청 서면-2023-법규재산-0816). 「과점주주 보유분」이 아니다.
 *
 * 발행주식총수가 없으면 **계산하지 않는다**(undefined) — 0 을 돌려주면 「요건 미달」로
 * 읽혀 조용히 틀린 판정이 된다.
 */
export function computeCumulativeTransferRatioPercent(
  priorShareCount: number,
  currentShareCount: number,
  totalIssuedShares: number,
): number | undefined {
  if (!(totalIssuedShares > 0)) return undefined;
  return ((priorShareCount + currentShareCount) / totalIssuedShares) * 100;
}

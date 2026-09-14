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
import { parseIntOrUndef } from "./stock-transfer-tax-api-parse";

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
   * 이미 `①4다`(기타자산·과점주주)로 신고된 건인가 — **표시 전용 플래그**다.
   *
   * 🔴 **합산에서 빼지 않는다**(2026-09-14 결정). 종전에는 이 값이 참이면 기납부세액을
   *    합산에서 제외했다 — 영 §168② 「**대주주로서** 납부하였거나 납부할 세액」 문언에
   *    닿지 않는다는 해석이었다. 그러나 §94①4 다목 **요건 판정 자체가 사용자 입력 축**이고,
   *    기신고를 어떤 조문으로 했는지는 **사용자가 알고 고르는 것**이다. 프로그램이 과거 신고의
   *    성격을 근거로 차감을 **자동으로 깎으면** 사용자가 되돌릴 방법이 없고, 방향이
   *    **납세자에게 불리**하다([[feedback_no_unfavorable_application_without_legal_basis]]).
   *    ⇒ 전액 합산하고, 어떤 조문으로 신고된 건인지는 **배지로 알리기만** 한다.
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

/**
 * 양도 주식수 — **2단 소스**로 읽는다.
 *
 * | 순위 | 소스 | 형태 |
 * |---|---|---|
 * | 1 | `resultData.shareCount` | number (엔진 echo) |
 * | 2 | `inputData.shareCount` | **문자열** (폼 — `calc-wizard-stock-form-types.ts:99`) |
 *
 * 🔴 2순위가 없으면 **이미 저장된 이력은 영원히 후보가 되지 못한다**. 결과 echo는
 *    2026-09-14에 추가됐고(`stock-transfer.types.ts` `shareCount`), 그 이전 이력에는
 *    `resultData`에 수량이 **아예 없다** — 그 때문에 이 기능이 후보를 한 건도 내지 못했다.
 *
 * 파서는 ④ API 변환과 **같은 것**을 쓴다(`stock-transfer-tax-api.ts:145`가 쓰는
 * `parseIntOrUndef`) — 폼 문자열 해석이 두 곳에서 갈리지 않게 한다.
 */
function resolveShareCount(
  result: Record<string, unknown>,
  input: Record<string, unknown>,
): number {
  const fromResult = num(result.shareCount);
  if (fromResult > 0) return fromResult;
  return parseIntOrUndef(str(input.shareCount)) ?? 0;
}

/**
 * 금액 3종을 **당회차분 우선**으로 읽는다 — 2단 소스.
 *
 * | 순위 | 키 | 의미 |
 * |---|---|---|
 * | 1 | `ownTransferPrice`·`ownAcquisitionPrice`·`ownExpenses` | 그 회차 **자기 몫** |
 * | 2 | `transferPrice`·`acquisitionPrice`·`expenses` | 합산 **후** 총액 |
 *
 * 🔴 **1순위가 핵심이다.** 그 회차가 이미 앞선 회차를 합산해 신고한 건이면 총액에는
 *    **앞 회차분이 들어 있다**. 그것을 그대로 후보 값으로 쓰면 3차 양도에서 1차분이
 *    **두 번** 더해진다(계획서 D-5 — 실측으로 확인된 결함).
 *
 * 2순위는 **구 이력 호환**이다. `own*` echo 는 2026-09-14에 생겼고, 그 이전 이력에는 없다.
 * 그때는 합산 자체가 폼 레벨이었으므로 저장된 총액이 사실상 그 회차분인 경우가 많지만,
 * **합산해 신고한 건이라면 총액이다** — 그래서 모달이 값을 그대로 보여 주고 사용자가
 * 확인·수정할 수 있게 남긴다.
 */
function ownAmount(
  result: Record<string, unknown>,
  ownKey: string,
  totalKey: string,
): number {
  const own = num(result[ownKey]);
  if (own > 0) return own;
  return num(result[totalKey]);
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
    const transferPrice = ownAmount(result, "ownTransferPrice", "transferPrice");
    const shareCount = resolveShareCount(result, input);
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
      acquisitionPrice: ownAmount(result, "ownAcquisitionPrice", "acquisitionPrice"),
      expenses: ownAmount(result, "ownExpenses", "expenses"),
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
  /**
   * 영 §168② 기납부세액 — **선택한 건 전부**를 더한다(조문 구분 없이).
   * 어떤 조문으로 신고된 건을 넣을지는 사용자가 모달에서 고른다.
   */
  priorMajorShareholderTax: number;
  /** 영 §158② 합산기간 최초 양도일 (ISO) — 선택 건 중 가장 이른 날 */
  aggregationFirstTransferDate: string;
  /** 이미 `①4다` 로 신고된 건 — **합산은 됐고**, 모달이 배지로 알리기만 한다 */
  alreadyBlockShareholderIds: string[];
  sourceIds: string[];
}

/**
 * 선택된 후보를 합산한다. **당회차는 포함하지 않는다** — 호출부가 자기 입력과 더한다.
 *
 * 🔴 `priorMajorShareholderTax` 는 **선택된 건을 전부** 더한다 — 기신고가 `①3`이든 `①4다`든
 *    가리지 않는다(2026-09-14 결정). 조문별 자동 배제를 두면 사용자가 고른 건이 조용히
 *    빠지고, 그 방향이 **납세자에게 불리**하다. 무엇을 넣을지는 **사용자가 고른다** —
 *    모달이 각 건의 신고 조문을 배지로 보여 주므로 빼고 싶으면 **선택을 해제**하면 된다.
 */
export function aggregatePriorStockTransfers(
  selected: readonly PriorStockTransferCandidate[],
): BlockShareholderAggregation {
  const alreadyBlockShareholderIds: string[] = [];
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
    priorMajorShareholderTax += c.calculatedTax;
    if (c.wasAlreadyBlockShareholder) {
      // 표시용으로만 모은다 — 합산에서 빼지 않는다.
      alreadyBlockShareholderIds.push(c.calculationId);
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
    alreadyBlockShareholderIds,
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

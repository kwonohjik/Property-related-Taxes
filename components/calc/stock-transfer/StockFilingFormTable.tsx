"use client";

/**
 * 주식 양도소득세 신고서 양식 표 — 렌더 컴포넌트 (JSX만)
 *
 * 32행 고정 신고서 양식 (별지 제84호 서식 — 주식 적용)
 * 계산 헬퍼·타입은 StockFilingFormTableHelpers.ts 에 분리 (800줄 정책).
 *
 * 부동산 FilingFormTable.tsx 패턴 차용.
 */

import { cn } from "@/lib/utils";
import {
  type StockFilingFormTableProps,
  deriveColumns,
  buildRows,
  fmtCell,
} from "./StockFilingFormTableHelpers";

export type { StockFilingFormTableProps };

// ── 열 폭 (px) — 근거는 컴포넌트 본문 `dataColPx` 주석 · 계획서 §5.3(b) ──
/** 항목 열 — 최장 라벨(418px)을 2행에 담는다. 제보 「2.5배」(실측 88px × 2.5) */
const ITEM_COL_PX = 220;
/** 합계 열(다자산) — 금액 전용. 제보 「2/5」(실측 355px × 0.4 = 142 → 여유 포함 150) */
const TOTAL_COL_PX = 150;
/** 합계 열(단건) — 데이터 열이 하나뿐이라 설명 문자열을 담을 여유를 준다 */
const SINGLE_TOTAL_COL_PX = 340;
/** 종목 열 — 헤더 `종목 2 (비상장 대주주)` 실측 173px 수용 (242px → −21%) */
const STOCK_COL_PX = 190;

export function StockFilingFormTable({
  result,
  aggregate,
  onPrint,
  title = "주식 양도소득세 신고서",
  subtitle = "소득세법 §105·§110 기준 — 참고용 (실제 신고서식과 다를 수 있음)",
  stockName,
  taxpayerName,
  stockCode,
  brokerName,
  accountNumber,
  filingYear,
}: StockFilingFormTableProps) {
  const { columns } = deriveColumns(result, aggregate);
  const rows = buildRows(result, columns, aggregate);
  const isMulti = Boolean(aggregate && aggregate.items.length > 1);

  /**
   * 열 폭 — **실측 기반**이다(계획서 §5.3(b), Playwright 3종목 · viewport 1280).
   *
   * | 열 | 종전 실측 | 목표 | 근거 |
   * |---|---:|---:|---|
   * | 항목 | 88px | 220px | 제보 「2.5배」. 최장 라벨도 2행에 든다(1행은 418px 필요) |
   * | 합계 | 355px | 150px | 제보 「2/5」. 금액 최장 `149,000,000` ≈ 119px(padding 포함) |
   * | 종목 | 242px | 190px | 헤더 `종목 2 (비상장 대주주)` 실측 173px 수용 |
   *
   * 🔑 종전 합계 열을 355px 로 밀어낸 것은 **금액이 아니라 설명 문자열**이었다
   *   (`예정신고: 반기 말일 + 2개월 / …` max-content 441px). 그래서 폭을 조이는 것만으로는
   *   부족하고 아래 `isTextCell` 의 줄바꿈 허용이 **같이** 가야 한다.
   *
   * ⚠️ 단건 모드는 데이터 열이 합계 하나뿐이라 종목 열 예산이 통째로 남는다 — 좁히면 설명
   *   문자열이 불필요하게 접힌다. 그래서 단건에서만 합계 열을 넓게 준다.
   */
  const dataColPx = (key: string) =>
    key === "total" ? (isMulti ? TOTAL_COL_PX : SINGLE_TOTAL_COL_PX) : STOCK_COL_PX;
  const dataColsPx = columns.reduce((s, c) => s + dataColPx(c.key), 0);

  return (
    <div
      data-print-section="stock-form-table"
      className="rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black"
    >
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b bg-slate-100 dark:bg-slate-800 border-slate-300 print:bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {title}
                </h3>
                {stockName && !isMulti && (
                  <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">
                    {stockName}
                  </span>
                )}
                {isMulti && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                    다자산 합산 ({aggregate!.items.length}종목)
                  </span>
                )}
                {result.isExempt && !isMulti && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                    비과세
                  </span>
                )}
              </div>
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="print:hidden shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-200 transition-colors text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  PDF
                </button>
              )}
            </div>
            <p className="text-caption text-slate-500 mt-0.5">{subtitle}</p>
            {/* 신고서 헤더 메타 정보 (§4.2 디자인) */}
            {(taxpayerName || stockName || stockCode || brokerName || accountNumber || filingYear) && (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 text-caption text-slate-600 border-t border-slate-200 pt-2">
                {taxpayerName && (
                  <div className="flex gap-1"><span className="text-slate-400">양도인:</span><span>{taxpayerName}</span></div>
                )}
                {(stockName || stockCode) && (
                  <div className="flex gap-1">
                    <span className="text-slate-400">종목:</span>
                    <span>{stockName}{stockCode ? ` (${stockCode})` : ""}</span>
                  </div>
                )}
                {filingYear && (
                  <div className="flex gap-1"><span className="text-slate-400">과세연도:</span><span>{filingYear}년</span></div>
                )}
                {brokerName && (
                  <div className="flex gap-1"><span className="text-slate-400">증권사:</span><span>{brokerName}</span></div>
                )}
                {accountNumber && (
                  <div className="flex gap-1"><span className="text-slate-400">계좌번호:</span><span>{accountNumber}</span></div>
                )}
              </div>
            )}
          </div>

          {/* 표 */}
          <table
            className="text-xs border-collapse"
            // 🔴 `width: "auto"` 였다. 테이블 폭이 auto 면 브라우저가 fixed 알고리즘을 적용할
            //    기준이 없어 **내용 기반(shrink-to-fit)으로 폴백**하고, `<col>` 폭은 강제값이
            //    아니라 선호 힌트로 격하된다 — 지정 220/130 이 실측 88/355 로 무너졌다
            //    (계획서 §5.1 · Playwright 실측). 총폭을 명시해야 지정이 지켜진다.
            style={{ width: `${ITEM_COL_PX + dataColsPx}px`, tableLayout: "fixed" }}
          >
            <colgroup>
              {/* 항목 열 */}
              <col style={{ width: `${ITEM_COL_PX}px` }} />
              {/* 데이터 열 — 합계는 금액만 담아 좁게, 종목은 헤더 라벨을 담을 만큼 */}
              {columns.map((c) => (
                <col key={c.key} style={{ width: `${dataColPx(c.key)}px` }} />
              ))}
            </colgroup>

            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-3 py-2 border-b border-r border-slate-200 font-semibold sticky left-0 bg-slate-50 dark:bg-slate-800/50 print:static">
                  항목
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      // 헤더 라벨은 텍스트다 — 좁힌 폭을 넘기면 접히게 둔다(종전 nowrap 은
                      // `종목 2 (비상장 대주주)` 173px 를 강제해 열 폭의 하한이 됐다).
                      "text-right px-3 py-2 border-b border-r border-slate-200 font-semibold",
                      c.key === "total" && "bg-slate-100 dark:bg-slate-800",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-slate-100",
                    row.highlight && "bg-amber-50/60 dark:bg-amber-950/30 font-semibold",
                    row.separatorAfter && "border-b-2 border-slate-300",
                  )}
                >
                  {/* 항목 열 (sticky) */}
                  <td
                    className={cn(
                      "px-3 py-1.5 border-r border-slate-200 sticky left-0 bg-white dark:bg-slate-900 print:static",
                      row.indent && "pl-7 text-slate-500",
                      row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
                    )}
                  >
                    {row.label}
                  </td>

                  {/* 데이터 열 */}
                  {columns.map((c) => {
                    const note = row.notes?.[c.key];
                    const roseNote = row.roseNotes?.[c.key];
                    /**
                     * 🔑 nowrap 을 **열 단위가 아니라 «값 종류» 단위**로 건다.
                     *
                     * `RowDef.values` 는 `number | string | null` 이고 타입 주석이 축을 이미
                     * 말한다 — 「number=금액, string=날짜·기간 등 텍스트」.
                     *   · 금액  → nowrap 유지. 천단위 콤마가 끊기면 안 된다(`amount-column-align`).
                     *   · 문자열 → 줄바꿈 허용. 종전에는 이것까지 nowrap 이라 441px 짜리 설명이
                     *     열을 밀어냈고, 폭을 조이면 **셀 밖으로 넘친다**(anchor A-7).
                     */
                    const isTextCell = typeof row.values[c.key] === "string";
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-1.5 text-right border-r border-slate-200 font-mono tabular-nums",
                          isTextCell ? "whitespace-normal break-words" : "whitespace-nowrap",
                          c.key === "total" && "bg-slate-50/60 dark:bg-slate-800/40",
                          (note || roseNote) && "align-top",
                        )}
                      >
                        {fmtCell(row.values[c.key])}
                        {roseNote && (
                          <div className="text-micro font-sans font-normal text-rose-600 leading-tight mt-0.5 whitespace-normal text-right">
                            {roseNote}
                          </div>
                        )}
                        {note && (
                          <div className="text-micro font-sans font-normal text-slate-500 leading-tight mt-0.5 whitespace-normal text-right">
                            {note}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 주석 */}
          <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-200 text-caption text-slate-400 space-y-0.5">
            <p>* 금액 단위: 원. 본세·가산세 10원 미만 절사 (국고금 관리법 §47①).</p>
            <p>* 지방소득세: 산출세액 × 10%, 10원 미만 절사 (지방세법 §103의3).</p>
            <p>* 본 표는 참고용입니다. 실제 신고는 양도소득세 과세표준 신고서 (별지 제84호 서식)를 사용하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

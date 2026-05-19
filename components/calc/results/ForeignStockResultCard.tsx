"use client";

/**
 * ForeignStockResultCard — 해외주식 양도소득세 결과 카드 (PR-4A, ⑦ 동기화 지점)
 *
 * 결과 산식 한국어 풀어쓰기 (feedback_result_view_korean_formula):
 *   - 변수 약어·floor() 금지
 *   - 법정 용어 우선 (산출세액·과세표준·양도소득금액)
 *   - 숫자 끝 "원" 단위 표기 금지 (feedback_no_won_suffix)
 *
 * 법조문 참조: §118의2 / §118의4 / §118의5 / §118의6 / §178의5
 */

import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

interface ForeignStockResultCardProps {
  result: ForeignStockResult;
  /** 종목명 (표시용) */
  stockName?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function pct(r: number): string {
  return (r * 100).toFixed(1) + "%";
}

// ── 항목 행 ──
function Row({
  label,
  value,
  sub,
  highlight,
  indent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between py-1.5 ${
        indent ? "pl-4" : ""
      } ${highlight ? "font-semibold text-sky-800" : "text-slate-700"}`}
    >
      <span className="text-sm leading-relaxed">{label}</span>
      <div className="text-right ml-4 shrink-0">
        <span className="text-sm tabular-nums">{typeof value === "number" ? fmt(value) : value}</span>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-slate-200 my-1" />;
}

export function ForeignStockResultCard({ result, stockName }: ForeignStockResultCardProps) {
  // 납세의무 없음 (§118의2 5년 미만)
  if (!result.isLiable) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-amber-800">납세의무 없음 (§118의2)</span>
        </div>
        <p className="text-sm text-amber-700 leading-relaxed">
          {result.ineligibleReason ?? "국내 거주 기간이 5년 미만이어서 §118의2에 따라 납세의무가 없습니다."}
        </p>
        <p className="text-xs text-amber-600 mt-2">세액: 0</p>
      </div>
    );
  }

  const hasForeignTaxCredit =
    result.foreignTaxCreditApplied !== undefined && result.foreignTaxCreditApplied > 0;
  const hasForeignTaxExpense =
    result.foreignTaxExpenseApplied !== undefined && result.foreignTaxExpenseApplied > 0;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-sky-800">
            해외주식 양도소득세 결과 (§94①3 다목)
          </span>
          {stockName && (
            <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded font-medium">
              {stockName}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-sky-700">{fmt(result.totalTax)}</span>
          <span className="text-sm text-sky-600">총 납부세액 (소득세 + 지방소득세)</span>
        </div>
      </div>

      {/* 환율 환산 표 (§178의5) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500 mb-2">환율 환산 (§178의5)</p>

        <Row
          label={`양도가액 (외화)`}
          value={`— × ${fmt(result.transferExchangeRate)} = ${fmt(result.transferPriceKrw)}`}
          sub="양도가액(외화) × 양도일 기준환율"
        />
        <Row
          label={`취득가액 (외화)`}
          value={`— × ${fmt(result.acquisitionExchangeRate)} = ${fmt(result.acquisitionPriceKrw)}`}
          sub="취득가액(외화) × 취득일 기준환율"
          indent
        />
        {result.foreignTaxPaidKrw !== undefined && result.foreignTaxPaidKrw > 0 && (
          <Row
            label="외국납부세액 (원화)"
            value={fmt(result.foreignTaxPaidKrw)}
            sub={`외국납부세액(외화) × 납세일 기준환율 ${result.foreignTaxExchangeRate !== undefined ? fmt(result.foreignTaxExchangeRate) : ""}`}
            indent
          />
        )}
      </div>

      {/* 양도차익 계산 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500 mb-2">양도차익 계산 (§118의8 준용)</p>

        <Row label="양도가액 (원화 환산)" value={result.transferPriceKrw} />
        <Row label="취득가액 (원화 환산)" value={result.acquisitionPriceKrw} indent />
        <Row
          label="필요경비 (자본적지출 + 양도비)"
          value={result.necessaryExpensesKrw}
          sub={hasForeignTaxExpense ? "외국납부세액 필요경비 산입 포함" : undefined}
          indent
        />
        <Divider />
        <Row
          label="양도차익"
          value={result.transferGain}
          sub="양도가액 − 취득가액 − 필요경비"
          highlight
        />
        <Row
          label="기본공제 (§118의7)"
          value={result.basicDeduction}
          sub="250만원 (§103①·§118의10④와 별도 그룹)"
          indent
        />
        <Divider />
        <Row
          label="과세표준"
          value={result.taxBase}
          sub="양도차익 − 기본공제 (장기보유특별공제 미적용 — §118의8 단서)"
          highlight
        />
      </div>

      {/* 세율 적용 (§118의5 → §55①) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
        <p className="text-xs font-semibold text-slate-500 mb-2">세율 적용 (§118의5 → §55① 6~45% 8구간)</p>

        <Row
          label={`적용 세율: ${pct(result.appliedRate)}`}
          value={`누진공제 ${fmt(result.progressiveDeduction)}`}
          sub="§55① 8구간 누진세율"
        />
        <Row
          label="산출세액"
          value={result.incomeTax}
          sub={`과세표준 ${fmt(result.taxBase)} × ${pct(result.appliedRate)} − 누진공제 ${fmt(result.progressiveDeduction)}`}
          highlight
        />

        {/* 외국납부세액공제 (credit 선택 시) */}
        {hasForeignTaxCredit && (
          <>
            <Divider />
            <Row
              label="외국납부세액공제 (§118의6)"
              value={result.foreignTaxCreditApplied!}
              sub={`공제한도 ${fmt(result.foreignTaxCreditLimit ?? 0)} (단일 자산 — 산출세액 전액)`}
              indent
            />
            <Row
              label="외국납부세액 원화 환산"
              value={result.foreignTaxPaidKrw ?? 0}
              sub="외국납부세액(외화) × 납세일 기준환율"
              indent
            />
          </>
        )}

        <Divider />
        <Row
          label="최종 소득세"
          value={result.finalTax}
          sub={hasForeignTaxCredit ? "산출세액 − 외국납부세액공제" : "산출세액"}
          highlight
        />
        <Row
          label="지방소득세"
          value={result.localIncomeTax}
          sub="최종 소득세 × 10% (10원 미만 절사, §103의3)"
          indent
        />
        <Divider />
        <Row
          label="총 납부세액"
          value={result.totalTax}
          sub="소득세 + 지방소득세"
          highlight
        />
      </div>

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-700 mb-2">참고 사항</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 leading-relaxed">{w}</p>
          ))}
        </div>
      )}

      {/* 적용 법령 배지 */}
      {result.appliedRules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.appliedRules.map((rule, i) => (
            <span
              key={i}
              className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium"
            >
              {rule}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

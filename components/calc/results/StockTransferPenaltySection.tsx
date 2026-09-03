"use client";

/**
 * StockTransferPenaltySection — 가산세·공제 상세 카드 (분리 파일)
 *
 * StockTransferTaxResultView 800줄 정책 준수를 위해 분리 (2026-05-18).
 * 가산세 분기 매트릭스 + 신고기한 안내 + 비발동 조건.
 *
 * v3 정정 (PR-3-c, 2026-05-19) — KoreanLaw MCP 검증:
 *   - 무신고  = 국세기본법 §47조의2 (이전에는 소득세법 조문으로 오인용했다)
 *   - 과소신고 = 국세기본법 §47조의3 (이전에는 소득세법 조문으로 오인용했다)
 *   - "국제거래" → "역외거래" (법령 본문 표기)
 *   - 부정행위 분기: under_report → §47조의3 ①1호 가목 / non_report → §47조의2 ①1호
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function fmt(n: number): string {
  return n.toLocaleString();
}

interface PenaltyDetailCardProps {
  result: StockTransferResult;
  filingViolation?: "none" | "under_report" | "non_report";
  isFraudulent?: boolean;
  isInternationalTransaction?: boolean;
}

export function StockTransferPenaltySection({
  result,
  filingViolation,
  isFraudulent,
  isInternationalTransaction,
}: PenaltyDetailCardProps) {
  if (
    result.underReportPenalty <= 0 &&
    result.latePaymentPenalty <= 0 &&
    result.electronicFilingCredit <= 0
  ) {
    return null;
  }

  const violation = filingViolation || "none";
  const isNonReport = violation === "non_report";
  const isUnderReport = violation === "under_report";
  const isIntl = Boolean(isInternationalTransaction);
  const isFraud = Boolean(isFraudulent);

  const underRate = isFraud && isIntl ? 60 : isFraud ? 40 : isNonReport ? 20 : 10;
  // v3: 무신고/과소 별 분기 + 역외 괄호 분리
  //
  // ⚠️ `violation === "none"`을 **먼저** 가른다. 이 카드는 신고불성실가산세 행과 달리
  //    무조건 렌더되므로, 삼항 사슬이 none 을 「일반 과소신고 10%」로 떨어뜨리면
  //    「정상 신고 + 납부지연만」인 결과에 **없는 위반이 인쇄된다**(§47조의4 사안이 흔하다).
  const underBasis = !isNonReport && !isUnderReport
    ? "정상 신고 — 신고불성실가산세 해당 없음 (납부지연은 국세기본법 §47조의4)"
    : isFraud && isIntl
      ? isNonReport
        ? "국세기본법 §47조의2 ①1호 (괄호) — 무신고 + 역외거래 부정 60%"
        : "국세기본법 §47조의3 ①1호 가목 (괄호) — 과소신고 + 역외거래 부정 60%"
      : isFraud
        ? isNonReport
          ? "국세기본법 §47조의2 ①1호 — 무신고 부정 40%"
          : "국세기본법 §47조의3 ①1호 가목 — 과소신고 부정 40%"
        : isNonReport
          ? "국세기본법 §47조의2 ①2호 — 일반 무신고 20%"
          : "국세기본법 §47조의3 ①2호 — 일반 과소신고 10%";

  return (
    <div className="space-y-3">
      {/* 가산세·공제 상세 표 */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-5 py-4 space-y-2">
        <p className="font-semibold text-rose-800 text-sm">가산세·공제 상세</p>
        <div className="divide-y divide-rose-100 text-sm">
          {result.underReportPenalty > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-rose-600">
                {isNonReport ? "무신고" : "과소신고"} 가산세 ({underRate}%)
                {/*
                  base 를 함께 보인다 — 「산출세액 × 세율」로 오해하지 않도록.
                  국세기본법 §47조의3① 의 base 는 「과소신고납부세액등」이라 당초 신고세액·
                  기납부세액·이자상당가산액을 뺀 금액이다.
                */}
                {result.penaltyBase !== undefined && (
                  <span className="block text-xs text-rose-500 mt-0.5">
                    기준금액 {fmt(result.penaltyBase)} × {underRate}%
                  </span>
                )}
              </span>
              <span className="font-medium text-rose-900">{fmt(result.underReportPenalty)}</span>
            </div>
          )}
          {result.latePaymentPenalty > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-rose-600">납부지연 가산세 (국세기본법 §47조의4)</span>
              <span className="font-medium text-rose-900">{fmt(result.latePaymentPenalty)}</span>
            </div>
          )}
          {result.electronicFilingCredit > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-emerald-600">전자신고 세액공제 (§52의2)</span>
              <span className="font-medium text-emerald-700">−{fmt(result.electronicFilingCredit)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 가산세 분기 안내 카드 */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/40 px-5 py-4 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-rose-700 text-base">ⓘ</span>
          <div className="flex-1">
            <p className="font-semibold text-rose-800 text-sm">가산세 분기 안내</p>
            <p className="text-xs text-rose-700 mt-1">
              현재 적용된 분기:{" "}
              <strong className="text-rose-900">{underBasis}</strong>
            </p>
          </div>
        </div>

        {/* 가산세 분기 매트릭스 표 */}
        <div className="rounded-lg border border-rose-100 bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-rose-50 text-rose-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold border-b border-rose-100">구분</th>
                <th className="text-center px-3 py-2 font-semibold border-b border-rose-100 w-20">세율</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-rose-100">법령</th>
                <th className="text-left px-3 py-2 font-semibold border-b border-rose-100">적용 요건</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-50">
              <tr className={isUnderReport && !isFraud ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">일반 과소신고</td>
                <td className="px-3 py-2 text-center font-mono">10%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의3 ①2호</td>
                <td className="px-3 py-2 text-slate-600">신고한 세액이 신고하여야 할 세액보다 적은 경우</td>
              </tr>
              <tr className={isNonReport && !isFraud ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">일반 무신고</td>
                <td className="px-3 py-2 text-center font-mono">20%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의2 ①2호</td>
                <td className="px-3 py-2 text-slate-600">법정 신고기한까지 신고서 미제출</td>
              </tr>
              <tr className={isFraud && !isIntl && isUnderReport ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">부정행위 과소</td>
                <td className="px-3 py-2 text-center font-mono">40%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의3 ①1호 가목</td>
                <td className="px-3 py-2 text-slate-600">부정행위(허위 증빙 등) 동반 과소신고</td>
              </tr>
              <tr className={isFraud && !isIntl && isNonReport ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">부정행위 무신고</td>
                <td className="px-3 py-2 text-center font-mono">40%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의2 ①1호</td>
                <td className="px-3 py-2 text-slate-600">부정행위 동반 무신고</td>
              </tr>
              <tr className={isFraud && isIntl && isUnderReport ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">역외 + 부정 과소</td>
                <td className="px-3 py-2 text-center font-mono">60%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의3 ①1호 가목 (괄호)</td>
                <td className="px-3 py-2 text-slate-600">역외거래에서 발생한 부정행위로 인한 과소신고</td>
              </tr>
              <tr className={isFraud && isIntl && isNonReport ? "bg-rose-100/40 font-semibold" : ""}>
                <td className="px-3 py-2 text-slate-700">역외 + 부정 무신고</td>
                <td className="px-3 py-2 text-center font-mono">60%</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의2 ①1호 (괄호)</td>
                <td className="px-3 py-2 text-slate-600">역외거래에서 발생한 부정행위로 인한 무신고</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-slate-700">납부지연</td>
                <td className="px-3 py-2 text-center font-mono">1일 22/100,000</td>
                <td className="px-3 py-2 text-slate-500">국세기본법 §47조의4</td>
                <td className="px-3 py-2 text-slate-600">납부기한 다음날부터 1일당 약 0.022%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 신고기한 안내 */}
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 space-y-1">
          <p className="font-semibold">주식 양도세 신고기한 (§105①2호)</p>
          <p className="text-sky-700 leading-relaxed">
            예정신고: <strong>양도일이 속한 반기 말일 + 2개월</strong> (상반기 양도→8.31 / 하반기 양도→다음해 2월 말)
            <br />
            확정신고: <strong>양도일 다음해 5.1 ~ 5.31</strong> (§110)
            <br />
            법정기한 도과 시 무신고(국세기본법 §47조의2 ①2호 20%) 또는 과소신고(국세기본법 §47조의3 ①2호 10%) 자동 발동
          </p>
        </div>

        {/* 비발동 조건 안내 — 중립 표현 (memory feedback_tax_calculation_principle 준수) */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
          <p>
            <strong>가산세 비발동 조건</strong>: 법정 신고기한 내 신고서 제출 + 산출세액 정확 + 납부기한 내 완납.
            전자신고 시 §52의2에 따라 △20,000원 세액공제.
          </p>
        </div>
      </div>
    </div>
  );
}

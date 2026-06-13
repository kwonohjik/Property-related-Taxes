"use client";

/**
 * LotMatchingDetailCard — 분할 매수·분할 양도 매칭 상세 카드 (Plan v2.2)
 *
 * split 모드 활성 시 결과 화면에 노출 (보유기간 카드 직후).
 * 산정방법 배지 + sub-lot별 매칭 표 + 합계 행.
 *
 * footnote: "산정방법은 납세자 입증책임 — 세법 명문 부재"
 */

import { useState } from "react";
import type { LotMatchingDetail } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { ExpandToggleButton } from "./shared/ExpandToggleButton";

const METHOD_LABEL: Record<LotMatchingDetail["method"], string> = {
  specific: "개별법",
  fifo: "선입선출법 (FIFO)",
  moving_avg: "이동평균법",
};

const CAUSE_LABEL_FOR_DATE: Record<string, string> = {
  // §104② lot별 기산일은 cause별로 달라지므로 표시 라벨만 분기
  default: "§104② 기산일",
};

function formatDate(d: Date): string {
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10);
}

interface Props {
  detail: LotMatchingDetail;
}

export function LotMatchingDetailCard({ detail }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 my-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-violet-900 flex items-center gap-2">
          🔀 로트별 매칭 상세
          <span className="rounded-full bg-violet-200 px-2 py-0.5 text-xs font-bold text-violet-800">
            {METHOD_LABEL[detail.method]}
          </span>
        </h3>
        <ExpandToggleButton
          open={expanded}
          onClick={() => setExpanded((e) => !e)}
          tone="violet"
        />
      </div>

      <p className="text-xs text-violet-700 mb-3">
        ⓘ 산정방법은 납세자 입증책임 — 세법 명문 부재 (KoreanLaw 검증 2026-05-18 / §104②·§163)
        {detail.method === "moving_avg" && detail.weightedAvgPerShare !== undefined && (
          <span className="ml-1">
            · 이동평균 단가 (마지막 매도 적용) <strong>{detail.weightedAvgPerShare.toLocaleString()}</strong>
            <span className="ml-1 text-violet-500">— 매도별 단가는 아래 표 매수단가 열 참조</span>
          </span>
        )}
      </p>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-violet-100 text-violet-900">
                <th className="border border-violet-300 p-1.5 text-left">#</th>
                <th className="border border-violet-300 p-1.5 text-left">§104② 기산일</th>
                <th className="border border-violet-300 p-1.5 text-left">매도일</th>
                <th className="border border-violet-300 p-1.5 text-right">매칭주식수</th>
                <th className="border border-violet-300 p-1.5 text-right">매수단가</th>
                <th className="border border-violet-300 p-1.5 text-right">매도단가</th>
                <th className="border border-violet-300 p-1.5 text-right">보유일수</th>
                <th className="border border-violet-300 p-1.5 text-center">구분</th>
                <th className="border border-violet-300 p-1.5 text-right">sub양도차익</th>
                <th className="border border-violet-300 p-1.5 text-right">적용세율</th>
              </tr>
            </thead>
            <tbody>
              {detail.matched.map((sub, idx) => (
                <tr key={idx} className={sub.perLotGain < 0 ? "bg-red-50/40" : "bg-white"}>
                  <td className="border border-violet-200 p-1.5">{idx + 1}</td>
                  <td className="border border-violet-200 p-1.5">{formatDate(sub.acquisitionDate)}</td>
                  <td className="border border-violet-200 p-1.5">{formatDate(sub.saleDate)}</td>
                  <td className="border border-violet-200 p-1.5 text-right">{sub.buyShares.toLocaleString()}</td>
                  <td className="border border-violet-200 p-1.5 text-right">{sub.perShareBuyPrice.toLocaleString()}</td>
                  <td className="border border-violet-200 p-1.5 text-right">{sub.perShareSalePrice.toLocaleString()}</td>
                  <td className="border border-violet-200 p-1.5 text-right">{sub.holdingDays}</td>
                  <td className="border border-violet-200 p-1.5 text-center">
                    {sub.isShortTerm ? (
                      <span className="text-red-600 font-medium">단기</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">장기</span>
                    )}
                  </td>
                  <td className={`border border-violet-200 p-1.5 text-right ${sub.perLotGain < 0 ? "text-red-700" : ""}`}>
                    {sub.perLotGain < 0
                      ? `(${Math.abs(sub.perLotGain).toLocaleString()})`
                      : sub.perLotGain.toLocaleString()}
                  </td>
                  <td className="border border-violet-200 p-1.5 text-right">{(sub.appliedRate * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {/* 합계 행 */}
              <tr className="bg-violet-200 font-bold">
                <td colSpan={3} className="border border-violet-400 p-1.5 text-right">
                  합계
                </td>
                <td className="border border-violet-400 p-1.5 text-right">
                  {detail.matched.reduce((s, m) => s + m.buyShares, 0).toLocaleString()}
                </td>
                <td colSpan={2} className="border border-violet-400 p-1.5 text-right">
                  {detail.totalTransferPrice.toLocaleString()} − {detail.totalAcquisitionPrice.toLocaleString()}
                </td>
                <td colSpan={2} className="border border-violet-400 p-1.5 text-center">단기 {detail.shortTermGain.toLocaleString()} · 장기 {detail.longTermGain.toLocaleString()}</td>
                <td className={`border border-violet-400 p-1.5 text-right ${detail.totalGain < 0 ? "text-red-700" : ""}`}>
                  {detail.totalGain < 0
                    ? `(${Math.abs(detail.totalGain).toLocaleString()})`
                    : detail.totalGain.toLocaleString()}
                </td>
                <td className="border border-violet-400 p-1.5 text-center">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {detail.warnings.length > 0 && (
        <div className="mt-3 rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
          {detail.warnings.map((w, i) => (
            <div key={i}>⚠️ {w}</div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 mt-2">
        ※ 결과 화면의 보유기간(holdingPeriodDays)·산출세액 합계는 위 sub-lot 기준으로 산정됨.
        대주주+비SME 케이스에서 단기/장기 sub-lot이 혼재된 경우 sub-lot별 세율 적용 후 합산.
      </p>
    </div>
  );
}

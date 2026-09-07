"use client";

/**
 * 단건 마법사 사이드바의 **자산별 요약 카드**.
 *
 * `TransferTaxCalculator.tsx`에서 분리했다(800줄 정책, 2026-09-07) — 렌더 전용이라
 * 계산기의 상태·핸들러를 하나도 참조하지 않는다(입력은 `summary` 하나뿐).
 *
 * 표시 규약(components/calc/CLAUDE.md): 라벨은 항상 표시하고, 값 > 0 이면 금액,
 * 계산 후에야 알 수 있는 값이면 «계산 후 표시», 그 외(미입력·해당없음)엔 «-».
 */
import { REDUCTION_SHORT_LABELS } from "@/components/calc/transfer/reduction-short-labels";
import { ASSET_KIND_LABELS } from "@/components/calc/transfer/asset-labels";
import type { TransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";

export function TransferSidebarSummary({ summary }: { summary: TransferPerAssetSummary }) {
  // 사이드바 요약 — 자산별 카드(자산 1·2·…). 안분 모드 양도가액은 §166⑥ 기준시가 비율로
  // 자산별 산출(computeTransferPerAssetSummary). 값 > 0 이면 금액, pending 이면 «계산 후 표시»,
  // 그 외엔 라인 미표시. 자산이 2건 이상일 때만 자산 헤더 + 합계 양도가액 노출.
  const showAssetHeader = summary.rows.length >= 2;
  // 라벨(양도가액·취득가액·필요경비)은 항상 표시. 값 > 0 이면 금액,
  // pending 이면 «계산 후 표시», 그 외(미입력·해당없음)엔 «-».
  const renderSidebarAmount = (label: string, value: number, pending: boolean, note?: string) => {
    return (
      <div className="text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">{label}</span>
          {note && <span className="text-xs text-muted-foreground/70">{note}</span>}
        </div>
        {value > 0 ? (
          <p className="text-right font-mono tabular-nums">{value.toLocaleString()}</p>
        ) : pending ? (
          <p className="text-right text-xs text-muted-foreground/50">계산 후 표시</p>
        ) : (
          <p className="text-right text-xs text-muted-foreground/50">-</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {summary.rows.map((row, i) => {
        const saleNote = row.saleIsApportioned
          ? "기준시가 안분"
          : row.ownershipRatio < 1
            ? `지분 ${(row.ownershipRatio * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
            : undefined;
        return (
          // 자산 2건 이상일 때 자산 사이에 구분선(상단 border) 삽입
          <div key={row.assetId} className={`space-y-1.5${i > 0 ? " border-t pt-3" : ""}`}>
            {showAssetHeader && (
              <p className="text-xs font-semibold text-foreground/80">
                자산 {row.index} — {ASSET_KIND_LABELS[row.assetKind] ?? row.assetLabel}
              </p>
            )}
            {renderSidebarAmount("양도가액", row.salePrice, row.salePending, saleNote)}
            {/* 라벨은 자산 종류별 표시 범위에 따라 갈린다 — 재개발·입주권은 「인가전 분 취득가액」 */}
            {renderSidebarAmount(row.acqLabel, row.acqPrice, row.acqPending)}
            {renderSidebarAmount("필요경비", row.expense, row.expensePending)}
            {/* 공제·감면 사항 라벨은 항상 표시 (감면 없으면 «-») */}
            <div className="border-t pt-1.5">
              <p className="mb-1 text-sm text-muted-foreground">공제·감면 사항</p>
              {row.reductionTypes.length > 0 ? (
                <ul className="space-y-0.5">
                  {row.reductionTypes.map((t) => (
                    <li key={t} className="text-sm">
                      {REDUCTION_SHORT_LABELS[t]}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground/50">-</p>
              )}
            </div>
          </div>
        );
      })}
      {showAssetHeader && summary.totalSalePrice > 0 && (
        <div className="flex items-baseline justify-between gap-2 border-t pt-2 text-sm font-semibold">
          <span>합계 양도가액</span>
          <span className="text-right font-mono tabular-nums">
            {summary.totalSalePrice.toLocaleString()}
          </span>
        </div>
      )}
    </div>
    );
}

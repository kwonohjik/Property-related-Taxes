"use client";

/**
 * OtherUnlistedHoldingSection — 다른 비상장법인 주식 보유 평가 (상증령 §54③·평가준칙 §60②)
 *
 * - 10% 이하: 시가 우선 → 이동평균법 취득가액 (§54③)
 * - 10% 초과: Max(장부가액, 보충적평가가액). 상호출자 시 다원일차연립방정식 (준칙 §60②)
 *
 * 평가액(Max(장부,보충적)) − 장부 차액이 ②평가차액에 자동 주입됨(C2 자산반영 — orchestrator).
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-cross-holding.ui.design.md
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type {
  OtherUnlistedHolding,
  OtherUnlistedCounterparty,
} from "@/lib/tax-engine/property-valuation/other-unlisted-holdings";

const MAX_ROWS = 20;

function newRowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `oh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeNewHolding(): OtherUnlistedHolding {
  return { rowId: newRowId(), issuerCorpName: "", holdingShares: 0, totalShares: 0 };
}

function makeNewCounterparty(): OtherUnlistedCounterparty {
  return {
    netAssetExStock: 0,
    totalLiabilities: 0,
    issuedShares: 0,
    netIncomePerShare: 0,
    isRealEstateHeavy: false,
    netAssetOnly: false,
    crossHeldOfTarget: 0,
  };
}

export interface OtherUnlistedHoldingSectionProps {
  holdings: OtherUnlistedHolding[] | undefined;
  onChange: (next: OtherUnlistedHolding[] | undefined) => void;
  sectionNum?: number;
}

export function OtherUnlistedHoldingSection({
  holdings,
  onChange,
  sectionNum,
}: OtherUnlistedHoldingSectionProps) {
  const rows = holdings ?? [];
  const enabled = rows.length > 0;

  const setRow = (idx: number, patch: Partial<OtherUnlistedHolding>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const setCounterparty = (idx: number, patch: Partial<OtherUnlistedCounterparty>) => {
    const cur = rows[idx].counterparty ?? makeNewCounterparty();
    setRow(idx, { counterparty: { ...cur, ...patch } });
  };
  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    onChange([...rows, makeNewHolding()]);
  };
  const removeRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  };

  const ratio = (h: OtherUnlistedHolding): number | null => {
    const denom = h.totalShares - (h.treasuryShares ?? 0);
    if (denom <= 0) return null;
    return h.holdingShares / denom;
  };

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {sectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
              {sectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-emerald-700">
            다른 비상장법인 주식 보유 (§54③ · 상호출자 평가준칙 §60②)
          </p>
        </div>
        {enabled && (
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_ROWS}
            className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            + 보유 추가
          </button>
        )}
      </div>

      {!enabled && (
        <button
          type="button"
          onClick={addRow}
          className="w-full rounded-md border border-dashed border-emerald-300 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100/50"
        >
          + 다른 비상장법인 주식 보유 추가
        </button>
      )}

      {rows.map((h, idx) => {
        const r = ratio(h);
        const over10 = r !== null && r > 0.1;
        const hasCounterparty = !!h.counterparty;
        return (
          <div
            key={h.rowId}
            className="rounded-md border border-emerald-200 bg-white/70 p-2.5 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={h.issuerCorpName}
                onChange={(e) => setRow(idx, { issuerCorpName: e.target.value })}
                placeholder="발행법인명"
                className="flex-1 rounded border border-emerald-200 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="rounded px-1.5 py-1 text-[11px] text-rose-600 hover:bg-rose-50"
              >
                삭제
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <LabeledNum label="보유 주식수" value={h.holdingShares} onChange={(v) => setRow(idx, { holdingShares: v })} />
              <LabeledNum label="발행주식총수" value={h.totalShares} onChange={(v) => setRow(idx, { totalShares: v })} />
              <LabeledNum label="자기주식 (분모제외)" value={h.treasuryShares ?? 0} onChange={(v) => setRow(idx, { treasuryShares: v })} />
              <div className="flex items-end pb-1 text-[11px] font-medium">
                {r === null ? (
                  <span className="text-muted-foreground">발행주식총수 입력 필요</span>
                ) : (
                  <span className={over10 ? "text-amber-700" : "text-emerald-700"}>
                    보유비율 {(r * 100).toFixed(2)}% — {over10 ? "10% 초과" : "10% 이하"}
                  </span>
                )}
              </div>
            </div>

            {/* 10% 이하: 시가 / 이동평균법 취득가액 */}
            {!over10 && (
              <div className="grid grid-cols-2 gap-2 rounded bg-emerald-50/60 p-2">
                <LabeledNum label="시가 (있으면 우선)" value={h.marketValue ?? 0} onChange={(v) => setRow(idx, { marketValue: v || undefined })} />
                <LabeledNum label="이동평균법 취득가액" value={h.movingAverageAcquisitionValue ?? 0} onChange={(v) => setRow(idx, { movingAverageAcquisitionValue: v || undefined })} />
              </div>
            )}

            {/* 10% 초과: 장부가액 + Max(장부,보충적), 상호출자 토글 */}
            {over10 && (
              <div className="space-y-2 rounded bg-amber-50/50 p-2">
                <LabeledNum label="장부가액" value={h.bookValue ?? 0} onChange={(v) => setRow(idx, { bookValue: v || undefined })} />
                <ToggleCard
                  tone="amber"
                  checked={hasCounterparty}
                  onCheckedChange={(c) =>
                    setRow(idx, { counterparty: c ? makeNewCounterparty() : undefined })
                  }
                  title="상호출자 (상대도 평가대상 주식 보유)"
                  description="ON 시 다원일차연립방정식. OFF는 단방향 보충적평가(Max(장부,보충적))."
                >
                  {hasCounterparty && h.counterparty && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <LabeledNum label="상대 자산총액(주식제외) P" value={h.counterparty.netAssetExStock} onChange={(v) => setCounterparty(idx, { netAssetExStock: v })} />
                      <LabeledNum label="상대 부채총계 d" value={h.counterparty.totalLiabilities} onChange={(v) => setCounterparty(idx, { totalLiabilities: v })} />
                      <LabeledNum label="상대 발행주식총수 η" value={h.counterparty.issuedShares} onChange={(v) => setCounterparty(idx, { issuedShares: v })} />
                      <LabeledNum label="상대 1주당 순손익가치 ρ" value={h.counterparty.netIncomePerShare} onChange={(v) => setCounterparty(idx, { netIncomePerShare: v })} />
                      <LabeledNum label="상대가 보유한 평가대상 주식수 a" value={h.counterparty.crossHeldOfTarget} onChange={(v) => setCounterparty(idx, { crossHeldOfTarget: v })} />
                      <div className="col-span-2 flex flex-wrap gap-2 pt-1">
                        <ToggleCard
                          variant="chip"
                          tone="amber"
                          checked={h.counterparty.isRealEstateHeavy}
                          onCheckedChange={(c) => setCounterparty(idx, { isRealEstateHeavy: c })}
                          title="상대 부동산과다보유법인"
                        />
                        <ToggleCard
                          variant="chip"
                          tone="emerald"
                          checked={h.counterparty.netAssetOnly}
                          onCheckedChange={(c) => setCounterparty(idx, { netAssetOnly: c })}
                          title="상대 순자산단독평가(§54④)"
                        />
                      </div>
                    </div>
                  )}
                </ToggleCard>
                {!hasCounterparty && (
                  <p className="text-[11px] text-amber-700">
                    상호출자가 아니면 상대 보충적평가가액을 직접 산정해 시가/장부 중 큰 값으로 처리하세요.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LabeledNum({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <CurrencyInput
      label={label}
      value={String(value || "")}
      onChange={(s) => onChange(parseAmount(s))}
      hideUnit
    />
  );
}

"use client";

/**
 * CapitalAdjustmentsBlock — R-2 자본조정(무상증자·감자) 입력 블록
 *
 * 법§17② 단서 + 집행기준 97-163-12.
 * 4-state type 분기. split 모드에서는 disabled.
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type {
  StockTransferFormData,
  CapitalAdjustmentForm,
} from "@/lib/stores/calc-wizard-stock-store";

interface CapitalAdjustmentsBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function emptyAdjustment(): CapitalAdjustmentForm {
  return { type: "bonus_capital_reserve", eventDate: "", ratio: "", notes: "" };
}

export function CapitalAdjustmentsBlock({ form, onChange }: CapitalAdjustmentsBlockProps) {
  const isSplit = (form.lotsMode || "single") === "split";

  const rows = form.capitalAdjustments || [];

  const sorted = useMemo(() => {
    return [...rows]
      .map((r, idx) => ({ ...r, _idx: idx }))
      .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || ""));
  }, [rows]);

  const update = (idx: number, patch: Partial<CapitalAdjustmentForm>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange({ capitalAdjustments: next });
  };
  const add = () => onChange({ capitalAdjustments: [...rows, emptyAdjustment()] });
  const remove = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    onChange({ capitalAdjustments: next });
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            CA
          </span>
          <p className="text-xs font-semibold text-violet-700">
            무상증자·무상감자 (자본조정) — 법§17② 단서 + 집행기준 97-163-12
          </p>
        </div>
        {!isSplit && (
          <button
            type="button"
            onClick={add}
            className="rounded border border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
          >
            + 행 추가
          </button>
        )}
      </div>

      {/* 도움말 카드 */}
      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 space-y-1">
        <p>
          <strong>의제배당 분기 (배당소득 — 본 엔진 skip)</strong>:
          이익잉여금 자본전입 무상증자 (§17②2호 가목 본문) /
          자본환급 무상감자 (§17②1호)
        </p>
        <p>
          <strong>양도세 분기 (단가 환산만)</strong>:
          자본준비금 무상증자 (§17②2호 가목 단서 (1)·(2)) /
          비례감자·결손보전 (형식감자)
        </p>
        <p className="text-slate-500">총 취득원가는 불변. 1주당 표시 단가만 환산.</p>
      </div>

      {isSplit && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          분할 매수 모드에서는 자본조정을 사용할 수 없습니다 (단건 모드 전용 — 후속 PR).
        </div>
      )}

      {!isSplit && rows.length === 0 && (
        <p className="text-xs text-slate-500">자본조정 없음. 필요 시 &quot;+ 행 추가&quot;를 누르세요.</p>
      )}

      {!isSplit && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((r) => {
            const idx = r._idx;
            return (
              <div key={idx} className="rounded border border-violet-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-violet-800">자본조정 #{idx + 1}</p>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    삭제
                  </button>
                </div>
                <RadioCardGroup
                  name={`capitalAdjustment-${idx}-type`}
                  value={r.type}
                  onChange={(v) => update(idx, { type: v as CapitalAdjustmentForm["type"] })}
                  tone="violet"
                  layout="stack"
                  options={[
                    {
                      value: "bonus_capital_reserve",
                      label: "무상증자 — 자본준비금 (양도세 처리)",
                      description: "§17②2호 가목 단서 (1) — 법§16①2호 가목 본문 자본준비금 (의제배당 제외)",
                    },
                    {
                      value: "bonus_retained_earnings",
                      label: "무상증자 — 이익잉여금 (배당소득 — 별도 처리)",
                      description: "§17②2호 가목 본문 — 의제배당, 본 엔진 skip",
                    },
                    {
                      value: "reduction_proportional",
                      label: "무상감자 — 비례감자·결손보전 (양도세 처리)",
                      description: "형식감자 — 의제배당 비대상",
                    },
                    {
                      value: "reduction_capital_return",
                      label: "무상감자 — 자본환급 (배당소득 — 별도 처리)",
                      description: "§17②1호 — 의제배당, 본 엔진 skip",
                    },
                  ]}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-violet-700">발생일</label>
                    <DateInput
                      value={r.eventDate}
                      onChange={(v) => update(idx, { eventDate: v })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-violet-700">비율</label>
                    <DecimalInput
                      value={r.ratio}
                      onChange={(v) => update(idx, { ratio: v })}
                      placeholder="예: 0.5 (1주당 0.5주 무상)"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-violet-700">메모 (선택)</label>
                  <input
                    type="text"
                    className="w-full rounded border border-violet-200 px-3 py-2 text-sm"
                    value={r.notes}
                    onChange={(e) => update(idx, { notes: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

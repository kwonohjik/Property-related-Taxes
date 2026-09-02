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
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
  // [A-2] 엔진 split(lot 희석) 모드 = 분할 양도(split) OR 취득 다건(lots-only). 둘 다 lot별 희석 적용.
  const isLotMode =
    (form.lotsMode || "single") === "split" ||
    (form.acquisitionActualInputMode || "per_share") === "lots";

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
    <ToneCard
      tone="violet"
      sectionNum="CA"
      title="무상증자·무상감자 (자본조정) — 법§17② 단서 + 집행기준 97-163-12"
      bodyClassName="space-y-3"
      noDark
      titleExtra={
        <button
          type="button"
          onClick={add}
          className="ml-auto rounded border border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
        >
          + 행 추가
        </button>
      }
    >
      {/* 도움말 카드 */}
      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 space-y-1">
        <p>
          <strong>의제배당 분기 (배당소득 — 이 계산기에서 계산하지 않음)</strong>:
          이익잉여금 자본전입 무상증자 (§17②2호 가목 본문) /
          자본환급 무상감자 (§17②1호)
        </p>
        <p>
          <strong>양도세 분기 (단가 환산만)</strong>:
          자본준비금 무상증자 (§17②2호 가목 단서 (1)·(2)) /
          비례감자·결손보전 (형식감자)
        </p>
        <p className="text-slate-500">
          {isLotMode
            ? "각 매수 lot의 총취득원가는 불변. 1주당 단가 환산이 매칭·양도차익에 반영됩니다."
            : "총 취득원가는 불변. 1주당 표시 단가만 환산."}
        </p>
      </div>

      {isLotMode && (
        <div className="rounded border border-violet-200 bg-violet-50/70 px-3 py-2 text-xs text-violet-700">
          매수 다건/분할 모드: 발생일 이전 보유한 매수 lot만 희석됩니다. 무상주 보유기간은 원주 취득일로 통산되며(집행기준 97-163-12),
          각 lot의 총취득원가는 불변·1주당 단가만 환산됩니다. 배정 수량은 매수 당시(원주) 기준으로 입력하세요.
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-xs text-slate-500">자본조정 없음. 필요 시 &quot;+ 행 추가&quot;를 누르세요.</p>
      )}

      {sorted.length > 0 && (
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
                {/* 4개를 세로로 쌓으면 자본조정 행 하나가 4행을 먹는다 — 2열 2행으로 접는다.
                    ⚠️ inline(한 행·설명 미렌더)이 아니라 columns다 — 이 그룹의 description은
                       **조문과 과세 구분**(§17②2호 가목 단서 (1) / 본문, §17②1호)이라
                       지우면 무상증자 두 종류를 가를 근거가 사라진다.
                    anchor: capital-adjustment-radio-columns.anchor.test.tsx CA-1 */}
                <RadioCardGroup
                  name={`capitalAdjustment-${idx}-type`}
                  value={r.type}
                  onChange={(v) => update(idx, { type: v as CapitalAdjustmentForm["type"] })}
                  tone="violet"
                  layout="stack"
                  columns={2}
                  options={[
                    {
                      value: "bonus_capital_reserve",
                      label: "무상증자 — 자본준비금 (양도세 처리)",
                      description: "§17②2호 가목 단서 (1) — 법§16①2호 가목 본문 자본준비금 (의제배당 제외)",
                    },
                    {
                      value: "bonus_retained_earnings",
                      label: "무상증자 — 이익잉여금 (배당소득 — 별도 처리)",
                      description: "§17②2호 가목 본문 — 의제배당(배당소득). 주식수·단가를 조정하지 않습니다",
                    },
                    {
                      value: "reduction_proportional",
                      label: "무상감자 — 비례감자·결손보전 (양도세 처리)",
                      description: "형식감자 — 의제배당 비대상",
                    },
                    {
                      value: "reduction_capital_return",
                      label: "무상감자 — 자본환급 (배당소득 — 별도 처리)",
                      description: "§17②1호 — 의제배당(배당소득). 주식수·단가를 조정하지 않습니다",
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
                      placeholder="1주당 비율 (무상증자 배정·감자 비율)"
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
    </ToneCard>
  );
}

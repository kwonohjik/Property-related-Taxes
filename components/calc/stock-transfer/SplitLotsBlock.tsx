"use client";

/**
 * SplitLotsBlock — 분할 매수·분할 양도 입력 블록 (Plan v2.2 / UI design v1.2)
 *
 * Step 1 섹션 3에 노출. lotsMode === "split" 활성 시 표시.
 * 매수 lot 행렬 + 매도 lot 행렬 + 산정방법 RadioCardGroup(3종) + (specific) 매칭 행렬 + 합계 미리보기.
 *
 * 정책:
 *  - useEffect → store 미러링 금지 (onChange wrapper에서 cascade 직접 처리)
 *  - 자동 안분 fallback 금지 (lot 빈 행은 사용자 명시 입력 강제)
 *  - lot 삭제 시 specificMatchings cascade 자동 제거
 */

import { useMemo } from "react";
import { nanoid } from "nanoid";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createEmptyAcquisitionLot,
  type StockTransferFormData,
  type AcquisitionLotForm,
  type TransferLotForm,
  type SpecificMatchingForm,
} from "@/lib/stores/calc-wizard-stock-store";

type SplitFormSlice = Pick<
  StockTransferFormData,
  | "lotsMode"
  | "costAllocationMethod"
  | "acquisitionLots"
  | "transferLots"
  | "specificMatchings"
>;

interface SplitLotsBlockProps {
  form: SplitFormSlice;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export const ACQ_CAUSE_LABEL: Record<AcquisitionLotForm["acquisitionCause"], string> = {
  purchase: "매매",
  inheritance: "상속",
  gift: "증여",
  /** §97의2① 이월과세 — 2025.1.1.~ 증여분. §104②2호로 증여자 취득일 기산 */
  carryover_gift: "이월과세(증여)",
  merger_split: "합병·분할",
};

const COST_METHOD_HINT: Record<NonNullable<StockTransferFormData["costAllocationMethod"]>, string> = {
  specific: "매도 lot 옆에서 어떤 매수 lot에서 차감할지 명시 입력하세요 (납세자 입증 가능 시)",
  fifo: "매수 lot이 매수일 오름차순으로 자동 정렬되어 매칭됩니다 (선입선출법)",
  moving_avg: "전체 매수 lot의 가중평균 단가를 사용합니다 (총평균법). 보유기간은 FIFO 기준",
};

export function SplitLotsBlock({ form, onChange }: SplitLotsBlockProps) {
  // ── 합계 미리보기 ──
  const summary = useMemo(() => {
    const totalAcq = form.acquisitionLots.reduce((s, l) => s + parseDecimal(l.shareCount), 0);
    const totalTrn = form.transferLots.reduce((s, l) => s + parseDecimal(l.shareCount), 0);
    let weightedAvg: number | null = null;
    if (form.costAllocationMethod === "moving_avg" && totalAcq > 0) {
      const totalCost = form.acquisitionLots.reduce(
        (s, l) => s + parseDecimal(l.shareCount) * parseAmount(l.perShareAcquisitionPrice),
        0,
      );
      weightedAvg = Math.floor(totalCost / totalAcq);
    }
    return {
      totalAcq,
      totalTrn,
      remaining: totalAcq - totalTrn,
      excess: totalTrn > totalAcq,
      weightedAvg,
    };
  }, [form.acquisitionLots, form.transferLots, form.costAllocationMethod]);

  // ── 매수 lot 추가/수정/삭제 ──
  const addAcquisitionLot = () => {
    onChange({ acquisitionLots: [...form.acquisitionLots, createEmptyAcquisitionLot()] });
  };
  const updateAcquisitionLot = (idx: number, patch: Partial<AcquisitionLotForm>) => {
    const next = form.acquisitionLots.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange({ acquisitionLots: next });
  };
  const deleteAcquisitionLot = (idx: number) => {
    const deletedLot = form.acquisitionLots[idx];
    const next = form.acquisitionLots.filter((_, i) => i !== idx);
    // cascade: specificMatchings에서 이 lot 참조 제거
    const cascadedMatchings = form.specificMatchings.filter(
      (m) => m.acquisitionLotId !== deletedLot.id,
    );
    const cascadeCount = form.specificMatchings.length - cascadedMatchings.length;
    onChange({
      acquisitionLots: next,
      specificMatchings: cascadedMatchings,
    });
    if (cascadeCount > 0) {
      console.info(`매수 lot 삭제로 매칭 ${cascadeCount}건 함께 제거됨`);
    }
  };

  // ── 매도 lot 추가/수정/삭제 ──
  const addTransferLot = () => {
    const newLot: TransferLotForm = {
      id: nanoid(),
      transferDate: "",
      shareCount: "",
      perShareTransferPrice: "",
    };
    onChange({ transferLots: [...form.transferLots, newLot] });
  };
  const updateTransferLot = (idx: number, patch: Partial<TransferLotForm>) => {
    const next = form.transferLots.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange({ transferLots: next });
  };
  const deleteTransferLot = (idx: number) => {
    const deletedLot = form.transferLots[idx];
    const next = form.transferLots.filter((_, i) => i !== idx);
    const cascadedMatchings = form.specificMatchings.filter(
      (m) => m.transferLotId !== deletedLot.id,
    );
    onChange({
      transferLots: next,
      specificMatchings: cascadedMatchings,
    });
  };

  // ── specific 매칭 ──
  const addMatching = () => {
    const newM: SpecificMatchingForm = {
      transferLotId: form.transferLots[0]?.id ?? "",
      acquisitionLotId: form.acquisitionLots[0]?.id ?? "",
      shareCount: "",
    };
    onChange({ specificMatchings: [...form.specificMatchings, newM] });
  };
  const updateMatching = (idx: number, patch: Partial<SpecificMatchingForm>) => {
    const next = form.specificMatchings.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange({ specificMatchings: next });
  };
  const deleteMatching = (idx: number) => {
    onChange({ specificMatchings: form.specificMatchings.filter((_, i) => i !== idx) });
  };

  const trnLotLabel = (id: string) => {
    const idx = form.transferLots.findIndex((l) => l.id === id);
    return idx >= 0 ? `매도 #${idx + 1}` : id;
  };
  const acqLotLabel = (id: string) => {
    const idx = form.acquisitionLots.findIndex((l) => l.id === id);
    return idx >= 0 ? `매수 #${idx + 1}` : id;
  };

  return (
    <div className="space-y-6">
      {/* ⓐ 매수 lot 행렬 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-amber-800">ⓐ 매수 lot (취득 정보)</h3>
        {form.acquisitionLots.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-100/60 rounded p-3">
            매수 행 추가부터 시작하세요. 동일 종목을 여러 차례 매수한 경우 lot별로 입력.
          </p>
        ) : (
          form.acquisitionLots.map((lot, idx) => (
            <div key={lot.id} className="rounded border border-amber-300 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700">매수 #{idx + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteAcquisitionLot(idx)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <FieldCard
                  label={
                    lot.acquisitionCause === "gift" || lot.acquisitionCause === "carryover_gift"
                      ? "수증일"
                      : "취득일"
                  }
                  hint={
                    lot.acquisitionCause === "gift"
                      ? "수증일 기산 — §97의2① 미적용 (§104② 본문)"
                      : lot.acquisitionCause === "carryover_gift"
                        ? "증여받은 날 — 2025.1.1. 이후여야 §104②2호 적용"
                        : undefined
                  }
                >
                  <DateInput
                    value={lot.acquisitionDate}
                    onChange={(v) => updateAcquisitionLot(idx, { acquisitionDate: v })}
                  />
                </FieldCard>
                <FieldCard label="취득원인" hint="lot별 §104② 보유기간 기산점">
                  <Select
                    value={lot.acquisitionCause}
                    onValueChange={(v) =>
                      updateAcquisitionLot(idx, {
                        acquisitionCause: v as AcquisitionLotForm["acquisitionCause"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue>{ACQ_CAUSE_LABEL[lot.acquisitionCause]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACQ_CAUSE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldCard>
                <FieldCard label="주식수" hint="lot 수량 (주)">
                  <DecimalInput
                    value={lot.shareCount}
                    onChange={(v) => updateAcquisitionLot(idx, { shareCount: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <CurrencyInput
                  label="1주당 단가"
                  hint={
                    lot.acquisitionCause === "inheritance"
                      ? "상속개시일 §60-66 평가가액 (원) — 소령 §163⑨"
                      : lot.acquisitionCause === "gift" ||
                          lot.acquisitionCause === "carryover_gift"
                      ? "수증일 §60-66 평가가액 (원) — 소령 §163⑨"
                      : lot.acquisitionCause === "merger_split"
                      ? "1주당 가중평균 취득원가 (원) — 소령 §163①4·5호"
                      : "1주당 실지 매수가 (원)"
                  }
                  value={lot.perShareAcquisitionPrice}
                  onChange={(v) =>
                    updateAcquisitionLot(idx, { perShareAcquisitionPrice: v })
                  }
                />
                {lot.acquisitionCause === "inheritance" && (
                  <FieldCard label="피상속인 취득일" hint="§104②1 보유기간 기산점">
                    <DateInput
                      value={lot.decedentAcquisitionDate ?? ""}
                      onChange={(v) =>
                        updateAcquisitionLot(idx, { decedentAcquisitionDate: v })
                      }
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여자 취득일"
                    hint="§104②2 보유기간 기산점 — 수증일이 2025.1.1. 이후여야 적용됩니다"
                  >
                    <DateInput
                      value={lot.donorAcquisitionDate ?? ""}
                      onChange={(v) =>
                        updateAcquisitionLot(idx, { donorAcquisitionDate: v })
                      }
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "merger_split" && (
                  <FieldCard label="종전 주식 취득일" hint="§104②3 보유기간 기산점">
                    <DateInput
                      value={lot.preMergerAcquisitionDate ?? ""}
                      onChange={(v) =>
                        updateAcquisitionLot(idx, { preMergerAcquisitionDate: v })
                      }
                    />
                  </FieldCard>
                )}
              </div>
            </div>
          ))
        )}
        <Button type="button" variant="outline" size="sm" onClick={addAcquisitionLot}>
          + 매수 행 추가
        </Button>
      </div>

      {/* ⓑ 매도 lot 행렬 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-emerald-800">ⓑ 매도 lot (양도 정보)</h3>
        {form.transferLots.length === 0 ? (
          <p className="text-xs text-emerald-700 bg-emerald-100/60 rounded p-3">
            매도 행 추가부터 시작하세요. 분할 양도인 경우 lot별로 입력.
          </p>
        ) : (
          form.transferLots.map((lot, idx) => (
            <div key={lot.id} className="rounded border border-emerald-300 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">매도 #{idx + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTransferLot(idx)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <FieldCard label="양도일">
                  <DateInput
                    value={lot.transferDate}
                    onChange={(v) => updateTransferLot(idx, { transferDate: v })}
                  />
                </FieldCard>
                <FieldCard label="주식수" hint="lot 수량 (주)">
                  <DecimalInput
                    value={lot.shareCount}
                    onChange={(v) => updateTransferLot(idx, { shareCount: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <CurrencyInput
                  label="1주당 단가"
                  hint="1주당 양도가액 (원)"
                  value={lot.perShareTransferPrice}
                  onChange={(v) => updateTransferLot(idx, { perShareTransferPrice: v })}
                />
              </div>
            </div>
          ))
        )}
        <Button type="button" variant="outline" size="sm" onClick={addTransferLot}>
          + 매도 행 추가
        </Button>
      </div>

      {/* ⓒ 합계 미리보기 */}
      <div className={`rounded-lg border p-3 text-sm ${summary.excess ? "border-red-300 bg-red-50/60 text-red-800" : "border-sky-200 bg-sky-50/40 text-sky-900"}`}>
        <p>
          총 매수 <strong>{summary.totalAcq.toLocaleString()}주</strong> / 총 매도{" "}
          <strong>{summary.totalTrn.toLocaleString()}주</strong> / 잔량{" "}
          <strong>{summary.remaining.toLocaleString()}주</strong>{" "}
          {summary.excess ? "⚠️ 매도 > 매수 (FIFO 매칭 불가)" : "✓"}
        </p>
        {summary.weightedAvg !== null && (
          <p className="text-xs mt-1 text-sky-700">
            가중평균 단가: <strong>{summary.weightedAvg.toLocaleString()}원</strong>
          </p>
        )}
      </div>

      {/* ⓓ 산정방법 */}
      <div className="space-y-2">
        <RadioCardGroup
          name="costAllocationMethod"
          value={form.costAllocationMethod}
          options={[
            { value: "specific", label: "개별법", description: "매도 lot과 매수 lot을 사용자가 명시 매칭" },
            { value: "fifo", label: "선입선출법", description: "먼저 매수한 lot부터 양도 (자동 매칭)" },
            { value: "moving_avg", label: "이동평균법", description: "전체 매수 lot 가중평균 (총평균법)" },
          ]}
          layout="inline"
          tone="violet"
          onChange={(v) => onChange({ costAllocationMethod: v })}
        />
        <p className="text-xs text-violet-700 bg-violet-50/40 rounded p-2">
          {COST_METHOD_HINT[form.costAllocationMethod]}
        </p>
        <p className="text-xs text-slate-500">
          ⓘ 산정방법은 납세자 입증책임 — 세법 명문 부재 (KoreanLaw 사전 검증 2026-05-18)
        </p>
      </div>

      {/* ⓔ specific 매칭 행렬 */}
      {form.costAllocationMethod === "specific" && (
        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-fuchsia-800">ⓔ 개별법 매칭</h3>
          {form.specificMatchings.length === 0 ? (
            <p className="text-xs text-fuchsia-700">매칭 추가부터 시작하세요.</p>
          ) : (
            form.specificMatchings.map((m, idx) => (
              <div key={idx} className="rounded border border-fuchsia-300 bg-white p-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                <FieldCard label="매도 lot">
                  <Select
                    value={m.transferLotId}
                    onValueChange={(v) => v && updateMatching(idx, { transferLotId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue>{trnLotLabel(m.transferLotId)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {form.transferLots.map((t, i) => (
                        <SelectItem key={t.id} value={t.id}>
                          매도 #{i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldCard>
                <FieldCard label="매수 lot">
                  <Select
                    value={m.acquisitionLotId}
                    onValueChange={(v) => v && updateMatching(idx, { acquisitionLotId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue>{acqLotLabel(m.acquisitionLotId)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {form.acquisitionLots.map((a, i) => (
                        <SelectItem key={a.id} value={a.id}>
                          매수 #{i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldCard>
                <FieldCard label="매칭 주식수">
                  <DecimalInput
                    value={m.shareCount}
                    onChange={(v) => updateMatching(idx, { shareCount: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMatching(idx)}
                  className="text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMatching}
            disabled={form.transferLots.length === 0 || form.acquisitionLots.length === 0}
          >
            + 매칭 추가
          </Button>
        </div>
      )}
    </div>
  );
}

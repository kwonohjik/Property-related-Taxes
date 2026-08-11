"use client";

/**
 * AcquisitionLotsMatrix — 취득가액 다건 입력 모드 (lots-only) 매트릭스
 *
 * Step2 취득가액 섹션 `acquisitionActualInputMode === "lots"` 시 노출.
 * SplitLotsBlock의 acquisition lot 부분만 추출한 sub-component:
 *   - 매도 lot 행렬 미포함 (단일 양도는 폼 전역 transferDate/shareCount/perShareTransferPrice)
 *   - 산정방법 fifo·이동평균법·개별법(specific) 모두 지원 (A-1)
 *   - 개별법: 합성 단일 매도(SYNTH_SINGLE_TRANSFER_ID)에 대한 매수 lot별 배정 수량 입력
 *
 * 합성 transferLot·specificMatchings의 transferLotId는 API 변환(`stock-transfer-tax-api.ts`)에서 강제.
 */

import { useMemo } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
  SYNTH_SINGLE_TRANSFER_ID,
  type AcquisitionLotForm,
  type SpecificMatchingForm,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { ACQ_CAUSE_LABEL } from "@/components/calc/stock-transfer/SplitLotsBlock";

interface AcquisitionLotsMatrixProps {
  lots: AcquisitionLotForm[];
  onChange: (lots: AcquisitionLotForm[]) => void;
  costAllocationMethod: StockTransferFormData["costAllocationMethod"];
  onCostMethodChange: (method: StockTransferFormData["costAllocationMethod"]) => void;
  /** 개별법(specific) 매수 lot별 배정 — 합성 단일 매도 기준 (A-1) */
  specificMatchings: SpecificMatchingForm[];
  onMatchingsChange: (matchings: SpecificMatchingForm[]) => void;
  /** 양도 주식수 (폼 전역) — 개별법 배정 합계 일치 검증 표시용 */
  transferShareCount: number;
}

export function AcquisitionLotsMatrix({
  lots,
  onChange,
  costAllocationMethod,
  onCostMethodChange,
  specificMatchings,
  onMatchingsChange,
  transferShareCount,
}: AcquisitionLotsMatrixProps) {
  const summary = useMemo(() => {
    const totalAcq = lots.reduce((s, l) => s + parseInt(l.shareCount || "0", 10), 0);
    const totalCost = lots.reduce(
      (s, l) =>
        s + parseAmount(l.perShareAcquisitionPrice) * parseInt(l.shareCount || "0", 10),
      0,
    );
    return {
      totalAcq,
      weightedAvg: totalAcq > 0 ? Math.floor(totalCost / totalAcq) : null,
    };
  }, [lots]);

  const isSpecific = costAllocationMethod === "specific";

  // 개별법 배정 합계 (specific 모드 표시용)
  const allocSum = useMemo(
    () => specificMatchings.reduce((s, m) => s + parseInt(m.shareCount || "0", 10), 0),
    [specificMatchings],
  );

  // 매수 lot별 배정 수량 read/write — specificMatchings를 acquisitionLotId 키로 upsert
  const getAlloc = (lotId: string) =>
    specificMatchings.find((m) => m.acquisitionLotId === lotId)?.shareCount ?? "";
  const setAlloc = (lotId: string, value: string) => {
    const others = specificMatchings.filter((m) => m.acquisitionLotId !== lotId);
    if (value.trim() === "" || parseInt(value, 10) === 0 || Number.isNaN(parseInt(value, 10))) {
      onMatchingsChange(others);
      return;
    }
    const next: SpecificMatchingForm = {
      transferLotId: SYNTH_SINGLE_TRANSFER_ID,
      acquisitionLotId: lotId,
      shareCount: value,
    };
    onMatchingsChange([...others, next]);
  };

  const addLot = () => onChange([...lots, createEmptyAcquisitionLot()]);
  const updateLot = (idx: number, patch: Partial<AcquisitionLotForm>) =>
    onChange(lots.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const deleteLot = (idx: number) => {
    const deleted = lots[idx];
    onChange(lots.filter((_, i) => i !== idx));
    // cascade: 삭제된 lot의 개별법 배정 제거
    if (deleted) {
      onMatchingsChange(specificMatchings.filter((m) => m.acquisitionLotId !== deleted.id));
    }
  };

  return (
    <div className="space-y-4">
      {/* 산정방법 — fifo·이동평균법·개별법 모두 지원 (A-1) */}
      <FieldCard label="산정방법" hint="개별법 선택 시 매수 lot별 배정 수량을 직접 지정">
        <RadioCardGroup
          name="costAllocationMethod_acq"
          value={costAllocationMethod ?? "fifo"}
          onChange={(v) => onCostMethodChange(v as StockTransferFormData["costAllocationMethod"])}
          tone="violet"
          layout="inline"
          options={[
            {
              value: "fifo",
              label: "선입선출법",
              description: "먼저 매수한 lot부터 차감 (자동 매칭)",
            },
            {
              value: "moving_avg",
              label: "이동평균법",
              description: "매도 시점까지 취득분으로 평균단가 재계산",
            },
            {
              value: "specific",
              label: "개별법",
              description: "매수 lot별 매도 배정 수량을 직접 지정 (입증 가능 시)",
            },
          ]}
        />
      </FieldCard>

      {/* 개별법 배정 합계 안내 */}
      {isSpecific && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            allocSum === transferShareCount && transferShareCount > 0
              ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
              : "border-rose-200 bg-rose-50/60 text-rose-800"
          }`}
        >
          개별법: 각 매수 lot에 배정한 수량의 합계가 양도 주식수와 일치해야 합니다.
          <span className="ml-1 font-semibold">
            배정 합계 {allocSum.toLocaleString()} / 양도 {transferShareCount.toLocaleString()}주
          </span>
        </div>
      )}

      {/* 매수 lot 행 목록 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-amber-800">매수 lot (취득 정보)</h3>
          <LawArticleModal legalBasis="소득세법 §104 ②" label="§104②" />
          <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
        </div>
        {lots.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-100/60 rounded p-3">
            매수 행 추가부터 시작하세요.
          </p>
        ) : (
          lots.map((lot, idx) => (
            <div
              key={lot.id}
              className="rounded border border-amber-300 bg-white p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-700">매수 #{idx + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteLot(idx)}
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
                    onChange={(v) => updateLot(idx, { acquisitionDate: v })}
                  />
                </FieldCard>
                <FieldCard label="취득원인" hint="lot별 §104② 보유기간 기산점">
                  <Select
                    value={lot.acquisitionCause}
                    onValueChange={(v) =>
                      v &&
                      updateLot(idx, {
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
                    onChange={(v) => updateLot(idx, { shareCount: v })}
                    thousandSeparator
                  />
                </FieldCard>
                <CurrencyInput
                  label="1주당 단가"
                  hint={
                    lot.acquisitionCause === "inheritance"
                      ? "상속개시일 §60-66 평가가액 (원)"
                      : lot.acquisitionCause === "gift" ||
                          lot.acquisitionCause === "carryover_gift"
                      ? "수증일 §60-66 평가가액 (원)"
                      : lot.acquisitionCause === "merger_split"
                      ? "1주당 가중평균 취득원가 (원)"
                      : "1주당 실지 매수가 (원)"
                  }
                  value={lot.perShareAcquisitionPrice}
                  onChange={(v) => updateLot(idx, { perShareAcquisitionPrice: v })}
                />
                {isSpecific && (
                  <FieldCard
                    label="이 양도에 배정 수량"
                    hint="이 매수 lot에서 양도한 주식수 (개별법)"
                  >
                    <DecimalInput
                      value={getAlloc(lot.id)}
                      onChange={(v) => setAlloc(lot.id, v)}
                      thousandSeparator
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "inheritance" && (
                  <FieldCard label="피상속인 취득일" hint="§104②1 보유기간 기산점">
                    <DateInput
                      value={lot.decedentAcquisitionDate ?? ""}
                      onChange={(v) => updateLot(idx, { decedentAcquisitionDate: v })}
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
                      onChange={(v) => updateLot(idx, { donorAcquisitionDate: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여자 취득가액 (1주당)"
                    hint="§97의2①1호 — 이 값이 있어야 취득가액이 승계됩니다"
                  >
                    <CurrencyInput
                      label=""
                      hideLabel
                      value={lot.donorAcquisitionPrice ?? ""}
                      onChange={(v) => updateLot(idx, { donorAcquisitionPrice: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여자 자본적지출"
                    hint="§97의2①2호 — 이 lot 전체 주식수 기준 총액. 매도한 주식수만큼 안분되어 산입됩니다"
                  >
                    <CurrencyInput
                      label=""
                      hideLabel
                      value={lot.donorCapitalExpenditure ?? ""}
                      onChange={(v) => updateLot(idx, { donorCapitalExpenditure: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여세 산출세액"
                    hint="§97의2①3호 — 이 lot을 증여받은 건의 증여세 산출세액"
                  >
                    <CurrencyInput
                      label=""
                      hideLabel
                      value={lot.donorGiftTaxAmount ?? ""}
                      onChange={(v) => updateLot(idx, { donorGiftTaxAmount: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여세 과세가액"
                    hint="영 §163의2② 안분 분모. 분자(양도한 자산가액)는 매도 주식수 × 증여 당시 평가액으로 계산됩니다"
                  >
                    <CurrencyInput
                      label=""
                      hideLabel
                      value={lot.donorGiftTaxableValue ?? ""}
                      onChange={(v) => updateLot(idx, { donorGiftTaxableValue: v })}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "carryover_gift" && (
                  <FieldCard
                    label="증여자와의 관계"
                    hint="§97의2① 본문 — 배우자·직계존비속이 아니면 대상이 아닙니다"
                  >
                    <RadioCardGroup
                      name={`matrixDonorRelation-${idx}`}
                      value={lot.donorRelation ?? ""}
                      onChange={(v) =>
                        updateLot(idx, { donorRelation: v as "spouse" | "lineal" | "other" })
                      }
                      options={[
                        { value: "spouse", label: "배우자" },
                        { value: "lineal", label: "직계존비속" },
                        { value: "other", label: "그 밖" },
                      ]}
                    />
                  </FieldCard>
                )}
                {lot.acquisitionCause === "merger_split" && (
                  <FieldCard label="종전 주식 취득일" hint="§104②3 보유기간 기산점">
                    <DateInput
                      value={lot.preMergerAcquisitionDate ?? ""}
                      onChange={(v) => updateLot(idx, { preMergerAcquisitionDate: v })}
                    />
                  </FieldCard>
                )}
              </div>
            </div>
          ))
        )}
        <Button type="button" variant="outline" size="sm" onClick={addLot}>
          + 매수 행 추가
        </Button>
      </div>

      {/* 합계 미리보기 */}
      <ToneCard tone="sky" noDark className="text-sm text-sky-900" bodyClassName="">
        <p>
          총 매수 <strong>{summary.totalAcq.toLocaleString()}주</strong>
        </p>
        {summary.weightedAvg !== null && summary.weightedAvg > 0 && (
          <p className="text-xs mt-1 text-sky-700">
            참고용 평균단가:{" "}
            <strong>{summary.weightedAvg.toLocaleString()}</strong>{" "}
            — 실제 이동평균은 매도 순서·시점에 따라 달라질 수 있습니다 (정확한 값은 계산 결과 참조)
          </p>
        )}
      </ToneCard>
    </div>
  );
}

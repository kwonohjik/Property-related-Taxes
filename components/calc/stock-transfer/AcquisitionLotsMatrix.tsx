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
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Button } from "@/components/ui/button";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  createEmptyAcquisitionLot,
  SYNTH_SINGLE_TRANSFER_ID,
  type AcquisitionLotForm,
  type SpecificMatchingForm,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { AcquisitionLotCard } from "@/components/calc/stock-transfer/AcquisitionLotCard";

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
      <FieldCard label="산정방법" hint="개별법 선택 시 매수 건별 배정 수량을 직접 지정">
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
              description: "먼저 매수한 건부터 차감 (자동 매칭)",
            },
            {
              value: "moving_avg",
              label: "이동평균법",
              description: "매도 시점까지 취득분으로 평균단가 재계산",
            },
            {
              value: "specific",
              label: "개별법",
              description: "매수 건별 매도 배정 수량을 직접 지정 (입증 가능 시)",
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
          개별법: 각 매수 건에 배정한 수량의 합계가 양도 주식수와 일치해야 합니다.
          <span className="ml-1 font-semibold">
            배정 합계 {allocSum.toLocaleString()} / 양도 {transferShareCount.toLocaleString()}주
          </span>
        </div>
      )}

      {/* 매수 lot 행 목록 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-amber-800">매수 건 (취득 정보)</h3>
          <LawArticleModal legalBasis="소득세법 §104 ②" label="§104②" />
          <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
        </div>
        {lots.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-100/60 rounded p-3">
            매수 행 추가부터 시작하세요.
          </p>
        ) : (
          lots.map((lot, idx) => (
            <AcquisitionLotCard
              key={lot.id}
              lot={lot}
              idx={idx}
              onUpdate={(patch) => updateLot(idx, patch)}
              onDelete={() => deleteLot(idx)}
              radioNamePrefix="matrixDonorRelation"
              extraFields={
                isSpecific ? (
                  <FieldCard
                    label="이 양도에 배정 수량"
                    hint="이 매수 건에서 양도한 주식수 (개별법)"
                  >
                    <DecimalInput
                      value={getAlloc(lot.id)}
                      onChange={(v) => setAlloc(lot.id, v)}
                      thousandSeparator
                    />
                  </FieldCard>
                ) : undefined
              }
            />
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

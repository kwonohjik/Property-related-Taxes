"use client";

/**
 * AcquisitionLotsMatrix — 취득가액 다건 입력 모드 (lots-only) 매트릭스
 *
 * Step2 취득가액 섹션 `acquisitionActualInputMode === "lots"` 시 노출.
 * SplitLotsBlock의 acquisition lot 부분만 추출한 sub-component:
 *   - 매도 lot 행렬 미포함 (단일 양도는 폼 전역 transferDate/shareCount/perShareTransferPrice)
 *   - specific 매칭 행렬 미포함 (transferLots 의존 제거)
 *   - 산정방법 specific 옵션 disabled (본 PR 범위 외)
 *
 * 합성 transferLot은 API 변환(`stock-transfer-tax-api.ts`)에서 자동 생성.
 */

import { useMemo } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
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
  type AcquisitionLotForm,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { ACQ_CAUSE_LABEL } from "@/components/calc/stock-transfer/SplitLotsBlock";

interface AcquisitionLotsMatrixProps {
  lots: AcquisitionLotForm[];
  onChange: (lots: AcquisitionLotForm[]) => void;
  costAllocationMethod: StockTransferFormData["costAllocationMethod"];
  onCostMethodChange: (method: StockTransferFormData["costAllocationMethod"]) => void;
}

export function AcquisitionLotsMatrix({
  lots,
  onChange,
  costAllocationMethod,
  onCostMethodChange,
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

  const addLot = () => onChange([...lots, createEmptyAcquisitionLot()]);
  const updateLot = (idx: number, patch: Partial<AcquisitionLotForm>) =>
    onChange(lots.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const deleteLot = (idx: number) => onChange(lots.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      {/* 산정방법 — specific disabled */}
      <FieldCard label="산정방법" hint="양도 단건 모드에서는 fifo / 이동평균법만 지원">
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
              description: "전체 매수 lot 가중평균 단가 (총평균법)",
            },
            {
              value: "specific",
              label: "개별법",
              description: "양도 단건 모드는 지원하지 않습니다 (후속 PR)",
              disabled: true,
            },
          ]}
        />
      </FieldCard>

      {/* 매수 lot 행 목록 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-amber-800">매수 lot (취득 정보)</h3>
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
                  label={lot.acquisitionCause === "gift" ? "수증일" : "취득일"}
                  hint={lot.acquisitionCause === "gift" ? "수증일 — §97의2 미적용" : undefined}
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
                      : lot.acquisitionCause === "gift"
                      ? "수증일 §60-66 평가가액 (원)"
                      : lot.acquisitionCause === "merger_split"
                      ? "1주당 가중평균 취득원가 (원)"
                      : "1주당 실지 매수가 (원)"
                  }
                  value={lot.perShareAcquisitionPrice}
                  onChange={(v) => updateLot(idx, { perShareAcquisitionPrice: v })}
                />
                {lot.acquisitionCause === "inheritance" && (
                  <FieldCard label="피상속인 취득일" hint="§104②1 보유기간 기산점">
                    <DateInput
                      value={lot.decedentAcquisitionDate ?? ""}
                      onChange={(v) => updateLot(idx, { decedentAcquisitionDate: v })}
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
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-sm text-sky-900">
        <p>
          총 매수 <strong>{summary.totalAcq.toLocaleString()}주</strong>
        </p>
        {summary.weightedAvg !== null && summary.weightedAvg > 0 && (
          <p className="text-xs mt-1 text-sky-700">
            가중평균 단가:{" "}
            <strong>{summary.weightedAvg.toLocaleString()}</strong>{" "}
            (이동평균 모드 적용 시 참고)
          </p>
        )}
      </div>
    </div>
  );
}

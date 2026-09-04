"use client";

/**
 * AcquisitionLotCard — 매수 lot 1건의 입력 카드 (취득일·취득원인·주식수·단가 + 원인별 추가 필드)
 *
 * 🔑 **두 화면이 같은 필드를 쓴다** — 여기가 단일 소스다:
 *   - `SplitLotsBlock`        Step1 분할 양도 (ⓐ 매수 lot 행렬)
 *   - `AcquisitionLotsMatrix` Step2 취득가액 「일자별 다건」 모드
 *
 * 종전에는 두 파일이 같은 JSX 약 180줄을 각자 들고 있었고(`AcquisitionLotsMatrix` 헤더 주석은
 * 「SplitLotsBlock의 acquisition lot 부분만 추출한 sub-component」라고 적었지만 실제로는 복제였다),
 * **이미 갈라져 있었다** — 「1주당 단가」 hint의 조문 인용(소령 §163⑨ · §163①4·5호)이
 * `SplitLotsBlock`에만 붙어 있어 같은 칸이 화면마다 다르게 설명됐다. 더 풍부한 쪽으로 합쳤다.
 *
 * ⚠️ 값(spouse·lineal·other 등)은 엔진 계약이므로 바꾸지 않는다.
 */

import type { ReactNode } from "react";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
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
import type { AcquisitionLotForm } from "@/lib/stores/calc-wizard-stock-store";

export const ACQ_CAUSE_LABEL: Record<AcquisitionLotForm["acquisitionCause"], string> = {
  purchase: "매매",
  inheritance: "상속",
  gift: "증여",
  /** §97의2① 이월과세 — 2025.1.1.~ 증여분. §104②2호로 증여자 취득일 기산 */
  carryover_gift: "이월과세(증여)",
  merger_split: "합병·분할",
};

export interface AcquisitionLotCardProps {
  lot: AcquisitionLotForm;
  /** 0-based 행 인덱스 — 표시 번호(#idx+1)와 라디오 name에 쓰인다 */
  idx: number;
  onUpdate: (patch: Partial<AcquisitionLotForm>) => void;
  onDelete: () => void;
  /**
   * 라디오 `name` 접두 — 두 화면이 동시에 마운트되지는 않지만 축이 다르므로 구분한다
   * (기존 값 유지: 분할 축 `lotDonorRelation` · 다건 축 `matrixDonorRelation`).
   */
  radioNamePrefix: string;
  /** 「1주당 단가」 뒤에 끼워 넣을 축 전용 칸 (다건 축의 개별법 배정 수량 등) */
  extraFields?: ReactNode;
}

export function AcquisitionLotCard({
  lot,
  idx,
  onUpdate,
  onDelete,
  radioNamePrefix,
  extraFields,
}: AcquisitionLotCardProps) {
  const isCarryover = lot.acquisitionCause === "carryover_gift";

  return (
    <div className="rounded border border-amber-300 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-700">매수 #{idx + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <FieldCard
          label={
            lot.acquisitionCause === "gift" || isCarryover ? "수증일" : "취득일"
          }
          hint={
            lot.acquisitionCause === "gift"
              ? "수증일 기산 — §97의2① 미적용 (§104② 본문)"
              : isCarryover
                ? "증여받은 날 — 2025.1.1. 이후여야 §104②2호 적용"
                : undefined
          }
        >
          <DateInput
            value={lot.acquisitionDate}
            onChange={(v) => onUpdate({ acquisitionDate: v })}
          />
        </FieldCard>

        <FieldCard label="취득원인" hint="매수 건별 §104② 보유기간 기산점">
          <Select
            value={lot.acquisitionCause}
            onValueChange={(v) =>
              v &&
              onUpdate({ acquisitionCause: v as AcquisitionLotForm["acquisitionCause"] })
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

        <FieldCard label="주식수">
          <DecimalInput
            value={lot.shareCount}
            onChange={(v) => onUpdate({ shareCount: v })}
            thousandSeparator
          />
        </FieldCard>

        <CurrencyInput
          label="1주당 단가"
          hint={
            lot.acquisitionCause === "inheritance"
              ? "상속개시일 §60~66 평가가액 (원) — 소령 §163⑨"
              : lot.acquisitionCause === "gift" || isCarryover
                ? "수증일 §60~66 평가가액 (원) — 소령 §163⑨"
                : lot.acquisitionCause === "merger_split"
                  ? "1주당 가중평균 취득원가 (원) — 소령 §163①4·5호"
                  : "1주당 실지 매수가 (원)"
          }
          value={lot.perShareAcquisitionPrice}
          onChange={(v) => onUpdate({ perShareAcquisitionPrice: v })}
        />

        {extraFields}

        {lot.acquisitionCause === "inheritance" && (
          <FieldCard label="피상속인 취득일" hint="§104②1 보유기간 기산점">
            <DateInput
              value={lot.decedentAcquisitionDate ?? ""}
              onChange={(v) => onUpdate({ decedentAcquisitionDate: v })}
            />
          </FieldCard>
        )}

        {isCarryover && (
          <>
            <FieldCard
              label="증여자 취득일"
              hint="§104②2 보유기간 기산점 — 수증일이 2025.1.1. 이후여야 적용됩니다"
            >
              <DateInput
                value={lot.donorAcquisitionDate ?? ""}
                onChange={(v) => onUpdate({ donorAcquisitionDate: v })}
              />
            </FieldCard>

            <FieldCard
              label="증여자 취득가액 (1주당)"
              hint="§97의2①1호 — 이 값이 있어야 취득가액이 승계됩니다"
            >
              <CurrencyInput
                label=""
                hideLabel
                value={lot.donorAcquisitionPrice ?? ""}
                onChange={(v) => onUpdate({ donorAcquisitionPrice: v })}
              />
            </FieldCard>

            <FieldCard
              label="증여자 자본적지출"
              hint="§97의2①2호 — 이 매수 건 전체 주식수 기준 총액. 매도한 주식수만큼 안분되어 산입됩니다"
            >
              <CurrencyInput
                label=""
                hideLabel
                value={lot.donorCapitalExpenditure ?? ""}
                onChange={(v) => onUpdate({ donorCapitalExpenditure: v })}
              />
            </FieldCard>

            <FieldCard
              label="증여세 산출세액"
              hint="§97의2①3호 — 이 매수 건을 증여받은 때의 증여세 산출세액"
            >
              <CurrencyInput
                label=""
                hideLabel
                value={lot.donorGiftTaxAmount ?? ""}
                onChange={(v) => onUpdate({ donorGiftTaxAmount: v })}
              />
            </FieldCard>

            <FieldCard
              label="증여세 과세가액"
              hint="영 §163의2② 안분 분모. 분자(양도한 자산가액)는 매도 주식수 × 증여 당시 평가액으로 계산됩니다"
            >
              <CurrencyInput
                label=""
                hideLabel
                value={lot.donorGiftTaxableValue ?? ""}
                onChange={(v) => onUpdate({ donorGiftTaxableValue: v })}
              />
            </FieldCard>

            <FieldCard
              label="증여자와의 관계"
              hint="§97의2① 본문 — 배우자·직계존비속이 아니면 대상이 아닙니다"
            >
              {/* 선택지가 3~7자이고 description이 없다 — 세로로 쌓을 이유가 없다.
                  inline은 한 행 나열 + description 미렌더인데 여기는 잃을 설명이 없다.
                  anchor: donor-relation-radio-inline.anchor.test.tsx DR-1~DR-3 */}
              <RadioCardGroup
                name={`${radioNamePrefix}-${idx}`}
                value={lot.donorRelation ?? ""}
                onChange={(v) =>
                  onUpdate({ donorRelation: v as "spouse" | "lineal" | "other" })
                }
                layout="inline"
                options={[
                  { value: "spouse", label: "배우자" },
                  { value: "lineal", label: "직계존비속" },
                  { value: "other", label: "그 밖의 관계" },
                ]}
              />
            </FieldCard>
          </>
        )}

        {lot.acquisitionCause === "merger_split" && (
          <FieldCard label="종전 주식 취득일" hint="§104②3 보유기간 기산점">
            <DateInput
              value={lot.preMergerAcquisitionDate ?? ""}
              onChange={(v) => onUpdate({ preMergerAcquisitionDate: v })}
            />
          </FieldCard>
        )}
      </div>
    </div>
  );
}

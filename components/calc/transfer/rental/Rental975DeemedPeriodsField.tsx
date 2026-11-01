"use client";

/**
 * §97의5 — 수용·정비사업으로 임대할 수 없던 기간 (조특령 §97의5①2호·3호)
 *
 * 「해당 기간 동안 계속하여 임대한 것으로 본다」 — 공실 판정에서 빼고 계속 임대기간에 산입한다.
 * - 2호 협의매수·수용: 임대할 수 없던 기간의 시작~종료를 그대로 받는다.
 * - 3호 재개발·재건축·소규모정비·리모델링: 관리처분계획 인가일(소규모정비 사업시행계획 인가일 ·
 *   리모델링 허가일 또는 사업계획승인일)과 준공일을 받는다 — 앞뒤 6개월은 엔진이 붙인다.
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { DeemedRentalPeriodFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

interface Props {
  enabled: boolean;
  periods: DeemedRentalPeriodFormItem[];
  onChange: (patch: { hasDeemedRentalPeriod?: boolean; deemedRentalPeriods?: DeemedRentalPeriodFormItem[] }) => void;
  /** 라디오 name 접두사 — 다자산에서 그룹이 섞이지 않게 인스턴스마다 다르게 */
  uid: string;
  /** 검증 오류 → 입력칸 이동 앵커의 조문 타입 — `reduction.${fieldType}.…` (⑧과 같은 템플릿) */
  fieldType: string;
}

const LABELS: Record<DeemedRentalPeriodFormItem["reason"], { start: string; end: string; note: string }> = {
  expropriation: {
    start: "임대할 수 없게 된 날",
    end: "종료일",
    note: "조특령 §97의5①2호 — 협의매수 또는 수용되어 임대할 수 없는 기간",
  },
  redevelopment: {
    start: "관리처분계획 인가일",
    end: "준공일",
    note:
      "조특령 §97의5①3호 — 인가일 전 6개월부터 준공일 후 6개월까지를 계속 임대로 봅니다(앞뒤 6개월은 자동 반영). " +
      "소규모주택정비사업은 사업시행계획 인가일, 리모델링은 허가일 또는 사업계획승인일을 입력하세요.",
  },
};

export function Rental975DeemedPeriodsField({ enabled, periods, onChange, uid, fieldType }: Props) {
  const update = (idx: number, patch: Partial<DeemedRentalPeriodFormItem>) =>
    onChange({ deemedRentalPeriods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });

  return (
    <div className="mt-2 border-t border-sky-200 pt-2 dark:border-sky-800/40">
      <ToggleCard
        data-field={`reduction.${fieldType}.hasDeemedRentalPeriod`}
        checked={enabled}
        onCheckedChange={(v) =>
          onChange({
            hasDeemedRentalPeriod: v,
            deemedRentalPeriods: v && periods.length === 0 ? [{ reason: "redevelopment", startDate: "", endDate: "" }] : periods,
          })
        }
        title="수용·정비사업으로 임대할 수 없던 기간이 있음"
        description="조특령 §97의5①2호·3호 — 그 기간은 계속 임대한 것으로 봅니다(위 공실 구간과 겹치는 부분을 공실에서 뺍니다)"
        tone="sky"
      >
        <div className="space-y-3" data-field={`reduction.${fieldType}.deemedRentalPeriods`}>
          {periods.map((p, idx) => (
            <div key={idx} className="space-y-1.5 rounded border border-sky-200 p-2 dark:border-sky-800/40">
              <RadioCardGroup
                name={`deemedReason-${uid}-${idx}`}
                layout="inline"
                tone="sky"
                value={p.reason}
                onChange={(v) => update(idx, { reason: v as DeemedRentalPeriodFormItem["reason"] })}
                options={[
                  { value: "redevelopment", label: "재개발·재건축·소규모정비·리모델링" },
                  { value: "expropriation", label: "협의매수·수용" },
                ]}
              />
              <p className="text-micro text-muted-foreground">{LABELS[p.reason].note}</p>
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">{LABELS[p.reason].start}</label>
                  <DateInput value={p.startDate} onChange={(v) => update(idx, { startDate: v })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">{LABELS[p.reason].end}</label>
                  <DateInput value={p.endDate} onChange={(v) => update(idx, { endDate: v })} />
                </div>
                <button
                  type="button"
                  onClick={() => onChange({ deemedRentalPeriods: periods.filter((_, i) => i !== idx) })}
                  className="self-end text-micro text-rose-700 hover:underline dark:text-rose-400"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({ deemedRentalPeriods: [...periods, { reason: "redevelopment", startDate: "", endDate: "" }] })
            }
            className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            + 기간 추가
          </button>
        </div>
      </ToggleCard>
    </div>
  );
}

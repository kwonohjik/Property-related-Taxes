"use client";

/**
 * 거주 정보 입력 섹션 (1세대1주택 + housing 자산 전용).
 *
 * 표2 장특공제(보유 4%/년 + 거주 4%/년, 최대 80%) 계산용.
 * 비연속 거주 사례를 정확히 반영하기 위해 입주일·퇴거일 페어를 다중 입력하거나,
 * 합산 개월수를 직접 입력하는 두 모드를 토글로 전환.
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { Plus, Trash2 } from "lucide-react";
import {
  type ResidencePeriod,
  diffMonthsClamped,
  sumResidenceMonths,
} from "@/lib/stores/calc-wizard-asset-residence";

interface Props {
  residenceInputMode: "interval" | "direct";
  residencePeriods: ResidencePeriod[];
  residencePeriodMonthsAsset: string;
  /** 양도일 (open-ended 구간 합산용 + 양도일 이후 거부 검증) */
  transferDate: string;
  onChange: (
    patch: Partial<{
      residenceInputMode: "interval" | "direct";
      residencePeriods: ResidencePeriod[];
      residencePeriodMonthsAsset: string;
    }>,
  ) => void;
}

function fmtPeriod(months: number): string {
  if (months <= 0) return "0개월";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}년 ${m}개월` : `${m}개월`;
}

export function ResidencePeriodSection({
  residenceInputMode,
  residencePeriods,
  residencePeriodMonthsAsset,
  transferDate,
  onChange,
}: Props) {
  const isInterval = residenceInputMode === "interval";
  const totalMonths = isInterval
    ? sumResidenceMonths(residencePeriods, transferDate)
    : parseInt(residencePeriodMonthsAsset) || 0;

  function setPeriod(idx: number, patch: Partial<ResidencePeriod>) {
    const next = residencePeriods.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange({ residencePeriods: next });
  }
  function addPeriod() {
    onChange({
      residencePeriods: [...residencePeriods, { moveInDate: "", moveOutDate: "" }],
    });
  }
  function removePeriod(idx: number) {
    onChange({
      residencePeriods: residencePeriods.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 §89①3호" label="§89①3호 비과세" />
        <LawArticleModal legalBasis="소득세법 §95②" label="§95② 표2 장특공제" />
      </div>
      <ToggleCard
        variant="card"
        tone="violet"
        title="거주 기간 입력"
        checked={isInterval}
        onCheckedChange={(v) => {
          // interval 모드 진입 시 구간이 비어 있으면 1개를 즉시 표시 — 사용자가 추가 버튼 클릭 없이 입력 가능.
          if (v && residencePeriods.length === 0) {
            onChange({
              residenceInputMode: "interval",
              residencePeriods: [{ moveInDate: "", moveOutDate: "" }],
            });
          } else {
            onChange({ residenceInputMode: v ? "interval" : "direct" });
          }
        }}
      >
        {isInterval && (
          <div className="space-y-2">
            {residencePeriods.length === 0 && (
              <p className="text-xs text-violet-700">
                구간이 없습니다. &ldquo;+ 구간 추가&rdquo; 로 첫 입주일·퇴거일을 입력하세요.
              </p>
            )}
            {residencePeriods.map((p, idx) => {
              const m = diffMonthsClamped(p.moveInDate, p.moveOutDate);
              const isMoveInOnly = !!p.moveInDate && !p.moveOutDate;
              return (
                <div
                  key={idx}
                  className="rounded-md border border-violet-200 bg-white p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-violet-700">
                      거주 구간 #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePeriod(idx)}
                      className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" />
                      삭제
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FieldCard label="입주일">
                      <DateInput
                        value={p.moveInDate}
                        onChange={(v) => setPeriod(idx, { moveInDate: v })}
                      />
                    </FieldCard>
                    <FieldCard
                      label="퇴거일"
                      required
                      hint="필수 입력 — 양도일까지 거주한 경우 양도일을 퇴거일로 입력"
                    >
                      <DateInput
                        value={p.moveOutDate}
                        onChange={(v) => setPeriod(idx, { moveOutDate: v })}
                      />
                    </FieldCard>
                  </div>
                  {isMoveInOnly && (
                    <p className="text-caption text-rose-600">
                      입주일이 입력되었는데 퇴거일이 비어 있습니다. 퇴거일을 입력하세요.
                      (양도일까지 거주한 경우 양도일을 퇴거일로 입력)
                    </p>
                  )}
                  <p className="text-caption text-violet-700">
                    이 구간 거주: {fmtPeriod(m)}
                  </p>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addPeriod}
              className="w-full rounded-md border border-dashed border-violet-300 bg-violet-50/40 px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-100/60 inline-flex items-center justify-center gap-1"
            >
              <Plus className="h-3 w-3" />
              구간 추가
            </button>
            <div className="rounded-md bg-violet-100/60 border border-violet-200 px-3 py-2 text-xs text-violet-900">
              합계 거주기간: <strong>{fmtPeriod(totalMonths)}</strong> ({totalMonths}개월)
            </div>
          </div>
        )}
        {!isInterval && (
          <FieldCard label="거주기간 (개월)" hint="상속개시일부터 상속인 본인 실거주 개월 (표2 거주분 공제율)">
            <div className="flex items-center gap-2">
              <div className="w-32">
                <DecimalInput
                  value={residencePeriodMonthsAsset}
                  onChange={(v) => onChange({ residencePeriodMonthsAsset: v })}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                ({fmtPeriod(parseInt(residencePeriodMonthsAsset) || 0)})
              </span>
            </div>
          </FieldCard>
        )}
      </ToggleCard>
      <p className="text-xs text-violet-700">
        거주기간(상속개시일부터 상속인 본인 실거주)은 표2 장특공제 거주분 공제율 계산에 사용됩니다.
        동일세대 상속의 통산 거주분은 취득 원인 카드의 &lsquo;동일세대 통산 거주기간&rsquo;에 별도 입력하세요.
      </p>
    </div>
  );
}

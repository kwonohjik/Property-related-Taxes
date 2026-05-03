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
import { FieldCard } from "@/components/calc/inputs/FieldCard";
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
      <p className="text-xs text-violet-700">
        거주기간은 1세대1주택 비과세·표2 장특공제 판정에 사용됩니다.
      </p>
      <ToggleCard
        variant="card"
        tone="violet"
        title="비연속 거주 구간 입력"
        description="입주일·퇴거일 페어를 여러 개 입력해 정확한 거주기간을 합산합니다. OFF 시 개월수만 직접 입력."
        checked={isInterval}
        onCheckedChange={(v) =>
          onChange({ residenceInputMode: v ? "interval" : "direct" })
        }
      >
        {isInterval && (
          <div className="space-y-2">
            {residencePeriods.length === 0 && (
              <p className="text-xs text-violet-700">
                구간이 없습니다. &ldquo;+ 구간 추가&rdquo; 로 첫 입주일·퇴거일을 입력하세요.
              </p>
            )}
            {residencePeriods.map((p, idx) => {
              const m = diffMonthsClamped(p.moveInDate, p.moveOutDate || transferDate);
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
                    <FieldCard label="퇴거일" hint="비워두면 양도일까지 거주">
                      <DateInput
                        value={p.moveOutDate}
                        onChange={(v) => setPeriod(idx, { moveOutDate: v })}
                      />
                    </FieldCard>
                  </div>
                  <p className="text-[11px] text-violet-700">
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
          <FieldCard label="거주기간 (개월)" hint="1세대1주택 표2 장특공제(거주 2년 이상)에 사용">
            <input
              type="number"
              min={0}
              max={480}
              value={residencePeriodMonthsAsset}
              onChange={(e) =>
                onChange({ residencePeriodMonthsAsset: e.target.value })
              }
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="ml-2 text-xs text-muted-foreground">
              ({fmtPeriod(parseInt(residencePeriodMonthsAsset) || 0)})
            </span>
          </FieldCard>
        )}
      </ToggleCard>
    </div>
  );
}

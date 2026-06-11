"use client";

/**
 * CasualtyLossSection — §23 재해손실공제 입력 (상속세 Step 4 내부)
 *
 * UI 설계: docs/02-design/features/inheritance-casualty-loss-deduction.ui.design.md
 * steps.tsx 800줄 정책 분리(2026-06-12). 외부 동작·마크업 동일.
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { FormState, FormSet } from "./shared";

/** §23 재난 종류 enum → 한국어 라벨 (단일 출처 — RadioCardGroup·결과 표시 공용) */
const DISASTER_TYPE_LABELS: Record<
  "fire" | "collapse" | "explosion" | "environmental" | "natural" | "other",
  string
> = {
  fire: "화재",
  collapse: "붕괴",
  explosion: "폭발",
  environmental: "환경오염사고",
  natural: "자연재해",
  other: "기타",
};

export function CasualtyLossSection({
  form,
  set,
}: {
  form: FormState;
  set: FormSet;
}) {
  // 자동계산 박스 — useMemo (useEffect→store 미러링 금지)
  const autoDeduction = useMemo(() => {
    if (!form.casualtyLossEnabled) return 0;
    const loss = parseAmount(form.casualtyLossValue);
    const comp = parseAmount(form.casualtyLossCompensated) || 0;
    return Math.max(0, loss - comp);
  }, [form.casualtyLossEnabled, form.casualtyLossValue, form.casualtyLossCompensated]);

  const disasterTypeOptions = (
    Object.keys(DISASTER_TYPE_LABELS) as Array<keyof typeof DISASTER_TYPE_LABELS>
  ).map((v) => ({ value: v, label: DISASTER_TYPE_LABELS[v] }));

  return (
    <ToggleCard
      tone="rose"
      title="재해손실공제 신청 (상증법 §23)"
      description="신고기한(상속개시일 말일부터 6개월) 이내 화재·붕괴·폭발·자연재해 등으로 상속재산이 멸실·훼손된 경우 과세가액에서 공제"
      checked={form.casualtyLossEnabled}
      onCheckedChange={(v) => set({ casualtyLossEnabled: v })}
    >
      {/* ① 재난 정보 (sky 카드) */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
            1
          </span>
          <p className="text-xs font-semibold text-sky-700">재난 정보</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">재난 종류</p>
          <RadioCardGroup
            name="casualtyLossType"
            tone="sky"
            layout="inline"
            value={form.casualtyLossType}
            onChange={(v) =>
              set({
                casualtyLossType: v as FormState["casualtyLossType"],
              })
            }
            options={disasterTypeOptions}
          />
        </div>
        <div data-testid="casualty-disaster-date">
          <FieldCard
            label="재난 발생일"
            hint="§23 요건 — 상속개시일 이후, 신고기한(상속개시일 말일부터 6개월) 이내 발생한 재난이어야 합니다."
          >
            <DateInput
              value={form.casualtyLossDate}
              onChange={(v) => set({ casualtyLossDate: v })}
            />
          </FieldCard>
        </div>
      </div>

      {/* ② 손실 산정 (rose 카드) */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-rose-700">손실 산정</p>
        </div>
        <CurrencyInput
          label="재해손실재산가액"
          value={form.casualtyLossValue}
          onChange={(v) => set({ casualtyLossValue: v })}
          hint="멸실·훼손된 상속재산의 평가액 (상속개시일 평가 기준, §20②)"
          placeholder="없으면 빈칸"
        />
        <CurrencyInput
          label="보전가능금액"
          value={form.casualtyLossCompensated}
          onChange={(v) => set({ casualtyLossCompensated: v })}
          hint="보험금 수령액·구상권 행사로 보전 가능한 금액. 없으면 0 또는 빈칸."
          placeholder="없으면 빈칸"
        />
        {/* 자동계산 박스 */}
        <div className="rounded-md border border-rose-200 bg-rose-100/60 px-3 py-2 text-xs space-y-1">
          <p className="text-rose-700 font-medium">
            공제 신청액 = 재해손실재산가액 − 보전가능금액
          </p>
          <p className="text-right font-mono tabular-nums text-rose-900 font-semibold text-sm">
            {autoDeduction.toLocaleString("ko-KR")}
          </p>
        </div>
      </div>
    </ToggleCard>
  );
}

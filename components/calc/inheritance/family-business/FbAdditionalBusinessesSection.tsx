"use client";

/**
 * 복수가업 순차공제 입력 (FB-MULTI) — 상증령 §15④ + 상증칙 §5 (PR-4)
 *
 * 피상속인이 둘 이상의 독립된 가업을 영위한 경우, 주 가업에 더해 추가 가업의
 * 영위연수·가업상속재산가액을 입력. 총한도 = 가장 긴 기업 한도, 영위연수 내림차순 순차 공제.
 *
 * 정책:
 *   - feedback_three_state_optional_mode_toggle: additionalFamilyBusinesses는 Array|undefined 3-state
 *       (undefined=OFF / []=ON·빈 / [...]=ON·데이터). length로 ON 여부 derive 금지.
 *   - single-source-engine-helper: 미리보기는 calcMultipleFamilyBusinessDeduction 엔진 호출 (UI 재구현 금지)
 *   - feedback_dialog_data_discard_confirm: OFF 시 데이터 있으면 폐기 확인
 *   - feedback_toggle_card_visibility / feedback_tailwind_static_tone_mapping
 */

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput, formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { calcMultipleFamilyBusinessDeduction } from "@/lib/tax-engine/deductions/family-business";
import type { FamilyBusinessUnit } from "@/lib/tax-engine/types/inheritance-family-business.types";

export type AdditionalFamilyBusiness = {
  operatingYears: number;
  businessValue: number;
  label?: string;
};

interface Props {
  /** 추가 가업 목록 (undefined=OFF / []=ON·빈 / [...]=ON·데이터) */
  value: AdditionalFamilyBusiness[] | undefined;
  onChange: (v: AdditionalFamilyBusiness[] | undefined) => void;
  /** 주 가업 영위연수 — 미리보기 순차공제 1순위 후보 */
  mainOperatingYears: number;
  /** 주 가업 가업상속재산가액 (원) — 미리보기용 */
  mainValue: number;
  /** 상속개시일 — 시기별 한도 (familyBusinessCap) */
  deathDate?: string;
}

export function FbAdditionalBusinessesSection({
  value,
  onChange,
  mainOperatingYears,
  mainValue,
  deathDate,
}: Props) {
  const isActive = value !== undefined;
  const [discardOpen, setDiscardOpen] = useState(false);

  const list = value ?? [];

  // 미리보기 — 엔진 단일 소스 (주 가업 + 추가 가업)
  const preview = useMemo(() => {
    if (!value || value.length === 0) return null;
    const units: FamilyBusinessUnit[] = [
      { operatingYears: mainOperatingYears, value: mainValue, label: "주 가업" },
      ...value.map((b) => ({
        operatingYears: b.operatingYears,
        value: b.businessValue,
        label: b.label?.trim() || undefined,
      })),
    ];
    return calcMultipleFamilyBusinessDeduction(units, deathDate);
  }, [value, mainOperatingYears, mainValue, deathDate]);

  const hasData = list.some((b) => b.operatingYears > 0 || b.businessValue > 0 || (b.label ?? "").trim());

  const handleToggleOn = () => onChange([{ operatingYears: 0, businessValue: 0 }]);
  const handleToggleOff = () => {
    if (!hasData) {
      onChange(undefined);
      return;
    }
    setDiscardOpen(true);
  };

  const updateItem = (idx: number, patch: Partial<AdditionalFamilyBusiness>) => {
    onChange(list.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };
  const addItem = () => onChange([...list, { operatingYears: 0, businessValue: 0 }]);
  const removeItem = (idx: number) => {
    const next = list.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <ToggleCard
        lawLinks="상증법"
        tone="sky"
        title="복수가업 순차공제 (상증령 §15④ · 상증칙 §5)"
        description={
          isActive
            ? "피상속인이 둘 이상의 독립된 가업을 영위 — 영위연수 긴 가업부터 순차 공제. 총한도는 가장 긴 기업의 한도."
            : "둘 이상의 독립된 가업을 상속하는 경우 체크. 추가 가업의 영위연수·가업상속재산가액을 입력합니다."
        }
        checked={isActive}
        onCheckedChange={(v) => (v ? handleToggleOn() : handleToggleOff())}
      />

      {isActive && (
        <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/10 dark:border-sky-800 p-3 space-y-3">
          <p className="text-[11px] text-sky-700 dark:text-sky-300">
            주 가업(위에서 입력한 가업)에 더해 추가 가업을 입력하세요. 각 추가 가업은 §15③ 요건을
            충족함을 전제로 영위연수·가업상속재산가액만 반영합니다.
          </p>

          {list.map((b, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-sky-200 bg-white/60 dark:bg-sky-950/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={b.label ?? ""}
                  onChange={(e) => updateItem(idx, { label: e.target.value || undefined })}
                  placeholder="가업 이름 (선택)"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  삭제
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    영위 연수
                  </span>
                  <DecimalInput
                    value={b.operatingYears > 0 ? String(b.operatingYears) : ""}
                    onChange={(v) => updateItem(idx, { operatingYears: parseDecimal(v) || 0 })}
                    unit="년"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    가업상속재산가액
                  </span>
                  <CurrencyInput
                    label="가업상속재산가액"
                    hideLabel
                    value={b.businessValue > 0 ? String(b.businessValue) : ""}
                    onChange={(v) => updateItem(idx, { businessValue: parseAmount(v) })}
                  />
                </label>
              </div>
              {b.businessValue > 0 && b.operatingYears > 0 && b.operatingYears < 10 && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400">
                  ⚠️ 영위 10년 미만은 가업이 아닙니다 (상증법 §18의2① 가업 정의).
                </p>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="w-full rounded-md border border-dashed border-sky-300 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100/50 dark:text-sky-300 dark:hover:bg-sky-900/20"
          >
            + 추가 가업
          </button>

          {/* 미리보기 — 엔진 단일 소스 순차공제 */}
          {preview && (
            <div className="rounded-md border border-sky-300 bg-sky-100/60 dark:bg-sky-900/30 dark:border-sky-700 p-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-sky-800 dark:text-sky-200">
                순차공제 미리보기 (총한도 {formatKRW(preview.totalCap)})
              </p>
              <div className="space-y-0.5 text-[10px] text-sky-800 dark:text-sky-300">
                {preview.lineItems.map((li) => (
                  <div key={li.order} className="flex justify-between gap-2">
                    <span>
                      {li.order}순위 {li.label ?? `영위 ${li.operatingYears}년`} (영위 {li.operatingYears}년)
                    </span>
                    <span className="font-mono tabular-nums">{formatKRW(li.deduction)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-2 border-t border-sky-300 pt-1 font-semibold">
                  <span>복수가업 공제 합계</span>
                  <span className="font-mono tabular-nums">{formatKRW(preview.totalDeduction)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>복수가업 입력을 삭제할까요?</DialogTitle>
            <DialogDescription>
              입력한 추가 가업 정보가 모두 삭제됩니다. 단일 가업 공제로 돌아갑니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setDiscardOpen(false);
              }}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

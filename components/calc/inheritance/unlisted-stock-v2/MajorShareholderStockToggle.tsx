"use client";

/**
 * MajorShareholderStockToggle — §22② 최대주주 해당 여부 (금융재산공제 배제 토글)
 *
 * 여(ON) = 최대주주 해당 → 이 비상장주식을 §22 금융재산 상속공제 대상금액에서 제외 (법 §22②).
 * resolveFinancialEligibility가 본 값을 최우선 가드로 참조 → §22 순금융재산 제안·결과 표시에 반영.
 * ※ §22②(금융재산공제 배제)는 §63③(할증평가 ×120%, isMaxShareholder)와 다른 개념(별도 모듈).
 *
 * Plan: docs/00-pm/inheritance-section22-major-shareholder-toggle.plan.md §3
 */

import { ToggleChip } from "@/components/calc/inputs/ToggleChip";

export interface MajorShareholderStockToggleProps {
  /** §22② 최대주주 해당 여부 (true=배제) */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 섹션 번호 (다-섹션 카드 패턴) */
  sectionNum?: number;
}

export function MajorShareholderStockToggle({
  checked,
  onCheckedChange,
  sectionNum = 7,
}: MajorShareholderStockToggleProps) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
          {sectionNum}
        </span>
        <p className="text-xs font-semibold text-violet-700">
          §22② 최대주주 보유주식 금융재산공제 배제
        </p>
      </div>
      <p className="text-[11px] text-violet-700/80">
        ⓘ 상증법 <strong>§22②</strong> — 최대주주가 보유한 주식은 금융재산 상속공제 대상에서{" "}
        <strong>제외</strong>됩니다. (§63③ 할증평가 ×120%는 별도 개념)
      </p>

      <div className="flex flex-wrap gap-1.5">
        <ToggleChip
          tone="violet"
          label="최대주주에 해당"
          checked={checked}
          onCheckedChange={onCheckedChange}
          title="ON = 공제 대상 제외 · OFF = 공제 대상 포함"
        />
      </div>
      {checked && (
        <div className="rounded border border-violet-300 bg-violet-100/60 p-2 text-[11px] text-violet-900">
          ✓ §22 순금융재산 <strong>제안값</strong>에 반영됨 — §22 입력 단계에서{" "}
          <strong>[적용]</strong> 버튼으로 반영하세요.
        </div>
      )}
    </div>
  );
}

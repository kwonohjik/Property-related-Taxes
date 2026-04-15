"use client";

/**
 * PriorGiftInput — 사전증여 내역 입력 컴포넌트 (#31)
 * 상속세: 10년(상속인) / 5년(비상속인) 이내 증여 합산 (§13)
 * 증여세: 동일인 10년 이내 증여 합산 (§47)
 */

import { useState } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type { PriorGift, DonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 관계 메타
// ============================================================

const DONOR_RELATION_LABELS: Record<DonorRelation, string> = {
  spouse: "배우자",
  lineal_ascendant_adult: "직계존속 (성인)",
  lineal_ascendant_minor: "직계존속 (미성년자 기준)",
  lineal_descendant: "직계비속",
  other_relative: "기타 친족",
};

const DONOR_RELATION_LIST: DonorRelation[] = [
  "spouse",
  "lineal_ascendant_adult",
  "lineal_ascendant_minor",
  "lineal_descendant",
  "other_relative",
];

// ============================================================
// 개별 사전증여 행 편집기
// ============================================================

interface GiftRowEditorProps {
  gift: PriorGift;
  index: number;
  /** 상속세 모드: 상속인 여부 선택 표시 / 증여세 모드: 숨김 */
  showIsHeir: boolean;
  onUpdate: (updated: PriorGift) => void;
  onRemove: () => void;
}

function GiftRowEditor({ gift, index, showIsHeir, onUpdate, onRemove }: GiftRowEditorProps) {
  const set = (patch: Partial<PriorGift>) => onUpdate({ ...gift, ...patch });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
          증여 {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>

      {/* 증여일 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          증여일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={gift.giftDate}
          onChange={(v) => set({ giftDate: v })}
        />
      </div>

      {/* 수증자 관계 */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          수증인과의 관계
        </label>
        <select
          value={gift.doneeRelation ?? ""}
          onChange={(e) =>
            set({ doneeRelation: (e.target.value || undefined) as DonorRelation | undefined })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택</option>
          {DONOR_RELATION_LIST.map((r) => (
            <option key={r} value={r}>
              {DONOR_RELATION_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {/* 상속인 여부 (상속세 전용) */}
      {showIsHeir && (
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={gift.isHeir}
            onChange={(e) => set({ isHeir: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              상속인에게 증여
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              상속인: 10년 이내 합산 (§13①1호) / 비상속인: 5년 이내 합산 (§13①2호)
            </p>
          </div>
        </label>
      )}

      {/* 증여가액 */}
      <CurrencyInput
        label="증여재산가액"
        value={gift.giftAmount > 0 ? String(gift.giftAmount) : ""}
        onChange={(v) => set({ giftAmount: parseAmount(v) })}
        required
        hint="증여 당시 평가액 (시가 기준)"
      />

      {/* 기납부 증여세 */}
      <CurrencyInput
        label="기납부 증여세"
        value={gift.giftTaxPaid > 0 ? String(gift.giftTaxPaid) : ""}
        onChange={(v) => set({ giftTaxPaid: parseAmount(v) })}
        hint="§28 증여세액공제 계산에 사용 — 납부하지 않았으면 0"
      />

      {/* 요약 미리보기 */}
      {gift.giftAmount > 0 && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
          <span>증여가액</span>
          <span className="font-medium">{formatKRW(gift.giftAmount)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 합산 요약
// ============================================================

function AggregationSummary({
  gifts,
  mode,
}: {
  gifts: PriorGift[];
  mode: "inheritance" | "gift";
}) {
  if (gifts.length === 0) return null;

  const total = gifts.reduce((s, g) => s + g.giftAmount, 0);
  const totalTaxPaid = gifts.reduce((s, g) => s + g.giftTaxPaid, 0);

  if (total === 0) return null;

  const heirTotal = mode === "inheritance"
    ? gifts.filter((g) => g.isHeir).reduce((s, g) => s + g.giftAmount, 0)
    : null;
  const nonHeirTotal = mode === "inheritance"
    ? gifts.filter((g) => !g.isHeir).reduce((s, g) => s + g.giftAmount, 0)
    : null;

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
        사전증여 합산 요약
      </p>
      {mode === "inheritance" && heirTotal !== null && nonHeirTotal !== null && (
        <>
          <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
            <span>상속인 증여 합계 (10년 합산)</span>
            <span>{formatKRW(heirTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
            <span>비상속인 증여 합계 (5년 합산)</span>
            <span>{formatKRW(nonHeirTotal)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between text-xs font-bold text-indigo-800 dark:text-indigo-200 border-t border-indigo-200 dark:border-indigo-700 pt-2">
        <span>증여가액 총합</span>
        <span>{formatKRW(total)}</span>
      </div>
      {totalTaxPaid > 0 && (
        <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
          <span>기납부 증여세 합계 (§28 공제 대상)</span>
          <span>{formatKRW(totalTaxPaid)}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface PriorGiftInputProps {
  gifts: PriorGift[];
  onChange: (gifts: PriorGift[]) => void;
  /** "inheritance": 상속세 모드 (상속인 여부 표시) / "gift": 증여세 모드 */
  mode?: "inheritance" | "gift";
}

function makeEmptyGift(): PriorGift {
  return {
    giftDate: "",
    isHeir: true,
    giftAmount: 0,
    giftTaxPaid: 0,
  };
}

export function PriorGiftInput({ gifts, onChange, mode = "inheritance" }: PriorGiftInputProps) {
  const handleAdd = () => onChange([...gifts, makeEmptyGift()]);

  const handleUpdate = (index: number, updated: PriorGift) => {
    const next = [...gifts];
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(gifts.filter((_, i) => i !== index));
  };

  const windowYears = mode === "inheritance" ? "10년 / 비상속인 5년" : "10년";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {mode === "inheritance" ? "사전증여재산 (§13)" : "동일인 사전증여 합산 (§47)"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            최근 {windowYears} 이내 증여 내역을 입력하세요
          </p>
        </div>
        {gifts.length > 0 && (
          <span className="text-xs text-gray-400">{gifts.length}건</span>
        )}
      </div>

      {gifts.length === 0 && (
        <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
          없으면 빈칸으로 두고 다음 단계로 이동하세요
        </div>
      )}

      {gifts.length > 0 && (
        <div className="space-y-3">
          {gifts.map((g, i) => (
            <GiftRowEditor
              key={i}
              gift={g}
              index={i}
              showIsHeir={mode === "inheritance"}
              onUpdate={(updated) => handleUpdate(i, updated)}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
      >
        <span className="text-lg">+</span>
        사전증여 추가
      </button>

      <AggregationSummary gifts={gifts} mode={mode} />
    </div>
  );
}

"use client";

/**
 * PriorGiftInput — 사전증여 내역 입력 컴포넌트 (#31)
 * 상속세: 10년(상속인) / 5년(비상속인) 이내 증여 합산 (§13)
 * 증여세: 동일인 10년 이내 증여 합산 (§47)
 */

import { useState } from "react";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { PriorGiftHistoryModal } from "@/components/calc/gift/PriorGiftHistoryModal";
import type {
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자동 채움 후 사용자가 자동 채움 9필드 중 어느 하나라도 수정했는지 판정.
 * 수정 시 sourceCalculationId 제거 → "📋 이력 기반" 배지 자동 사라짐.
 */
function hasUserEditedFields(prev: PriorGift, next: PriorGift): boolean {
  const keys: (keyof PriorGift)[] = [
    "giftDate",
    "giftAmount",
    "giftTaxPaid",
    "giftTaxBase",
    "doneeRelation",
    "donor",
    "computedTax",
    "additionalGenerationSkipSurcharge",
    "wasGenerationSkip",
  ];
  return keys.some((k) => prev[k] !== next[k]);
}

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

// Phase A: 증여자 관계 8 enum (gift 모드에서 §47 합산 그룹화·§57 적용 판정용)
const GIFT_DONOR_LABELS: Record<GiftDonorRelation, string> = {
  father: "부",
  mother: "모",
  grandparent: "조부모",
  spouse: "배우자",
  lineal_descendant: "직계비속",
  sibling: "형제자매",
  other_relative: "기타친족",
  other: "기타",
};

const GIFT_DONOR_LIST: GiftDonorRelation[] = [
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
];

// ============================================================
// 개별 사전증여 행 편집기
// ============================================================

interface GiftRowEditorProps {
  gift: PriorGift;
  index: number;
  /** 상속세 모드: 상속인 여부 선택 표시 / 증여세 모드: 숨김 */
  showIsHeir: boolean;
  /** 증여세 모드: donor·⑤·⑦·⑫ Phase A 필드 표시 */
  showGiftPhaseA: boolean;
  onUpdate: (updated: PriorGift) => void;
  onRemove: () => void;
}

function GiftRowEditor({
  gift,
  index,
  showIsHeir,
  showGiftPhaseA,
  onUpdate,
  onRemove,
}: GiftRowEditorProps) {
  const set = (patch: Partial<PriorGift>) => onUpdate({ ...gift, ...patch });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            증여 {index + 1}
          </span>
          {gift.sourceCalculationId && (
            <a
              href={`/history/${gift.sourceCalculationId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] bg-violet-100 text-violet-800 rounded px-2 py-0.5 hover:bg-violet-200"
              title="이 사전증여는 저장된 증여세 이력에서 자동 입력되었습니다. 필드를 수정하면 배지가 사라집니다."
            >
              📋 이력 기반
            </a>
          )}
        </div>
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
        <ToggleCard
          tone="violet"
          title="상속인에게 증여"
          description="상속인: 10년 이내 합산 (§13①1호) / 비상속인: 5년 이내 합산 (§13①2호)"
          checked={gift.isHeir}
          onCheckedChange={(v) => set({ isHeir: v })}
        />
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

      {/* Phase A: 증여세 모드 전용 — donor + ⑤ + ⑦ + 할증 + ⑫ */}
      {showGiftPhaseA && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
              §47
            </span>
            <p className="text-xs font-semibold text-violet-700">
              동일인 합산 정보 (§47 ② · §58 한도 산식용)
            </p>
          </div>

          {/* 증여자 (donor) */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-violet-700">
              증여자 (동일인 그룹 판정) <span className="text-destructive">*</span>
            </label>
            <select
              value={gift.donor ?? ""}
              onChange={(e) =>
                set({ donor: (e.target.value || undefined) as GiftDonorRelation | undefined })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">선택</option>
              {GIFT_DONOR_LIST.map((d) => (
                <option key={d} value={d}>
                  {GIFT_DONOR_LABELS[d]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-violet-600">
              현재 증여자와 동일인 그룹(부·모 또는 조부모)만 §47 합산 대상. 다른 그룹은 별개 신고로 자동 분리됩니다.
            </p>
          </div>

          {/* ⑤ 합산과세표준 */}
          <CurrencyInput
            label="그 회차 합산과세표준 ⑤"
            value={gift.giftTaxBase && gift.giftTaxBase > 0 ? String(gift.giftTaxBase) : ""}
            onChange={(v) => set({ giftTaxBase: parseAmount(v) || undefined })}
            hint="신고서 ⑤ 값. §58 한도 산식 분자(가장 최근 합산 회차) 용도."
          />

          {/* ⑦ 산출세액 */}
          <CurrencyInput
            label="그 회차 산출세액 ⑦"
            value={gift.computedTax && gift.computedTax > 0 ? String(gift.computedTax) : ""}
            onChange={(v) => set({ computedTax: parseAmount(v) || undefined })}
            hint="신고서 ⑦ 값. §58 가산 증여재산 산출세액(가장 최근 합산 회차)."
          />

          {/* 세대생략 토글 */}
          <ToggleCard
            tone="rose"
            title="그 회차에 세대생략 할증 적용 (§57)"
            description="조부모→손자 등 세대생략 증여 회차였으면 ON. donor=조부모 시 자동 ON 권장."
            checked={gift.wasGenerationSkip ?? false}
            onCheckedChange={(v) => set({ wasGenerationSkip: v })}
          />

          {/* ⑫ 추가 할증세액 (할증 ON 시만) */}
          {gift.wasGenerationSkip && (
            <CurrencyInput
              label="그 회차 추가 할증세액 ⑫"
              value={
                gift.additionalGenerationSkipSurcharge &&
                gift.additionalGenerationSkipSurcharge > 0
                  ? String(gift.additionalGenerationSkipSurcharge)
                  : ""
              }
              onChange={(v) =>
                set({
                  additionalGenerationSkipSurcharge: parseAmount(v) || undefined,
                })
              }
              hint="신고서 ⑫ 값. §57 누적 기할증과세액 ⑨ 산정용."
            />
          )}
        </div>
      )}

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
  /** 증여세 모드 — 현재 증여일 (이력 조회 필터 기준) */
  currentGiftDate?: string;
  /** 증여세 모드 — 현재 증여자 관계 (§47 표시용) */
  currentDonor?: GiftDonorRelation;
  /** 증여세 모드 — 수증자(=의뢰인) 식별자. null = 본인 (일반 납세자 모드) */
  currentClientId?: string | null;
}

function makeEmptyGift(): PriorGift {
  return {
    giftDate: "",
    isHeir: true,
    giftAmount: 0,
    giftTaxPaid: 0,
    sourceCalculationId: undefined,
  };
}

export function PriorGiftInput({
  gifts,
  onChange,
  mode = "inheritance",
  currentGiftDate,
  currentDonor,
  currentClientId = null,
}: PriorGiftInputProps) {
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const handleAdd = () => onChange([...gifts, makeEmptyGift()]);
  const handleAddFromHistory = (priorGift: PriorGift) => {
    onChange([...gifts, priorGift]);
  };

  const handleUpdate = (index: number, updated: PriorGift) => {
    const next = [...gifts];
    // 사용자가 자동 채움 후 어떤 필드라도 수정하면 sourceCalculationId 제거 (배지 자동 사라짐)
    const prev = gifts[index];
    if (prev.sourceCalculationId && hasUserEditedFields(prev, updated)) {
      updated = { ...updated, sourceCalculationId: undefined };
    }
    next[index] = updated;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(gifts.filter((_, i) => i !== index));
  };

  const canLookup =
    mode === "gift" && Boolean(currentGiftDate) && Boolean(currentDonor);
  const excludeIds = gifts
    .map((g) => g.sourceCalculationId)
    .filter((v): v is string => Boolean(v));

  const windowYears = mode === "inheritance" ? "10년 / 비상속인 5년" : "10년";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {mode === "inheritance" ? "사전증여재산 (§13)" : "동일인 사전증여 합산 (§47)"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            최근 {windowYears} 이내 증여 내역을 입력하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "gift" && (
            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              disabled={!canLookup}
              title={
                !canLookup
                  ? "1단계에서 증여일과 증여자 관계를 먼저 입력하세요"
                  : "현재 수증자(=의뢰인)의 저장된 증여세 이력에서 사전증여를 선택해 자동 입력합니다"
              }
              className={`text-xs rounded-md border px-3 py-1.5 transition-colors ${
                canLookup
                  ? "border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700"
                  : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
              }`}
            >
              📋 이력에서 조회
            </button>
          )}
          {gifts.length > 0 && (
            <span className="text-xs text-gray-400">{gifts.length}건</span>
          )}
        </div>
      </div>
      {mode === "gift" && !canLookup && (
        <p className="text-[11px] text-gray-500 -mt-2">
          ※ 이력 조회는 1단계 증여일·증여자 관계가 입력된 후 활성화됩니다.
        </p>
      )}

      {/* 이력 조회 모달 — 수증자(=의뢰인) clientId 매칭 */}
      {mode === "gift" && canLookup && (
        <PriorGiftHistoryModal
          open={historyModalOpen}
          onOpenChange={setHistoryModalOpen}
          currentGiftDate={currentGiftDate!}
          currentDonor={currentDonor!}
          currentClientId={currentClientId}
          excludeCalculationIds={excludeIds}
          onSelect={handleAddFromHistory}
          onManualAdd={handleAdd}
        />
      )}

      {gifts.length > 0 && (
        <div className="space-y-3">
          {gifts.map((g, i) => (
            <GiftRowEditor
              key={i}
              gift={g}
              index={i}
              showIsHeir={mode === "inheritance"}
              showGiftPhaseA={mode === "gift"}
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

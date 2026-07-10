"use client";

/**
 * SpecialTreatmentAssetSelector — 조특법 과세특례 귀속 자산 선택 (⑤-a)
 *
 * UI 설계 근거:
 *   - 자산 1개: 자동 귀속 읽기전용 표시 (사용자 선택 불필요)
 *   - 자산 N≥2: 체크박스 멀티선택 (isSpecialTreatmentAsset 직접 write)
 *   - 자산 0개: 경고 메시지
 *
 * 엔진 superRefine 동기화 (⑧ validateStep과 일치):
 *   - N≥2이고 모든 자산이 미설정이면 Step3 다음 버튼 차단
 *   - 1개 자동 귀속은 차단 없음
 *
 * useEffect → store 미러링 금지 (3대 핵심 정책).
 * onChange → giftItems[i].isSpecialTreatmentAsset 직접 write.
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  CATEGORY_LABELS,
} from "@/components/calc/inheritance/estate-card/estate-category-meta";
import type { SupportedCategory } from "@/lib/calc/deemed-category-policy";
import {
  isSpecialTreatmentEligibleCategory,
  SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON,
} from "@/lib/tax-engine/gift-special-stream";

// ============================================================
// 자산 표시값 계산 (평가액 우선순위)
// ============================================================

function getAssetValue(item: EstateItem): number {
  return (
    item.marketValue ??
    item.appraisedValue ??
    item.similarSalesValue ??
    item.standardPrice ??
    0
  );
}

function getAssetLabel(item: EstateItem, index: number): string {
  const categoryLabel =
    CATEGORY_LABELS[item.category as SupportedCategory] ??
    item.category;
  const name = item.name?.trim();
  if (name) return `${name} (${categoryLabel})`;
  return `${categoryLabel} ${index + 1}`;
}

// ============================================================
// SpecialTreatmentBadge — Step1 자산 카드 배지용 (외부 사용)
// ============================================================

export function SpecialTreatmentBadge({
  type,
}: {
  type: "startup" | "family_business";
}) {
  const label =
    type === "startup" ? "§30의5 창업자금 특례" : "§30의6 가업승계 특례";
  return (
    <span className="inline-flex items-center text-micro px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">
      {label}
    </span>
  );
}

// ============================================================
// SpecialTreatmentAssetSelector
// ============================================================

interface SpecialTreatmentAssetSelectorProps {
  /** 현재 선택된 특례 타입 */
  specialTreatment: "startup" | "family_business";
  /** 전체 자산 목록 (giftItems + stockItems) */
  allItems: EstateItem[];
  /** 개별 자산 isSpecialTreatmentAsset 변경 콜백 — 인덱스는 allItems 기준 */
  onItemChange: (index: number, isSpecial: boolean) => void;
}

export function SpecialTreatmentAssetSelector({
  specialTreatment,
  allItems,
  onItemChange,
}: SpecialTreatmentAssetSelectorProps) {
  const streamLabel =
    specialTreatment === "startup" ? "창업자금 §30의5" : "가업승계 §30의6";

  // 자산 0개
  if (allItems.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 px-4 py-3 text-sm text-amber-700">
        증여재산을 먼저 입력하세요. (Step 1)
      </div>
    );
  }

  // 자산 1개 — 자동 귀속 읽기전용 표시
  if (allItems.length === 1) {
    const item = allItems[0];
    const val = getAssetValue(item);
    const label = getAssetLabel(item, 0);
    // 재산 종류 부적격 — 자동 귀속 불가 경고 (validateStep ⑧·Zod ⑩이 차단)
    if (!isSpecialTreatmentEligibleCategory(item.category, specialTreatment)) {
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-800">
            특례 귀속 불가 재산 ({streamLabel})
          </p>
          <p className="text-sm text-amber-800">{label}</p>
          <p className="text-caption text-amber-700">
            {SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[specialTreatment]}. 특례
            선택을 해제하거나 해당 재산 종류로 입력하세요.
          </p>
        </div>
      );
    }
    return (
      <ToneCard
        tone="emerald"
        sectionNum="§"
        bodyClassName="space-y-2"
        noDark
        title={<>특례 귀속 자산 ({streamLabel}) — 자동 귀속</>}
      >
        <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-100/60 px-3 py-2">
          <span className="text-sm text-emerald-800 font-medium">{label}</span>
          <span className="text-sm font-mono text-emerald-800">
            {val > 0 ? formatKRW(val) : "—"}
          </span>
        </div>
        <p className="text-caption text-emerald-600">
          자산이 1개이므로 전체가 {streamLabel} 특례 스트림으로 자동 귀속됩니다.
        </p>
      </ToneCard>
    );
  }

  // 자산 N≥2 — 멀티선택 체크박스
  return (
    <ToneCard
      tone="emerald"
      sectionNum="§"
      bodyClassName="space-y-2"
      noDark
      title={<>특례 귀속 자산 선택 ({streamLabel})</>}
    >
      <p className="text-caption text-emerald-600">
        {streamLabel} 과세특례를 적용할 자산을 선택하세요. 미선택 자산은 일반 스트림(§47·§53·§56)으로 계산됩니다.
      </p>
      <div className="space-y-1.5">
        {allItems.map((item, i) => {
          const isChecked = item.isSpecialTreatmentAsset === true;
          const val = getAssetValue(item);
          const label = getAssetLabel(item, i);
          // 재산 종류 부적격 자산은 특례 귀속 선택 비활성 (startup: 소법 §94① 재산 제외 / family: 주식만)
          const eligible = isSpecialTreatmentEligibleCategory(
            item.category,
            specialTreatment,
          );
          return (
            <label
              key={item.id ?? i}
              className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors ${
                !eligible
                  ? "border-emerald-200/60 bg-emerald-50/30 opacity-60 cursor-not-allowed"
                  : isChecked
                    ? "border-emerald-400 bg-emerald-100/80 cursor-pointer"
                    : "border-emerald-200 bg-white dark:bg-transparent hover:bg-emerald-50 cursor-pointer"
              }`}
              title={
                !eligible
                  ? SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[specialTreatment]
                  : undefined
              }
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={isChecked}
                  // 부적격은 신규 체크 차단. 단 이미 체크된 상태(이력 복원 등)는 해제 가능해야 함
                  disabled={!eligible && !isChecked}
                  onChange={(e) => onItemChange(i, e.target.checked)}
                  className="h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                />
                <span className="text-sm">{label}</span>
                {isChecked && (
                  <span className="text-micro px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 font-medium">
                    특례 스트림
                  </span>
                )}
                {!eligible && (
                  <span className="text-micro px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                    특례 대상 아님
                  </span>
                )}
              </div>
              {val > 0 && (
                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                  {formatKRW(val)}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </ToneCard>
  );
}

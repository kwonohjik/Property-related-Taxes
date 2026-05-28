"use client";

/**
 * CategoryChangeDialog — 자산 카테고리 변경 Dialog
 *
 * Plan estate-card-followup-phase2 §FU-6·§6.5 · Design §7·Visual §4
 *
 * 정책:
 *   - 그룹 내 변경: 전 필드 보존 (confirm indigo + emerald hint)
 *   - 그룹 간 변경: marketValue ↔ leaseDeposit 매핑 + 비호환 필드 자동 손실 (confirm rose + amber 경고)
 *   - deemedCategory: isDeemedCategoryCompatible 호환 시만 보존
 *   - mode=gift: deposit 카테고리 제외 (상속세 전용)
 *   - 동일 카테고리 선택 시 confirm 버튼 disabled (UV2-O4)
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCategoryGroup,
  pickPreservedFields,
  computeLossFields,
  LOSS_FIELD_LABELS,
} from "@/lib/calc/category-change-policy";
import type { SupportedCategory } from "@/lib/calc/deemed-category-policy";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const CATEGORY_LABELS: Record<SupportedCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "단독주택·건물",
  real_estate_apartment: "아파트·공동주택",
  cash: "현금",
  financial: "예금·펀드·채권·공제금",
  deposit: "전세보증금 반환채권 (상속세 전용)",
  other: "기타 재산",
};

const INHERITANCE_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "deposit",
  "other",
];

const GIFT_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "other",
];

export interface CategoryChangeDialogProps {
  open: boolean;
  item: EstateItem;
  mode: "inheritance" | "gift";
  onConfirm: (preservedFields: Partial<EstateItem>) => void;
  onCancel: () => void;
}

export function CategoryChangeDialog({
  open,
  item,
  mode,
  onConfirm,
  onCancel,
}: CategoryChangeDialogProps) {
  const currentCategory = item.category as SupportedCategory;
  const [newCategory, setNewCategory] = useState<SupportedCategory>(currentCategory);

  const availableCategories =
    mode === "gift" ? GIFT_CATEGORIES : INHERITANCE_CATEGORIES;

  const oldGroup = getCategoryGroup(item.category);
  const newGroup = getCategoryGroup(newCategory);
  const isCrossGroup = oldGroup !== newGroup;
  const isSameCategory = newCategory === currentCategory;

  const preserved = useMemo(
    () => pickPreservedFields({ item, newCategory }),
    [item, newCategory],
  );

  const lossFields = useMemo(
    () => (isCrossGroup ? computeLossFields(item, preserved) : []),
    [isCrossGroup, item, preserved],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md print:hidden"
        data-testid={`category-change-dialog-${item.id}`}
      >
        <DialogHeader>
          <DialogTitle>카테고리 변경</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            현재 카테고리:{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {CATEGORY_LABELS[currentCategory]}
            </span>
          </p>

          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              변경할 카테고리
            </legend>
            {availableCategories.map((cat) => {
              const isCurrent = cat === currentCategory;
              const isSelected = cat === newCategory;
              return (
                <label
                  key={cat}
                  className={`flex items-center gap-2 text-xs cursor-pointer px-2 py-1 rounded ${
                    isSelected ? "bg-indigo-50 dark:bg-indigo-900/20" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="newCategory"
                    value={cat}
                    checked={isSelected}
                    onChange={() => setNewCategory(cat)}
                    data-testid={`category-change-radio-${cat}-${item.id}`}
                  />
                  <span className={isCurrent ? "text-gray-500" : ""}>
                    {CATEGORY_LABELS[cat]}
                    {isCurrent && " (현재)"}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* 그룹 내 변경 — emerald hint */}
          {!isCrossGroup && !isSameCategory && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/20 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              ✓ 그룹 내 변경 — 자산명·평가액·소재지·기준시가·임대보증금·저당권·§14
              토글 등 모든 필드가 보존됩니다.
            </div>
          )}

          {/* 그룹 간 변경 — amber 경고 + 손실 필드 */}
          {isCrossGroup && (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-900/20 dark:border-amber-800 p-3 space-y-1">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                ⚠️ 그룹 간 변경 — 다음 필드가 삭제됩니다
              </p>
              <ul className="space-y-0.5">
                {lossFields.map((key) => (
                  <li
                    key={key}
                    className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2"
                  >
                    <span aria-hidden className="text-rose-600 dark:text-rose-300">
                      ✗
                    </span>
                    {LOSS_FIELD_LABELS[key]}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                ※ 자산명·평가액·협의분할은 보존
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded border border-input bg-background hover:bg-accent"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(preserved)}
            disabled={isSameCategory}
            data-testid={`category-change-confirm-${item.id}`}
            className={`text-xs px-3 py-1.5 rounded text-white ${
              isSameCategory
                ? "bg-gray-300 cursor-not-allowed dark:bg-gray-600"
                : isCrossGroup
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isCrossGroup ? "변경 확인 (필드 손실)" : "변경 확인"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

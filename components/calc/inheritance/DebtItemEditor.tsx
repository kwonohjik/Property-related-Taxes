"use client";

/**
 * DebtItemEditor — 채무·공과·장례비 1건 편집 폼 (테이블 행 클릭 시 Dialog 모달 내용물)
 *
 * debt-item-table-view.plan.md §5.
 * 기존 DebtAllocationInput 항목 카드 body(이름·금액·봉안 토글·§22 토글·Table C·협의분할)에서
 * 카테고리 칩 헤더·카드 외곽을 벗긴 것. 입력 위젯 변경 0 — 위치만 카드→모달.
 *
 * 카테고리 칩은 DialogTitle("{라벨} 편집")과 중복되므로 미렌더(자산 탭 hideTitle 동형).
 * 삭제는 모달 푸터에서 처리하므로 본 컴포넌트는 onRemove를 받지 않는다.
 */

import type {
  DebtItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DateInput } from "@/components/ui/date-input";
import { HeirAllocationInput } from "./HeirAllocationInput";

export interface DebtItemEditorProps {
  item: DebtItem;
  heirs: Heir[];
  onUpdate: (patch: Partial<DebtItem>) => void;
}

export function DebtItemEditor({ item, heirs, onUpdate }: DebtItemEditorProps) {
  return (
    <div className="space-y-3" data-testid="debt-edit-body">
      {/* 채권자·내용 + 금액 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="채권자·내용"
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1 px-2 py-1 text-sm rounded border border-border bg-background"
        />
        <div className="w-36">
          <CurrencyInput
            label=""
            value={item.amount > 0 ? String(item.amount) : ""}
            onChange={(v) => onUpdate({ amount: parseAmount(v) })}
            placeholder="금액"
            hideUnit
          />
        </div>
      </div>

      {/* 장례비 봉안 토글 — native checkbox 금지, ToggleCard 강제 */}
      {item.category === "funeral" && (
        <ToggleCard
          lawLinks="상증법"
          tone="emerald"
          size="sm"
          title="봉안시설 사용료"
          description="ON 시 한도 500만 / OFF 시 식대 한도 1,000만"
          checked={!!item.isBongan}
          onCheckedChange={(v) => onUpdate({ isBongan: v })}
        />
      )}

      {/* §22 순금융재산 차감 채무 — financial 카테고리만 활성 (상증령 §19④) */}
      <div className="flex flex-wrap gap-1.5">
        <LawArticleModal legalBasis="상증법 §22" label="§22 금융재산공제" />
        <LawArticleModal legalBasis="상증령 §19" label="상증령 §19 금융재산·채무" />
      </div>
      {/* O-1: §22·§19 링크는 위 전용 행에서 제공 → lawLinks 미적용(중복 방지) */}
      <ToggleCard
        tone="rose"
        size="sm"
        title="§22 순금융재산 차감 채무"
        description={
          item.category === "financial"
            ? "§10① 1호 입증된 금융회사등 채무 (상증령 §19④)"
            : "§19④ — 금융회사등 채무만 §22 차감 대상. 사적채무·공과금·장례비는 제외"
        }
        checked={
          item.category === "financial" &&
          (item.isFinancialDebtForDeduction ?? true)
        }
        onCheckedChange={(v) => onUpdate({ isFinancialDebtForDeduction: v })}
        disabled={item.category !== "financial"}
      />

      {/* 상속개시자료 요약 4표 — Table C 채권자/비고 (2026-05-28) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50/40 p-2">
        <div>
          <label className="block text-caption font-medium text-slate-600 mb-1">
            채권자 주소 (Table C)
          </label>
          <input
            type="text"
            value={item.creditorAddress ?? ""}
            onChange={(e) =>
              onUpdate({ creditorAddress: e.target.value || undefined })
            }
            placeholder="예: 강남구 역삼동"
            className="w-full px-2 py-1 text-sm rounded border border-border bg-background"
          />
        </div>
        <div>
          <label className="block text-caption font-medium text-slate-600 mb-1">
            채무 발생일 (Table C 비고)
          </label>
          <DateInput
            value={item.incurredDate ?? ""}
            onChange={(v) => onUpdate({ incurredDate: v || undefined })}
          />
        </div>
      </div>

      {/* 협의분할 */}
      <HeirAllocationInput
        allocations={item.heirAllocations}
        expectedTotal={item.amount}
        heirs={heirs}
        onChange={(allocs) => onUpdate({ heirAllocations: allocs })}
      />
    </div>
  );
}

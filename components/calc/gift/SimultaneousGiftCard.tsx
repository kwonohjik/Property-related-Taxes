"use client";

/**
 * SimultaneousGiftCard — 동시증여 추가 건 1개 입력 카드 (⑤ 지점)
 *
 * 재사용 컴포넌트:
 *   - RadioCardGroup: 증여자 관계 선택 (DONOR_OPTIONS 8종)
 *   - PropertyValuationForm: 증여재산 입력
 *   - StockValuationForm: 주식 입력
 *   - ExemptionChecklist: 비과세
 *   - PriorGiftInput: 사전증여
 *   - GiftCreditChecklist: 공제·세액공제 (기본 접힘)
 *
 * 정책:
 *   - useEffect → store 미러링 금지 (mirror-pattern)
 *   - 자동 안분 fallback 금지 — 미입력은 validateStep에서 차단
 *   - donor === "grandparent" → 세대생략 할증(§57) 자동 처리는 엔진(buildGiftTaxInput)
 *   - 동일 그룹 차단: 1차 인라인 경고, 2차 validateStep(3)
 *   - 800줄 정책 준수
 */

import { useState, useMemo } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { cn } from "@/lib/utils";
import type { GiftSubFormState } from "@/components/calc/gift-tax-form-shared";
import {
  DONOR_LABELS,
  DONOR_OPTIONS,
} from "@/components/calc/gift-tax-form-shared";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { isSameDonorGroup } from "@/lib/tax-engine/gift-prior-aggregation";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { GiftCreditChecklist } from "@/components/calc/gift/GiftCreditChecklist";
import { sumEstateItemsValuation } from "@/lib/stores/inheritance-summary";

// ============================================================
// Props
// ============================================================

export interface SimultaneousGiftCardProps {
  /** 건 번호 (0-based 인덱스 + 1) 표시용 */
  index: number;
  /** 추가 건 서브폼 상태 */
  sub: GiftSubFormState;
  /** 건 0의 donor — 동일 그룹 경고 기준 */
  mainDonor: GiftDonorRelation;
  /** 서브폼 부분 업데이트 콜백 */
  onChange: (partial: Partial<GiftSubFormState>) => void;
  /** 이 건 삭제 콜백 */
  onDelete: () => void;
}

// ============================================================
// 섹션 접기/펼치기 버튼 헬퍼
// ============================================================

function SectionToggle({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      <span>{label}</span>
      <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(expanded)}</span>
    </button>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function SimultaneousGiftCard({
  index,
  sub,
  mainDonor,
  onChange,
  onDelete,
}: SimultaneousGiftCardProps) {
  // 비과세·사전증여 / 공제 섹션 기본 접힘 (경량 뷰 우선)
  const [exemptionOpen, setExemptionOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [giftAddOpen, setGiftAddOpen] = useState(false);
  const [stockAddOpen, setStockAddOpen] = useState(false);

  // 동일 그룹 검사 — donor 선택 직후 인라인 경고 (1차 방어)
  const isSameGroup =
    sub.donor && isSameDonorGroup(sub.donor, mainDonor);

  // 재산 합계 — 헤더 요약용 (useMemo, useEffect 금지)
  const giftTotal = useMemo(
    () => sumEstateItemsValuation(sub.giftItems, sub.giftDate),
    [sub.giftItems, sub.giftDate],
  );
  const stockTotal = useMemo(
    () => sumEstateItemsValuation(sub.stockItems, sub.giftDate),
    [sub.stockItems, sub.giftDate],
  );
  const totalValue = giftTotal + stockTotal;

  const donorLabel = sub.donor ? (DONOR_LABELS[sub.donor] ?? "선택 안 됨") : "관계 선택";
  const cardTitle = `동시증여 추가 건 ${index + 1} — ${donorLabel}${totalValue > 0 ? ` (${totalValue.toLocaleString("ko-KR")}원)` : ""}`;

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 space-y-4",
        isSameGroup
          ? "border-rose-300 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-900/20"
          : "border-sky-200 bg-sky-50/30 dark:border-sky-800 dark:bg-sky-900/20",
      )}
    >
      {/* 헤더 — 번호 배지 + 제목 + 삭제 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-caption font-bold text-white">
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-sky-900 dark:text-sky-100">
            {cardTitle}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
        >
          삭제
        </button>
      </div>

      {/* ① 증여자 관계 (RadioCardGroup) */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-sky-800 dark:text-sky-200">
          ① 증여자 관계 (8종)
        </div>
        <RadioCardGroup
          name={`sim-donor-${index}`}
          options={DONOR_OPTIONS.map((d) => ({
            value: d,
            label: DONOR_LABELS[d],
            testId: `sim-card-${index}-donor-${d}`,
          }))}
          value={sub.donor ?? ""}
          onChange={(v) => onChange({ donor: v as GiftDonorRelation })}
          tone="sky"
        />
        {/* 세대생략 안내 */}
        {sub.donor === "grandparent" && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            조부모 선택: 세대생략 할증(§57, 30%) 자동 적용. 수증자 미성년 + 20억 초과 시 40%.
          </div>
        )}
      </div>

      {/* D-2: 동일 그룹 인라인 경고 (1차 방어) */}
      {isSameGroup && sub.donor && (
        <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 text-xs font-medium text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300 whitespace-pre-line">
          {`${DONOR_LABELS[sub.donor]}와 현재 신고의 ${DONOR_LABELS[mainDonor]}는 상증법 §47② 동일인 그룹입니다.\n동일인의 증여는 현재 신고 증여재산에 합산하고 여기에 입력하지 마세요.`}
        </div>
      )}

      {/* ② 증여재산 (PropertyValuationForm) */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-sky-800 dark:text-sky-200">
          ② 증여재산
          {giftTotal > 0 && (
            <span className="ml-2 font-normal text-gray-500">
              합계 {giftTotal.toLocaleString("ko-KR")}원
            </span>
          )}
        </div>
        <PropertyValuationForm
          items={sub.giftItems}
          onChange={(items) => onChange({ giftItems: items })}
          mode="gift"
          valuationDate={sub.giftDate || undefined}
          hideHeader
          addPanelOpen={giftAddOpen}
          onAddPanelOpenChange={setGiftAddOpen}
        />
        {!giftAddOpen && (
          <button
            type="button"
            onClick={() => setGiftAddOpen(true)}
            className="rounded-md border border-sky-300 bg-sky-100/60 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
          >
            + 증여재산 추가
          </button>
        )}
      </div>

      {/* ② 주식·지분 (StockValuationForm) */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-sky-800 dark:text-sky-200">
          주식·지분
          {stockTotal > 0 && (
            <span className="ml-2 font-normal text-gray-500">
              합계 {stockTotal.toLocaleString("ko-KR")}원
            </span>
          )}
        </div>
        <StockValuationForm
          items={sub.stockItems}
          onChange={(items) => onChange({ stockItems: items })}
          mode="gift"
          valuationDate={sub.giftDate || undefined}
          hideHeader
          addPanelOpen={stockAddOpen}
          onAddPanelOpenChange={setStockAddOpen}
        />
        {!stockAddOpen && (
          <button
            type="button"
            onClick={() => setStockAddOpen(true)}
            className="rounded-md border border-emerald-300 bg-emerald-100/60 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            + 주식·지분 추가
          </button>
        )}
      </div>

      {/* ③ 비과세·사전증여 (기본 접힘) */}
      <div className="space-y-2">
        <SectionToggle
          label={`③ 비과세·사전증여${sub.exemptionItems.length > 0 || sub.priorGifts.length > 0 ? " (입력 있음)" : ""}`}
          expanded={exemptionOpen}
          onToggle={() => setExemptionOpen((prev) => !prev)}
        />
        {exemptionOpen && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            <ExemptionChecklist
              category="gift"
              value={sub.exemptionItems}
              onChange={(items) => onChange({ exemptionItems: items })}
            />
            <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
              <PriorGiftInput
                gifts={sub.priorGifts}
                onChange={(gifts) => onChange({ priorGifts: gifts })}
                mode="gift"
                currentGiftDate={sub.giftDate}
                currentDonor={sub.donor}
              />
            </div>
          </div>
        )}
      </div>

      {/* ④ 공제·세액공제 (기본 접힘) */}
      <div className="space-y-2">
        <SectionToggle
          label="④ 공제·세액공제 설정"
          expanded={creditOpen}
          onToggle={() => setCreditOpen((prev) => !prev)}
        />
        {creditOpen && (
          <div className="rounded-lg border border-gray-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            <GiftCreditChecklist
              form={sub as import("@/components/calc/gift-tax-form-shared").FormState}
              set={(partial) => onChange(partial)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

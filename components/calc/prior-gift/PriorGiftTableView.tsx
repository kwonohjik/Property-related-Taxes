"use client";

/**
 * PriorGiftTableView — 사전증여재산(§13)·동일인 합산(§47) 요약 테이블 (행 클릭 → 편집 모달)
 *
 * prior-gift-table-view.plan.md §3.
 * 행은 read-only 요약. 컬럼: 증여일 · 수증자 · 증여재산가액(우정렬) · 분류·옵션 배지 · 편집.
 * 배지·수증자 라벨은 단일 출처 재사용(resolvePriorGiftBadges·donorSummaryLabel) — dual-truth 회피.
 *
 * ★ PriorGift에 행 id가 없음 → 선택 식별은 index 기반(selectedIndex). testid도 index 기반.
 * ★ 증여세 모드(mode="gift")는 heirs 미전달(undefined) → 수증자는 doneeRelation 라벨만.
 */

import { Settings } from "lucide-react";
import {
  CHIP_TONE_CLASSES,
} from "@/components/calc/inheritance/estate-card/chip-config";
import {
  DONOR_RELATION_LABELS,
  donorSummaryLabel,
} from "@/components/calc/prior-gift/meta";
import {
  resolvePriorGiftBadges,
  countPriorGiftOptions,
  type PriorGiftBadge,
} from "@/components/calc/prior-gift/prior-gift-badges";
import { deriveBeneficiaryTypeFromHeir } from "@/lib/calc/prior-gift-donee-derive";
import type {
  PriorGift,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 수증자 표시 라벨 (단일진실 — GiftRowEditor 요약 배지와 동일 derive)
// ============================================================

interface DoneeDisplay {
  label: string;
  sub: string | null;
  warn?: boolean;
}

/** 수증자 컬럼 표시 — 모드·heirs 가용성·doneeId 매칭 5케이스 enumerate */
function resolveDoneeDisplay(
  gift: PriorGift,
  mode: "inheritance" | "gift",
  heirs?: Heir[],
): DoneeDisplay {
  if (mode === "inheritance") {
    const matched = (heirs ?? []).find((h) => h.id === gift.doneeId);
    // 1. doneeId 지정 + 매칭 Heir 존재
    if (gift.doneeId && matched) {
      const type = deriveBeneficiaryTypeFromHeir(matched);
      return {
        label: donorSummaryLabel(matched) + (matched.name ? ` (${matched.name})` : ""),
        sub: type === "heir" ? "상속인 · 10년 합산" : "비상속인 · 5년 합산",
      };
    }
    // 2. doneeId 지정했으나 Heir 삭제됨 (orphan)
    if (gift.doneeId && !matched) {
      return { label: "수증자 삭제됨", sub: "재지정 필요", warn: true };
    }
    // 3. 수동 경로 (doneeId 미지정) — isHeir 게이트 + doneeRelation
    return {
      label: gift.isHeir ? "상속인 증여" : "비상속인 증여",
      sub: gift.doneeRelation ? DONOR_RELATION_LABELS[gift.doneeRelation] : "관계 미지정",
    };
  }
  // 증여세 모드 (heirs 없음) — 4·5. doneeRelation 라벨만
  return {
    label: gift.doneeRelation ? DONOR_RELATION_LABELS[gift.doneeRelation] : "수증인 미지정",
    sub: null,
  };
}

// ============================================================
// 읽기 전용 배지
// ============================================================

function ReadonlyPriorGiftBadge({ badge }: { badge: PriorGiftBadge }) {
  const cls = CHIP_TONE_CLASSES[badge.tone] ?? CHIP_TONE_CLASSES.gray;
  return (
    <span
      className={`inline-flex items-center text-micro px-1.5 py-0.5 rounded-full border ${cls}`}
    >
      {badge.label}
    </span>
  );
}

// ============================================================
// 행
// ============================================================

interface PriorGiftTableRowProps {
  gift: PriorGift;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

function PriorGiftTableRow({
  gift,
  index,
  isSelected,
  onSelect,
  mode,
  heirs,
}: PriorGiftTableRowProps) {
  const donee = resolveDoneeDisplay(gift, mode, heirs);
  const badges = resolvePriorGiftBadges(gift, mode);
  const optionCount = countPriorGiftOptions(gift, mode);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={`증여 ${index + 1} 편집`}
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 " +
        (isSelected
          ? "bg-violet-50/70 dark:bg-violet-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
      data-testid={`prior-gift-table-row-${index}`}
    >
      {/* 증여일 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs">
        {gift.giftDate ? (
          gift.giftDate
        ) : (
          <span className="text-amber-600 dark:text-amber-400">미입력</span>
        )}
      </td>
      {/* 수증자 */}
      <td className="pl-2 py-1.5 text-xs">
        <div className={`font-medium ${donee.warn ? "text-amber-600 dark:text-amber-400" : ""}`}>
          {donee.label}
        </div>
        {donee.sub && (
          <div className="text-micro text-gray-400">{donee.sub}</div>
        )}
        {gift.propertyName && (
          <div className="text-micro text-gray-400">{gift.propertyName}</div>
        )}
      </td>
      {/* 증여재산가액 (우정렬 — amount-column-align) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {gift.giftAmount > 0 ? (
          gift.giftAmount.toLocaleString()
        ) : (
          <span className="text-gray-400">미입력</span>
        )}
      </td>
      {/* 분류·옵션 배지 */}
      <td className="pl-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <ReadonlyPriorGiftBadge key={badge.key} badge={badge} />
          ))}
        </div>
      </td>
      {/* 편집 힌트 */}
      <td className="pr-3 py-1.5 text-right text-xs select-none whitespace-nowrap">
        {optionCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-slate-400 mr-1.5">
            <Settings className="h-3 w-3" aria-hidden />
            {optionCount}
          </span>
        )}
        <span className="text-gray-300 dark:text-gray-600">✎</span>
      </td>
    </tr>
  );
}

// ============================================================
// 메인 export
// ============================================================

export interface PriorGiftTableViewProps {
  gifts: PriorGift[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  mode: "inheritance" | "gift";
  /** 상속세 모드 — 수증자 Heir 매칭용. 증여세 모드는 undefined. */
  heirs?: Heir[];
}

export function PriorGiftTableView({
  gifts,
  selectedIndex,
  onSelect,
  mode,
  heirs,
}: PriorGiftTableViewProps) {
  if (gifts.length === 0) return null;

  return (
    <div
      className="overflow-x-auto"
      role="group"
      aria-label={mode === "inheritance" ? "사전증여재산 목록" : "동일인 사전증여 목록"}
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">증여일</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">수증자</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">
              증여재산가액
            </th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">분류·옵션</th>
            <th className="w-16 py-2 text-right pr-3 text-gray-400 font-medium text-micro">
              편집
            </th>
          </tr>
        </thead>
        <tbody>
          {gifts.map((gift, index) => (
            <PriorGiftTableRow
              key={index}
              gift={gift}
              index={index}
              isSelected={index === selectedIndex}
              onSelect={() => onSelect(index)}
              mode={mode}
              heirs={heirs}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

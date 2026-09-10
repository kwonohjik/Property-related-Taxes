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
  GIFT_DONOR_LABELS,
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
  // 증여세 모드 (heirs 없음) — 표시 대상은 «증여자»(donor)다.
  //
  // 종전에는 doneeRelation을 「수증자」 칸에 넣었는데, 증여세 모드에서 그 필드는
  // 이력 조회가 `donorRelation`을 그대로 복사해 넣은 값이고(prior-gift-lookup.ts:327)
  // GiftRowEditor는 증여세 모드에서 수증인 관계 select를 아예 렌더하지 않는다(:371 showIsHeir 게이트).
  // 즉 「수증자」 라벨 아래에 증여자 관계가 찍혔고, §47 동일인 합산을 실제로 가르는
  // gift.donor는 표에도 배지에도 없었다. 컬럼 헤더도 모드별로 나눈다(:220).
  return {
    label: gift.donor ? GIFT_DONOR_LABELS[gift.donor] : "증여자 미지정",
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
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              {mode === "inheritance" ? "수증자" : "증여자"}
            </th>
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

"use client";

/**
 * MinorAtGiftToggleBlock — 증여 당시 수증자 미성년 여부 토글 (항목 C)
 *
 * 표시 조건:
 *   - 상속세 모드(showIsHeir=true)
 *   - doneeRelation === "lineal_descendant" (피상속인 관점 자녀)
 *   - 매칭 Heir.birthDate 미입력 시에만 토글 노출
 *   - birthDate 있으면 자동 판정 안내만 표시 (토글 숨김)
 *
 * 엔진 단일 진실: isDoneeMinorAtGift (prior-gift-deduction-perspective.ts)
 *   birthDate + giftDate 우선 → 미입력 시 doneeWasMinorAtGift fallback.
 *
 * 설계: docs/02-design/features/inheritance-prior-gift-followup-3items.ui.design.md §C
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { differenceInYears } from "date-fns";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

interface MinorAtGiftToggleBlockProps {
  gift: PriorGift;
  set: (patch: Partial<PriorGift>) => void;
  /** 매칭된 Heir의 생년월일 (있으면 자동 도출, 없으면 토글 표시) */
  heirBirthDate?: string;
}

export function MinorAtGiftToggleBlock({
  gift,
  set,
  heirBirthDate,
}: MinorAtGiftToggleBlockProps) {
  // birthDate + giftDate 모두 있으면 자동 판정 안내만 표시
  if (heirBirthDate && gift.giftDate) {
    const ageAtGift = differenceInYears(
      new Date(gift.giftDate),
      new Date(heirBirthDate),
    );
    return (
      <p className="text-caption text-emerald-600 dark:text-emerald-400">
        ⓘ 증여 당시 만 {ageAtGift}세 (자동 판정 — §53 공제 자동 적용).
        {ageAtGift < 19
          ? " 미성년 직계존속 공제 2천만 원 적용."
          : " 성년 직계존속 공제 5천만 원 적용."}
      </p>
    );
  }

  // birthDate 없음 → 토글로 수동 입력
  return (
    <ToggleCard
      tone="amber"
      title="증여 당시 미성년이었음"
      description="§53 직계존속 공제: 성년 5천만 원 / 미성년(만 19세 미만) 2천만 원. 수증자(상속인) 생년월일 미입력 시 토글로 지정하세요."
      checked={gift.doneeWasMinorAtGift === true}
      onCheckedChange={(v) => set({ doneeWasMinorAtGift: v || undefined })}
    />
  );
}

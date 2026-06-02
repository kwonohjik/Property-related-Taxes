"use client";

/**
 * FamilyBusinessHeirSelector — 가업상속인 지정 (섹션③, ~80줄)
 *
 * - 자연인 상속인(corporate 제외)을 RadioCardGroup(tone=sky)으로 선택
 * - 1명이면 자동선택 badge 표시
 * - 선택된 Heir의 birthDate 없으면 heirBirthDate DateInput 노출
 *
 * testid: fb-heir-selector
 *
 * 정책:
 *   - feedback_toggle_card_visibility (RadioCardGroup 강제)
 *   - feedback_tailwind_static_tone_mapping (정적 매핑)
 *   - feedback_useeffect_store_mirror_forbidden (useMemo만)
 */

import { useMemo } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const RELATION_LABEL: Record<string, string> = {
  spouse: "배우자",
  child: "자녀",
  lineal_ascendant: "직계존속",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
};

interface Props {
  heirs: Heir[];
  heirId?: string;
  heirBirthDate?: string;
  deathDate: string;
  onChange: (patch: Partial<FamilyBusinessInheritanceInput>) => void;
}

export function FamilyBusinessHeirSelector({
  heirs,
  heirId,
  heirBirthDate,
  deathDate,
  onChange,
}: Props) {
  // corporate 제외한 자연인 상속인만
  const naturalHeirs = useMemo(
    () => heirs.filter((h) => h.relation !== "corporate"),
    [heirs],
  );

  const selectedHeir = useMemo(
    () => naturalHeirs.find((h) => h.id === heirId) ?? null,
    [naturalHeirs, heirId],
  );

  // 선택된 Heir의 만 나이 (deathDate 기준)
  const ageLabel = useMemo(() => {
    const bd = selectedHeir?.birthDate ?? heirBirthDate;
    if (!bd || !deathDate) return null;
    try {
      const age = differenceInYears(parseISO(deathDate), parseISO(bd));
      return `만 ${age}세`;
    } catch {
      return null;
    }
  }, [selectedHeir, heirBirthDate, deathDate]);

  // 1명이면 자동선택 (없을 때만)
  const autoSelected = naturalHeirs.length === 1 && !heirId;

  if (naturalHeirs.length === 0) {
    return (
      <div className="rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 p-3 text-[11px] text-sky-700 dark:text-sky-300">
        자연인 상속인을 먼저 등록하면 가업상속인을 선택할 수 있습니다.
      </div>
    );
  }

  const effectiveHeirId = autoSelected ? naturalHeirs[0].id : heirId;

  return (
    <div className="space-y-2" data-testid="fb-heir-selector">
      {autoSelected && (
        <div className="rounded bg-sky-100/70 dark:bg-sky-900/30 px-2 py-1 text-[10px] text-sky-700 dark:text-sky-300">
          상속인이 1명이므로 자동 선택됩니다.
        </div>
      )}

      <RadioCardGroup<string>
        name="fb-heir-id"
        layout="stack"
        tone="sky"
        value={effectiveHeirId ?? ""}
        options={naturalHeirs.map((h) => {
          const bd = h.birthDate ?? (h.id === effectiveHeirId ? heirBirthDate : undefined);
          let ageStr = "";
          if (bd && deathDate) {
            try {
              ageStr = ` (만 ${differenceInYears(parseISO(deathDate), parseISO(bd))}세)`;
            } catch {
              /* ignore */
            }
          }
          return {
            value: h.id,
            label: h.name?.trim() || RELATION_LABEL[h.relation] || h.relation,
            description: RELATION_LABEL[h.relation] + ageStr,
          };
        })}
        onChange={(v) => onChange({ heirId: v || undefined })}
      />

      {/* 선택된 Heir의 birthDate 미입력 → heirBirthDate DateInput */}
      {effectiveHeirId && !selectedHeir?.birthDate && (
        <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 p-2">
          <p className="text-[11px] text-sky-700 dark:text-sky-300">
            생년월일을 입력하면 18세(§15③2호 가) 자동판정을 수행합니다.
          </p>
          <DateInput
            value={heirBirthDate ?? ""}
            onChange={(v) => onChange({ heirBirthDate: v || undefined })}
          />
          {ageLabel && (
            <p className="text-[11px] text-sky-600 dark:text-sky-400">{ageLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

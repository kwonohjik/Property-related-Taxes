"use client";

/**
 * GiftTaxBaseModeBlock — 사전증여 과세표준 산정 방식 선택 + 직접 입력 (항목 B)
 *
 * 상속세 모드(showIsHeir=true) 전용.
 * - "auto":   §53 관계공제 자동 도출 (derivePriorGiftTaxBase 엔진 단일 진실).
 * - "manual": 증여세 신고서 과세표준 ⑤ 직접 입력 → giftTaxBase 저장.
 *             manual 선택 + giftTaxBase 입력 시 §53의2 위젯 자동 숨김 (GiftRowEditor :361).
 *
 * 설계: docs/02-design/features/inheritance-prior-gift-followup-3items.ui.design.md §B
 */

import {
  CurrencyInput,
  parseAmount,
} from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

interface GiftTaxBaseModeBlockProps {
  gift: PriorGift;
  set: (patch: Partial<PriorGift>) => void;
  /** RadioCardGroup name — 여러 행 마운트 시 유일해야 함 (index 포함) */
  groupName: string;
}

export function GiftTaxBaseModeBlock({
  gift,
  set,
  groupName,
}: GiftTaxBaseModeBlockProps) {
  const mode = gift.priorGiftTaxBaseInputMode ?? "auto";

  return (
    <div className="space-y-2">
      {/* 라벨 */}
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        과세표준 산정 방식
      </label>

      {/* 자동 / 직접 입력 RadioCardGroup (emerald, inline) */}
      <RadioCardGroup<"auto" | "manual">
        name={groupName}
        tone="emerald"
        layout="inline"
        value={mode}
        onChange={(v) => {
          if (v === "auto") {
            // auto 복귀: mode 변경, giftTaxBase 초기화 — marriageBirthDeduction 보존
            set({ priorGiftTaxBaseInputMode: "auto", giftTaxBase: undefined });
          } else {
            set({ priorGiftTaxBaseInputMode: "manual" });
          }
        }}
        options={[
          {
            value: "auto",
            label: "자동 도출 (§53 관계공제)",
          },
          {
            value: "manual",
            label: "직접 입력 (증여세 신고서 과세표준)",
          },
        ]}
      />

      {/* manual 선택 시에만 giftTaxBase 입력란 노출 */}
      {mode === "manual" && (
        <CurrencyInput
          label="증여 과세표준"
          value={
            gift.giftTaxBase != null && gift.giftTaxBase > 0
              ? String(gift.giftTaxBase)
              : ""
          }
          onChange={(v) =>
            set({ giftTaxBase: parseAmount(v) || undefined })
          }
          hint="증여세 신고서 과세표준 ⑤ 값. 입력 시 §53의2 혼인·출산 위젯은 자동 숨김(이미 반영)."
        />
      )}

      {/* auto 선택 시 안내 */}
      {mode === "auto" && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
          ⓘ §53 관계공제(수증자 관점)를 적용해 과세표준을 자동 도출합니다. 증여세 신고서가 있으면 직접 입력을 선택하세요.
        </p>
      )}
    </div>
  );
}

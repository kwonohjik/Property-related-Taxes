"use client";

/**
 * CorporateGiftFields — 영리법인 사전증여 ToggleCard 펼침 영역
 * (§3의2② 산출세액 상당액 + giftTaxBase + doneeId select)
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type {
  PriorGift,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

export function CorporateGiftFields({
  gift,
  set,
  heirs,
}: {
  gift: PriorGift;
  set: (patch: Partial<PriorGift>) => void;
  heirs?: Heir[];
}) {
  const value = gift.corporateGiftComputedTax;
  const isMissing = !value || value <= 0;
  const taxBaseValue = gift.giftTaxBase;
  // PR-C: doneeId select — heirs 중 영리법인(또는 relation="corporate") 우선 노출
  const corporateHeirs = (heirs ?? []).filter(
    (h) => h.relation === "corporate" || h.isHeir === false,
  );
  const availableHeirs =
    corporateHeirs.length > 0 ? corporateHeirs : (heirs ?? []);
  const doneeIdMissing = !gift.doneeId;
  return (
    <div className="space-y-2 pt-2">
      <CurrencyInput
        label="증여세 산출세액 상당액"
        value={value && value > 0 ? String(value) : ""}
        onChange={(v) => set({ corporateGiftComputedTax: parseAmount(v) })}
        required
        hint="영리법인에 증여세가 부과된다고 가정한 산출세액 (시가 기준 §26 누진세율). §3의2② 면제 한도 분자."
      />
      {isMissing && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          ⚠ 입력 필수 — 미입력 시 §3의2② 면제 한도를 계산할 수 없습니다.
        </p>
      )}

      {/* giftTaxBase — 면제 한도 분자 정밀 지정 (옵션) */}
      <CurrencyInput
        label="증여세 과세표준 (선택)"
        value={taxBaseValue && taxBaseValue > 0 ? String(taxBaseValue) : ""}
        onChange={(v) => {
          const parsed = parseAmount(v);
          set({ giftTaxBase: parsed > 0 ? parsed : undefined });
        }}
        hint="미입력 시 위 증여재산가액(giftAmount)을 §3의2② 한도 분자로 사용. 증여세 공제 후 과세표준이 별도라면 직접 입력."
      />

      {/* PR-C: doneeId select — 영리법인 Heir.id 매핑 (validate 차단 해소) */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          영리법인 수증자 <span className="text-destructive">*</span>
        </label>
        <select
          value={gift.doneeId ?? ""}
          onChange={(e) => set({ doneeId: e.target.value || undefined })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">
            {availableHeirs.length === 0
              ? "상속인 단계에서 영리법인(relation=\"corporate\") 추가 필요"
              : "선택"}
          </option>
          {availableHeirs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name ?? h.id}
              {h.relation === "corporate" ? " (영리법인)" : ""}
            </option>
          ))}
        </select>
        {doneeIdMissing && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">
            ⚠ §3의2② 면제 적용을 위해 영리법인 수증자 매핑이 필요합니다.
          </p>
        )}
      </div>
    </div>
  );
}

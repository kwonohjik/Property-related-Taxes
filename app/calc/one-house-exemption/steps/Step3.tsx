"use client";

/**
 * ③ 양도 예정 (P4-2b-2)
 *
 * UI 설계 §3.3.
 *
 * ## 🔴 「양도 대상 주택 선택」 위젯은 만들지 않는다 (계획서 §20.4)
 *
 * 설계 초안은 ② 명부에서 양도 대상을 고르는 `RadioCardGroup`을 두려 했으나, 명부는
 * **「다른 보유 주택」**이라 거기에 양도 대상이 들어 있지 않다
 * (`HousesListSection.tsx:529`). API 변환 층이 `id:"selling"` 행을 앞에 붙이며 그 행의
 * 취득일·기준시가·지역을 전부 `assets[0]`에서 읽는다. ⇒ 양도 대상은 **여기서 직접** 받는다.
 */
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function Step3({ form, onChange }: Props) {
  const primary = form.assets[0];

  /** 자산-수준 patch — `assets[0]`만 갈아 끼운다(계산기 Step4:613-617과 같은 형태). */
  const patchAsset = (patch: Record<string, unknown>) =>
    onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="③ 양도 예정"
        description="양도하려는 주택과 예정 조건을 입력하세요."
      />

      <ToneCard tone="amber" sectionNum="3-A" title="양도 대상 주택">
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldCard label="취득일">
            <DateInput
              data-testid="one-house-acq-date"
              value={primary?.acquisitionDate ?? ""}
              onChange={(acquisitionDate) => patchAsset({ acquisitionDate })}
            />
          </FieldCard>
          <FieldCard label="양도 예정일">
            <DateInput
              data-testid="one-house-sale-date"
              value={form.transferDate}
              onChange={(transferDate) => onChange({ transferDate })}
            />
          </FieldCard>
        </div>
        <FieldCard
          label="예상 양도가액"
          hint="12억 초과 여부(고가주택)를 판정하는 데 쓰입니다"
        >
          <CurrencyInput
            data-testid="one-house-sale-price"
            label="예상 양도가액"
            hideLabel
            hideUnit
            value={form.contractTotalPrice}
            onChange={(contractTotalPrice) => onChange({ contractTotalPrice })}
          />
        </FieldCard>
      </ToneCard>

      <ToneCard tone="rose" sectionNum="3-B" title="조정대상지역">
        <p className="text-sm leading-relaxed">
          <b>취득 당시</b> 조정대상지역이었다면 보유 2년에 더해 <b>거주 2년</b>이 필요합니다.
          양도 당시 지정 여부는 거주요건과 무관합니다.
        </p>
        <ToggleCard
          data-testid="one-house-was-regulated"
          checked={form.wasRegulatedAtAcquisition}
          onCheckedChange={(wasRegulatedAtAcquisition) => onChange({ wasRegulatedAtAcquisition })}
          title="취득 당시 조정대상지역이었습니다"
          tone="rose"
          size="sm"
        />
        <ToggleCard
          data-testid="one-house-is-regulated"
          checked={form.isRegulatedArea}
          onCheckedChange={(isRegulatedArea) => onChange({ isRegulatedArea })}
          title="양도 당시 조정대상지역입니다"
          tone="rose"
          size="sm"
        />
      </ToneCard>

      {/*
        거주기간 — **자산-수준** 필드에 바인딩한다. 폼-전역 `residencePeriodMonths`는 이
        위젯이 건드리지 않는 옛 필드이고, 어댑터도 같은 leaf로 자산-수준을 읽는다.
      */}
      <ResidencePeriodSection
        residenceInputMode={primary.residenceInputMode}
        residencePeriods={primary.residencePeriods}
        residencePeriodMonthsAsset={primary.residencePeriodMonthsAsset}
        transferDate={form.transferDate}
        onChange={patchAsset}
      />

      <ToggleCard
        data-testid="one-house-unregistered"
        checked={form.isUnregistered}
        onCheckedChange={(isUnregistered) => onChange({ isUnregistered })}
        title="미등기 양도자산입니다"
        description="미등기 양도는 비과세·감면이 배제됩니다 (법 §91①)"
        tone="rose"
      />
    </div>
  );
}

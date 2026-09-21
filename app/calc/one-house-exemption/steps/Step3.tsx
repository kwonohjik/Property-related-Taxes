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
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { RedevelopmentRightExemptionSection } from "@/components/calc/transfer/RedevelopmentRightExemptionSection";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function Step3({ form, onChange }: Props) {
  const primary = form.assets[0];
  /** 양도 대상이 조합원입주권인가 — §89①3호(주택)와 §89①4호(입주권)를 가르는 축이다. */
  const isRightSale = primary.assetKind === "right_to_move_in";

  /** 자산-수준 patch — `assets[0]`만 갈아 끼운다(계산기 Step4:613-617과 같은 형태). */
  const patchAsset = (patch: Record<string, unknown>) =>
    onChange({ assets: form.assets.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="③ 양도 예정"
        description="양도하려는 주택과 예정 조건을 입력하세요."
      />

      {/*
        🔴 **양도 대상 종류가 판정 조문을 가른다** (P4-3b).
           주택 → §89①3호(보유·거주요건·§155 각 항) · 조합원입주권 → §89①4호(가목·나목).
           엔진의 자산 게이트가 `propertyType !== "housing"`이라 이 선택이 곧 경로 선택이다.
        🔑 `redevSubject`를 함께 세운다 — §89①4호 카드의 노출 게이트가 그 값을 읽는다.
      */}
      <ToneCard tone="violet" sectionNum="3-A" title="양도 대상">
        <RadioCardGroup
          name="one-house-sale-target"
          tone="violet"
          layout="stack"
          options={[
            {
              value: "housing",
              label: "주택",
              description: "소득세법 §89①3호 — 보유 2년(조정대상지역 취득 시 거주 2년) 요건과 §155 각 항 특례로 판정합니다.",
            },
            {
              value: "right_to_move_in",
              label: "조합원입주권",
              description: "소득세법 §89①4호 — 다른 주택·분양권 보유 여부와 인가일 기준 요건으로 판정합니다.",
            },
          ]}
          value={primary.assetKind === "right_to_move_in" ? "right_to_move_in" : "housing"}
          onChange={(v) =>
            patchAsset(
              v === "right_to_move_in"
                ? { assetKind: "right_to_move_in", redevSubject: "right" }
                : { assetKind: "housing" },
            )
          }
        />
      </ToneCard>

      <ToneCard tone="amber" sectionNum="3-B" title={isRightSale ? "양도 대상 입주권" : "양도 대상 주택"}>
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

      <ToneCard tone="rose" sectionNum="3-C" title="조정대상지역">
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
        §89①4호 1세대1입주권 — **이 화면이 유일한 입력 경로**다 (P6-c-1).
        종전에는 계산기 `RedevelopmentBlock`도 같은 컴포넌트를 `mode="full"`로 띄웠으나,
        입력 4종이 전부 판정 사실이라 계산기 쪽을 읽기 전용 요약으로 바꿨다.
        🔑 §166 3분할 산식 입력은 애초에 이 컴포넌트가 아니라 `RedevelopmentBlock`이 갖는다 —
           세액 맥락(§95② 장기보유특별공제 구조 안내)도 그쪽으로 옮겼다.
      */}
      {isRightSale && (
        <RedevelopmentRightExemptionSection
          asset={primary}
          onChange={patchAsset}
          wasRegulatedAtAcquisition={form.wasRegulatedAtAcquisition}
        />
      )}

      {/*
        거주기간 — **자산-수준** 필드에 바인딩한다. 폼-전역 `residencePeriodMonths`는 이
        위젯이 건드리지 않는 옛 필드이고, 어댑터도 같은 leaf로 자산-수준을 읽는다.

        🔑 입주권 양도에는 띄우지 않는다 — §89①4호의 거주 축은 **인가일 기준 종전주택** 거주이고
           그 값은 위 카드의 `redevPriorHouseResidenceMonths`가 받는다. 둘 다 띄우면 사용자는
           같은 질문을 두 번 받고, 판정에는 그중 하나만 쓰인다.
      */}
      {!isRightSale && (
      <ResidencePeriodSection
        residenceInputMode={primary.residenceInputMode}
        residencePeriods={primary.residencePeriods}
        residencePeriodMonthsAsset={primary.residencePeriodMonthsAsset}
        transferDate={form.transferDate}
        onChange={patchAsset}
      />
      )}

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

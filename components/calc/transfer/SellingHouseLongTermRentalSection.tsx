"use client";

/**
 * SellingHouseLongTermRentalSection — **양도하는 주택 자신**이 장기임대주택인 경우 (§167의3①2호)
 *
 * ## 왜 별도 섹션인가 — 2호는 2주택에서도 성립한다
 *
 * 기존 `SellingHouseExclusionSection`은 노출 게이트가 **3주택 이상**이다. 그런데 2호는
 * 2주택에서도 §167의10①**2호**가 「제167조의3제1항제2호부터 제8호까지」를 준용해 성립하고,
 * 엔진도 `effectiveHouseCount >= 2`에서 판정한다(`multi-house-surcharge-exclusion.ts`).
 * 3주택+ 섹션에 넣으면 2주택 사용자는 **선언할 화면이 없다**.
 *
 * ## 9유형 매트릭스는 명부 행과 **같은 위젯**을 쓴다
 *
 * 법문(실독 2026-09-22 · MST 286211)의 가~자목 중 양도 주택에 안 쓰이는 목이 없다 —
 * 사목은 문언이 아예 「등록 말소 이후 1년 이내 **양도하는** 주택」이다. 목을 골라낼 수 없으므로
 * `HouseEntryRentalTypeSection`을 그대로 재사용한다(복제하면 두 진실이 된다).
 *
 * 정책: ToggleCard/DateInput/DecimalInput 전용 · OFF 시 onChange 직접 patch(useEffect 미러링 금지).
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import { hasRentalBasicRegistration } from "@/lib/tax-engine/multi-house-surcharge-count";
import type { RentalDeclaration, TransferFormData } from "@/lib/stores/calc-wizard-store";

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

interface Props {
  value: SellingExclusion | undefined;
  onChange: (v: SellingExclusion | undefined) => void;
}

export function SellingHouseLongTermRentalSection({ value, onChange }: Props) {
  const v = value ?? {};
  const ltr = v.longTermRental ?? {};

  function patch(partial: RentalDeclaration) {
    onChange({ ...v, longTermRental: { ...ltr, ...partial } });
  }

  return (
    <ToneCard tone="violet" bodyClassName="space-y-2.5" title="양도 주택이 장기임대주택인 경우" noDark>
      <p className="text-caption text-muted-foreground/80">
        양도하는 주택 자체가 등록 장기임대주택이면 중과 대상에서 제외됩니다 (소령 §167의3①2호 ·
        2주택은 §167의10①2호 준용).
      </p>

      <ToggleCard
        variant="card"
        tone="violet"
        checked={ltr.isLongTermRental ?? false}
        onCheckedChange={(b) =>
          onChange({ ...v, longTermRental: b ? { ...ltr, isLongTermRental: true } : undefined })
        }
        title="양도 주택이 등록 장기임대주택"
        description="유형을 고르면 목별 요건(기간·기준시가·호수·아파트 제한 등)으로 정밀 판정합니다. 유형을 고르지 않으면 등록 완비 + 임대 5년 이상으로 판정합니다."
      >
        <div className="space-y-3 pt-1">
          {/* 아파트 여부 — 아·자목 일괄 제외 / 가·마목 2020.7.11 이후 등록 제외의 판정 입력 */}
          <ToggleCard
            variant="chip"
            tone="violet"
            checked={ltr.isApartment ?? false}
            onCheckedChange={(b) => patch({ isApartment: b })}
            title="임대주택이 아파트"
            description="단기(아·자목)는 아파트가 일괄 제외되고, 매입 장기(가·마목)는 2020.7.11 이후 등록분이 제외됩니다."
          />

          {/* 등록 — 엔진 hasRentalBasicRegistration(등록 플래그 + 등록일 2종) */}
          <ToggleCard
            variant="card"
            tone="violet"
            checked={ltr.isRegisteredRental ?? false}
            onCheckedChange={(b) =>
              patch({
                isRegisteredRental: b,
                rentalRegistrationDate: b ? ltr.rentalRegistrationDate : undefined,
                businessRegistrationDate: b ? ltr.businessRegistrationDate : undefined,
              })
            }
            title="임대사업자 정식 등록"
            description="시·군·구청 임대사업자 등록(민특법 §5) + 세무서 사업자등록(법 §168)"
          >
            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">
                  임대사업자 등록일
                </label>
                <DateInput
                  value={ltr.rentalRegistrationDate ?? ""}
                  onChange={(s) => patch({ rentalRegistrationDate: s || undefined })}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">
                  사업자 등록일
                </label>
                <DateInput
                  value={ltr.businessRegistrationDate ?? ""}
                  onChange={(s) => patch({ businessRegistrationDate: s || undefined })}
                />
              </div>
            </div>
          </ToggleCard>

          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">임대기간 (년)</label>
            <DecimalInput
              value={ltr.rentalPeriodYears ?? ""}
              onChange={(s) => patch({ rentalPeriodYears: s || undefined })}
              placeholder="임대기간 입력"
            />
            <p className="text-caption text-muted-foreground/70">
              가목·다목은 5년, 마목·바목은 10년, 아목·자목은 6년이 의무임대기간입니다.
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">
              임대사업자 말소일{" "}
              <span className="text-muted-foreground/60 font-normal">(양도 전 말소 시 입력)</span>
            </label>
            <DateInput
              value={ltr.rentalCancelledDate ?? ""}
              onChange={(s) => patch({ rentalCancelledDate: s || undefined })}
            />
            <p className="text-caption text-muted-foreground/70">
              말소 후 1년 이내 양도(사목)를 주장하려면 이 칸이 아니라 아래 유형에서 사목을 고르고
              「자진·자동 말소일」에 적으세요.
            </p>
          </div>

          {/*
            🔴 명부 행과 같은 함정을 그대로 알린다(R20) — 등록이 미완비면 유형을 다 채워도
               `isLongTermRentalHousingExempt`가 **침묵 미적용**한다.
          */}
          {!hasRentalBasicRegistration(
            ltr.isRegisteredRental,
            ltr.rentalRegistrationDate,
            ltr.businessRegistrationDate,
          ) && (
            <p
              className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-caption text-amber-900"
              data-testid="selling-rental-registration-incomplete-warning"
            >
              위 <strong>「임대사업자 정식 등록」</strong>이 완료되지 않아, 아래 유형을 모두 채워도
              <strong> 중과 배제가 적용되지 않습니다</strong>. 등록 토글을 켜고 임대사업자
              등록일·사업자 등록일을 입력하세요.
            </p>
          )}

          <HouseEntryRentalTypeSection house={ltr} idPrefix="selling" onUpdate={patch} />
        </div>
      </ToggleCard>
    </ToneCard>
  );
}

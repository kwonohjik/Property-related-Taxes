"use client";

/**
 * 다른 보유 주택 편집 — 섹션 ③ 장기임대(violet) · 소령 §167의3①2호. `HouseEntryEditor.tsx`(757줄)에서 분리했다(800줄 정책).
 * isLongTermRental=true 조건부 → 등록사업자·등록일·사업자등록일·임대기간·말소일·9유형 매트릭스.
 */
import { DateInput } from "@/components/ui/date-input";
import { RentalPeriodDatesFields } from "@/components/calc/transfer/RentalPeriodDatesFields";
import { REGISTERED_DATE_HINT } from "@/components/calc/transfer/RentalPeriodDatesFields";
import { registeredDateAfterApplicationChange } from "@/lib/stores/calc-wizard-asset-rental-period";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { hasRentalBasicRegistration } from "@/lib/tax-engine/multi-house-surcharge-count";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import { RentalGiftDonorHouseholdField } from "@/components/calc/transfer/RentalGiftDonorHouseholdField";
import { RentalCancellationReasonField } from "@/components/calc/transfer/RentalCancellationReasonField";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

export function HouseEntryLongTermRentalSection({
  house,
  onUpdate,
  aptDeadlineExtensionEnabled,
}: {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
  /** ⑪ 연장 사실 칸 — 3호 칩과 같은 축(중과) · 계산기만 연다 */
  aptDeadlineExtensionEnabled?: boolean;
}) {
  return (
    <ToneCard tone="violet" sectionNum="③" bodyClassName="space-y-2.5" title="장기임대 정보">

      {/* 장기임대 여부 토글 */}
      <ToggleCard
        variant="card"
        tone="violet"
        checked={house.isLongTermRental}
        onCheckedChange={(v) => {
          // 장기임대 OFF 시 관련 필드 초기화 (onChange 직접 set)
          onUpdate({
            isLongTermRental: v,
            isRegisteredRental: v ? house.isRegisteredRental : undefined,
            rentalRegistrationDate: v ? house.rentalRegistrationDate : undefined,
            rentalRegisteredDate: v ? house.rentalRegisteredDate : undefined,
            businessRegistrationDate: v ? house.businessRegistrationDate : undefined,
            // 임대개시일·종료일은 §167의3①3호와 같은 칸 — 3호가 켜져 있으면 지우지 않는다. 상속 합산은 2호 전용.
            rentalStartDate: v || house.isTaxIncentiveRental ? house.rentalStartDate : undefined,
            rentalEndDate: v || house.isTaxIncentiveRental ? house.rentalEndDate : undefined,
            isInheritedRental: v ? house.isInheritedRental : undefined,
            decedentRentalMonths: v ? house.decedentRentalMonths : undefined,
            rentalCancelledDate: v ? house.rentalCancelledDate : undefined,
            rentalCancellationReason: v ? house.rentalCancellationReason : undefined,
            rentalGiftDonorHousehold: v ? house.rentalGiftDonorHousehold : undefined,
          });
        }}
        title="장기임대 등록주택"
        description="임대사업자 등록 장기임대주택 — 요건 충족 시 중과 대상에서 제외 (소령 §167의3①2호 · 주택 수에는 산입)"
      >
        {/* ON 시 세부 입력 노출 */}
        <div className="space-y-3 pt-1">
          {/* 등록임대사업자 여부 */}
          <ToggleCard
            variant="card"
            tone="violet"
            checked={house.isRegisteredRental ?? false}
            onCheckedChange={(v) => {
              onUpdate({
                isRegisteredRental: v,
                rentalRegistrationDate: v ? house.rentalRegistrationDate : undefined,
                rentalRegisteredDate: v ? house.rentalRegisteredDate : undefined,
                businessRegistrationDate: v ? house.businessRegistrationDate : undefined,
              });
            }}
            title="임대사업자 정식 등록"
            description="시·군·구청에 임대사업자 등록 완료 여부 (민간임대주택법)"
          >
            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">임대사업자 등록 신청일</label>
                <DateInput
                  value={house.rentalRegistrationDate ?? ""}
                  onChange={(v) =>
                    onUpdate({
                      rentalRegistrationDate: v || undefined,
                      rentalRegisteredDate:
                        registeredDateAfterApplicationChange(house.rentalRegistrationDate, house.rentalRegisteredDate, v) || undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">임대사업자 등록일</label>
                <DateInput
                  data-testid="house-rental-registered-date"
                  value={house.rentalRegisteredDate ?? ""}
                  onChange={(v) => onUpdate({ rentalRegisteredDate: v || undefined })}
                />
                <p className="text-caption text-muted-foreground">{REGISTERED_DATE_HINT}</p>
              </div>
              <div className="space-y-1">
                <label className="block text-caption text-muted-foreground font-medium">사업자 등록일</label>
                <DateInput
                  value={house.businessRegistrationDate ?? ""}
                  onChange={(v) => onUpdate({ businessRegistrationDate: v || undefined })}
                />
              </div>
            </div>
          </ToggleCard>

          {/* 임대기간 — 임대개시일·종료일로 엔진이 계산(소령 §167의3③ 등록일 기산 · 연수 칸 없음) */}
          <RentalPeriodDatesFields
            value={house}
            onPatch={onUpdate}
            variant="long_term"
            testIdPrefix={`house-${house.id}-rental`}
          />

          {/* 임대사업자 말소일 (optional) */}
          <div className="space-y-1">
            <label className="block text-caption text-muted-foreground font-medium">
              임대사업자 말소일{" "}
              <span className="text-muted-foreground font-normal">(양도 전 말소 시 입력)</span>
            </label>
            <DateInput
              value={house.rentalCancelledDate ?? ""}
              onChange={(v) => onUpdate({ rentalCancelledDate: v || undefined })}
            />
            <p className="text-caption text-muted-foreground">
              양도일 이전 말소된 경우 임대 배제 특례가 해제될 수 있습니다.
            </p>
          </div>
          {house.rentalCancelledDate && (
            <RentalCancellationReasonField
              testIdPrefix={`house-rental-cancel-reason-${house.id}`}
              value={house.rentalCancellationReason}
              onChange={(v) => onUpdate({ rentalCancellationReason: v })}
            />
          )}
          <RentalGiftDonorHouseholdField
            decl={house}
            testIdPrefix={`house-rental-gift-donor-${house.id}`}
            onChange={(v) => onUpdate({ rentalGiftDonorHousehold: v })}
          />

          {/*
            🔴 9유형 매트릭스는 「임대사업자 정식 등록」 토글 **밖**의 형제다(R20).
               엔진 `isLongTermRentalHousingExempt`는 `rentalType`이 있어도
               `hasRentalBasicRegistration`(등록 플래그 + 임대등록일 + 사업자등록일)이
               false면 **중과배제를 침묵 미적용**한다. 요건을 다 채워도 아무 말이 없었다.
               ⇒ 배치는 그대로 두고(등록 여부와 무관하게 유형은 고를 수 있어야 한다)
                 **미충족 사실과 빠진 항목을 밝힌다**.
          */}
          {!hasRentalBasicRegistration(
            house.isRegisteredRental,
            house.rentalRegistrationDate,
            house.businessRegistrationDate,
          ) && (
            <p
              className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-caption text-amber-900 dark:text-amber-200 dark:bg-amber-950/40"
              data-testid="rental-registration-incomplete-warning"
            >
              위 <strong>「임대사업자 정식 등록」</strong>이 완료되지 않아, 아래 유형을 모두
              채워도 <strong>중과 배제가 적용되지 않습니다</strong>. 등록 토글을 켜고
              임대사업자 등록 신청일·사업자 등록일을 입력하세요.
            </p>
          )}
          {/* 9유형(가~자목) 매트릭스 — 유형 선택 시 유형별 요건 정밀 판정 */}
          <HouseEntryRentalTypeSection
            house={house}
            idPrefix={house.id}
            onUpdate={onUpdate}
            aptDeadlineExtensionEnabled={aptDeadlineExtensionEnabled}
            urbanLifeHousingQuestionEnabled
          />
        </div>
      </ToggleCard>
    </ToneCard>
  );
}

"use client";

/**
 * 종부령 §3①8호 나목 1)~4)·7호 단서 입력 칸 — 묻는 조건은 `na8Asks`(⑧ 차단·④ 전송과 같은 술어).
 * 조정대상지역은 주소(PNU)로 자동 판정하고, 판정할 수 없거나 사용자가 고르면 직접 입력한다.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-8ho-na.plan.md
 */
import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { na8Asks } from "@/lib/calc/comprehensive-rental-8na";
import { na8Context } from "@/lib/calc/comprehensive-rental-8na";
import { resolveRegulated8Na } from "@/lib/calc/comprehensive-rental-8na";

type Tri = "yes" | "no";
const YES_NO = (testId: string, yes: string, no: string) => [
  { value: "yes" as const, label: yes, testId: `${testId}-yes` },
  { value: "no" as const, label: no, testId: `${testId}-no` },
];

function DateField({
  label,
  testId,
  value,
  onChange,
  hint,
  optional = false,
}: {
  label: string;
  testId: string;
  value: string | undefined;
  onChange: (v: string) => void;
  hint: string;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label} {optional ? <span className="text-muted-foreground font-normal text-xs">(선택)</span> : <span className="text-destructive">*</span>}
      </label>
      <DateInput data-testid={testId} value={value ?? ""} onChange={onChange} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function YesNoField({
  label,
  name,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  name: string;
  value: "" | Tri | undefined;
  onChange: (v: Tri) => void;
  yes: string;
  no: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label} <span className="text-destructive">*</span>
      </label>
      <RadioCardGroup<Tri>
        name={name}
        data-testid={name}
        layout="inline"
        tone="sky"
        value={value ?? ""}
        onChange={onChange}
        options={YES_NO(name, yes, no)}
      />
    </div>
  );
}

export function RentalExclusion8NaFields({
  property,
  registrationType,
  onUpdate,
}: {
  property: PropertyEntry;
  registrationType: string;
  onUpdate: (data: Partial<PropertyEntry>) => void;
}) {
  const assessmentYear = useComprehensiveWizardStore((s) => s.formData.assessmentYear);
  const taxpayerType = useComprehensiveWizardStore((s) => s.formData.taxpayerType);
  const ctx = useMemo(
    () => na8Context({ assessmentYear, taxpayerType }, registrationType),
    [assessmentYear, taxpayerType, registrationType],
  );
  const asks = na8Asks(property, ctx);
  const regulated = asks.regulated ? resolveRegulated8Na(property, ctx.assessmentDate) : null;
  const manual = property.regulated8NaMode === "manual";

  if (!Object.values(asks).some(Boolean)) return null;

  return (
    <ToneCard tone="slate" title="장기일반·공공지원 임대주택 제외 요건 (시행령 §3①7호 단서·8호 나목)" bodyClassName="space-y-3">
      {asks.acquisitionDate && (
        <>
          <DateField
            label="임대주택 취득일"
            testId="comprehensive-8na-acquisition-date"
            value={property.rentalAcquisitionDate}
            onChange={(v) => onUpdate({ rentalAcquisitionDate: v })}
            hint="2018.9.13. 이전 취득분은 종전 규정(제외 요건 없음)입니다."
          />
          <DateField
            label="매매계약·계약금 지급일"
            testId="comprehensive-8na-deposit-date"
            optional
            value={property.rentalDepositPaidDate}
            onChange={(v) => onUpdate({ rentalDepositPaidDate: v })}
            hint="조정대상지역 공고 전에 계약하고 계약금을 냈다면 입력하세요(증빙서류로 확인되는 경우만)."
          />
          <ToggleCard
            tone="sky"
            title="상속 또는 재개발·재건축으로 임대기간을 합산하는 취득"
            description="시행령 §3⑦2호·7호로 임대기간이 합산되는 취득은 「새로 취득」에서 빠집니다."
            checked={property.rentalMergedAcquisition === true}
            onCheckedChange={(v) => onUpdate({ rentalMergedAcquisition: v })}
          />
        </>
      )}
      {asks.householdOwned && (
        <YesNoField
          label="취득 당시 세대가 국내에 다른 주택을 1채 이상 보유"
          name="comprehensive-8na-household-owned"
          value={property.householdOwnedAtAcquisition}
          onChange={(v) => onUpdate({ householdOwnedAtAcquisition: v })}
          yes="보유"
          no="무주택"
        />
      )}
      {asks.businessRegistrationApplicationDate && (
        <DateField
          label="세무서 사업자등록 신청일"
          testId="comprehensive-8na-business-application-date"
          value={property.businessRegistrationApplicationDate}
          onChange={(v) => onUpdate({ businessRegistrationApplicationDate: v })}
          hint="주택임대업 업종을 추가한 정정신고라면 그 신청일입니다."
        />
      )}
      {asks.isApartment && (
        <YesNoField
          label="아파트 (도시형 생활주택은 아니오)"
          name="comprehensive-8na-apartment"
          value={property.isApartment}
          onChange={(v) => onUpdate({ isApartment: v })}
          yes="아파트"
          no="아파트 아님"
        />
      )}
      {asks.rentalApplicationDate && (
        <DateField
          label="지자체 임대사업자 등록 신청일"
          testId="comprehensive-8na-rental-application-date"
          value={property.rentalApplicationDate}
          onChange={(v) => onUpdate({ rentalApplicationDate: v })}
          hint="등록증의 등록일이 아니라 신청서를 낸 날입니다(임대할 주택을 추가한 변경신고 포함)."
        />
      )}
      {asks.regulated && regulated && (
        <div className="space-y-2" data-testid="comprehensive-8na-regulated">
          <ToggleCard
            tone="sky"
            title="조정대상지역 직접 입력"
            description={manual ? "아래 두 칸을 직접 채웁니다." : regulated.basis}
            checked={manual}
            onCheckedChange={(v) => onUpdate({ regulated8NaMode: v ? "manual" : "auto" })}
          />
          {manual && (
            <>
              <YesNoField
                label="과세기준일(6월 1일) 현재 조정대상지역"
                name="comprehensive-8na-regulated-manual"
                value={property.regulatedAtAssessment}
                onChange={(v) => onUpdate({ regulatedAtAssessment: v })}
                yes="조정대상지역"
                no="아님"
              />
              {property.regulatedAtAssessment === "yes" && (
                <DateField
                  label="그 지정의 공고일"
                  testId="comprehensive-8na-regulated-notice-date"
                  value={property.regulatedNoticeDate}
                  onChange={(v) => onUpdate({ regulatedNoticeDate: v })}
                  hint="해제 후 다시 지정됐다면 과세기준일에 효력이 있는 지정의 공고일입니다."
                />
              )}
            </>
          )}
        </div>
      )}
      {asks.convertedFromShortTerm && (
        <YesNoField
          label="단기민간임대주택에서 장기일반·공공지원으로 변경신고한 주택"
          name="comprehensive-8na-converted"
          value={property.convertedFromShortTerm}
          onChange={(v) => onUpdate({ convertedFromShortTerm: v })}
          yes="변경신고함"
          no="아님"
        />
      )}
      {asks.shortTermConversionDate && (
        <DateField
          label="변경신고일"
          testId="comprehensive-8na-conversion-date"
          value={property.shortTermConversionDate}
          onChange={(v) => onUpdate({ shortTermConversionDate: v })}
          hint="2020.7.11. 이후 변경신고한 주택은 합산배제에서 제외됩니다."
        />
      )}
    </ToneCard>
  );
}

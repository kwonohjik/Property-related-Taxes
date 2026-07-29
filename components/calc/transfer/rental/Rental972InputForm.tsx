"use client";

/**
 * §97의2 — 국민주택 임대 세액 100% 감면 입력 폼
 *
 * 요건:
 * - 국민주택(부속토지 연면적 2배 내)
 * - 1999.8.20~2001.12.31 신축(1호) / 매매계약+계약금(2호)
 * - 5년 이상 임대
 *
 * 매매계약일은 자산 카드의 assetContractDate를 재사용 (자산-수준).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental972Form = Extract<RentalReductionFormVariant, { type: "rental_97_2" }>;

interface Props {
  value: Rental972Form;
  onChange: (patch: Partial<Rental972Form>) => void;
}

export function Rental972InputForm({ value, onChange }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental972Form>);
  };

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 등록·신분 */}
      <ToneCard tone="violet" sectionNum="①" title="등록·신분" noDark>

        <RegistrationFields
          registrationDate={value.registrationDate}
          isTaxRegistered={value.isTaxRegistered}
          rentalStartDate={value.rentalStartDate}
          onRegistrationDateChange={(v) => onChange({ registrationDate: v })}
          onIsTaxRegisteredChange={(v) => onChange({ isTaxRegistered: v })}
          onRentalStartDateChange={(v) => onChange({ rentalStartDate: v })}
        />
      </ToneCard>

      {/* ② 임대 유형 */}
      <ToneCard tone="amber" sectionNum="②" title="임대 유형 (§97의2①)" noDark>

        <RadioCardGroup
          name="rental972Type"
          tone="amber"
          value={value.rental972Type}
          onChange={(v) => onChange({ rental972Type: v as Rental972Form["rental972Type"] })}
          options={[
            {
              value: "construction",
              label: "1호 — 건설임대주택",
              description: "1999.8.20~2001.12.31 신축 + 5년 이상 임대",
            },
            {
              value: "purchase",
              label: "2호 — 매입임대주택",
              description: "1999.8.20~2001.12.31 매매계약+계약금 납부 + 5년 이상 임대",
            },
          ]}
        />

        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/80 px-3 py-2">
          <p className="text-micro text-amber-800">
            ℹ️ 매매계약일(2호)은 <strong>자산 카드의 매매계약일 입력</strong>을 사용합니다.
            (감면 그룹 펼침 영역 상단 「매매계약일」 필드)
          </p>
        </div>

        <ToggleCard
          variant="chip"
          checked={value.isNationalHousing}
          onCheckedChange={(v) => onChange({ isNationalHousing: v })}
          title="국민주택 확인"
          description="전용면적 85㎡ 이하 + 부속토지 연면적 2배 이내 (§85의2①·§97의2①)"
          tone="sky"
        />
      </ToneCard>

      {/* ③④ 공통 필드 */}
      <RentalCommonFields
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
      />
    </div>
  );
}

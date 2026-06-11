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
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-violet-700">등록·신분</p>
        </div>

        <RegistrationFields
          registrationDate={value.registrationDate}
          isTaxRegistered={value.isTaxRegistered}
          rentalStartDate={value.rentalStartDate}
          onRegistrationDateChange={(v) => onChange({ registrationDate: v })}
          onIsTaxRegisteredChange={(v) => onChange({ isTaxRegistered: v })}
          onRentalStartDateChange={(v) => onChange({ rentalStartDate: v })}
        />
      </div>

      {/* ② 임대 유형 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-amber-700">임대 유형 (§97의2①)</p>
        </div>

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
          <p className="text-[10px] text-amber-800">
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
      </div>

      {/* ③④ 공통 필드 */}
      <RentalCommonFields
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
      />
    </div>
  );
}

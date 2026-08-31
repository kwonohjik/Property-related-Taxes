"use client";

/**
 * §97 본문(rental_97_main) / 단서(rental_97_proviso) 공용 입력 폼
 *
 * 본문: 1986~2000 신축 국민주택·2000.12.31 이전 임대개시·5년+ → 50%
 * 단서(provisoCase):
 *   a_construction = 건설임대 5년+ → 100%
 *   b_purchase     = 매입임대 5년+ (1995.1.1 이후 취득·미입주) → 100%
 *   c_10years      = 10년 이상 → 100%
 */

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental97MainForm = Extract<RentalReductionFormVariant, { type: "rental_97_main" | "rental_97_proviso" }>;

interface Props {
  value: Rental97MainForm;
  onChange: (patch: Partial<Rental97MainForm>) => void;
}

export function Rental97MainInputForm({ value, onChange }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental97MainForm>);
  };

  const isProviso = value.type === "rental_97_proviso";

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

        <div>
          <label className="mb-1 block text-xs font-medium">신축 연도</label>
          <div className="flex items-center gap-2">
            <DecimalInput
              className="w-24"
              value={value.constructionYear}
              onChange={(v) => onChange({ constructionYear: v })}
              placeholder="예: 1998"
            />
            <span className="text-xs text-muted-foreground">년 (1986~2000 신축)</span>
          </div>
          <p className="mt-1 text-micro text-muted-foreground">
            §97①1호 — 1986~2000년 사이 신축된 주택
          </p>
        </div>

        <ToggleCard
          variant="chip"
          checked={value.isNationalHousing}
          onCheckedChange={(v) => onChange({ isNationalHousing: v })}
          title="국민주택 (§85의2①)"
          description="전용면적 85㎡(수도권 외 읍면 100㎡) 이하"
          tone="sky"
        />
      </ToneCard>

      {/* ② 단서 분기 (rental_97_proviso만) */}
      {isProviso && (
        <ToneCard tone="amber" sectionNum="②" title="단서 분기 — 100% 감면 요건" noDark>
          <RadioCardGroup
            name="provisoCase_97"
            tone="amber"
            value={value.provisoCase ?? ""}
            onChange={(v) => onChange({ provisoCase: v as Rental97MainForm["provisoCase"] })}
            options={[
              {
                value: "a_construction",
                label: "(가) 건설임대 5년+",
                description: "§97① 단서 (a) — 건설임대주택으로 5년 이상 임대",
              },
              {
                value: "b_purchase",
                label: "(나) 매입임대 5년+ (1995.1.1 이후 취득)",
                description: "§97① 단서 (b) — 매입임대주택으로 5년 이상 임대 + 1995.1.1 이후 취득 + 임차인 미입주",
              },
              {
                value: "c_10years",
                label: "(다) 10년 이상 임대",
                description: "§97① 단서 (c) — 10년 이상 임대",
              },
            ]}
          />
        </ToneCard>
      )}

      {/* ③④ 공통 필드 */}
      <RentalCommonFields
        vacancyGraceMonths={3}
        value={value}
        onChange={patchCommon}
        sectionOffset={isProviso ? 3 : 2}
      />
    </div>
  );
}

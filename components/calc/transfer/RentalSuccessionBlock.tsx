"use client";

/**
 * §155⑳ 임대사업 승계 입력 (G-3·G-5 · 계획서 PR-2 ⑤) — RentalUnitPeriodPriceBlock 분리.
 *
 * 임대주택을 상속·같은 세대원 증여·그 밖의 포괄양수로 넘겨받아 계속 임대하는지 고른다. 셋 다 전 임대사업자 임대개월을 더하고,
 * 같은 세대원 증여만 증여자 등록 3필드로 목·기한을 판정한다. 종류 변경은 `applyRentalSuccession` 한 번의 onChange —
 * 개월·증여자 칸 비우기와 임대 구분 점검이 함께 일어난다(useEffect 미러링 금지).
 * 증여자 칸 노출 술어는 ④·⑧과 같은 `rentalUnitDonorRegistrationInScope`.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { rentalSuccessionOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import { rentalUnitDonorRegistrationInScope } from "@/lib/calc/rental-succession";
import { applyRentalRegDate, applyRentalSuccession } from "@/lib/calc/rental-unit-reg-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export interface RentalSuccessionBlockProps {
  unit: RentalUnitForm;
  index: number;
  onChange: (u: RentalUnitForm) => void;
}

type OptionValue = "none" | "inheritance" | "household_gift" | "assumption";

const MONTHS_FIELD = {
  inheritance: {
    label: "피상속인 임대기간",
    placeholder: "피상속인 임대 개월",
    hint: "피상속인이 세무서 사업자등록과 임대주택 등록을 한 뒤 임대한 기간입니다. 임차인이 바뀌는 사이 3개월 이내 공실은 넣고, 넘는 공실은 빼서 셉니다. 위 「실제 임대 기간」에는 상속 후 상속인이 임대한 구간만 넣으세요.",
  },
  household_gift: {
    label: "증여자 임대기간",
    placeholder: "증여자 임대 개월",
    hint: "증여자가 세무서 사업자등록과 임대주택 등록을 한 뒤 임대한 기간입니다. 임차인이 바뀌는 사이 3개월 이내 공실은 넣고, 넘는 공실은 빼서 셉니다. 위 「실제 임대 기간」에는 증여받은 뒤 임대한 구간만 넣으세요.",
  },
  assumption: {
    label: "전 임대사업자 임대기간",
    placeholder: "전 임대사업자 임대 개월",
    hint: "임대사업자 지위를 넘겨준 전 임대사업자가 등록한 뒤 임대한 기간입니다. 임차인이 바뀌는 사이 3개월 이내 공실은 넣고, 넘는 공실은 빼서 셉니다. 위 「실제 임대 기간」에는 양수한 뒤 임대한 구간만 넣으세요.",
  },
} as const;

export function RentalSuccessionBlock({ unit, index, onChange }: RentalSuccessionBlockProps) {
  const kind = rentalSuccessionOf(unit);
  const donorInScope = rentalUnitDonorRegistrationInScope(unit);
  const monthsField = kind ? MONTHS_FIELD[kind] : null;

  return (
    <div className="space-y-2">
      <FieldCard
        label="임대사업 승계"
        stacked
        hint="임대주택을 직접 등록하지 않고 넘겨받아 계속 임대하는 경우에만 고르세요. 전 임대사업자의 임대기간을 더합니다."
      >
        <RadioCardGroup<OptionValue>
          name={`rental-succession-${index}`}
          data-testid={`rental-succession-${index}`}
          tone="violet"
          layout="stack"
          options={[
            { value: "none", label: "승계 없음 — 본인이 등록한 임대주택", testId: `rental-succession-none-${index}` },
            {
              value: "inheritance",
              label: "상속받아 계속 임대",
              description: "피상속인의 임대기간을 상속인의 임대기간에 더합니다(조특령 §97⑤3호 · 소령 §167의3③ 준용).",
              testId: `rental-succession-inheritance-${index}`,
            },
            {
              value: "household_gift",
              label: "같은 세대원에게 증여받아 계속 임대(포괄승계)",
              description:
                "증여자의 임대기간을 통산하고 목은 증여자 등록 기준으로 봅니다(서면-2022-법규재산-4972 · 기획재정부 재산세제과-1591).",
              testId: `rental-succession-household-gift-${index}`,
            },
            {
              value: "assumption",
              label: "그 밖의 포괄양수(임대사업자 지위 승계)",
              description: "㉓1호 1/2은 전 소유자 등록일부터 셉니다(서면-2020-법규재산-5310).",
              testId: `rental-succession-assumption-${index}`,
            },
          ]}
          value={kind || "none"}
          onChange={(v) => onChange(applyRentalSuccession(unit, v === "none" ? "" : v))}
        />
      </FieldCard>

      {monthsField && (
        <FieldCard label={monthsField.label} required unit="개월" hint={monthsField.hint}>
          <DecimalInput
            data-testid={`rental-predecessor-months-${index}`}
            value={unit.decedentRentalMonths ?? ""}
            onChange={(v) => onChange({ ...unit, decedentRentalMonths: v })}
            placeholder={monthsField.placeholder}
          />
        </FieldCard>
      )}

      {donorInScope && (
        <div className="space-y-2" data-testid={`rental-donor-registration-${index}`}>
          <p className="text-caption text-muted-foreground px-1">
            ※ 증여받은 임대주택의 목·의무임대기간·등록 기한은 <b>증여자의 등록일</b>로 판정합니다. 양도일 현재 등록·임대 중인지는
            증여받은 사람 본인 기준이라 위 본인 등록일 칸을 그대로 입력하세요.
          </p>
          <FieldCard label="증여자 세무서 사업자등록일" required>
            <DateInput
              data-testid={`rental-donor-biz-date-${index}`}
              value={unit.donorBusinessRegistrationDate ?? ""}
              onChange={(v) => onChange(applyRentalRegDate(unit, "donorBusinessRegistrationDate", v))}
            />
          </FieldCard>
          <FieldCard label="증여자 지자체 임대사업자 등록 신청일" required hint="목·아파트 제한·의무임대기간을 가르는 기준일입니다.">
            <DateInput
              data-testid={`rental-donor-reg-date-${index}`}
              value={unit.donorRentalRegistrationDate ?? ""}
              onChange={(v) => onChange(applyRentalRegDate(unit, "donorRentalRegistrationDate", v))}
            />
          </FieldCard>
          <FieldCard
            label="증여자 지자체 임대사업자 등록일"
            hint="등록증의 등록일. 신청일을 넣으면 같은 날로 채워지니 다르면 고쳐 주세요. 모르면 비워 두세요."
          >
            <DateInput
              data-testid={`rental-donor-registered-date-${index}`}
              value={unit.donorRentalRegisteredDate ?? ""}
              onChange={(v) => onChange(applyRentalRegDate(unit, "donorRentalRegisteredDate", v))}
            />
          </FieldCard>
        </div>
      )}
    </div>
  );
}

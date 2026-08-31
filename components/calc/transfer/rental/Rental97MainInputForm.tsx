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

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental97MainForm = Extract<RentalReductionFormVariant, { type: "rental_97_main" | "rental_97_proviso" }>;
type BelowPeriod = NonNullable<Rental97MainForm["belowMin5UnitsPeriods"]>[number];

interface Props {
  value: Rental97MainForm;
  onChange: (patch: Partial<Rental97MainForm>) => void;
}

export function Rental97MainInputForm({ value, onChange }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental97MainForm>);
  };

  const isProviso = value.type === "rental_97_proviso";

  // ── 조특령 §97⑤4호 — 5호 미만으로 임대한 기간 ──
  const belowPeriods = value.belowMin5UnitsPeriods ?? [];
  const patchBelow = (next: BelowPeriod[]) => onChange({ belowMin5UnitsPeriods: next });
  const addBelow = () => patchBelow([...belowPeriods, { startDate: "", endDate: "" }]);
  const removeBelow = (i: number) => patchBelow(belowPeriods.filter((_, x) => x !== i));
  const updateBelow = (i: number, patch: Partial<BelowPeriod>) =>
    patchBelow(belowPeriods.map((p, x) => (x === i ? { ...p, ...patch } : p)));

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

      {/* §97①2호 — 1985.12.31 이전 신축 공동주택 (D1-06) */}
      {parseInt(value.constructionYear || "0") > 0 &&
        parseInt(value.constructionYear) <= 1985 && (
          <ToneCard tone="amber" sectionNum="②" title="§97①2호 요건" bodyClassName="space-y-2" noDark>
            <p className="text-micro text-amber-800">
              조특법 §97①2호 — 「<strong>1985년 12월 31일 이전에 신축된 공동주택</strong>으로서
              <strong>1986년 1월 1일 현재 입주된 사실이 없는 주택</strong>」. 두 가지를 모두
              충족해야 합니다.
            </p>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">공동주택 여부</p>
              <RadioCardGroup
                name="isMultiUnitHousing"
                layout="inline"
                tone="amber"
                value={
                  value.isMultiUnitHousing === null ? "" : value.isMultiUnitHousing ? "yes" : "no"
                }
                onChange={(v) => onChange({ isMultiUnitHousing: v === "yes" })}
                options={[
                  { value: "yes", label: "공동주택" },
                  { value: "no", label: "미해당" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">1986.1.1 현재 입주 사실</p>
              <RadioCardGroup
                name="isUnoccupiedAt1986"
                layout="inline"
                tone="amber"
                value={
                  value.isUnoccupiedAt1986 === null ? "" : value.isUnoccupiedAt1986 ? "yes" : "no"
                }
                onChange={(v) => onChange({ isUnoccupiedAt1986: v === "yes" })}
                options={[
                  { value: "yes", label: "입주 사실 없음" },
                  { value: "no", label: "입주 사실 있음" },
                ]}
              />
            </div>
            {(value.isMultiUnitHousing === null || value.isUnoccupiedAt1986 === null) && (
              <p className="text-micro text-rose-600">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
            )}
          </ToneCard>
        )}

      {/* §97① 단서 나목 — 취득 당시 미입주 (D1-07) */}
      {isProviso && value.provisoCase === "b_purchase" && (
        <ToneCard tone="rose" sectionNum="②" title="단서 나목 요건" bodyClassName="space-y-2" noDark>
          <p className="text-micro text-rose-800">
            조특법 §97① 단서 — 매입임대주택은 「<strong>취득 당시 입주된 사실이 없는 주택만
            해당한다</strong>」.
          </p>
          <RadioCardGroup
            name="isUnoccupiedAtAcquisition_97"
            layout="inline"
            tone="rose"
            value={
              value.isUnoccupiedAtAcquisition === null
                ? ""
                : value.isUnoccupiedAtAcquisition
                  ? "yes"
                  : "no"
            }
            onChange={(v) => onChange({ isUnoccupiedAtAcquisition: v === "yes" })}
            options={[
              { value: "yes", label: "취득 당시 입주 사실 없음" },
              { value: "no", label: "입주 사실 있음" },
            ]}
          />
          {value.isUnoccupiedAtAcquisition === null && (
            <p className="text-micro text-rose-600">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
          )}
        </ToneCard>
      )}

      {/* 주체 요건 — 조특령 §97① 5호 이상 (D1-01) */}
      <ToneCard
        tone="sky"
        sectionNum={isProviso ? "③" : "②"}
        title="임대 호수 요건"
        bodyClassName="space-y-2"
        noDark
      >
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">임대주택 5호 이상 임대</p>
          <p className="mb-1.5 text-micro text-muted-foreground">
            조특령 §97① — §97①의 「대통령령으로 정하는 거주자」란 임대주택을 5호 이상 임대하는
            거주자를 말한다. 공동소유는 호수에 지분비율을 곱해 산정한다.
          </p>
          <RadioCardGroup
            name="hasMin5RentalUnits"
            layout="inline"
            tone="sky"
            value={
              value.hasMin5RentalUnits === null ? "" : value.hasMin5RentalUnits ? "yes" : "no"
            }
            onChange={(v) => onChange({ hasMin5RentalUnits: v === "yes" })}
            options={[
              { value: "yes", label: "5호 이상" },
              { value: "no", label: "미해당 (5호 미만)" },
            ]}
          />
          {value.hasMin5RentalUnits === null && (
            <p className="mt-1 text-micro text-rose-600">
              ※ 반드시 선택하세요 (미선택 시 계산 불가)
            </p>
          )}
        </div>

        {value.hasMin5RentalUnits === true && (
          <div className="mt-2 space-y-2 border-t border-sky-200 pt-2">
            <p className="text-xs font-medium text-sky-800">5호 미만으로 임대한 기간</p>
            <p className="text-micro text-muted-foreground">
              조특령 §97⑤4호 — 5호 미만의 주택을 임대한 기간은 주택임대기간으로 보지 않는다.
              공실과 달리 유예가 없어 구간 전체가 차감된다. 없으면 비워 두세요.
            </p>
            {belowPeriods.map((period, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <DateInput
                  value={period.startDate}
                  onChange={(v) => updateBelow(idx, { startDate: v })}
                />
                <span className="text-xs text-muted-foreground">~</span>
                <DateInput
                  value={period.endDate}
                  onChange={(v) => updateBelow(idx, { endDate: v })}
                />
                <button
                  type="button"
                  onClick={() => removeBelow(idx)}
                  className="text-micro text-rose-600 hover:underline"
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addBelow}
              className="text-xs font-medium text-sky-700 hover:underline"
            >
              + 구간 추가
            </button>
          </div>
        )}
      </ToneCard>

      {/* 공통 필드 */}
      <RentalCommonFields
        vacancyGraceMonths={3}
        value={value}
        onChange={patchCommon}
        sectionOffset={isProviso ? 4 : 3}
      />
    </div>
  );
}

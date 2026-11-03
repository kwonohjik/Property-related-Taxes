"use client";

/**
 * §97의4 — 장기임대주택 장기보유특별공제 추가율 입력 폼 (R-3 확정·활성)
 *
 * 효과: §95② 보유기간별 공제율에 임대기간별 추가율을 "가산" (§97의3의 대체와 다름).
 *       추가율: 6~7년 2% / 7~8년 4% / 8~9년 6% / 9~10년 8% / 10년↑ 10%.
 * 요건: 소령 §167의3①2호 장기임대주택 6년 이상 임대 + 사업자등록 + 임대료 5% 제한.
 *       1세대1주택 표2(§95② 단서) 해당 시 추가율 미가산 (§97의4① 단서 — 엔진 처리).
 *
 * 정책:
 * - 추가율은 표만 정적 안내 — 미리보기 율을 UI에서 자체 계산하지 않음(엔진 단일 진실, 공실 차감 반영).
 * - rentIncreaseViolationMode 기본 "" / hasVacancyOverGrace 기본 null (3-state). useEffect→store 미러링 금지.
 */

import { useMemo } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { rental974PeriodSegmentsString } from "@/lib/calc/rental-97-effective-start";
import { rental974ApartmentAnswerRequired } from "@/lib/calc/apt-deadline-extension-scope";
import { rental974SaMokApplies } from "@/lib/calc/apt-deadline-extension-scope";
import { AptDeadlineExtensionFields } from "../AptDeadlineExtensionFields";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";

type Rental974Form = Extract<RentalReductionFormVariant, { type: "rental_97_4" }>;

interface Props {
  value: Rental974Form;
  onChange: (patch: Partial<Rental974Form>) => void;
  /** 자산의 양도일 — 임대기간 미리보기용 */
  transferDate?: string;
}

function diffYearsMonths(from: string, to: string): string {
  if (!from || !to) return "—";
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "—";
  const totalMonths =
    (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (totalMonths < 0) return "—";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years}년 ${months}개월` : `${years}년`;
}

const ADDITIONAL_RATE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["6년 이상 ~ 7년 미만", "2%"],
  ["7년 이상 ~ 8년 미만", "4%"],
  ["8년 이상 ~ 9년 미만", "6%"],
  ["9년 이상 ~ 10년 미만", "8%"],
  ["10년 이상", "10%"],
];

export function Rental974InputForm({ value, onChange, transferDate }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental974Form>);
  };

  // emerald 자동 표시 박스 — useMemo, store 미기록.
  // 구간은 엔진과 같은 축 — 조특령 §97의4② 의제 개시일(임대일·등록일·사업자등록일 중 늦은 날)부터,
  // 자동말소면 그 날까지, 상속이면 피상속인 분을 따로 (리뷰 R-1·R-3·R-4)
  const segments = useMemo(() => rental974PeriodSegmentsString(value, transferDate ?? ""), [value, transferDate]);

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 등록·신분 */}
      <ToneCard tone="violet" sectionNum="①" title="등록·신분">

        {/* 상속 여부가 아래 등록·임대일의 주체(상속인 본인)를 바꾸므로 그 입력 직전에 둔다 (모드 토글은 영향 필드 직전) */}
        <ToggleCard
          data-field={`reduction.${value.type}.isInherited974`}
          checked={value.isInherited974}
          onCheckedChange={(v) =>
            onChange(
              v
                ? { isInherited974: true }
                : { isInherited974: false, inheritanceDate974: "", decedentRegistrationDate974: "", decedentRentalStartDate974: "" },
            )
          }
          title="상속받은 임대주택"
          description="피상속인의 임대기간을 상속인의 임대기간에 합산합니다 (조특령 §97⑤3호 준용)"
          tone="violet"
        >
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium">상속개시일</label>
              <DateInput
                data-field={`reduction.${value.type}.inheritanceDate974`}
                value={value.inheritanceDate974}
                onChange={(v) => onChange({ inheritanceDate974: v })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">피상속인 사업자등록등일</label>
              <DateInput
                data-field={`reduction.${value.type}.decedentRegistrationDate974`}
                value={value.decedentRegistrationDate974}
                onChange={(v) => onChange({ decedentRegistrationDate974: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">
                피상속인의 세무서 사업자등록일과 임대사업자 등록일 중 늦은 날입니다. 「2018.3.31까지 사업자등록등」 요건(소령
                §167의3①2호 가·다목 단서)도 이 날로 판정합니다 — 상속 주택을 이렇게 판정한 해석례는 찾지 못했으므로 확인이 필요합니다.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">피상속인 임대개시일</label>
              <DateInput
                data-field={`reduction.${value.type}.decedentRentalStartDate974`}
                value={value.decedentRentalStartDate974}
                onChange={(v) => onChange({ decedentRentalStartDate974: v })}
              />
            </div>
            <p className="text-micro text-muted-foreground">
              아래 등록일·임대개시일에는 <b>상속인 본인</b>의 날짜를 입력합니다. 상속개시일부터 상속인이 등록·임대한 날 전까지는 임대기간에 넣지 않습니다.
            </p>
          </div>
        </ToggleCard>

        <RegistrationFields
          fieldType={value.type}
          registrationDate={value.registrationDate}
          isTaxRegistered={value.isTaxRegistered}
          rentalStartDate={value.rentalStartDate}
          onRegistrationDateChange={(v) => onChange({ registrationDate: v })}
          onIsTaxRegisteredChange={(v) => onChange({ isTaxRegistered: v })}
          onRentalStartDateChange={(v) => onChange({ rentalStartDate: v })}
        />
        {/* 조특령 §97의4② — 사업자등록·임대사업자등록·임대 중 늦은 날부터 임대 개시 */}
        {value.isTaxRegistered && (
          <div>
            <label className="mb-1 block text-xs font-medium">세무서 사업자등록일</label>
            <DateInput
              data-field={`reduction.${value.type}.taxRegistrationDate`}
              value={value.taxRegistrationDate}
              onChange={(v) => onChange({ taxRegistrationDate: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              조특령 §97의4② — 사업자등록·임대사업자 등록·임대개시 중 가장 늦은 날부터 임대를 개시한 것으로 봅니다.
            </p>
          </div>
        )}

        {/* 임대기간 종점 — 국세청 서면-2021-법규재산-1422: 자동말소된 주택은 임대개시일부터 자동말소일까지 */}
        <ToggleCard
          data-field={`reduction.${value.type}.isAutoCancelled974`}
          checked={value.isAutoCancelled974}
          onCheckedChange={(v) =>
            onChange(
              v
                ? { isAutoCancelled974: true, isVoluntaryCancelled974: false, voluntaryCancelledDate974: "" }
                : { isAutoCancelled974: false, autoCancelledDate974: "" },
            )
          }
          title="임대사업자 등록 자동말소"
          description="임대의무기간이 끝나 등록이 자동말소된 주택 (민간임대주택에 관한 특별법 §6⑤) — 임대기간은 자동말소일까지만 셉니다"
          tone="violet"
        >
          <div>
            <label className="mb-1 block text-xs font-medium">자동말소일</label>
            <DateInput
              data-field={`reduction.${value.type}.autoCancelledDate974`}
              value={value.autoCancelledDate974}
              onChange={(v) => onChange({ autoCancelledDate974: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              국세청 서면-2021-법규재산-1422(2022.6.21.) — 자동말소 후 계속 임대했더라도 추가공제율의 임대기간은 자동말소일까지입니다.
              자동말소일이 2027.1.1. 이후면 가목 아파트의 양도기한도 그날부터 1년이 되는 날까지 늘어납니다(소령 §167의3⑪1호) —
              아래 연장 사유에 같은 날을 다시 넣지 않아도 됩니다.
            </p>
          </div>
        </ToggleCard>

        {/* 자진말소 — 임대기간 종점(1422 유추 · 확인 필요) · 가목 아파트는 소령 §167의3①2호 가목2) 단서 → 사목 양도기한 */}
        <ToggleCard
          data-field={`reduction.${value.type}.isVoluntaryCancelled974`}
          checked={value.isVoluntaryCancelled974}
          onCheckedChange={(v) =>
            onChange(
              v
                ? { isVoluntaryCancelled974: true, isAutoCancelled974: false, autoCancelledDate974: "" }
                : { isVoluntaryCancelled974: false, voluntaryCancelledDate974: "" },
            )
          }
          title="임대사업자 등록 자진말소"
          description="임대의무기간 중 임대사업자가 말소를 신청해 등록이 말소된 주택 (민간임대주택에 관한 특별법 §6①11호) — 임대기간은 자진말소일까지만 셉니다"
          tone="violet"
        >
          <div>
            <label className="mb-1 block text-xs font-medium">자진말소일</label>
            <DateInput
              data-field={`reduction.${value.type}.voluntaryCancelledDate974`}
              value={value.voluntaryCancelledDate974}
              onChange={(v) => onChange({ voluntaryCancelledDate974: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              자동말소에 대한 국세청 해석(서면-2021-법규재산-1422)을 유추해 임대기간을 자진말소일까지 셉니다 — 자진말소에 대한 정면
              해석례는 찾지 못했습니다(확인 필요). 가목 아파트는 말소일부터 1년이 되는 날까지 양도해야 합니다(소령 §167의3①2호
              가목2) 단서 → 사목 양도기한).
            </p>
          </div>
        </ToggleCard>

        <div className="rounded-md border border-dashed border-violet-300 bg-violet-50/80 px-3 py-2 dark:bg-violet-950/40">
          <p className="text-micro text-violet-800 dark:text-violet-200">
            ℹ️ 소령 §167의3①2호 장기임대주택(민간건설·민간매입·공공건설·공공매입)을 <strong>6년 이상</strong> 임대해야 합니다.
            1세대1주택 장기보유특별공제 표2(소득세법 §95② 단서)가 적용되는 경우에는
            추가공제율을 가산하지 않습니다 (조특법 §97의4① 단서).
          </p>
        </div>
      </ToneCard>

      {/* ② 추가공제율 안내 (§95② 보유기간 공제율에 가산) */}
      <ToneCard tone="amber" sectionNum="②" title="임대기간별 추가공제율 (§97의4①)">

        <p className="text-micro text-amber-800 dark:text-amber-200">
          §95② 보유기간별 장기보유특별공제율에 아래 추가율을 <strong>가산</strong>합니다 (대체 아님).
        </p>
        <div className="rounded-md border border-amber-200 bg-white/70 dark:bg-white/5 divide-y divide-amber-100">
          {ADDITIONAL_RATE_ROWS.map(([label, rate]) => (
            <div key={label} className="flex items-center justify-between px-2.5 py-1 text-caption">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold text-amber-900 dark:text-amber-200">{rate}</span>
            </div>
          ))}
        </div>
        <p className="text-micro text-amber-700 dark:text-amber-300">
          ※ 적용 추가율은 공실 차감 후 유효임대기간으로 엔진이 산정합니다.
        </p>
      </ToneCard>

      {/* ③ 대상 요건 — 조특령 §97의4① → 소령 §167의3①2호 가목·다목 (D2-04) */}
      <ToneCard tone="sky" sectionNum="③" title="장기임대주택 요건" bodyClassName="space-y-2">
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">장기임대주택 유형</p>
          <p className="mb-1.5 text-micro text-muted-foreground">
            조특령 §97의4①은 「소득세법 시행령」 §167조의3①2호 <strong>가목 및 다목</strong>의
            장기임대주택만 대상으로 합니다 (나목은 §97의4 대상이 아닙니다).
          </p>
          <RadioCardGroup
            data-field={`reduction.${value.type}.rental974Category`}
            name="rental974Category"
            tone="sky"
            value={value.rental974Category}
            onChange={(v) =>
              onChange({ rental974Category: v as "purchase_a" | "construction_c" })
            }
            options={[
              {
                value: "purchase_a",
                label: "가목 — 민간매입임대 1호 이상",
                description:
                  "민간매입임대주택을 1호 이상 임대 + 5년 이상 임대. 기준시가 한도 6억원(수도권 밖 3억원)",
              },
              {
                value: "construction_c",
                label: "다목 — 건설임대 2호 이상",
                description:
                  "대지 298㎡ 이하·주택 연면적 149㎡ 이하 건설임대주택을 2호 이상 임대 + 5년 이상 임대 또는 분양전환. 기준시가 한도 6억원",
              },
            ]}
          />
          {value.rental974Category === "" && (
            <p className="mt-1 text-micro text-rose-700 dark:text-rose-400">
              ※ 반드시 선택하세요 (미선택 시 계산 불가)
            </p>
          )}
        </div>

        {/* 소령 §167의3①2호 가목2) — 아파트 매입임대는 ⑪ 기한까지 양도해야 가목에 해당한다. 다목(건설임대)에는 없는 요건. */}
        {value.rental974Category === "purchase_a" && (
          <div className="border-t border-sky-200 pt-2 space-y-2">
            <div>
              <p className="mb-1 text-xs font-medium">아파트 여부</p>
              <RadioCardGroup
                data-field={`reduction.${value.type}.isApartment974`}
                name="isApartment974"
                layout="inline"
                tone="sky"
                value={value.isApartment974}
                onChange={(v) => onChange({ isApartment974: v as Rental974Form["isApartment974"] })}
                options={[
                  { value: "yes", label: "아파트", testId: "r974-apt-yes" },
                  { value: "no", label: "아파트 아님 (도시형 생활주택 포함)", testId: "r974-apt-no" },
                ]}
              />
              <p className="mt-1 text-micro text-muted-foreground">
                아파트(「주택법」에 따른 도시형 생활주택인 아파트는 제외)를 임대하는 민간매입임대주택은 소령 §167의3⑪에 따른
                기한(2027.12.31. — 연장 사유가 있으면 그 날)까지 양도해야 가목 장기임대주택에 해당합니다 (소령 §167의3①2호 가목2)).
                2027.12.31.까지 양도하면 결과에 영향이 없습니다.
              </p>
              {value.isApartment974 === "" && rental974ApartmentAnswerRequired(value, transferDate) && (
                <p className="mt-1 text-micro text-rose-700 dark:text-rose-400">
                  ※ 양도일이 아파트 양도기한 뒤라 반드시 선택하세요
                </p>
              )}
            </div>
            {value.isApartment974 === "yes" && rental974SaMokApplies(value) && (
              <p className="text-micro text-muted-foreground">
                자진말소한 주택이라 소령 §167의3⑪ 기한 대신 사목의 양도기한(자진말소일부터 1년이 되는 날)을 적용합니다 — ⑪ 연장
                사유는 묻지 않습니다 (소령 §167의3①2호 가목2) 단서).
              </p>
            )}
            {value.isApartment974 === "yes" && !rental974SaMokApplies(value) && (
              <div data-field={`reduction.${value.type}.aptDeadlineExtension974`}>
                <AptDeadlineExtensionFields
                  value={value.aptDeadlineExtension974}
                  onChange={(next) => onChange({ aptDeadlineExtension974: next })}
                  idPrefix="r974"
                  tone="sky"
                />
              </div>
            )}
          </div>
        )}

        {/*
          소재지 — 가목의 기준시가 한도를 6억/3억으로 가르는 축(소령 §167의3①2호 가목 괄호).
          엔진 `rental-97-4.ts:125`가 `region === "non_capital"`로 한도를 정하는데 ⑤가 없어
          항상 기본값 "capital"(6억)이 굳어 있었다 — 수도권 밖 3~6억 주택이 한도 초과인데도
          감면을 받았다. 형제 §97의3·§97의5 폼에는 같은 라디오가 이미 있다.
          위치는 아래 기준시가보다 **앞** — 한도를 정한 뒤 금액을 판정하는 로직 순서를 따르고,
          기준시가 hint가 이 값을 인용하기 때문이다.
        */}
        <div className="border-t border-sky-200 pt-2">
          <p className="mb-1 text-xs font-medium">소재지</p>
          <RadioCardGroup
            name="region_974"
            layout="inline"
            tone="sky"
            value={value.region}
            onChange={(v) => onChange({ region: v as Rental974Form["region"] })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "비수도권" },
            ]}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            가목(민간매입)만 수도권 밖 한도가 3억원입니다 — 다목(건설임대)은 소재지와 무관하게 6억원입니다.
          </p>
        </div>

        <div className="border-t border-sky-200 pt-2">
          <CurrencyInput
            data-field={`reduction.${value.type}.officialPriceAtStart`}
            label="임대개시일 당시 기준시가 (주택+부수토지 합계)"
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            한도{" "}
            {value.rental974Category === "purchase_a" && value.region === "non_capital"
              ? "3억원 (가목 — 수도권 밖)"
              : "6억원"}
            를 초과하면 장기임대주택에 해당하지 않아 §97의4를 적용할 수 없습니다.
            {value.isInherited974 && " 상속받은 주택은 피상속인 임대개시일 당시 기준시가를 입력합니다."}
          </p>
        </div>
      </ToneCard>

      {/* ④⑤ 공통 필드 (임대료 증액·공실) */}
      <RentalCommonFields
        fieldType={value.type}
        value={value}
        onChange={patchCommon}
        sectionOffset={4}
        vacancyGraceMonths={3}
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1 dark:bg-emerald-900/40">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">최소 의무임대기간</span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">6년</span>
        </div>
        {segments.decedent && (
          <div className="flex items-center justify-between text-xs" data-testid="rental974-decedent-segment">
            <span className="text-muted-foreground">
              피상속인 임대기간 ({segments.decedent.start}→{segments.decedent.end})
            </span>
            <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">
              {diffYearsMonths(segments.decedent.start, segments.decedent.end)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs" data-testid="rental974-own-segment">
          <span className="text-muted-foreground">
            {value.isInherited974 ? "상속인 임대기간" : "임대기간"} (
            {segments.own ? `${segments.own.start}→${segments.own.end}` : "의제 임대개시일→" + (value.isAutoCancelled974 ? "자동말소일" : "양도일")})
          </span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">
            {segments.own ? diffYearsMonths(segments.own.start, segments.own.end) : "—"}
          </span>
        </div>
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ※ 임대개시일은 임대일·임대사업자 등록일·세무서 사업자등록일 중 가장 늦은 날입니다 (조특령 §97의4②).
        </p>
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ※ 공실 차감 후 실제 유효임대기간과 적용 추가율은 엔진이 계산합니다.
        </p>
      </div>
    </div>
  );
}

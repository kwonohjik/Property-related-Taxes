"use client";

/**
 * §97의3 장기임대주택 — 장특공제율 70% 특례 입력 폼
 *
 * 다-섹션 색상 카드 + 번호 패턴 (①~④):
 * ① violet 등록·신분
 * ② violet 임대 개시 (기준시가·소재지)
 * ③ violet 임대료 증액 제한
 * ④ sky 공실 기간
 * + emerald 자동 표시 박스 (useMemo 파생, store 미기록)
 *
 * 정책:
 * - rentIncreaseViolationMode 기본 "" (3-state 미선택)
 * - hasVacancyOverGrace 기본 null (3-state 미선택)
 * - useEffect → store 미러링 금지
 */

import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, RegistrationFields } from "./RentalCommonFields";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";
import { rental973DeemedStartString } from "@/lib/calc/rental-97-effective-start";
import { rental973LongRegistrationDate } from "@/lib/calc/transfer-tax-validate-rental-conversion";
import { Clause4GrandfatherQuestion } from "./Clause4GrandfatherQuestion";
import { Rental973InheritanceBlock } from "./Rental973InheritanceBlock";
import { RentalResidentOnlyNotice } from "./RentalResidentOnlyNotice";
import { Rental973AutoCancelToggle } from "./Rental973AutoCancelToggle";
import { autoCancelDeemed973Applies } from "@/lib/tax-engine/transfer-reductions/rental-97-3-auto-cancel";
import { APT_PURCHASE_973_QUESTION } from "@/lib/tax-engine/transfer-reductions/rental-97-3-apt-purchase-exclusion";
import { rental973AptPurchaseQuestionApplies } from "@/lib/calc/rental-97-3-apt-purchase";
import { rental973InheritanceInScope } from "@/lib/calc/rental-97-3-inheritance";
import { rental973InheritanceConflictsConversion } from "@/lib/calc/rental-97-3-inheritance";
import { rental973MergedDecedentStart } from "@/lib/calc/rental-97-3-inheritance";
import { mergedRentalYears97 } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import { RENTAL_973_RIGHT_STD_PRICE_D_LABEL } from "@/lib/tax-engine/transfer-reductions/rental-97-3-right-after-auto-cancel";
import { RENTAL_973_RIGHT_STD_PRICE_D_HINT } from "@/lib/tax-engine/transfer-reductions/rental-97-3-right-after-auto-cancel";
import { toOptionalDate } from "@/lib/api/date-coerce";

type Rental973Form = Extract<RentalReductionFormVariant, { type: "rental_97_3" }>;

interface Props {
  value: Rental973Form;
  onChange: (patch: Partial<Rental973Form>) => void;
  /** 자산의 양도일 — 임대기간 미리보기용 */
  transferDate?: string;
  /** 자산 취득일·매매계약일 — 가액요건 부칙 §2② 질문 표시 조건 */
  acquisitionDate?: string;
  assetContractDate?: string;
  /** 자산 취득원인 — V-14 상속 합산 토글은 상속 자산에서만 보인다(`rental973InheritanceInScope`) */
  acquisitionCause?: string;
  /** G-7 — 조합원입주권 양도(자동말소 뒤 인가로 입주권이 된 경우만 · 서면-2023-법규재산-2731). 안분 D 라벨이 인가일 기준시가로 바뀐다(Q-6 a) */
  isRightToMoveIn?: boolean;
}

function diffYearsMonths(from: string, to: string): string {
  if (!from || !to) return "—";
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "—";
  const totalMonths =
    (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
  if (totalMonths < 0) return "—";
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years}년 ${months}개월` : `${years}년`;
}

export function Rental973InputForm({ value, onChange, transferDate, acquisitionDate, assetContractDate, acquisitionCause, isRightToMoveIn = false }: Props) {
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental973Form>);
  };

  // ─ emerald 자동 표시 박스 — useMemo, store 미기록 ─
  // 기산은 엔진·⑧과 같은 의제 개시일 — 임대일·임대사업자 등록일·세무서 사업자등록일 중 늦은 날 (조특령 §97의3④).
  // 2020.7.10 이전 단기→장기 변경신고 주택은 단기 임대기간 산입을 반영한 날(④ 후단 — 엔진 leaf 단일 소스, PR-C)
  const effectiveStart = useMemo(
    () => rental973DeemedStartString(value),
    [value],
  );
  // 장기일반민간임대주택등 「등록」일 — 변경신고 주택은 수리일(엔진 `longRegistrationDate`·⑧과 같은 축)
  const longRegistrationDate = rental973LongRegistrationDate(value);
  // G-1 — 종전 §97의3① 괄호 아파트 매입임대 질문 표시 여부(④·⑧과 같은 판정)
  const aptPurchaseQuestion = rental973AptPurchaseQuestionApplies(value);
  const rentalDuration = useMemo(
    () => diffYearsMonths(effectiveStart, transferDate ?? ""),
    [effectiveStart, transferDate],
  );

  // V-14 — 상속 합산(조특령 §97의3④ → §97⑤3호). 상속 자산에서만 묻고, 합산이 실제로 일어나는 조건은 엔진·④·⑧과 같은 leaf.
  const inheritanceInScope = rental973InheritanceInScope(acquisitionCause);
  const owner = { acquisitionCause, acquisitionDate };
  const mergedDecedentStart = rental973MergedDecedentStart(value, owner);
  const mergedPreview = useMemo(() => {
    const own = toOptionalDate(effectiveStart);
    const end = toOptionalDate(transferDate);
    const inheritanceDate = toOptionalDate(acquisitionDate);
    const decedentRegistrationDate = toOptionalDate(value.decedentRegistrationDate973);
    const decedentRentalStartDate = toOptionalDate(value.decedentRentalStartDate973);
    if (!mergedDecedentStart || !own || !end || !inheritanceDate || !decedentRegistrationDate || !decedentRentalStartDate) return null;
    // 공실은 넣지 않는다 — 아래 안내대로 공실 차감은 엔진이 한다(기존 미리보기와 같은 기준)
    const m = mergedRentalYears97(own, end, { inheritanceDate, decedentRegistrationDate, decedentRentalStartDate }, [], 3);
    return { years: m.years, decedent: `${mergedDecedentStart} ~ ${acquisitionDate}` };
  }, [mergedDecedentStart, effectiveStart, transferDate, acquisitionDate, value.decedentRegistrationDate973, value.decedentRentalStartDate973]);

  // 구 조특령 §97의3②2호 — 자동말소 8년 간주가 성립하는지(엔진·⑧·⑫와 같은 leaf). 말소일 = 공용 종료 칸.
  const autoCancelDeemed = autoCancelDeemed973Applies({
    autoCancelled: value.autoCancelled973,
    rentalContinuesToTransfer: value.rentalContinuesToTransfer,
    cancelledDate: value.rentalEndDate,
    longRegistrationDate,
  });

  // 등록일별 공제율 안내 (R-1: 2022.12.31 이전 등록분 8년 50% 경과규정) — store 미기록
  const rateGuide = useMemo(() => {
    if (!longRegistrationDate) return null;
    return longRegistrationDate < "2023-01-01"
      ? "2022.12.31 이전 등록 — 8년↑ 50% / 10년↑ 70%"
      : "2023.1.1 이후 등록 — 10년↑ 70%만";
  }, [longRegistrationDate]);

  return (
    <div className="mt-2 ml-4 space-y-3">
      {isRightToMoveIn && (
        <ToneCard tone="amber">
          <p className="text-xs leading-relaxed" data-testid="r973-right-to-move-in-notice">
            조합원입주권 양도에는 <b>원조합원의 종전 주택이 자동말소(민간임대주택법 §6⑤)된 뒤 관리처분계획 인가로 입주권이 된 경우</b>에만 적용합니다
            (서면-2023-법규재산-2731). 아래 ③에서 「양도일까지 계속 임대」를 끄고 자동말소를 선택하고, 말소일은 관리처분계획 인가일 이전이어야 합니다.
            장기보유특별공제 특례는 관리처분계획 인가 전 양도차익에만 적용됩니다(소득세법 §95② 괄호).
          </p>
        </ToneCard>
      )}
      {/* ① 등록·신분 */}
      <ToneCard tone="violet" sectionNum="①" title="등록·신분">
        <RentalResidentOnlyNotice article="§97의3" />

        {/* PR-C — 단기민간임대 → 장기일반 변경신고. 이 선택이 아래 「임대사업자 등록일」의 의미를 바꾸므로
            (변경신고 주택 = 단기 지자체 등록일) 그 입력 **직전**에 둔다(입력 화면 작성 원칙 「모드 토글은 영향 필드 직전」).
            정본은 `shortTermConversionMode`이고 구 boolean(`isConvertedFromShortTerm` = 적용 제외)은 onChange에서 함께 쓴다. */}
        <div>
          <p className="mb-1 text-xs font-medium">단기민간임대주택 → 장기일반 변경신고</p>
          <RadioCardGroup
            name="shortTermConversionMode_973"
            layout="stack"
            tone="amber"
            value={value.shortTermConversionMode}
            onChange={(v) => {
              const mode = v as Rental973Form["shortTermConversionMode"];
              onChange({
                shortTermConversionMode: mode,
                isConvertedFromShortTerm: mode === "after",
                ...(mode === "before" ? {} : { conversionReportedDate: "", conversionAcceptedDate: "" }),
              });
            }}
            options={[
              { value: "none", label: "변경신고 없음", description: "처음부터 장기일반·공공지원민간임대주택으로 등록" },
              {
                value: "before",
                label: "2020.7.10 이전 변경신고",
                description: "단기로 임대한 기간을 장기 임대기간에 산입 (조특령 §97의3④ 후단)",
              },
              {
                value: "after",
                label: "2020.7.11 이후 변경신고",
                description: "적용 제외 (조특법 §97의3① 괄호)",
              },
            ]}
          />
        </div>
        {value.shortTermConversionMode === "before" && (
          <>
            <p className="text-micro text-muted-foreground">
              변경신고 주택은 아래 「임대사업자 등록일」에 <b>단기민간임대주택으로 등록한 날</b>(지자체)을 입력합니다.
              2019.2.11 이전 신고분은 단기로 임대한 기간 중 5년까지의 50%(최대 2년 6개월), 2019.2.12 이후 신고분은 전부(단기 임대의무기간 한도)를 산입합니다.
              단기 의무기간은 2015.12.28 이전 등록(구 임대주택법)이면 5년, 이후 등록이면 4년으로 봅니다.
              단기 건설임대주택의 입주지정기간 개시일(민특령 §34①1호)은 반영하지 않고 등록일 기준으로 계산합니다.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium">변경 신고일</label>
              <DateInput
                data-field={`reduction.${value.type}.conversionReportedDate`}
                value={value.conversionReportedDate}
                onChange={(v) => onChange({ conversionReportedDate: v })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">변경신고 수리일 (장기일반 등록일)</label>
              <DateInput
                data-field={`reduction.${value.type}.conversionAcceptedDate`}
                value={value.conversionAcceptedDate}
                onChange={(v) => onChange({ conversionAcceptedDate: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">
                임대료 5% 증액 제한은 수리일 이후 체결·갱신한 계약부터 판정합니다.
              </p>
            </div>
          </>
        )}

        {/* V-14 — 상속 여부가 아래 등록·임대일의 주체(상속인 본인)를 정하므로 그 직전에 둔다. 변경신고는 등록일의 의미를 바꾸므로 그 앞. */}
        {inheritanceInScope && (
          <Rental973InheritanceBlock
            reductionType={value.type}
            checked={value.isInherited973 === true}
            decedentRegistrationDate={value.decedentRegistrationDate973 ?? ""}
            decedentRentalStartDate={value.decedentRentalStartDate973 ?? ""}
            inheritanceDate={acquisitionDate}
            conflictsConversion={rental973InheritanceConflictsConversion(value)}
            onChange={onChange}
          />
        )}

        <RegistrationFields
          fieldType={value.type}
          registrationDate={value.registrationDate}
          isTaxRegistered={value.isTaxRegistered}
          rentalStartDate={value.rentalStartDate}
          onRegistrationDateChange={(v) => onChange({ registrationDate: v })}
          onIsTaxRegisteredChange={(v) => onChange({ isTaxRegistered: v })}
          onRentalStartDateChange={(v) => onChange({ rentalStartDate: v })}
        />
        {/* 조특령 §97의3④ — 사업자등록·임대사업자등록·임대 중 늦은 날부터 임대 개시 */}
        {value.isTaxRegistered && (
          <div>
            <label className="mb-1 block text-xs font-medium">세무서 사업자등록일</label>
            <DateInput
              data-field={`reduction.${value.type}.taxRegistrationDate`}
              value={value.taxRegistrationDate}
              onChange={(v) => onChange({ taxRegistrationDate: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              조특령 §97의3④ — 사업자등록·임대사업자 등록·임대개시 중 가장 늦은 날부터 임대를 개시한 것으로 봅니다.
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium">임대주택 유형</p>
          {/* D9-07 — §97의3①은 4호·5호를 동등하게 대상으로 삼아 이 선택이 공제율을 가르지 않는다.
              종전에는 옆에 「아파트 여부」 라디오까지 있어 두 입력 모두 세액을 바꾸는 것처럼 보였다. */}
          <RadioCardGroup
            name="rentalHousingType_973"
            // D9-07 — inline 분기는 description을 렌더하지 않는다(RadioCardGroup.tsx:203).
            // 4호/5호 조문 표기를 실제로 보이게 하려면 stack이어야 한다.
            layout="stack"
            columns={2}
            tone="violet"
            value={value.rentalHousingType}
            onChange={(v) => onChange({ rentalHousingType: v as Rental973Form["rentalHousingType"] })}
            options={[
              {
                value: "long_term_private",
                label: "장기일반민간임대",
                description: "민특법 §2 5호",
              },
              {
                value: "public_support_private",
                label: "공공지원민간임대",
                description: "민특법 §2 4호",
              },
            ]}
          />
        </div>



        {/* D2-07 — §97의3① 「민간건설임대주택」 한정은 2023.1.1 이후 등록분(법률 제19199호 부칙 §38
            경과조치 — 그 전 등록분은 종전 규정). 다만 **종전 규정에도 등록 시한**이 있어 매입임대는
            2020.12.31에서 끝나므로(건설임대만 2022.12.31), 2021.1.1 이후 등록분이면 시대와 무관하게
            건설임대 여부를 물어야 한다 — 엔진·⑧과 같은 경계(2020.12.31). */}
        {longRegistrationDate > "2020-12-31" && (
          <ToggleCard
            data-field={`reduction.${value.type}.isPrivateConstructionRental`}
            variant="chip"
            checked={value.isPrivateConstructionRental}
            onCheckedChange={(v) => onChange({ isPrivateConstructionRental: v })}
            title="민간건설임대주택"
            description={
              longRegistrationDate >= "2023-01-01"
                ? "민특법 §2 2호 — 2023.1.1 이후 등록분은 건설임대에 한정 (§97의3①)"
                : "민특법 §2 2호 — 매입임대 등록 시한은 2020.12.31, 건설임대는 2022.12.31 (§97의3① 종전 규정)"
            }
            tone="amber"
          />
        )}

        {/* G-1 — 종전 §97의3① 괄호(2023.1.1. 전 등록분): 2020.7.11. 이후 등록 신청한 아파트 민간매입임대주택은 적용 제외.
            장기 등록일 2020-07-11~2020-12-31 · 변경신고 없음일 때만 결론을 가른다(엔진·④·⑧·⑫와 같은 leaf). 미답은 ⑧이 막는다. */}
        {aptPurchaseQuestion && (
          <div>
            <p className="mb-1 text-xs font-medium">{APT_PURCHASE_973_QUESTION}</p>
            <RadioCardGroup
              data-field="reduction.rental_97_3.aptPurchaseAfter0711_973"
              name="aptPurchaseAfter0711_973"
              layout="inline"
              tone="amber"
              value={value.aptPurchaseAfter0711_973 ?? ""}
              onChange={(v) => onChange({ aptPurchaseAfter0711_973: v as Rental973Form["aptPurchaseAfter0711_973"] })}
              options={[
                { value: "yes", label: "예 — 적용 제외", testId: "r973-apt-purchase-yes" },
                { value: "no", label: "아니오", testId: "r973-apt-purchase-no" },
              ]}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              2023.1.1. 전 등록분에 적용되는 종전 §97의3① 괄호 — 등록 <b>신청</b>일이 2020.7.11. 이후인 아파트 매입임대는 제외됩니다
              (증여로 임대사업자 지위를 포괄승계한 경우도 같음 · 기획재정부 재산세제과-954). 건설임대이거나 아파트가 아니면 「아니오」.
              도시형 생활주택인 아파트도 조문이 「아파트」로만 정해 포함해 계산합니다 — 해석 미확인(확인 필요).
            </p>
            {!value.aptPurchaseAfter0711_973 && (
              <p className="mt-1 text-micro text-rose-700 dark:text-rose-400">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
            )}
          </div>
        )}

        <ToggleCard
          data-field={`reduction.${value.type}.isNationalHousingScale`}
          variant="chip"
          checked={value.isNationalHousingScale}
          onCheckedChange={(v) => onChange({ isNationalHousingScale: v })}
          title="국민주택규모 이하"
          description="전용 85㎡(수도권 외 읍면 100㎡) 이하 · 다가구주택은 전체 면적 합이 아니라 가구당 전용면적으로 판정 — 령 §97의3③2호"
          tone="sky"
        />
      </ToneCard>

      {/* ② 임대 개시 */}
      <ToneCard tone="violet" sectionNum="②" title="임대 개시 정보">

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시일 당시 기준시가 (원)</label>
          <CurrencyInput
            data-field={`reduction.${value.type}.officialPriceAtStart`}
            label=""
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            주택+부속토지 합계 — 6억(수도권 밖 3억) 이하 요건 (령 §97의3③4호)
          </p>
          <p className="mt-1 text-micro text-muted-foreground">
            임대개시일은 실제 임대일·임대사업자 등록일·세무서 사업자등록일 중 늦은 날입니다 (령 §97의3④).
            {mergedDecedentStart
              ? " 피상속인 임대기간을 합산하면 피상속인 임대개시일(등록등일이 늦으면 그날) 당시 값을 넣으세요 — 이때 안분은 취득일(상속개시일) 기준시가로 계산해 이 값을 쓰지 않습니다 (확인 필요)."
              : " 그날이 취득일보다 늦으면 이 값이 임대기간 분 양도차익 안분의 개시일 기준시가로도 쓰입니다 (령 §97의3⑤)."}
            {value.shortTermConversionMode === "before" &&
              " 단기→장기 변경신고 주택은 단기 임대기간 산입을 반영한 임대개시일(자동 산출 박스의 기산일) 당시 값을 입력합니다."}
          </p>
        </div>

        <Clause4GrandfatherQuestion
          dataField={`reduction.${value.type}.clause4Grandfather`}
          value={value.clause4Grandfather ?? ""}
          onChange={(v) => onChange({ clause4Grandfather: v })}
          acquisitionDate={acquisitionDate}
          transferDate={transferDate}
          assetContractDate={assetContractDate}
        />

        <div>
          <p className="mb-1 text-xs font-medium">소재지</p>
          <RadioCardGroup
            name="region_973"
            layout="inline"
            tone="rose"
            value={value.region}
            onChange={(v) => onChange({ region: v as Rental973Form["region"] })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "비수도권" },
            ]}
          />
        </div>
      </ToneCard>

      {/* ③④ 공통 필드 (임대료 증액·공실) */}
      <RentalCommonFields
        fieldType={value.type}
        hasGainProration
        vacancyGraceMonths={3}
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
        {...(isRightToMoveIn ? { stdPriceAtTransferLabel: RENTAL_973_RIGHT_STD_PRICE_D_LABEL, stdPriceAtTransferHint: RENTAL_973_RIGHT_STD_PRICE_D_HINT } : {})}
        endExtra={
          <Rental973AutoCancelToggle
            checked={value.autoCancelled973 ?? false}
            onChange={(v) => onChange({ autoCancelled973: v })}
          />
        }
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1 dark:bg-emerald-900/40">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">등록일별 적용 공제율</span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">
            {rateGuide ?? "등록일 입력 시 표시"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            임대개시일 (기산일{value.shortTermConversionMode === "before" ? " — 단기 임대기간 산입 반영" : ""})
          </span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200" data-testid="rental973-effective-start">
            {effectiveStart || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">양도일 기준 임대기간 (임대개시일→양도일, 임대개시일 = 임대일·등록일·사업자등록일 중 늦은 날)</span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">{rentalDuration}</span>
        </div>
        {mergedPreview && (
          <div className="flex items-center justify-between text-xs" data-testid="rental973-merged-preview">
            <span className="text-muted-foreground">피상속인 임대기간({mergedPreview.decedent}) 통산 후 (공실 차감 전)</span>
            <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">{mergedPreview.years}년</span>
          </div>
        )}
        {autoCancelDeemed && (
          <div className="flex items-center justify-between text-xs" data-testid="rental973-auto-cancel-preview">
            <span className="text-muted-foreground">자동말소({value.rentalEndDate}) — 8년 등록·임대 간주 (구 조특령 §97의3②2호)</span>
            <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">8년 · 50%</span>
          </div>
        )}
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ※ 2022.12.31 이전 등록분은 8년 이상 50%, 10년 이상 70%. 2023.1.1 이후 등록분은 10년 이상 70%만 적용됩니다.
          공실 차감 후 실제 유효임대기간은 엔진이 계산합니다.
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * §97의5 장기일반민간임대 — 산출세액 100% 감면 입력 폼
 *
 * 요건: 2018.12.31까지 취득 + 취득 후 3개월 내 등록 + 10년 계속 임대 후 양도
 * + ①3호가 준용하는 조특령 §97의3③ — 국민주택규모 이하(2호)·임대개시 당시 기준시가 6억(수도권 밖 3억) 이하(4호).
 *   (종전 주석의 「전용면적 요건 없음」은 ①3호 준용 사슬을 놓친 것이었다 — CA-01.)
 *
 * 특이사항:
 * - 등록일 입력 직하에 3개월 검증 배지 (useMemo 파생)
 *   취득일 + 3개월 ≥ 등록일 → emerald "✓ 취득 후 3개월 내 등록"
 *   초과 → amber "취득 후 3개월 초과 — §97의5①1호 불충족"
 * - rentalHousingType·isConvertedFromShortTerm 없음
 */

import { useId, useMemo } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { RentalCommonFields, TaxRegistrationToggle } from "./RentalCommonFields";
import { Rental975DeemedPeriodsField } from "./Rental975DeemedPeriodsField";
import type { RentalReductionFormVariant, RentalCommonFormFields } from "@/lib/stores/calc-wizard-asset-reduction";
import { addMonths } from "date-fns";
import { RENTAL_97_5_REGISTRATION_MONTHS } from "@/lib/tax-engine/transfer-reductions";
import { evaluateContinuousRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5-period";
import { toOptionalDate } from "@/lib/api/date-coerce";

type Rental975Form = Extract<RentalReductionFormVariant, { type: "rental_97_5" }>;

interface Props {
  value: Rental975Form;
  onChange: (patch: Partial<Rental975Form>) => void;
  /** 자산 취득일 — 3개월 검증 배지용 */
  acquisitionDate?: string;
  /** 자산의 양도일 — 임대기간 미리보기용 */
  transferDate?: string;
}

/**
 * 3개월 기한 — **엔진과 같은 함수**(`date-fns` `addMonths`)를 쓴다.
 *
 * 🔴 종전에는 `d.setMonth(d.getMonth() + 3)`이었다. 그것은 **말일을 넘긴다**:
 *    2018-11-30 + 3개월 → 2019-03-02(2월이 28일뿐이라 오버플로). 반면 엔진
 *    (`rental-97-5.ts:70`)의 `date-fns addMonths`는 말일로 **clamp** 한다 → 2019-02-28.
 *
 *    그래서 취득 2018-11-30 · 등록 2019-03-01이면 화면에는 emerald 「✓ 취득 후 3개월 내 등록」이
 *    뜨는데 엔진은 `REGISTRATION_AFTER_3_MONTHS`로 §97의5①1호 불충족을 잡아 **100% 세액감면을
 *    전액 배제**한다. §97의5는 2018.12.31.까지 취득분이 대상이라 말일 취득이 실제로 흔하다.
 *
 * 개월수도 엔진 상수(`RENTAL_97_5_REGISTRATION_MONTHS`)를 그대로 쓴다 — 두 곳이 갈릴 수 없다.
 */
function registrationDeadline(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return addMonths(d, RENTAL_97_5_REGISTRATION_MONTHS);
}


export function Rental975InputForm({ value, onChange, acquisitionDate, transferDate }: Props) {
  const uid = useId();
  const patchCommon = (patch: Partial<RentalCommonFormFields>) => {
    onChange(patch as Partial<Rental975Form>);
  };

  // 3개월 검증 배지 (useMemo — store 미기록)
  const regBadge = useMemo(() => {
    if (!acquisitionDate || !value.registrationDate) return null;
    const deadline = registrationDeadline(acquisitionDate);
    if (!deadline) return null;
    const regDate = new Date(value.registrationDate);
    if (isNaN(regDate.getTime())) return null;
    if (regDate <= deadline) {
      return { ok: true, text: "✓ 취득 후 3개월 내 등록" };
    }
    return { ok: false, text: "취득 후 3개월 초과 — §97의5①1호 불충족" };
  }, [acquisitionDate, value.registrationDate]);

  // emerald 자동 표시
  // 종점 — 양도 전 임대 종료면 임대 종료일(§97의5①2호), 아니면 양도일
  const ended = value.rentalContinuesToTransfer === false;
  /**
   * 리뷰 9번 — 엔진과 **같은 판정 함수**(`evaluateContinuousRental975`)로 미리 보여 준다.
   * 기산일 = 임대개시일·임대사업자 등록일·사업자등록일 중 늦은 날(조특령 §97의5③), 종점 = 양도일 또는 임대 종료일,
   * 6개월 초과 공실 단절·수용/정비사업 간주기간 반영. 종전에는 임대개시일→양도일 단순 차이였다.
   */
  const rentalPreview = useMemo(() => {
    const dates = [value.rentalStartDate, value.registrationDate, value.isTaxRegistered ? value.taxRegistrationDate : ""]
      .map((d) => toOptionalDate(d))
      .filter((d): d is Date => d !== undefined);
    const start = toOptionalDate(value.rentalStartDate) ? new Date(Math.max(...dates.map((d) => d.getTime()))) : undefined;
    const end = toOptionalDate(ended ? value.rentalEndDate : transferDate);
    if (!start || !end) return null;
    const toSpans = (rows: { startDate: string; endDate: string }[]) =>
      rows
        .map((r) => ({ startDate: toOptionalDate(r.startDate), endDate: toOptionalDate(r.endDate) }))
        .filter((r): r is { startDate: Date; endDate: Date } => !!r.startDate && !!r.endDate);
    return evaluateContinuousRental975({
      start,
      end,
      vacancyPeriods: value.hasVacancyOverGrace ? toSpans(value.vacancyPeriods ?? []) : [],
      deemedRentalPeriods: value.hasDeemedRentalPeriod
        ? (value.deemedRentalPeriods ?? [])
            .map((p) => ({ reason: p.reason, startDate: toOptionalDate(p.startDate), endDate: toOptionalDate(p.endDate) }))
            .filter((p): p is { reason: typeof p.reason; startDate: Date; endDate: Date } => !!p.startDate && !!p.endDate)
        : [],
    });
  }, [value, ended, transferDate]);

  return (
    <div className="mt-2 ml-4 space-y-3">
      {/* ① 등록·신분 */}
      <ToneCard tone="violet" sectionNum="①" title="등록·신분">

        {/* §97의5①1호 — 매입임대주택을 취득하고 3개월 내 등록 (취득 유형 → 등록일 순서) */}
        <div>
          <p className="mb-1 text-xs font-medium">임대주택 취득 유형</p>
          <p className="mb-1.5 text-micro text-muted-foreground">
            §97의5①1호 — 민간매입임대주택(민특법 §2 3호 「매매 등으로 소유권을 취득」) 또는 공공매입임대주택만 대상입니다.
            증여·분양으로 취득한 주택도 매입임대입니다. 건설임대주택(민특법 §2 2호 — 임대 목적으로 건설하거나 주택건설사업자가
            건설 후 미분양으로 임대)은 대상이 아닙니다.
          </p>
          <RadioCardGroup
            data-field={`reduction.${value.type}.isPurchaseRental`}
            name={`isPurchaseRental-${uid}`}
            layout="inline"
            tone="violet"
            value={value.isPurchaseRental === null ? "" : value.isPurchaseRental ? "purchase" : "construction"}
            onChange={(v) => onChange({ isPurchaseRental: v === "purchase" })}
            options={[
              { value: "purchase", label: "매입임대 (매매·증여·분양 등으로 취득)" },
              { value: "construction", label: "건설임대 (건설·미분양 임대)" },
            ]}
          />
          {value.isPurchaseRental === null && (
            <p className="mt-1 text-micro text-rose-700 dark:text-rose-400">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">지자체 임대사업자 등록일</label>
          <DateInput
            data-field={`reduction.${value.type}.registrationDate`}
            value={value.registrationDate}
            onChange={(v) => onChange({ registrationDate: v })}
          />
          {/* 3개월 검증 배지 */}
          {regBadge && (
            <div
              className={`mt-1 rounded px-2 py-1 text-micro font-medium ${
                regBadge.ok
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}
            >
              {regBadge.text}
            </div>
          )}
          {!acquisitionDate && (
            <p className="mt-1 text-micro text-muted-foreground">
              ※ 3개월 검증 배지는 자산 카드의 취득일 입력 후 표시됩니다.
            </p>
          )}
        </div>

        <TaxRegistrationToggle
          checked={value.isTaxRegistered}
          onCheckedChange={(v) => onChange({ isTaxRegistered: v })}
        />
        {/* 조특령 §97의5③ — 사업자등록·임대사업자등록·임대 중 늦은 날부터 임대 개시 */}
        {value.isTaxRegistered && (
          <div>
            <label className="mb-1 block text-xs font-medium">세무서 사업자등록일</label>
            <DateInput
              data-field={`reduction.${value.type}.taxRegistrationDate`}
              value={value.taxRegistrationDate}
              onChange={(v) => onChange({ taxRegistrationDate: v })}
            />
            <p className="mt-1 text-micro text-muted-foreground">
              조특령 §97의5③ — 사업자등록·임대사업자 등록·임대개시 중 가장 늦은 날부터 임대를 개시한 것으로 봅니다.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시일</label>
          <DateInput data-field={`reduction.${value.type}.rentalStartDate`} value={value.rentalStartDate} onChange={(v) => onChange({ rentalStartDate: v })} />
        </div>
      </ToneCard>

      {/* ② 임대 개시 정보 */}
      <ToneCard tone="violet" sectionNum="②" title="임대 개시 정보">

        <div>
          <label className="mb-1 block text-xs font-medium">임대개시 당시 기준시가 (원)</label>
          <CurrencyInput
            data-field={`reduction.${value.type}.officialPriceAtStart`}
            label=""
            value={value.officialPriceAtStart}
            onChange={(v) => onChange({ officialPriceAtStart: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            주택+부속토지 합계 — 6억(수도권 밖 3억) 이하 요건 (§97의5①3호 → 령 §97의3③4호)
          </p>
        </div>

        {/* CA-01 — §97의5①3호가 준용하는 조특령 §97의3③2호 */}
        <ToggleCard
          data-field={`reduction.${value.type}.isNationalHousingScale`}
          variant="chip"
          checked={value.isNationalHousingScale}
          onCheckedChange={(v) => onChange({ isNationalHousingScale: v })}
          title="국민주택규모 이하"
          description="전용 85㎡(수도권 외 읍면 100㎡) 이하 — §97의5①3호 → 령 §97의3③2호"
          tone="sky"
        />

        <div>
          <p className="mb-1 text-xs font-medium">소재지</p>
          <RadioCardGroup
            name="region_975"
            layout="inline"
            tone="rose"
            value={value.region}
            onChange={(v) => onChange({ region: v as Rental975Form["region"] })}
            options={[
              { value: "capital", label: "수도권" },
              { value: "non_capital", label: "비수도권" },
            ]}
          />
        </div>
      </ToneCard>

      {/* ③④ 공통 필드 */}
      <RentalCommonFields
        fieldType={value.type}
        hasGainProration
        vacancyGraceMonths={6}
        value={value}
        onChange={patchCommon}
        sectionOffset={3}
        vacancyExtra={
          <Rental975DeemedPeriodsField
            enabled={value.hasDeemedRentalPeriod}
            periods={value.deemedRentalPeriods ?? []}
            onChange={(patch) => onChange(patch)}
            uid={uid}
            fieldType={value.type}
          />
        }
      />

      {/* emerald 자동 표시 박스 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-100/60 p-3 space-y-1 dark:bg-emerald-900/40">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">자동 산출 (참고용, 저장 안 됨)</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">의무임대기간</span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">10년</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {ended ? "계속 임대기간 (기산일→임대 종료일)" : "계속 임대기간 (기산일→양도일)"}
          </span>
          <span className="font-mono font-medium text-emerald-900 dark:text-emerald-200">
            {rentalPreview ? `${rentalPreview.years}년` : "—"}
          </span>
        </div>
        {rentalPreview && rentalPreview.breaks.length > 0 && rentalPreview.longestSegment && (
          <p className="text-micro text-muted-foreground">
            6개월을 넘는 공실 {rentalPreview.breaks.length}건으로 계속 임대가 끊겨 가장 긴 구간(
            {rentalPreview.longestSegment.start.toLocaleDateString("ko-KR")} ~{" "}
            {rentalPreview.longestSegment.end.toLocaleDateString("ko-KR")})으로 셉니다.
          </p>
        )}
      </div>
    </div>
  );
}

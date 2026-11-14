"use client";

/**
 * §155⑳㉓ 말소 특례 토글 — RentalUnitCard 분리 (800줄 정책).
 *
 * 자진·자동 말소된 호의 말소 사유·말소 전 등록 유형·말소일 + 이 호 말소일 기준 5년 기한 안내.
 * 노출 여부(가·다·라·마목)는 호출부(`showTermination`)가 정한다 — 이 컴포넌트는 그리기만 한다.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { deadlineEndNote } from "@/lib/tax-engine/civil-period";
import { terminationDeadline } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { isAutoCancellationDeemable } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/termination-window";
import { ADDENDA_17482_DEEMED_CANCELLATION } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/termination-window";
import { deriveHalfDutyRentalMonths } from "@/lib/stores/calc-wizard-asset-rental-period";
import { recognizedRentalSegments } from "@/lib/stores/calc-wizard-asset-rental-period";
import { halfDutyRentalPeriods } from "@/lib/stores/calc-wizard-asset-rental-period";
import { hasRentalAfterCancellation } from "@/lib/stores/calc-wizard-asset-rental-period";
import { rentalRegisteredDateOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import { rentalSuccessionOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export interface RentalTerminationBlockProps {
  unit: RentalUnitForm;
  index: number;
  set: <K extends keyof RentalUnitForm>(key: K, val: RentalUnitForm[K]) => void;
  onChange: (u: RentalUnitForm) => void;
  /** 양도일(YYYY-MM-DD) — 말소일 기준 5년 기한과 비교한다. 빈값이면 비교하지 않는다. */
  transferDate?: string;
}

export function RentalTerminationBlock({ unit, index, set, onChange, transferDate }: RentalTerminationBlockProps) {
  // I-4 — 이 호 말소일 기준 5년 기한(엔진 `terminationDeadline` — 민법 §161 연장 포함). 표시 전용 파생.
  const cancellationTs = unit.registrationCancellationDate ? new Date(unit.registrationCancellationDate).getTime() : NaN;
  // G-8 — 자동말소 · 폐지 유형 · 2020.8.18. 전 종료일이면 법률 제17482호 부칙 제7조로 2020.8.18. 말소 간주(엔진과 같은 술어).
  const deemed = unit.rentalAutoTermination && isAutoCancellationDeemable(unit, cancellationTs);
  const unitDeadline =
    unit.rentalAutoTermination && !Number.isNaN(cancellationTs)
      ? terminationDeadline(deemed ? ADDENDA_17482_DEEMED_CANCELLATION : new Date(unit.registrationCancellationDate))
      : null;
  // G-8 — 말소 사유에 따라 칸이 묻는 날짜가 다르다(민특법 §6⑤ 자동 = 임대의무기간 종료일 · §6①11호 자진 = 말소된 날).
  const cancellationLabel =
    unit.terminationReason === "auto"
      ? "등록 말소일(임대의무기간 종료일)"
      : unit.terminationReason === "voluntary"
        ? "등록 말소일(말소 신청으로 등록이 말소된 날)"
        : "등록 말소일";
  const cancellationHint =
    unit.terminationReason === "auto"
      ? "민특법 §6⑤에 따라 임대의무기간이 끝난 날 등록이 말소됩니다. 등록증에 적힌 말소 처리일이 아니라 임대의무기간 종료일을 넣으세요. 2020.8.18. 전에 끝났다면 실제 종료일을 넣으면 2020.8.18.에 말소된 것으로 계산합니다(법률 제17482호 부칙 제7조)."
      : unit.terminationReason === "voluntary"
        ? "민특법 §6①11호에 따라 임대의무기간 안에 말소를 신청해 등록이 말소된 날입니다 (소령 §155㉓)."
        : "먼저 위 말소 사유를 고르세요 — 자동말소는 임대의무기간 종료일, 자진말소는 등록이 말소된 날입니다 (소령 §155㉓).";
  const successionKind = rentalSuccessionOf(unit);
  const transferTs = transferDate ? new Date(transferDate).getTime() : NaN;

  return (
    <ToggleCard
      variant="card"
      size="sm"
      tone="violet"
      title="자진말소 또는 자동말소로 임대사업자 등록이 말소된 임대주택입니다."
      description="말소일(2호 이상이면 최초 말소일)부터 5년 이내에 거주주택을 양도하면 임대기간요건을 충족한 것으로 봅니다. 자진말소는 민특법 임대의무기간(단기 4년·장기일반 8년)의 1/2 이상 임대한 경우에 한합니다(소령 §155㉓)."
      checked={unit.rentalAutoTermination}
      // 끄면 등록 유형·말소일도 함께 비운다 — 같은 onChange 한 번(useEffect 미러링 금지)
      onCheckedChange={(v) =>
        onChange({
          ...unit,
          rentalAutoTermination: v,
          ...(v ? {} : { terminatedRegistrationType: "", registrationCancellationDate: "", terminationReason: "" }),
        })
      }
    >
      {/*
        말소 사유 — ⑳㉓ 판정은 자진·자동을 가르지 않지만, ⑳이 불성립해 이 호를 다주택 중과 주택 수에 넣을 때는
        자동말소만 「소득세법 시행령」 §167의3①2호 단서로 임대기간요건을 갖춘 것으로 본다(미선택 = 자동말소로 보지 않음).
      */}
      <FieldCard label="말소 사유" hint="다주택 중과 판정용 — 자동말소면 임대기간요건을 갖춘 것으로 봅니다 (소령 §167의3①2호 단서)">
        <RadioCardGroup
          name={`rental-termination-reason-${index}`}
          data-testid={`rental-termination-reason-${index}`}
          tone="violet"
          layout="inline"
          options={[
            { value: "auto", label: "자동말소", description: "임대의무기간 종료일 말소 (민특법 §6⑤)", testId: `rental-termination-reason-auto-${index}` },
            { value: "voluntary", label: "자진말소", description: "임대의무기간 내 말소 신청 (민특법 §6①11호)", testId: `rental-termination-reason-voluntary-${index}` },
          ]}
          value={unit.terminationReason ?? ""}
          onChange={(v) => set("terminationReason", v)}
        />
      </FieldCard>
      {/*
        OH-39 — ㉓1호 「같은 법 제43조에 따른 임대의무기간의 2분의 1」은 소득세법 목별 임대기간요건
        (가목 5년 등)이 아니라 말소 전 민특법 등록 유형의 임대의무기간이다(종전 §2 5호 8년 · 6호 4년).
      */}
      <FieldCard label="말소 전 민간임대주택 등록 유형" required hint="자진말소 1/2 판정 기준 (소령 §155㉓1호)">
        <RadioCardGroup
          name={`rental-terminated-type-${index}`}
          data-testid={`rental-terminated-type-${index}`}
          tone="violet"
          layout="inline"
          options={[
            { value: "short_term", label: "단기민간임대(4년)", description: "1/2 = 24개월", testId: `rental-terminated-type-short-${index}` },
            { value: "long_term_general", label: "장기일반민간임대(8년)", description: "1/2 = 48개월", testId: `rental-terminated-type-long-${index}` },
          ]}
          value={unit.terminatedRegistrationType ?? ""}
          onChange={(v) => set("terminatedRegistrationType", v)}
        />
        {/* V-5 — 1/2 판정 개월은 ④가 엔진에 싣는 값과 같다(`deriveHalfDutyRentalMonths` 단일 소스). */}
        {(unit.rentalPeriods ?? []).some((p) => p.start && p.end) && (
          <p className="text-xs px-1 pt-1" data-testid={`rental-half-duty-months-${index}`}>
            1/2 판정에 쓰는 임대기간: <strong>{deriveHalfDutyRentalMonths(unit)}개월</strong>
            <span className="text-muted-foreground">
              {" "}— 지자체 임대사업자 등록일(그 뒤 임대를 시작했으면 실제 임대개시일)부터 등록 말소일까지 셉니다. 세무서
              사업자등록일은 기산에 쓰지 않습니다(민특령 §34①2호 · 서면-2021-부동산-7820).
            </span>
          </p>
        )}
        {/*
          1/2 계산의 공실·상속 처리는 해석례 미확보 — 계산은 ⑳ 규칙 그대로 두고 해당할 때만 확인 필요를 고지한다
          (사용자 결정 2026-11-12). 공실: 자진말소 해석 29건·국토부 해석 16건에 없음. 상속: 포괄양수 해석 5310 유추뿐.
        */}
        {/* 말소 뒤 임대분은 1/2에 넣지 않는다(사용자 결정 2026-11-12 · 정면 해석례 없음) — 잘린 구간이 있을 때만 고지 */}
        {hasRentalAfterCancellation(unit) && (
          <p className="text-xs px-1 pt-1 text-amber-800 dark:text-amber-300" data-testid={`rental-half-duty-after-cancel-notice-${index}`}>
            등록 말소일 뒤의 임대분은 1/2 계산에서 뺐습니다. ㉓1호는 민특법 §43 임대의무기간(등록한 임대사업자의 임대)의
            2분의 1을 묻기 때문입니다. 이 점을 직접 다룬 해석례는 찾지 못했습니다(확인 필요).
          </p>
        )}
        {recognizedRentalSegments(halfDutyRentalPeriods(unit), rentalRegisteredDateOf(unit)).length > 1 && (
          <p className="text-xs px-1 pt-1 text-amber-800 dark:text-amber-300" data-testid={`rental-half-duty-gap-notice-${index}`}>
            임대 구간 사이 3개월을 넘는 공실은 1/2 계산에서 뺐습니다. 민특법 임대의무기간에서 공실을 어떻게 세는지는
            해석례를 찾지 못했습니다(확인 필요).
          </p>
        )}
        {successionKind && (
          <p className="text-xs px-1 pt-1 text-amber-800 dark:text-amber-300" data-testid={`rental-half-duty-inherited-notice-${index}`}>
            {successionKind === "assumption"
              ? "전 임대사업자 임대기간을 1/2 계산에 더했습니다. 포괄양수한 임대주택은 전 임대사업자 등록일부터 센다는 해석(서면-2020-법규재산-5310)에 따른 것입니다."
              : successionKind === "household_gift"
                ? "증여자 임대기간을 1/2 계산에 더했습니다(임대기간 통산은 서면-2022-법규재산-4972). 같은 세대원 증여의 1/2 기산을 직접 다룬 해석은 찾지 못해 포괄양수 해석(서면-2020-법규재산-5310)을 유추했습니다(확인 필요)."
                : "피상속인 임대기간을 1/2 계산에 더했습니다. 포괄양수한 임대주택은 전 임대사업자 등록일부터 센다는 해석(서면-2020-법규재산-5310)을 유추한 것으로, 상속을 직접 다룬 해석은 찾지 못했습니다(확인 필요)."}
          </p>
        )}
      </FieldCard>
      {/*
        I-4 — ㉓ 「말소 이후 5년 이내」는 선언이 아니라 말소일로 판정한다. 2호 이상이면 엔진이 입력한 말소 호 중
        가장 이른 말소일로 기한을 정한다(기획재정부 재산세제과-1308). 여기 표시는 이 호 기준이다.
      */}
      <FieldCard label={cancellationLabel} required hint={<span data-testid={`rental-cancellation-date-hint-${index}`}>{cancellationHint}</span>}>
        <DateInput
          data-testid={`rental-cancellation-date-${index}`}
          value={unit.registrationCancellationDate ?? ""}
          onChange={(v) => set("registrationCancellationDate", v)}
        />
      </FieldCard>
      {unitDeadline && (
        <div data-testid={`rental-cancellation-deadline-${index}`} className="px-1 space-y-0.5 text-caption">
          <p>
            이 호 말소일 기준 양도 기한: <b>{unitDeadline.end.toISOString().slice(0, 10)}</b>까지
            {!Number.isNaN(transferTs) &&
              (transferTs <= unitDeadline.end.getTime() ? " — 양도일이 기한 안입니다." : " — 양도일이 기한을 지났습니다.")}
          </p>
          {deadlineEndNote(unitDeadline) && <p className="text-muted-foreground">{deadlineEndNote(unitDeadline)}</p>}
          {deemed ? (
            <p className="text-muted-foreground" data-testid={`rental-cancellation-deemed-${index}`}>
              임대의무기간이 2020.8.18. 전에 끝나 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조에 따라 2020.8.18.에 등록이
              말소된 것으로 보고 기한을 계산했습니다.
            </p>
          ) : (
            cancellationTs < Date.UTC(2020, 7, 18) && (
              <p className="text-rose-700 dark:text-rose-300">
                2020.8.18. 전 말소는 §155㉓ 말소 특례 대상이 아닙니다(대통령령 제31083호 부칙 제3조②)
                {unit.terminationReason === "auto" ? "" : " — 자동말소라면 말소 사유를 「자동말소」로 고르세요"}.
              </p>
            )
          )}
          <p className="text-muted-foreground">
            장기임대주택이 2호 이상이면 가장 먼저 말소된 주택의 말소일부터 5년입니다 — 이미 양도했거나 거주주택으로
            전환한 주택이 먼저 말소됐다면 그 날이 기준입니다.
          </p>
        </div>
      )}
    </ToggleCard>
  );
}

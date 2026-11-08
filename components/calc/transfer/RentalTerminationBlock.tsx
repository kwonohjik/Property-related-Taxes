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
  const unitDeadline =
    unit.rentalAutoTermination && !Number.isNaN(cancellationTs)
      ? terminationDeadline(new Date(unit.registrationCancellationDate))
      : null;
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
      </FieldCard>
      {/*
        I-4 — ㉓ 「말소 이후 5년 이내」는 선언이 아니라 말소일로 판정한다. 2호 이상이면 엔진이 입력한 말소 호 중
        가장 이른 말소일로 기한을 정한다(기획재정부 재산세제과-1308). 여기 표시는 이 호 기준이다.
      */}
      <FieldCard label="등록 말소일" required hint="말소 이후 5년 이내 양도 판정 기준일 (소령 §155㉓)">
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
          {cancellationTs < Date.UTC(2020, 7, 18) && (
            <p className="text-rose-700 dark:text-rose-300">
              2020.8.18. 전 말소는 §155㉓ 말소 특례 대상이 아닙니다(대통령령 제31083호 부칙 제3조②).
            </p>
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

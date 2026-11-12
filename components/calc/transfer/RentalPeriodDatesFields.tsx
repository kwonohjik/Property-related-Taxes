"use client";

/**
 * 다주택 중과배제 임대주택의 임대기간 입력 — 「임대기간 (년)」 칸을 대신한다
 * (계획서 `docs/01-plan/features/surcharge-rental-period-dates.plan.md`).
 *
 * 임대개시일·임대 종료일(선택)을 받고 엔진이 연수를 계산한다(`multi-house-rental-period.ts`).
 * - 2호(`variant="long_term"`): 세무서 사업자등록일·지자체 등록일 중 늦은 날 전 임대분은 빼고 센다(소령 §167의3③).
 *   상속받아 계속 임대하면 피상속인 임대개월을 더한다(조특령 §97⑤3호).
 * - 3호(`variant="tax_incentive"`): 입력한 개시일 그대로 센다(③은 2호 한정) — 상속 칸 없음.
 * 3개월을 넘는 공실은 이 입력으로 뺄 수 없다 — 고지만(Q-4).
 *
 * 정책: DateInput·DecimalInput·ToggleCard 전용, onPatch 직접 호출(useEffect 미러링 없음).
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

export interface RentalPeriodDatesValue {
  rentalStartDate?: string;
  rentalEndDate?: string;
  isInheritedRental?: boolean;
  decedentRentalMonths?: string;
}

interface Props {
  value: RentalPeriodDatesValue;
  onPatch: (partial: RentalPeriodDatesValue) => void;
  variant: "long_term" | "tax_incentive";
  testIdPrefix: string;
}

const LABEL = "block text-caption text-muted-foreground font-medium";
const HINT = "text-caption text-muted-foreground";

export function RentalPeriodDatesFields({ value, onPatch, variant, testIdPrefix }: Props) {
  const longTerm = variant === "long_term";
  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-period`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={LABEL}>임대개시일</label>
          <DateInput
            value={value.rentalStartDate ?? ""}
            onChange={(s) => onPatch({ rentalStartDate: s || undefined })}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>
            임대 종료일 <span className="font-normal">(선택)</span>
          </label>
          <DateInput
            value={value.rentalEndDate ?? ""}
            onChange={(s) => onPatch({ rentalEndDate: s || undefined })}
          />
        </div>
      </div>
      <p className={HINT} data-testid={`${testIdPrefix}-period-hint`}>
        {longTerm
          ? "임대기간은 세무서 사업자등록일·임대사업자 등록 신청일 중 늦은 날 전의 임대분을 빼고 양도일(임대 종료일을 넣으면 그날)까지 셉니다(소령 §167의3③). 의무임대기간: 가·나·다·라목 5년, 마·바목 10년(2020.8.18. 전 등록 신청분은 8년), 아·자목 6년."
          : "임대개시일부터 양도일(임대 종료일을 넣으면 그날)까지 셉니다. 5년 이상 임대해야 합니다(소령 §167의3①3호)."}{" "}
        임차인이 바뀌는 사이 3개월을 넘는 공실이 있었다면 그 기간은 이 계산에 반영되지 않습니다(조특칙 §44 — 확인 필요).
      </p>
      {longTerm && (
        <ToggleCard
          variant="card"
          size="sm"
          tone="violet"
          data-testid={`${testIdPrefix}-inherited`}
          checked={value.isInheritedRental === true}
          onCheckedChange={(b) =>
            onPatch({ isInheritedRental: b || undefined, decedentRentalMonths: b ? value.decedentRentalMonths : undefined })
          }
          title="상속받아 계속 임대하는 주택"
          description="피상속인의 임대기간을 더합니다(조특령 §97⑤3호 · 소령 §167의3③ 준용)."
        >
          <div className="space-y-1 pt-1">
            <label className={LABEL}>피상속인 임대기간 (개월)</label>
            <DecimalInput
              value={value.decedentRentalMonths ?? ""}
              onChange={(s) => onPatch({ decedentRentalMonths: s || undefined })}
              placeholder="피상속인 임대 개월"
            />
            <p className={HINT}>
              피상속인이 사업자등록과 임대주택 등록을 한 뒤 임대한 개월입니다. 위 임대개시일에는 상속 후 상속인이 임대를 시작한 날을 넣으세요.
            </p>
          </div>
        </ToggleCard>
      )}
    </div>
  );
}

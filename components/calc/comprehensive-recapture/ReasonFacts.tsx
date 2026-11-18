"use client";

/**
 * 사유별 사실 칸 — §10③1·2·3호. 사유 하나만 렌더한다(다른 호의 칸은 사유 전환 때 `switchReason`이 비웠다).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.2
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  APPLICATION_KIND_OPTIONS,
  CANCEL_CLAUSE_OPTIONS,
  CAUSE_OPTIONS,
  RENT_5PCT_TYPES,
  asksApplicationDate,
  changeApplicationKind,
  changeRegistrationType,
  type RecaptureFormState,
  type YesNo,
} from "./shared";

interface Props {
  form: RecaptureFormState;
  /** 부분 갱신 */
  onPatch: (patch: Partial<RecaptureFormState>) => void;
  /** 전체 교체(유형·신청 사실 전환처럼 연쇄 비움이 있는 변경) */
  onReplace: (next: RecaptureFormState) => void;
}

const YES_NO_OPTIONS: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "예" },
  { value: "no", label: "아니오" },
];

function YesNoField({
  label,
  name,
  value,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  value: YesNo;
  hint?: string;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <FieldCard label={label} required hint={hint}>
      <RadioCardGroup<"yes" | "no">
        name={name}
        layout="inline"
        tone="violet"
        value={value}
        options={YES_NO_OPTIONS.map((o) => ({ ...o, testId: `${name}-${o.value}` }))}
        onChange={onChange}
      />
    </FieldCard>
  );
}

function Rent5pctFacts({ form, onPatch, onReplace }: Props) {
  return (
    <div className="space-y-3">
      <FieldCard label="임대 유형" required hint="시행령 §10③1호가 열거한 호(제3조제1항 1호·2호·7호·8호·10호·11호)의 임대주택만 해당합니다.">
        <RadioCardGroup
          name="rc-registration-type"
          layout="stack"
          columns={2}
          tone="violet"
          value={form.registrationType}
          options={RENT_5PCT_TYPES.map((t) => ({ value: t.value, label: t.label, testId: `rc-type-${t.value}` }))}
          onChange={(v) => onReplace(changeRegistrationType(form, v))}
        />
      </FieldCard>
      <FieldCard label="임대 기산일" required hint="최초 임대한 날입니다(시행령 §3⑦1호). 의무임대기간은 이 날부터 셉니다.">
        <DateInput value={form.rentalStartDate} onChange={(v) => onPatch({ rentalStartDate: v })} data-testid="rc-rental-start" />
      </FieldCard>
      {/* V-5(T-14 계획서 §6): 의제 다가구(1·2호)는 지자체 등록이 없다 — 엔진 정규화(세무서 등록일=§5 등록일)와 같은 기준. 1·2호 계산엔 이 날짜를 쓰지 않는다(`mandatoryPeriod` 장기 3유형만). */}
      <FieldCard
        label="지자체 임대사업자 등록일"
        required
        hint="2020.2.11. 전에 지자체 등록 없이 세무서에만 주택임대업 사업자등록을 한 다가구주택은 세무서 사업자등록일을 넣습니다."
      >
        <DateInput value={form.rentalRegistrationDate} onChange={(v) => onPatch({ rentalRegistrationDate: v })} data-testid="rc-rental-registration" />
      </FieldCard>
      {asksApplicationDate(form.registrationType) && (
        <FieldCard
          label="지자체 등록 신청일"
          hint="추가 변경신고 포함, 본인이 신청한 날입니다. 2020.8.18. 이후 신청분은 의무임대기간이 10년이고 그 전 신청분은 8년입니다. 입력하지 않으면 10년으로 보고 확인 필요 안내를 붙입니다."
        >
          <DateInput value={form.rentalApplicationDate} onChange={(v) => onPatch({ rentalApplicationDate: v })} data-testid="rc-rental-application" />
        </FieldCard>
      )}
      <FieldCard
        label="5% 초과 계약일"
        required
        hint="임대료 증액이 직전 임대료의 5%를 넘은 계약을 체결한 날, 곧 5% 요건을 충족하지 않게 된 날입니다."
      >
        <DateInput value={form.ceasedDate} onChange={(v) => onPatch({ ceasedDate: v })} data-testid="rc-ceased" />
      </FieldCard>
    </div>
  );
}

function CancelFacts({ form, onPatch }: Props) {
  return (
    <FieldCard label="등록 말소 근거" required>
      <RadioCardGroup
        name="rc-cancel-clause"
        layout="stack"
        tone="violet"
        value={form.cancelClause}
        options={CANCEL_CLAUSE_OPTIONS.map((o) => ({ ...o, testId: `rc-cancel-${o.value}` }))}
        onChange={(v) => onPatch({ cancelClause: v })}
      />
    </FieldCard>
  );
}

function ReplacementFacts({ form, onPatch, onReplace }: Props) {
  return (
    <div className="space-y-3">
      <FieldCard label="멸실 원인" required>
        <RadioCardGroup
          name="rc-cause"
          layout="stack"
          tone="violet"
          value={form.cause}
          options={CAUSE_OPTIONS.map((o) => ({ ...o, testId: `rc-cause-${o.value}` }))}
          onChange={(v) => onPatch({ cause: v })}
        />
      </FieldCard>
      <YesNoField
        label="당초 합산배제 임대주택이 단기민간임대주택이었는가"
        name="rc-original-short"
        value={form.originalKind === "" ? "" : form.originalKind === "short_term" ? "yes" : "no"}
        hint="단기민간임대주택이었다면 새 주택이 아파트가 아니어도 나목(미등록)을 적용합니다."
        onChange={(v) => onPatch({ originalKind: v === "yes" ? "short_term" : "other" })}
      />
      <FieldCard label="새 주택 준공일" required hint="준공일부터 6개월이 되는 날이 2020.7.10. 이전이면 §10③3호를 적용하지 않습니다.">
        <DateInput value={form.completionDate} onChange={(v) => onPatch({ completionDate: v })} data-testid="rc-completion" />
      </FieldCard>
      <YesNoField label="새 주택이 아파트인가" name="rc-apartment" value={form.isApartment} onChange={(v) => onPatch({ isApartment: v })} />
      <YesNoField
        label="새 주택을 임대사업자로 등록했는가"
        name="rc-registered"
        value={form.registeredAsRental}
        hint="나목은 아파트(당초가 단기민간임대면 모든 주택)이면서 임대사업자 등록을 하지 않은 경우입니다."
        onChange={(v) => onPatch({ registeredAsRental: v })}
      />
      <FieldCard
        label="2020.7.11. 이후 등록 신청"
        required
        hint="가목 — 새 주택에 대해 종전 장기일반민간임대 중 아파트 민간매입임대 또는 종전 단기민간임대로 등록 신청(변경신고 포함)을 했는지 고릅니다."
      >
        <RadioCardGroup
          name="rc-application-kind"
          layout="stack"
          tone="violet"
          value={form.applicationKind}
          options={APPLICATION_KIND_OPTIONS.map((o) => ({ ...o, testId: `rc-app-${o.value}` }))}
          onChange={(v) => onReplace(changeApplicationKind(form, v))}
        />
      </FieldCard>
      {form.applicationKind !== "" && form.applicationKind !== "none" && (
        <FieldCard label="등록 신청일" required hint="2020.7.11.~8.17. 사이 신청일 — 2020.8.18.부터는 이 두 유형으로 새로 등록 신청할 수 없습니다.">
          <DateInput value={form.applicationDate} onChange={(v) => onPatch({ applicationDate: v })} data-testid="rc-application-date" />
        </FieldCard>
      )}
    </div>
  );
}

export function ReasonFacts(props: Props) {
  const { form } = props;
  if (form.reason === "other") return null;
  const title =
    form.reason === "rent_over_5pct"
      ? "§10③1호 — 확인할 사실"
      : form.reason === "registration_cancelled"
        ? "§10③2호 — 확인할 사실"
        : "§10③3호 — 확인할 사실";
  return (
    <ToneCard tone="violet" title={title} bodyClassName="space-y-3">
      <div data-testid="rc-reason-facts">
        {form.reason === "rent_over_5pct" && <Rent5pctFacts {...props} />}
        {form.reason === "registration_cancelled" && <CancelFacts {...props} />}
        {form.reason === "replacement_housing" && <ReplacementFacts {...props} />}
      </div>
    </ToneCard>
  );
}

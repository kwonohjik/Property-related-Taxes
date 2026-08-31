"use client";

/**
 * §97 시리즈 공통 입력 필드 묶음
 * - 등록일(DateInput)·세무서 등록(ToggleCard)·임대개시일(DateInput)
 * - 임대료 5% 증액 위반(RadioCardGroup, 3-state: "" 미선택)
 *   → "있음" 시 계약 이력 표 (최소 2행 안내)
 * - 유예 초과 공실(RadioCardGroup, 3-state: null 미선택)
 *   → "있음" 시 구간 [시작~종료] [+ 추가]
 *   ⚠️ 임계는 조문마다 다르다 — `vacancyGraceMonths` prop으로 받는다(D1-03).
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  RentalCommonFormFields,
  RentHistoryFormItem,
  VacancyPeriodFormItem,
} from "@/lib/stores/calc-wizard-asset-reduction";

interface Props {
  value: RentalCommonFormFields;
  onChange: (patch: Partial<RentalCommonFormFields>) => void;
  /** 섹션 번호 오프셋 — RentalCommonFields가 렌더하는 ③④ 섹션의 시작 번호 */
  sectionOffset?: number;
  /**
   * 공실 유예 개월 — 질문 문구와 안내를 가른다 (D1-03).
   * §97·§97의2·§97의3·§97의4 = 3 (조특칙 §44 「3월이내」)
   * §97의5 = 6 (조특령 §97의5①1호 「6개월 이내」)
   * 기본값을 두지 않는다 — 호출부가 조문을 명시하지 않으면 컴파일이 실패해야 한다.
   */
  vacancyGraceMonths: 3 | 6;
  /**
   * 임대기간 분 안분이 있는 조문인가 — §97의3⑤·§97의5②만 true (D2-06).
   * §97·§97의2·§97의4는 기준시가 안분이 없어 「임대 종료 시점」을 묻지 않는다.
   */
  hasGainProration?: boolean;
}

const CONTRACT_TYPE_LABELS: Record<RentHistoryFormItem["contractType"], string> = {
  jeonse: "전세",
  monthly: "월세",
  semi_jeonse: "반전세",
};

export function RentalCommonFields({ value, onChange, sectionOffset = 3, vacancyGraceMonths, hasGainProration = false }: Props) {
  const graceLabel = vacancyGraceMonths === 3 ? "3개월" : "6개월";
  const graceBasis =
    vacancyGraceMonths === 3
      ? "조특칙 §44 — 기존 임차인 퇴거일부터 다음 임차인 입주일까지 3월 이내는 임대기간에 산입"
      : "조특령 §97의5①1호 — 기존 임차인 퇴거일부터 다음 임차인 주민등록 이전일까지 6개월 이내는 계속 임대 간주";
  // ── 임대료 계약 이력 ──
  function addRentHistory() {
    const next: RentHistoryFormItem = {
      contractDate: "",
      contractType: "monthly",
      monthlyRent: "",
      deposit: "",
    };
    onChange({ rentHistory: [...(value.rentHistory ?? []), next] });
  }

  function removeRentHistory(idx: number) {
    onChange({ rentHistory: (value.rentHistory ?? []).filter((_, i) => i !== idx) });
  }

  function updateRentHistory(idx: number, patch: Partial<RentHistoryFormItem>) {
    onChange({
      rentHistory: (value.rentHistory ?? []).map((item, i) =>
        i === idx ? { ...item, ...patch } : item,
      ),
    });
  }

  // ── 공실 구간 ──
  function addVacancy() {
    const next: VacancyPeriodFormItem = { startDate: "", endDate: "" };
    onChange({ vacancyPeriods: [...(value.vacancyPeriods ?? []), next] });
  }

  function removeVacancy(idx: number) {
    onChange({ vacancyPeriods: (value.vacancyPeriods ?? []).filter((_, i) => i !== idx) });
  }

  function updateVacancy(idx: number, patch: Partial<VacancyPeriodFormItem>) {
    onChange({
      vacancyPeriods: (value.vacancyPeriods ?? []).map((item, i) =>
        i === idx ? { ...item, ...patch } : item,
      ),
    });
  }

  const sec3 = sectionOffset;
  const sec4 = sectionOffset + 1;

  return (
    <>
      {/* ③ 임대료 증액 제한 */}
      <ToneCard tone="violet" sectionNum={sec3} title="임대료 증액 제한 (§97의3①2호)" bodyClassName="space-y-2" noDark>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">임대료 5% 증액 위반 이력</p>
          <RadioCardGroup
            name="rentIncreaseViolationMode"
            layout="inline"
            tone="violet"
            value={value.rentIncreaseViolationMode}
            onChange={(v) => onChange({ rentIncreaseViolationMode: v as RentalCommonFormFields["rentIncreaseViolationMode"] })}
            options={[
              { value: "none", label: "없음" },
              { value: "has_violation", label: "있음" },
            ]}
          />
          {value.rentIncreaseViolationMode === "" && (
            <p className="mt-1 text-micro text-rose-600">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
          )}
        </div>

        {value.rentIncreaseViolationMode === "has_violation" && (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-violet-800">
              계약 이력 입력 (최소 2건 이상 — 위반 시점 확인용)
            </p>
            {(value.rentHistory ?? []).map((item, idx) => (
              <div key={idx} className="rounded-md border border-violet-200 bg-white/70 dark:bg-white/5 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-700">계약 {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeRentHistory(idx)}
                    className="text-micro text-rose-600 hover:underline"
                  >
                    삭제
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-caption font-medium">계약일</label>
                    <DateInput
                      value={item.contractDate}
                      onChange={(v) => updateRentHistory(idx, { contractDate: v })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-caption font-medium">계약 유형</label>
                    <Select
                      value={item.contractType}
                      onValueChange={(v) => v && updateRentHistory(idx, { contractType: v as RentHistoryFormItem["contractType"] })}
                    >
                      <SelectTrigger>
                        <SelectValue>{CONTRACT_TYPE_LABELS[item.contractType]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">월세</SelectItem>
                        <SelectItem value="jeonse">전세</SelectItem>
                        <SelectItem value="semi_jeonse">반전세</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(item.contractType === "monthly" || item.contractType === "semi_jeonse") && (
                    <div>
                      <label className="mb-1 block text-caption font-medium">월세 (원)</label>
                      <CurrencyInput
                        label=""
                        value={item.monthlyRent}
                        onChange={(v) => updateRentHistory(idx, { monthlyRent: v })}
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-caption font-medium">보증금 (원)</label>
                    <CurrencyInput
                      label=""
                      value={item.deposit}
                      onChange={(v) => updateRentHistory(idx, { deposit: v })}
                    />
                  </div>
                </div>
              </div>
            ))}
            {(value.rentHistory ?? []).length < 2 && (
              <p className="text-micro text-amber-700">
                ※ 최소 2건 입력 필요 (현재 {(value.rentHistory ?? []).length}건)
              </p>
            )}
            <button
              type="button"
              onClick={addRentHistory}
              className="text-xs text-violet-700 hover:underline font-medium"
            >
              + 계약 추가
            </button>
          </div>
        )}
      </ToneCard>

      {/* ④ 공실 기간 */}
      <ToneCard tone="sky" sectionNum={sec4} title="공실 기간" bodyClassName="space-y-2" noDark>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">
            {graceLabel}을 초과하는 공실 구간
          </p>
          <p className="mb-1.5 text-micro text-muted-foreground">{graceBasis}</p>
          <RadioCardGroup
            name="hasVacancyOverGrace"
            layout="inline"
            tone="sky"
            value={value.hasVacancyOverGrace === null ? "" : value.hasVacancyOverGrace ? "yes" : "no"}
            onChange={(v) => onChange({ hasVacancyOverGrace: v === "yes" ? true : false })}
            options={[
              { value: "no", label: "없음" },
              { value: "yes", label: "있음" },
            ]}
          />
          {value.hasVacancyOverGrace === null && (
            <p className="mt-1 text-micro text-rose-600">※ 반드시 선택하세요 (미선택 시 계산 불가)</p>
          )}
        </div>

        {value.hasVacancyOverGrace === true && (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-sky-800">공실 구간 입력</p>
            {(value.vacancyPeriods ?? []).map((period, idx) => (
              <div key={idx} className="flex items-center gap-2 flex-wrap">
                <DateInput
                  value={period.startDate}
                  onChange={(v) => updateVacancy(idx, { startDate: v })}
                />
                <span className="text-xs text-muted-foreground">~</span>
                <DateInput
                  value={period.endDate}
                  onChange={(v) => updateVacancy(idx, { endDate: v })}
                />
                <button
                  type="button"
                  onClick={() => removeVacancy(idx)}
                  className="text-micro text-rose-600 hover:underline"
                >
                  삭제
                </button>
              </div>
            ))}
            {(value.vacancyPeriods ?? []).length === 0 && (
              <p className="text-micro text-amber-700">※ 공실 구간을 1개 이상 추가하세요</p>
            )}
            <button
              type="button"
              onClick={addVacancy}
              className="text-xs text-sky-700 hover:underline font-medium"
            >
              + 구간 추가
            </button>
          </div>
        )}
      </ToneCard>

      {/* 임대 종료 시점 — 조특령 §97의3⑤ B · §97의5② (D2-06) */}
      {hasGainProration && (
        <ToneCard
          tone="violet"
          sectionNum={sec4 + 1}
          title="임대 종료 시점"
          bodyClassName="space-y-2"
          noDark
        >
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">임대가 양도일까지 계속되었습니까?</p>
            <p className="mb-1.5 text-micro text-muted-foreground">
              조특령 §97의3⑤·§97의5② — 안분 산식의 분자는 「실제 임대기간의 <strong>마지막 날</strong>의
              기준시가」입니다. 양도일 기준시가와 별개 변수여서, 임대를 끝내고 시간이 지난 뒤 양도했다면
              그 시점 기준시가가 따로 필요합니다.
            </p>
            <RadioCardGroup
              name="rentalContinuesToTransfer"
              layout="inline"
              tone="violet"
              value={
                value.rentalContinuesToTransfer === null
                  ? ""
                  : value.rentalContinuesToTransfer
                    ? "yes"
                    : "no"
              }
              onChange={(v) => onChange({ rentalContinuesToTransfer: v === "yes" })}
              options={[
                { value: "yes", label: "양도일까지 계속 임대" },
                { value: "no", label: "양도 전에 임대 종료" },
              ]}
            />
            {value.rentalContinuesToTransfer === null && (
              <p className="mt-1 text-micro text-rose-600">
                ※ 반드시 선택하세요 (미선택 시 계산 불가)
              </p>
            )}
          </div>

          {value.rentalContinuesToTransfer === false && (
            <div className="mt-2 border-t border-violet-200 pt-2">
              <CurrencyInput
                label="임대 종료일 당시 기준시가 (주택+부속토지 합계)"
                value={value.stdPriceAtRentalEnd}
                onChange={(v) => onChange({ stdPriceAtRentalEnd: v })}
              />
              <p className="mt-1 text-micro text-muted-foreground">
                산식의 B — 실제 임대기간 마지막 날의 기준시가
              </p>
            </div>
          )}
        </ToneCard>
      )}
    </>
  );
}

// ── 등록일·세무서 등록·임대개시일 공통 상단 필드 (섹션 ① 내부에서 사용) ──

interface RegistrationFieldsProps {
  registrationDate: string;
  isTaxRegistered: boolean;
  rentalStartDate: string;
  onRegistrationDateChange: (v: string) => void;
  onIsTaxRegisteredChange: (v: boolean) => void;
  onRentalStartDateChange: (v: string) => void;
}

export function RegistrationFields({
  registrationDate,
  isTaxRegistered,
  rentalStartDate,
  onRegistrationDateChange,
  onIsTaxRegisteredChange,
  onRentalStartDateChange,
}: RegistrationFieldsProps) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium">지자체 임대사업자 등록일</label>
        <DateInput value={registrationDate} onChange={onRegistrationDateChange} />
      </div>
      <ToggleCard
        variant="chip"
        checked={isTaxRegistered}
        onCheckedChange={onIsTaxRegisteredChange}
        title="세무서 사업자 등록"
        description="소득세법 §168 — 임대개시 인정 요건"
        tone="violet"
      />
      <div>
        <label className="mb-1 block text-xs font-medium">임대개시일</label>
        <DateInput value={rentalStartDate} onChange={onRentalStartDateChange} />
      </div>
    </div>
  );
}

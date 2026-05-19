"use client";

/**
 * ExitTaxBlock — 국외전출세 입력 블록 (PR-4B, ⑤ 동기화 지점)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 시행령: §178의8, §178의9, §178의10, §167의8
 *
 * 입력 순서 = 엔진 계산 로직 순서 (feedback_ui_order_follows_logic):
 *   거주자 요건(§118의9①) → 출국일 → 대주주 요건(§178의8) →
 *   보유 종목(§178의9) → 실양도(경정청구용) →
 *   납부유예(§118의16) → 외국납부세액(§118의13) → 보유현황 신고(§118의15)
 *
 * 3중 패턴 강제 (feedback_store_default_vs_ui_display_fallback):
 *   value={form.etField} — display fallback 단독 금지, factory default 사용
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   미입력 → validate 차단
 *
 * useEffect → store 미러링 금지 (feedback_useeffect_store_mirror_forbidden)
 * "원" 단위 표기 금지 (feedback_no_won_suffix)
 * SelectOnFocusProvider 전역 적용 — 개별 onFocus 불필요
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { ExitTaxHoldingsMatrix } from "@/components/calc/stock-transfer/ExitTaxHoldingsMatrix";
import type {
  StockTransferFormData,
  ExitTaxHoldingForm,
} from "@/lib/stores/calc-wizard-stock-store";

// ── 납부유예 사유 옵션 (§118의16) ──
const DEFERRAL_REASON_OPTIONS = [
  {
    value: "study_abroad",
    label: "국외유학 등 (10년 유예)",
    description: "§118의16② — 국외유학·취업·사업 등 대통령령에서 정하는 사유: 10년 연장",
  },
  {
    value: "other_10yr",
    label: "기타 10년 연장 사유",
    description: "§118의16② — 대통령령 기타 10년 유예 사유",
  },
  {
    value: "default_5yr",
    label: "일반 사유 (5년 유예)",
    description: "§118의16① — 위에 해당하지 않는 경우: 기본 5년 납부유예",
  },
];

// ── 외국납부세액 배제 사유 옵션 (§118의13②) ──
const FOREIGN_TAX_EXCLUSION_OPTIONS = [
  {
    value: "none",
    label: "배제 사유 없음 (공제 적용)",
    description: "§118의13① — 외국 납부 세액을 산출세액에서 공제",
  },
  {
    value: "credit_allowed",
    label: "외국정부가 산출세액에서 공제 허용 (1호)",
    description: "§118의13②1호 — 외국정부가 거주자 시절 납세액에 대해 공제를 허용",
  },
  {
    value: "step_up",
    label: "외국정부가 취득가액을 출국일 시가로 조정 (2호)",
    description: "§118의13②2호 — step-up basis 적용: 외국에서 출국일 시가를 취득가액으로 인정",
  },
];

// ── 섹션 박스 래퍼 ──
function SectionBox({
  n,
  label,
  tone,
  children,
}: {
  n: number;
  label: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-${tone}-200 bg-${tone}-50/40 p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full bg-${tone}-200 text-[10px] font-bold text-${tone}-800 select-none`}
        >
          {n}
        </span>
        <p className={`text-xs font-semibold text-${tone}-700`}>{label}</p>
      </div>
      {children}
    </div>
  );
}

interface ExitTaxBlockProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function ExitTaxBlock({ form, onChange }: ExitTaxBlockProps) {
  // 3중 패턴 default (factory default와 동일값)
  const deferralReason = form.etDeferralReason;         // factory: "none"
  const foreignTaxExclusionReason = form.etForeignTaxExclusionReason; // factory: "none"

  // 5년 미만 거주 경고 조건
  const residencyYears = parseDecimal(form.etYearsResidentLast10);
  const isResidencyShort = form.etYearsResidentLast10 !== "" && residencyYears < 5;

  return (
    <div className="space-y-5">
      {/* ── 섹션 1: 거주자 요건 (§118의9①1호) ── */}
      <SectionBox n={1} label="거주자 요건 (§118의9①1호)" tone="rose">
        <FieldCard
          label="출국일 전 10년 중 국내 거주 연수"
          hint="출국일 전 10년 중 국내에 주소 또는 거소를 둔 기간의 합계 (만 년). 5년 이상이어야 과세됩니다."
          required
          trailing={
            <span className="text-xs text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded">
              §118의9①1호
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <DecimalInput
              value={form.etYearsResidentLast10}
              onChange={(v) => onChange({ etYearsResidentLast10: v })}
              placeholder="국내 거주 연수 (만 년)"
              className="w-40"
            />
            <span className="text-sm text-slate-500">년</span>
          </div>
        </FieldCard>

        {isResidencyShort && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            거주 기간이 5년 미만입니다. §118의9①에 따라 납세의무가 없어 세액은 0으로 산출됩니다.
          </div>
        )}
      </SectionBox>

      {/* ── 섹션 2: 출국일 ── */}
      <SectionBox n={2} label="출국일" tone="sky">
        <FieldCard
          label="출국일"
          hint="비거주자가 된 날 (YYYY-MM-DD). 보유 주식의 간주양도 시점이 됩니다."
          required
          trailing={
            <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">
              §118의9①
            </span>
          }
        >
          <DateInput
            value={form.etDepartureDate}
            onChange={(v) => onChange({ etDepartureDate: v })}
          />
        </FieldCard>
      </SectionBox>

      {/* ── 섹션 3: 대주주 요건 (§178의8) ── */}
      <SectionBox n={3} label="대주주 요건 (§178의8 → §167의8 준용)" tone="violet">
        <ToggleCard
          title="직전 연도말 대주주 해당"
          description="§178의8 → §167의8 준용 — 출국일이 속하는 연도 직전 연도말 기준으로 대주주 요건에 해당하는 경우 과세됩니다. 자기 판정하여 입력하세요."
          checked={form.etIsMajorShareholder}
          onCheckedChange={(v) => onChange({ etIsMajorShareholder: v })}
          tone="violet"
          trailing={
            <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">
              §178의8
            </span>
          }
        />

        {!form.etIsMajorShareholder && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            대주주에 해당하지 않는 경우 §118의9①2호 요건 미충족으로 납세의무가 없습니다.
          </div>
        )}
      </SectionBox>

      {/* ── 섹션 4: 보유 종목 (§178의9) ── */}
      <SectionBox n={4} label="보유 종목 — 간주양도 대상 (§178의9)" tone="amber">
        <p className="text-xs text-amber-700 leading-relaxed">
          §118의9①: 국내 상장·비상장 주식 중 §94①3호 가·나목에 해당하는 보유 종목별로 입력하세요.
          각 종목의 출국일 시가(간주양도가액 = 시가 × 주수)가 양도차익 계산에 사용됩니다.
        </p>
        <ExitTaxHoldingsMatrix
          holdings={form.etHoldings}
          onChange={(holdings: ExitTaxHoldingForm[]) => onChange({ etHoldings: holdings })}
        />
      </SectionBox>

      {/* ── 섹션 5: 실양도 정보 (경정청구 §118의12~§118의15⑤) ── */}
      <SectionBox n={5} label="실양도 정보 — 경정청구용 (§118의12, 선택)" tone="emerald">
        <p className="text-xs text-emerald-700 leading-relaxed">
          납부유예 후 해외에서 실제로 양도한 경우, 실양도가액이 출국일 시가보다 낮으면
          §118의12 조정공제를 통해 환급청구할 수 있습니다.
          아직 실양도하지 않은 경우 비워두세요.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldCard
            label="실양도일"
            hint="해외에서 실제 주식을 양도한 날 (없으면 비워두세요)"
          >
            <DateInput
              value={form.etActualTransferDate}
              onChange={(v) => onChange({ etActualTransferDate: v })}
            />
          </FieldCard>
          <FieldCard
            label="실양도 1주당 단가 (원화 환산)"
            hint="실제 양도한 1주당 원화 환산 단가. §118의12 조정공제 계산에 사용됩니다."
          >
            <CurrencyInput
              label=""
              value={form.etActualTransferPricePerShare}
              onChange={(v) => onChange({ etActualTransferPricePerShare: v })}
              hideUnit
              placeholder="없으면 비워두세요"
            />
          </FieldCard>
        </div>
      </SectionBox>

      {/* ── 섹션 6: 납부유예 (§118의16) ── */}
      <ToggleCard
        title="납부유예 신청 (§118의16)"
        description="§118의16 — 비거주자가 된 날로부터 5년(또는 10년) 범위에서 납부 유예 가능. 유예 신청 시 이자상당액 부담."
        checked={form.etDeferralRequested}
        onCheckedChange={(v) =>
          onChange({
            etDeferralRequested: v,
            etDeferralReason: v ? form.etDeferralReason : "none",
          })
        }
        tone="sky"
        trailing={
          <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">
            §118의16
          </span>
        }
      >
        <div className="space-y-3 mt-3">
          <FieldCard label="납부유예 사유" required>
            <RadioCardGroup
              name="etDeferralReason"
              value={deferralReason === "none" ? "default_5yr" : deferralReason}
              onChange={(v) =>
                onChange({
                  etDeferralReason:
                    v === "default_5yr" ? "none" : (v as "study_abroad" | "other_10yr"),
                })
              }
              tone="sky"
              layout="stack"
              options={DEFERRAL_REASON_OPTIONS}
            />
          </FieldCard>
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-sky-700 leading-relaxed">
            이자상당액 = 유예 세액 × 유예 일수 × 일정 이율 (§178의10 참조).
            실제 이자는 결과 화면에서 안내됩니다.
          </div>
        </div>
      </ToggleCard>

      {/* ── 섹션 7: 외국납부세액 (§118의13) ── */}
      <ToggleCard
        title="외국납부세액 있음 (§118의13)"
        description="§118의13 — 납부유예 후 해외에서 실양도 시 외국에서 납부한 세액이 있는 경우. 배제 사유 없으면 산출세액에서 공제."
        checked={!!form.etForeignTaxPaid && form.etForeignTaxPaid !== ""}
        onCheckedChange={(v) => {
          if (!v) onChange({ etForeignTaxPaid: "", etForeignTaxExclusionReason: "none" });
        }}
        tone="violet"
        trailing={
          <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">
            §118의13
          </span>
        }
      >
        <div className="space-y-3 mt-3">
          <FieldCard
            label="외국납부세액 (원화 환산)"
            hint="해외에서 실양도 시 납부한 세액 (원화 환산). 공제 한도 초과분은 무시."
            required
          >
            <CurrencyInput
              label=""
              value={form.etForeignTaxPaid}
              onChange={(v) => onChange({ etForeignTaxPaid: v })}
              hideUnit
              placeholder="외국납부세액 (원화 환산)"
            />
          </FieldCard>

          <FieldCard label="§118의13② 배제 사유" required>
            <RadioCardGroup
              name="etForeignTaxExclusionReason"
              value={foreignTaxExclusionReason}
              onChange={(v) =>
                onChange({
                  etForeignTaxExclusionReason: v as
                    | "none"
                    | "credit_allowed"
                    | "step_up",
                })
              }
              tone="violet"
              layout="stack"
              options={FOREIGN_TAX_EXCLUSION_OPTIONS}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/* ── 섹션 8: 보유현황 신고 (§118의15) ── */}
      <SectionBox n={6} label="보유현황 신고 (§118의15)" tone="rose">
        <ToggleCard
          title="출국일 전날까지 보유현황 신고 완료"
          description="§118의15 — 출국일 전날까지 보유 주식 현황을 신고한 경우 미신고 가산세를 면제받습니다."
          checked={form.etHasFiledHoldingsReport}
          onCheckedChange={(v) => onChange({ etHasFiledHoldingsReport: v })}
          tone="rose"
          trailing={
            <span className="text-xs text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded">
              §118의15
            </span>
          }
        />

        {!form.etHasFiledHoldingsReport && (
          <div className="space-y-2">
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-700 leading-relaxed">
              미신고 가산세 = 보유 주식 액면금액 합계 × 2% (§118의15).
              액면금액이 없는 무액면주식은 자본금÷발행총주수로 환산합니다.
            </div>
            <FieldCard
              label="보유 주식 액면금액 합계 (원)"
              hint="출국일 전날 기준 보유 주식 전체의 액면금액 합계. 무액면주식은 자본금÷발행총주수로 환산."
            >
              <CurrencyInput
                label=""
                value={form.etTotalFaceValue}
                onChange={(v) => onChange({ etTotalFaceValue: v })}
                hideUnit
                placeholder="없으면 비워두세요"
              />
            </FieldCard>
          </div>
        )}
      </SectionBox>

      {/* ── 국내원천 원천징수 (§118의14, 선택) ── */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-600">
          비거주자 세액공제 (§118의14, 선택)
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          납부유예 후 국내에서 비거주자로 실양도 시 §156①7에 따라 원천징수된 세액이 있는 경우 입력하세요.
        </p>
        <FieldCard
          label="§156①7 국내원천 원천징수액 (원)"
          hint="비거주자 신분으로 실양도 시 국내 원천징수된 세액. 없으면 비워두세요."
        >
          <CurrencyInput
            label=""
            value={form.etDomesticSourceTaxWithheld}
            onChange={(v) => onChange({ etDomesticSourceTaxWithheld: v })}
            hideUnit
            placeholder="없으면 비워두세요"
          />
        </FieldCard>
      </div>
    </div>
  );
}

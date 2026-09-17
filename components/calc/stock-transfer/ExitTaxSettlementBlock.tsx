"use client";

/**
 * ExitTaxSettlementBlock — 국외전출세 **3단계**: 실양도 · 납부유예 · 외국납부세액 · 보유현황 신고
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` §3
 * 검증 짝: `validateStep3ExitTax`(실양도 단가 · 외국납부세액 · 원천징수액 · 액면금액 합계)
 *
 * ⚠️ 국내 Step3 의 ①필요경비는 국외전출세에서 **렌더되지 않는다** — 필요경비는 §118의10②가
 *   §97 을 준용해 **종목별 취득가액**으로 잡히고, 국내 `expenseMode`·`actualExpenses` 는
 *   exit body 에 실리지도 않는다(계획서 §1.3 실측).
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CURRENCY_OPTIONS } from "./currency-options";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";


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

export function ExitTaxSettlementBlock({ form, onChange }: StockStepBlockProps) {
  // 3중 패턴 default (factory default와 동일값)
  const deferralReason = form.etDeferralReason;         // factory: "none"
  const foreignTaxExclusionReason = form.etForeignTaxExclusionReason; // factory: "none"

  return (
    <div className="space-y-5">
      {/* ── 섹션 5: 실양도 정보 (경정청구 §118의12~§118의15⑤) ── */}
      <SectionBox label="실양도 정보 — 경정청구용 (§118의12, 선택)" tone="emerald">
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
            이자상당액 = 유예 세액 × 유예 일수 × 1일당 이자율 (§118의16④·시행령 §178의12③).
            아래 일수·이자율 입력 시 산출되며, 미입력 시 결과 화면에 안내만 표시됩니다.
          </div>
          <FieldCard label="납부유예 일수" hint="유예 시작 ~ 실제 납부일 일수 (정보성 산출용)">
            <DecimalInput
              value={form.etDeferralInterestDays}
              onChange={(v) => onChange({ etDeferralInterestDays: v })}
              unit="일"
            />
          </FieldCard>
          <FieldCard label="1일당 이자율" hint="국세기본법 시행령 §43의3②(연도별 변동) — 소수 입력 (예: 0.000022 = 1일 10만분의 22)">
            <DecimalInput
              value={form.etDeferralInterestDailyRate}
              onChange={(v) => onChange({ etDeferralInterestDailyRate: v })}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/* ── 섹션 6.5: 재전입 환급 (§118의17①1호) ── */}
      <ToggleCard
        title="5년 이내 재입국 거주자 (§118의17①1호)"
        description="출국일부터 5년 이내에 국외전출자 국내주식등을 양도하지 않고 국내에 다시 입국하여 거주자가 된 경우 — 납부세액 환급(납부 완료) 또는 납부유예 취소(유예 중) 예정액을 정보성으로 산출합니다. 실제 신청은 사유 발생일부터 1년 이내."
        checked={form.etReenteredWithin5Years}
        onCheckedChange={(v) => onChange({ etReenteredWithin5Years: v })}
        tone="emerald"
        trailing={
          <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded">
            §118의17
          </span>
        }
      />

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
            />

          {/*
            외화 + 기준환율 — §118의13 외국납부세액은 본래 **외국에서 낸 세금**이라 외화다.
            종전에는 원화 환산액만 받아 **사용자가 스스로 곱해** 넣어야 했고, 어떤 환율을
            썼는지 화면에 남지 않아 검산이 불가능했다.
            소득세법 시행령 §178의5 는 「수령·지출일 현재 외국환거래법 **기준환율 또는
            재정환율**」을 정한다 — 그 환율을 직접 넣으면 **환산은 엔진이** 한다.
            ⚠️ 외화·환율이 **둘 다** 있어야 환산한다. 하나만 넣으면 위 원화 입력이 그대로 쓰인다.
          */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FieldCard label="외국납부세액 (외화)" hint="외국에서 실제 납부한 금액">
              <DecimalInput
                value={form.etForeignTaxPaidForeign}
                onChange={(v) => onChange({ etForeignTaxPaidForeign: v })}
                placeholder="외화 금액"
              />
            </FieldCard>
            <FieldCard label="통화" hint="표시용 — 계산에는 쓰지 않습니다">
              <select
                value={form.etForeignTaxCurrencyCode}
                onChange={(e) => onChange({ etForeignTaxCurrencyCode: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FieldCard>
            <FieldCard
              label="납세일 기준환율"
              hint="외국환거래법 기준환율 또는 재정환율 (소득세법 시행령 §178의5)"
              unit={`KRW/${form.etForeignTaxCurrencyCode || "USD"}`}
            >
              <DecimalInput
                value={form.etForeignTaxExchangeRate}
                onChange={(v) => onChange({ etForeignTaxExchangeRate: v })}
                placeholder="납부일 기준환율"
              />
            </FieldCard>
          </div>
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
      <SectionBox label="보유현황 신고 (§118의15)" tone="rose">
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
              액면금액이 없는 무액면주식은 자본금을 발행총주수로 나누어 환산합니다.
            </div>
            <FieldCard
              label="보유 주식 액면금액 합계 (원)"
              hint="출국일 전날 기준 보유 주식 전체의 액면금액 합계. 무액면주식은 자본금을 발행총주수로 나누어 환산."
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

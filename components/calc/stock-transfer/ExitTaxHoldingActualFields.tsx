"use client";

/**
 * ExitTaxHoldingActualFields — 종목 1건의 **실제 양도 입력칸** (⑤ · PR-7b)
 *
 * 마운트: `ExitTaxActualTransferBlock`이 «실제 양도함» ToggleCard를 켠 종목의 children으로 렌더한다.
 * 칸 구성은 엔진 `ExitTaxHoldingActualTransfer`와 1:1이다(필드명 동일 — 검증 오류 경로가 곧 입력칸 앵커).
 *
 *  - 양도 주식 수 · 실제 양도일
 *  - 1주당 양도가: 국내 종목 = 원화 / 국외주식 = 외화 + 실제 양도일 기준환율(반대 쪽 칸은 아예 없다 — ④도 싣지 않는다)
 *  - 외국납부세액: 이 종목의 것만(총액을 종목에 자동 안분하지 않는다). 원화 또는 외화+환율 **한쪽만**
 *  - 비거주자 원천징수액: 외국법인 발행 국외주식(2호)에는 칸이 없다(엔진 V-14 — `holdingAllowsDomesticWithholding`이 UI·④·⑧ 단일 기준)
 *
 * 숨은 값 금지(#3707): 외국납부세액 토글을 끄거나 입력 방식(원화↔외화)을 바꾸면 안 쓰게 된 쪽 값을 비운다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import { holdingAllowsDomesticWithholding } from "@/lib/calc/stock-transfer-exit-tax-actual-mode";
import { createEmptyExitTaxActualTransfer } from "@/lib/stores/calc-wizard-stock-store";
import type {
  ExitTaxHoldingActualForm,
  ExitTaxHoldingForm,
} from "@/lib/stores/calc-wizard-stock-store";
import { CURRENCY_OPTIONS } from "./currency-options";

const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400";

const RATE_HINT =
  "외국환거래법에 따른 기준환율(없으면 재정환율)입니다 — 대고객 매입률·매도율이 아닙니다. 환산 기준일은 법령에 명시가 없어 결과에서 확인 필요로 고지됩니다.";

const FOREIGN_TAX_METHOD_OPTIONS = [
  { value: "krw", label: "원화로 입력", description: "외국납부세액을 원화로 환산한 금액을 그대로 입력" },
  {
    value: "foreign",
    label: "외화 + 납세일 기준환율로 입력",
    description: "소득세법 시행령 §178의5 — 외화 금액과 납세일 기준환율을 입력하면 엔진이 환산",
  },
] as const;

interface Props {
  holding: ExitTaxHoldingForm;
  actual: ExitTaxHoldingActualForm;
  /** 종목 순번(0부터) — 검증 오류 → 입력칸 이동 앵커(`etHoldings[i].actualTransfer.key`) */
  index: number;
  onChange: (patch: Partial<ExitTaxHoldingActualForm>) => void;
}

export function ExitTaxHoldingActualFields({ holding, actual, index, onChange }: Props) {
  const at = (key: keyof ExitTaxHoldingActualForm) => `etHoldings[${index}].actualTransfer.${key}`;
  const isForeign = holding.marketType === "foreign_stock";
  const taxInput = actual.foreignTaxInput;
  const withholdingAllowed = holdingAllowsDomesticWithholding(holding);
  // 허용되지 않는 종목에 값이 남아 있으면(시장·발행 구분을 바꾼 뒤) 칸을 보여 지울 수 있게 한다 — ⑧이 막는다
  const showWithholding = withholdingAllowed || actual.domesticSourceTaxWithheld !== "";
  const blank = createEmptyExitTaxActualTransfer();

  return (
    <div className="mt-3 space-y-3" data-testid={`exit-actual-fields-${holding.id}`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldCard
          label="실제 양도 주식 수"
          required
          stacked
          hint={`보유 주식 수 이하로 입력하세요. 일부만 양도했으면 양도한 만큼만 조정공제·외국납부세액공제에 들어갑니다 (보유 ${holding.shareCount || "미입력"}주)`}
          field={at("shareCount")}
        >
          <CurrencyInput
            label=""
            value={actual.shareCount}
            onChange={(v) => onChange({ shareCount: v })}
            hideUnit
            placeholder="양도한 주식 수 (주)"
          />
        </FieldCard>
        <FieldCard
          label="실제 양도일"
          stacked
          hint="선택 — 출국일보다 앞서면 막힙니다. 국외주식의 환산 기준환율은 이 날의 기준환율입니다"
          field={at("transferDate")}
        >
          <DateInput value={actual.transferDate} onChange={(v) => onChange({ transferDate: v })} />
        </FieldCard>

        {isForeign ? (
          <>
            <FieldCard label="1주당 실제 양도가 (외화)" required stacked field={at("priceForeign")}>
              <DecimalInput
                value={actual.priceForeign}
                onChange={(v) => onChange({ priceForeign: v })}
                placeholder="1주당 외화 양도가"
                thousandSeparator
              />
            </FieldCard>
            <FieldCard
              label="실제 양도일 기준환율 (원/외화)"
              required
              stacked
              hint={RATE_HINT}
              field={at("exchangeRate")}
            >
              <DecimalInput
                value={actual.exchangeRate}
                onChange={(v) => onChange({ exchangeRate: v })}
                placeholder="실제 양도일 기준환율"
                thousandSeparator
              />
            </FieldCard>
          </>
        ) : (
          <FieldCard label="1주당 실제 양도가 (원)" required stacked field={at("pricePerShare")}>
            <CurrencyInput
              label=""
              value={actual.pricePerShare}
              onChange={(v) => onChange({ pricePerShare: v })}
              hideUnit
              placeholder="1주당 원화 양도가"
            />
          </FieldCard>
        )}
      </div>

      {/* ── 이 종목의 외국납부세액 (§118의13①) ── */}
      <ToggleCard
        title="이 종목에 외국납부세액 있음 (§118의13①)"
        description="해당 자산의 양도소득에 대해 외국정부에 납부한 세액입니다. 총액을 종목에 나누어 주지 않으므로 종목마다 입력합니다."
        checked={taxInput !== "none"}
        onCheckedChange={(v) => {
          if (v) {
            onChange({ foreignTaxInput: "krw" });
            return;
          }
          // 끌 때는 외국납부세액 칸을 전부 초기값으로 — 숨은 값이 body로 나가지 않게
          onChange({
            foreignTaxInput: "none",
            foreignTaxPaid: blank.foreignTaxPaid,
            foreignTaxPaidForeign: blank.foreignTaxPaidForeign,
            foreignTaxCurrencyCode: blank.foreignTaxCurrencyCode,
            foreignTaxExchangeRate: blank.foreignTaxExchangeRate,
          });
        }}
        tone="violet"
        size="sm"
        data-testid={`exit-actual-foreign-tax-toggle-${holding.id}`}
      >
        <div className="mt-3 space-y-3">
          <RadioCardGroup
            name={`exit-actual-foreign-tax-method-${holding.id}`}
            value={taxInput === "foreign" ? "foreign" : "krw"}
            onChange={(v) =>
              // 입력 방식을 바꾸면 쓰지 않게 된 쪽을 비운다 — 엔진은 원화·외화 동시 입력을 거부한다
              onChange(
                v === "krw"
                  ? {
                      foreignTaxInput: "krw",
                      foreignTaxPaidForeign: blank.foreignTaxPaidForeign,
                      foreignTaxCurrencyCode: blank.foreignTaxCurrencyCode,
                      foreignTaxExchangeRate: blank.foreignTaxExchangeRate,
                    }
                  : { foreignTaxInput: "foreign", foreignTaxPaid: blank.foreignTaxPaid },
              )
            }
            tone="violet"
            layout="stack"
            options={[...FOREIGN_TAX_METHOD_OPTIONS]}
          />
          {taxInput === "krw" && (
            <FieldCard label="외국납부세액 (원화 환산)" required stacked field={at("foreignTaxPaid")}>
              <CurrencyInput
                label=""
                value={actual.foreignTaxPaid}
                onChange={(v) => onChange({ foreignTaxPaid: v })}
                hideUnit
                placeholder="원화로 환산한 외국납부세액"
              />
            </FieldCard>
          )}
          {taxInput === "foreign" && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FieldCard label="외국납부세액 (외화)" required stacked field={at("foreignTaxPaidForeign")}>
                <DecimalInput
                  value={actual.foreignTaxPaidForeign}
                  onChange={(v) => onChange({ foreignTaxPaidForeign: v })}
                  placeholder="외화 금액"
                  thousandSeparator
                />
              </FieldCard>
              <FieldCard label="통화" stacked hint="표시용 — 계산에는 쓰지 않습니다" field={at("foreignTaxCurrencyCode")}>
                <select
                  value={actual.foreignTaxCurrencyCode}
                  onChange={(e) => onChange({ foreignTaxCurrencyCode: e.target.value })}
                  className={SELECT_CLASS}
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FieldCard>
              <FieldCard
                label="납세일 기준환율"
                required
                stacked
                hint="외국환거래법 기준환율 또는 재정환율 (소득세법 시행령 §178의5)"
                field={at("foreignTaxExchangeRate")}
              >
                <DecimalInput
                  value={actual.foreignTaxExchangeRate}
                  onChange={(v) => onChange({ foreignTaxExchangeRate: v })}
                  placeholder="납세일 기준환율"
                  thousandSeparator
                />
              </FieldCard>
            </div>
          )}
        </div>
      </ToggleCard>

      {/* ── 비거주자 세액공제 (§118의14①) — 외국법인 발행 국외주식(2호)에는 칸이 없다 ── */}
      {showWithholding && (
        <FieldCard
          label="비거주자 원천징수액 (§156①7)"
          stacked
          hint={
            withholdingAllowed
              ? "비거주자로서 국내에서 양도해 원천징수된 세액이 있을 때만 입력하세요. 없으면 비워두세요"
              : "외국법인이 발행한 국외주식에는 쓸 수 없습니다 — 값을 지우세요. 외국정부에 낸 세액은 위 외국납부세액으로 입력합니다"
          }
          field={at("domesticSourceTaxWithheld")}
        >
          <CurrencyInput
            label=""
            value={actual.domesticSourceTaxWithheld}
            onChange={(v) => onChange({ domesticSourceTaxWithheld: v })}
            hideUnit
            placeholder="없으면 비워두세요"
          />
        </FieldCard>
      )}
    </div>
  );
}

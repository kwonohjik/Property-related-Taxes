"use client";

/**
 * ExitTaxForeignHoldingFields — 국외전출세 보유 종목 카드 안의 **국외주식(§94①3호 다목) 입력** (⑤)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.ui.plan.md` §4.2 · D-4 · D-8
 * 마운트: `ExitTaxHoldingsMatrix`가 시장 «국외주식» 행에만 렌더한다(국내 행 DOM은 불변).
 *
 * - 금액은 **외화 전용 필드**로만 받는다(D-4). 원화 칸을 «국외면 외화로 읽기»로 재사용하지 않는다.
 * - 환산(외화 × 환율 × 주수)은 엔진 leaf(`toKrwExact`)가 한다 — 아래 참고 칩도 같은 함수를 부른다.
 * - 환율·외화 단가는 대체하지 않는다: 비우면 ⑧이 차단한다(자동 환산·보간 없음).
 * - 출국일이 2027.1.1. 이전이면 행을 지우지 않고 안내만 한다(사용자 결정 C-4) — 엔진이 제외하고 결과에 사유를 싣는다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { COUNTRY_OPTIONS } from "@/components/calc/foreign/foreign-options";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { foreignDepartureValueKrw } from "@/lib/calc/stock-transfer-exit-tax-fx-preview";
import { CURRENCY_OPTIONS } from "./currency-options";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";

const FOREIGN_MODE_OPTIONS: {
  value: ExitTaxHoldingForm["departureDayValuationMode"];
  label: string;
  description: string;
}[] = [
  {
    value: "foreign_market_price",
    label: "출국일 거래가액",
    description: "§178의9① — 출국일 당시 거래가액(외화 1주당)",
  },
  {
    value: "foreign_decree_178_3",
    label: "시행령 §178의3 시가",
    description: "§178의9②3호 — 영 §178의3에 따라 산정한 시가(외화 1주당)를 직접 입력",
  },
];

const RATE_HINT =
  "외국환거래법에 따른 기준환율(없으면 재정환율)입니다 — 대고객 매입률·매도율이 아닙니다. 환산 기준일은 법령에 명시가 없어 확인 필요로 고지됩니다.";

const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

interface Props {
  holding: ExitTaxHoldingForm;
  /** 종목 순번(0부터) — 검증 오류 → 입력칸 이동 앵커(`etHoldings[i].key`)에 쓴다 */
  index: number;
  /** 출국일이 2027.1.1. 이후인가 (`isExitTaxFrom2027`) */
  era: boolean;
  onChange: (patch: Partial<ExitTaxHoldingForm>) => void;
}

export function ExitTaxForeignHoldingFields({ holding, index, era, onChange }: Props) {
  const at = (key: keyof ExitTaxHoldingForm) => `etHoldings[${index}].${key}`;
  const isForeignCorp = holding.isListedForeignCorp;
  const previewKrw = foreignDepartureValueKrw(holding);

  return (
    <div className="space-y-3" data-testid="exit-foreign-holding-fields">
      {!era && (
        <ToneCard tone="rose" title="2027.1.1. 이전 출국분은 국외주식등이 과세 대상이 아닙니다">
          <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
            출국일이 2027.1.1. 이후일 때만 국외주식등(§94①3호 다목)이 국외전출자 주식등에 포함됩니다(소득세법 부칙 제8조 — 기준은
            실제 양도일이 아니라 출국일). 지금 출국일에서는 이 종목이 계산에서 제외되고, 제외 사유가 결과에 표시됩니다. 출국일을
            확인하거나 시장을 바꾸세요 — 입력한 종목은 지우지 않습니다.
          </p>
        </ToneCard>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldCard label="발행국가" stacked>
          <select
            value={holding.countryCode}
            onChange={(e) => onChange({ countryCode: e.target.value })}
            className={SELECT_CLASS}
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>
        <FieldCard label="통화" stacked>
          <select
            value={holding.foreignCurrencyCode}
            onChange={(e) => onChange({ foreignCurrencyCode: e.target.value })}
            className={SELECT_CLASS}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>
      </div>

      <ToggleCard
        title="외국법인 발행 주식"
        description="ON = §157의3 1호(외국법인 발행 주식). OFF = §157의3 2호(내국법인 발행 주식, 해외 증권시장 상장). 둘 다 §94①3호 다목 국외주식등이지만 중소기업 10%(§118의11 2호 가목)는 내국법인(2호)만 해당됩니다."
        checked={isForeignCorp}
        // 1호(외국법인)로 되돌리면 중소기업 선택을 함께 지운다 — 내국법인 기준이라 stale 값이 남으면 10%가 붙을 수 있다(④도 같은 게이트)
        onCheckedChange={(v) => onChange(v ? { isListedForeignCorp: true, isSmallMediumEnterprise: false } : { isListedForeignCorp: false })}
        tone="sky"
        size="sm"
        data-testid="exit-foreign-corp-toggle"
      />
      {!isForeignCorp && (
        <ToggleCard
          title="중소기업 (§118의11 2호 가목 — 세율 10%)"
          description="「중소기업기본법」 §2에 따른 중소기업이면 세율이 20%에서 10%가 됩니다. 중소기업 여부는 납세자만 아는 사실이라 추정하지 않으며, 켜지 않으면 2호 나목(20%)으로 계산합니다."
          checked={holding.isSmallMediumEnterprise}
          onCheckedChange={(v) => onChange({ isSmallMediumEnterprise: v })}
          tone="sky"
          size="sm"
          data-testid="exit-foreign-sme-toggle"
        />
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldCard label="주식수" required stacked field={at("shareCount")}>
          <CurrencyInput
            label=""
            value={holding.shareCount}
            onChange={(v) => onChange({ shareCount: v })}
            hideUnit
            placeholder="보유 주식수 (주)"
          />
        </FieldCard>
        <FieldCard label="취득일" required stacked field={at("acquisitionDate")}>
          <DateInput value={holding.acquisitionDate} onChange={(v) => onChange({ acquisitionDate: v })} />
        </FieldCard>
        <FieldCard label="취득가액 (외화 1주당)" required stacked field={at("perShareAcquisitionPriceForeign")}>
          <DecimalInput
            value={holding.perShareAcquisitionPriceForeign}
            onChange={(v) => onChange({ perShareAcquisitionPriceForeign: v })}
            placeholder="1주당 외화 취득가액"
            thousandSeparator
          />
        </FieldCard>
        <FieldCard
          label="취득일 기준환율 (원/외화)"
          required
          stacked
          hint={RATE_HINT}
          field={at("acquisitionExchangeRate")}
        >
          <DecimalInput
            value={holding.acquisitionExchangeRate}
            onChange={(v) => onChange({ acquisitionExchangeRate: v })}
            placeholder="취득일 기준환율"
            thousandSeparator
          />
        </FieldCard>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
          출국일 시가 산정 방법 (§178의9 · 영 §178의3)
        </label>
        <RadioCardGroup
          name={`departureDayValuationMode-${holding.id}`}
          value={holding.departureDayValuationMode}
          onChange={(v) => onChange({ departureDayValuationMode: v })}
          tone="amber"
          layout="stack"
          options={FOREIGN_MODE_OPTIONS}
        />
        <p className="text-caption text-gray-600 dark:text-gray-400">
          비상장 국외주식의 보충적 평가(순손익·순자산)는 입력받지 않습니다 — 영 §178의3으로 산정한 시가를 외화 1주당으로 직접 입력하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldCard label="출국일 시가 (외화 1주당)" required stacked field={at("departureDayPriceForeign")}>
          <DecimalInput
            value={holding.departureDayPriceForeign}
            onChange={(v) => onChange({ departureDayPriceForeign: v })}
            placeholder="출국일 1주당 외화 시가"
            thousandSeparator
          />
        </FieldCard>
        <FieldCard
          label="출국일 기준환율 (원/외화)"
          required
          stacked
          hint={RATE_HINT}
          field={at("departureExchangeRate")}
        >
          <DecimalInput
            value={holding.departureExchangeRate}
            onChange={(v) => onChange({ departureExchangeRate: v })}
            placeholder="출국일 기준환율"
            thousandSeparator
          />
        </FieldCard>
      </div>

      {previewKrw !== null && (
        <div
          className="rounded bg-amber-100/60 border border-amber-200 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200 dark:bg-amber-900/40"
          data-testid="exit-foreign-preview-chip"
        >
          간주양도가액 참고 (원화 환산): 외화 시가 × 출국일 기준환율 × 주식수 ={" "}
          <span className="font-semibold">{previewKrw.toLocaleString("ko-KR")}</span>
        </div>
      )}
    </div>
  );
}

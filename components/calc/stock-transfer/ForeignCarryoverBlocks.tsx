"use client";

/**
 * ForeignCarryoverBlocks — 국외주식(§94①3호다목) **§97의2① 이월과세** 입력 3섹션 (⑤ 위젯)
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §3.2·§4 · 본문 §4(Q-1·Q-2·Q-10)
 *
 * 입력은 국외 마법사의 원칙 「입력 = 그 단계의 주제」를 따라 **세 단계에 나뉜다**(Q-10).
 *   1단계 `ForeignCarryoverGateSection`        게이트 토글 + 증여자 취득일·관계·사망
 *   2단계 `ForeignCarryoverDonorPriceSection`  증여자 취득가액(외화 + 증여자 취득일 환율)
 *   3단계 `ForeignCarryoverExpenseSection`     증여자 자본적지출(지출일 환율) + 증여세 상당액
 *
 * 🔑 게이트는 국내와 **같은 `acquisitionCause`** 를 쓴다 — 토글 ON이면 `"carryover_gift"`, OFF이면 `"purchase"`.
 *    술어는 raw cause(`isForeignCarryoverForm`)다 — ④·⑧과 같은 leaf.
 * 🔑 토글을 꺼도 입력값은 **지우지 않는다**(`useEffect → store` 미러링 금지 · 다시 켜면 복원). ④가 술어로
 *    막아 숨은 값이 body에 새지 않게 한다.
 * 🔑 국외 이월과세는 **필요경비만** 바꾼다 — §104②가 12호(국외주식)를 열거하지 않아 세율·보유기간은 그대로다.
 *    그래서 「증여자 취득일 기산」 같은 세율 문구를 쓰지 않는다.
 * ⛔ 국내 donor 원화 필드(`donorAcquisitionPrice`·`donorCapitalExpenditure`)는 여기서 읽지 않는다 —
 *    외화로 조용히 재해석되는 stale-단위 함정.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { perShareKrwPreview } from "@/components/calc/foreign/krw-of";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CarryoverGateFields } from "./CarryoverGateFields";
import { CarryoverGiftTaxFields } from "./CarryoverGiftTaxFields";
import { CURRENCY_OPTIONS } from "./currency-options";
import { SectionBox, FG_ACQ_MODE_OPTIONS, type ForeignStockSectionProps } from "./foreign-stock-shared";

/** 1단계 §3 — 게이트 토글 + 증여자 취득일·관계·사망 */
export function ForeignCarryoverGateSection({ form, onChange }: ForeignStockSectionProps) {
  // 3중 패턴 — store factory default `"purchase"` = ④·⑧ 술어 = 이 표시 (`||` display fallback 쓰지 않는다)
  const checked = form.acquisitionCause === "carryover_gift";
  return (
    <SectionBox n={3} label="증여받은 주식 — 이월과세 (§97의2①)" tone="amber">
      <ToggleCard
        title="배우자·직계존비속에게 증여받은 주식입니다 (이월과세)"
        description={
          <>
            증여받은 날부터 <strong>1년 이내</strong> 양도(§94①3호 자산)하고 <strong>2025.1.1. 이후</strong>{" "}
            증여받은 주식만 대상입니다. 적용하면 취득가액은 증여자가 취득할 당시의 금액으로 승계되고
            증여세 상당액이 필요경비에 산입됩니다. 국외주식은 단일세율이라 세율·보유기간은 바뀌지 않고
            필요경비만 바뀝니다. 증여자 취득가액은 <strong>2단계</strong>, 자본적지출·증여세는{" "}
            <strong>3단계</strong>에서 입력합니다.
          </>
        }
        checked={checked}
        onCheckedChange={(v) => onChange({ acquisitionCause: v ? "carryover_gift" : "purchase" })}
        tone="amber"
        data-testid="fg-carryover-toggle"
      >
        <CarryoverGateFields
          form={form}
          onChange={onChange}
          dateLabel="증여자 취득일"
          dateHint="증여자가 취득한 날 — 2단계 증여자 취득가액의 환율 기준일입니다"
        />
      </ToggleCard>
    </SectionBox>
  );
}

/** 2단계 §3 — 증여자 취득가액 (외화 + 증여자 취득일 환율) */
export function ForeignCarryoverDonorPriceSection({ form, onChange }: ForeignStockSectionProps) {
  const mode = form.donorAcquisitionModeFS; // factory: "actual"
  const cur = form.donorAcquisitionCurrencyCode; // factory: "USD"
  const krw = (() => {
    const rate = parseDecimal(form.donorAcquisitionExchangeRate);
    const perShare = parseDecimal(form.donorPerShareAcquisitionPriceForeign);
    const count = parseInt((form.shareCount || "0").replace(/,/g, ""), 10);
    return perShareKrwPreview(perShare, count, rate);
  })();

  return (
    <SectionBox n={3} label="증여자 취득가액 — 이월과세 (§97의2①1호 · 영 §178의5)" tone="amber">
      <ToneCard tone="amber" bodyClassName="space-y-1">
        <p className="text-xs">
          ⓘ 위 「취득가액」 칸은 <strong>증여받은 날의 평가액</strong>이며, 이월과세가 적용되지 않을 때(배제·요건
          불충족) 쓰입니다. 이월과세를 적용하면 아래 증여자 취득가액이 취득가액이 됩니다 — 환율은{" "}
          <strong>증여자 취득일</strong>의 것입니다 (<LawArticleModal legalBasis="소득세법 시행령 §178의5" label="영 §178의5①" />).
        </p>
      </ToneCard>

      <FieldCard label="증여자 취득가액 산정 방식" required>
        <RadioCardGroup
          name="donorAcquisitionModeFS"
          value={mode}
          onChange={(v) => onChange({ donorAcquisitionModeFS: v as "actual" | "market_price" })}
          tone="amber"
          layout="inline"
          options={FG_ACQ_MODE_OPTIONS}
        />
      </FieldCard>

      {mode === "market_price" && (
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p className="text-xs">
            영 §178의3 시가 — 증여자 취득일 기준으로 산정한 1주당 가격을 아래 「1주당 증여자 취득가액」 칸에 직접
            입력하세요.
          </p>
        </ToneCard>
      )}

      <FieldCard label="증여자 취득 통화" required>
        <select
          value={cur}
          onChange={(e) => onChange({ donorAcquisitionCurrencyCode: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </FieldCard>

      <FieldCard
        label="증여자 취득일 기준환율"
        hint="1단계에 입력한 증여자 취득일의 대고객 매매기준율 (원/외화)."
        required
        unit={`KRW/${cur || "USD"}`}
      >
        <DecimalInput
          value={form.donorAcquisitionExchangeRate}
          onChange={(v) => onChange({ donorAcquisitionExchangeRate: v })}
          placeholder="증여자 취득일 기준환율"
        />
      </FieldCard>

      <FieldCard
        label={mode === "market_price" ? "1주당 증여자 취득가액 — 시가 (외화)" : "1주당 증여자 취득가액 (외화)"}
        hint={
          mode === "market_price"
            ? "위 안내대로 산정한 1주당 평균가격 (외화 기준)"
            : "증여자가 취득할 당시의 실지거래가액 (외화 기준)"
        }
        required
        unit={cur || "USD"}
      >
        <DecimalInput
          value={form.donorPerShareAcquisitionPriceForeign}
          onChange={(v) => onChange({ donorPerShareAcquisitionPriceForeign: v })}
          placeholder="증여자 외화 취득 단가"
        />
      </FieldCard>

      {krw !== null && (
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p className="text-xs">증여자 취득가액(원화 환산 참고): {krw.toLocaleString()}</p>
        </ToneCard>
      )}
    </SectionBox>
  );
}

/** 3단계 — 증여자 자본적지출(외화 + 지출일 환율) + 증여세 상당액 */
export function ForeignCarryoverExpenseSection({ form, onChange }: ForeignStockSectionProps) {
  const cur = form.donorAcquisitionCurrencyCode;
  // 지출일 환율 칸은 금액을 넣었을 때만 보인다 — 값은 남긴다(기존 필요경비 환율 칸과 같은 규약).
  const hasCapex = (parseFloat((form.donorCapitalExpenditureForeign || "").replace(/,/g, "")) || 0) > 0;

  return (
    <SectionBox label="증여자 필요경비 — 이월과세 (§97의2①2호·3호)" tone="amber">
      <FieldCard
        label="증여자 자본적지출액 (외화)"
        hint="증여자가 그 주식에 지출한 자본적지출. 양도비는 포함하지 않습니다. 없으면 비워두세요."
        unit={cur || "USD"}
      >
        <DecimalInput
          value={form.donorCapitalExpenditureForeign}
          onChange={(v) => onChange({ donorCapitalExpenditureForeign: v })}
          placeholder="없으면 비워두세요"
        />
      </FieldCard>

      {hasCapex && (
        <FieldCard
          label="증여자 자본적지출 지출일 기준환율"
          hint="증여자가 자본적지출액을 지출한 날의 기준환율 (원/외화) — 영 §178의5①. 비워둘 수 없습니다 — 양도일 환율로 대신하지 않습니다."
          required
          unit={`KRW/${cur || "USD"}`}
        >
          <DecimalInput
            value={form.donorCapitalExpenditureExchangeRate}
            onChange={(v) => onChange({ donorCapitalExpenditureExchangeRate: v })}
            placeholder="지출일 기준환율"
          />
        </FieldCard>
      )}

      <CarryoverGiftTaxFields form={form} onChange={onChange} showHoldingPeriodNote={false} />
    </SectionBox>
  );
}

"use client";

/**
 * EstateBodyConvertibleBond — 전환사채등(전환사채·신주인수권부사채·신주인수권증권·신주인수권증서) 입력
 *
 * 상증법 §63①2호·상증령 §58의2.
 *   A 거래소 거래: Max(2개월 종가평균, 최근일 최종시세) / 실적無 매입가+미수이자 or 처분예상
 *   B 비거래소: 전환금지/가능 × 4종. PV(R)=발행가액, PV(r)=적정할인율 현가, 배당차액 §57③.
 * 평가기준일은 lib/calc가 cbValuationDate로 주입(엔진 할인율·일수 산정). UI는 입력만.
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { resolveReceivableDiscountRate } from "@/lib/tax-engine/data/gift-deemed-rates";
import type { CbSecurityType } from "@/lib/tax-engine/types/inheritance-gift.types";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SECURITY_OPTIONS: { value: CbSecurityType; label: string; description: string }[] = [
  { value: "convertible_bond", label: "전환사채", description: "주식 전환권 부여 사채 (CB)" },
  { value: "bond_with_warrant", label: "신주인수권부사채", description: "신주인수권 부여 사채 (BW)" },
  { value: "warrant_certificate", label: "신주인수권증권", description: "분리형 신주인수권 (Warrant)" },
  { value: "preemptive_right", label: "신주인수권증서", description: "유상증자 신주인수 권리 (증서)" },
];

const cur = (v: number | undefined) => (v != null ? String(v) : "");
const dec = (v: number | undefined) => (v != null ? String(v) : "");

export function EstateBodyConvertibleBond({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);
  const securityType = item.cbSecurityType ?? "convertible_bond";
  const isPreemptive = securityType === "preemptive_right";
  const isWarrantFamily = securityType !== "convertible_bond"; // 신주인수가액 필요(나·다·라)
  const traded = item.cbTradedOnExchange ?? false;

  // 평가기준일 기준 자동 적정할인율 (엔진과 동일 헬퍼 — dual-truth 금지)
  const autoRate = valuationDate ? resolveReceivableDiscountRate(valuationDate) : undefined;
  const autoRatePct = autoRate ? (autoRate.numer * 100) / autoRate.denom : undefined;

  return (
    <div data-testid={`estate-body-variant-convertible-bond-${item.id}`} className="space-y-3">
      <EstateBodySection
        title="전환사채등 평가"
        subtitle="상증법 §63①2호·상증령 §58의2 — 전환사채·신주인수권부사채·신주인수권증권·증서"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○사 전환사채)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* 증권 종류 */}
        <FieldCard label="증권 종류">
          <RadioCardGroup
            name={`cb-security-type-${item.id}`}
            options={SECURITY_OPTIONS}
            value={securityType}
            onChange={(v) => set({ cbSecurityType: v as CbSecurityType })}
            tone="sky"
          />
        </FieldCard>

        {/* 거래소 거래 여부 */}
        <ToggleCard
          checked={traded}
          onCheckedChange={(v) => set({ cbTradedOnExchange: v })}
          title={isPreemptive ? "거래소 거래 (전체거래일 종가평균)" : "거래소 거래 (§58①1호 준용)"}
          description="ON: 한국거래소 거래분 / OFF: 비거래소 보충적 평가(§58의2②)"
          tone="rose"
        >
          {isPreemptive ? (
            <FieldCard label="전체 거래일 종가평균" unit="원" hint="라목1 — 상장 신주인수권증서">
              <CurrencyInput
                label="종가평균"
                value={cur(item.cbExchange2mAvg)}
                onChange={(v) => set({ cbExchange2mAvg: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`cb-2m-avg-${item.id}`}
              />
            </FieldCard>
          ) : (
            <div className="space-y-2">
              <ToggleCard
                checked={item.cbHasTradeRecord ?? false}
                onCheckedChange={(v) => set({ cbHasTradeRecord: v })}
                title="평가기준일 이전 2개월 거래실적 있음"
                description="OFF: 거래실적 없음 → 매입가액 또는 처분예상금액"
                tone="sky"
                variant="chip"
              />
              {item.cbHasTradeRecord ? (
                <>
                  <FieldCard label="평가기준일 이전 2개월 종가평균" unit="원">
                    <CurrencyInput
                      label="2개월 종가평균"
                      value={cur(item.cbExchange2mAvg)}
                      onChange={(v) => set({ cbExchange2mAvg: parseAmount(v) || undefined })}
                      hideLabel
                      hideUnit
                      data-testid={`cb-2m-avg-${item.id}`}
                    />
                  </FieldCard>
                  <FieldCard label="평가기준일 이전 최근일 최종시세" unit="원">
                    <CurrencyInput
                      label="최근일 최종시세"
                      value={cur(item.cbExchangeLatestPrice)}
                      onChange={(v) => set({ cbExchangeLatestPrice: parseAmount(v) || undefined })}
                      hideLabel
                      hideUnit
                      data-testid={`cb-latest-${item.id}`}
                    />
                  </FieldCard>
                </>
              ) : (
                <>
                  <FieldCard label="평가방법 (거래실적 없음)">
                    <RadioCardGroup
                      name={`cb-sub-mode-${item.id}`}
                      options={[
                        { value: "purchase", label: "매입분 (§58①2호가)", description: "매입가액 + 미수이자상당액" },
                        { value: "disposal", label: "그 외 (§58①2호나)", description: "처분예상금액" },
                      ]}
                      value={item.cbExchangeSubMode ?? "purchase"}
                      onChange={(v) => set({ cbExchangeSubMode: v as "purchase" | "disposal" })}
                      tone="sky"
                      layout="inline"
                    />
                  </FieldCard>
                  {(item.cbExchangeSubMode ?? "purchase") === "purchase" ? (
                    <>
                      <FieldCard label="매입가액" unit="원">
                        <CurrencyInput
                          label="매입가액"
                          value={cur(item.cbPurchasePrice)}
                          onChange={(v) => set({ cbPurchasePrice: parseAmount(v) || undefined })}
                          hideLabel
                          hideUnit
                          data-testid={`cb-purchase-price-${item.id}`}
                        />
                      </FieldCard>
                      <FieldCard label="평가기준일까지 미수이자상당액" unit="원" hint="없으면 비워두세요">
                        <CurrencyInput
                          label="미수이자상당액"
                          value={cur(item.cbAccruedInterestToBase)}
                          onChange={(v) => set({ cbAccruedInterestToBase: parseAmount(v) || undefined })}
                          hideLabel
                          hideUnit
                          data-testid={`cb-accrued-to-base-${item.id}`}
                        />
                      </FieldCard>
                    </>
                  ) : (
                    <FieldCard label="처분예상금액" unit="원">
                      <CurrencyInput
                        label="처분예상금액"
                        value={cur(item.cbDisposalExpected)}
                        onChange={(v) => set({ cbDisposalExpected: parseAmount(v) || undefined })}
                        hideLabel
                        hideUnit
                        data-testid={`cb-disposal-expected-${item.id}`}
                      />
                    </FieldCard>
                  )}
                </>
              )}
            </div>
          )}
        </ToggleCard>

        {/* B. 비거래소 보충적 평가 */}
        {!traded && (
          <div className="space-y-2">
            {autoRatePct != null && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                적정할인율(r): 평가기준일 기준 자동 {autoRatePct}% (상증칙 §18의3). PV(사채발행이율 R)은 발행가액으로 처리.
              </div>
            )}

            {/* 사채 기본 정보 (라목 신주인수권증서는 사채 본체 없음 → 생략) */}
            {!isPreemptive && (
              <>
                <FieldCard label="원금(액면총액) = 발행가액" unit="원" hint="액면(par) 발행 기준">
                  <CurrencyInput
                    label="원금"
                    value={cur(item.cbPrincipal)}
                    onChange={(v) => set({ cbPrincipal: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-principal-${item.id}`}
                  />
                </FieldCard>
                <FieldCard label="표시 액면이자율" unit="%" hint="무이표(0%)는 0 입력 또는 비워두기">
                  <DecimalInput
                    value={dec(item.cbCouponRate)}
                    onChange={(v) => set({ cbCouponRate: v.trim() === "" ? undefined : parseDecimal(v) })}
                    data-testid={`cb-coupon-rate-${item.id}`}
                  />
                </FieldCard>
                <FieldCard label="만기년수" unit="년">
                  <DecimalInput
                    value={dec(item.cbMaturityYears)}
                    onChange={(v) => set({ cbMaturityYears: parseDecimal(v) || undefined })}
                    data-testid={`cb-maturity-${item.id}`}
                  />
                </FieldCard>

                <ToggleCard
                  checked={item.cbHasRedemptionPremium ?? false}
                  onCheckedChange={(v) => set({ cbHasRedemptionPremium: v })}
                  title="상환할증조건"
                  description="만기까지 미행사 시 추가 지급액(상환할증금) — 만기상환금액에 가산, R=유효이자율"
                  tone="amber"
                >
                  <FieldCard label="상환할증금" unit="원">
                    <CurrencyInput
                      label="상환할증금"
                      value={cur(item.cbRedemptionPremium)}
                      onChange={(v) => set({ cbRedemptionPremium: parseAmount(v) || undefined })}
                      hideLabel
                      hideUnit
                      data-testid={`cb-redemption-premium-${item.id}`}
                    />
                  </FieldCard>
                  <FieldCard label="유효이자율 (R)" unit="%" hint="액면이자+상환할증을 발행가액과 일치시키는 이자율">
                    <DecimalInput
                      value={dec(item.cbIssueRate)}
                      onChange={(v) => set({ cbIssueRate: parseDecimal(v) || undefined })}
                      data-testid={`cb-issue-rate-${item.id}`}
                    />
                  </FieldCard>
                </ToggleCard>

                {/* 발생이자 */}
                <FieldCard label="직전 이자지급일" hint="평가기준일까지 발생이자 일수 산정">
                  <div data-testid={`cb-interest-base-date-${item.id}`}>
                    <DateInput
                      value={typeof item.cbInterestBaseDate === "string" ? item.cbInterestBaseDate : ""}
                      onChange={(v) => set({ cbInterestBaseDate: v || undefined })}
                    />
                  </div>
                </FieldCard>
                <FieldCard label="발생이자상당액 직접입력" unit="원" hint="비우면 직전 이자지급일·이자율로 자동 산정">
                  <CurrencyInput
                    label="발생이자 override"
                    value={cur(item.cbAccruedInterestOverride)}
                    onChange={(v) => set({ cbAccruedInterestOverride: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-accrued-override-${item.id}`}
                  />
                </FieldCard>
              </>
            )}

            {/* 주식전환 가능 여부 */}
            <ToggleCard
              checked={item.cbConvertible ?? false}
              onCheckedChange={(v) => set({ cbConvertible: v })}
              title="평가기준일 현재 주식전환(인수) 가능 기간"
              description="OFF: 전환불가 기간(§58의2②1호) / ON: 전환가능 기간(2호)"
              tone="emerald"
            >
              {/* 주식가액 — 가·나·다목 = 전환·인수가능주식가액 / 라목 = 권리락전가액 */}
              {isPreemptive ? (
                <>
                  <FieldCard label="권리락 전 주식가액" unit="원">
                    <CurrencyInput
                      label="권리락 전 주식가액"
                      value={cur(item.cbExRightsPriorPrice)}
                      onChange={(v) => set({ cbExRightsPriorPrice: parseAmount(v) || undefined })}
                      hideLabel
                      hideUnit
                      data-testid={`cb-exrights-prior-${item.id}`}
                    />
                  </FieldCard>
                  <FieldCard label="권리락 후 주식가액" unit="원" hint="상장주식 단서 — 없으면 비워두세요">
                    <CurrencyInput
                      label="권리락 후 주식가액"
                      value={cur(item.cbExRightsPostPrice)}
                      onChange={(v) => set({ cbExRightsPostPrice: parseAmount(v) || undefined })}
                      hideLabel
                      hideUnit
                      data-testid={`cb-exrights-post-${item.id}`}
                    />
                  </FieldCard>
                </>
              ) : (
                <FieldCard label="전환·인수가능 주식가액" unit="원" hint="평가기준일 시가 × 전환(인수)가능 주식수">
                  <CurrencyInput
                    label="전환·인수가능 주식가액"
                    value={cur(item.cbConvertibleShareValue)}
                    onChange={(v) => set({ cbConvertibleShareValue: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-conv-share-value-${item.id}`}
                  />
                </FieldCard>
              )}

              {/* 신주인수가액 — 나·다·라목 */}
              {isWarrantFamily && (
                <FieldCard label="신주인수가액" unit="원" hint="신주 인수에 지급할 금액">
                  <CurrencyInput
                    label="신주인수가액"
                    value={cur(item.cbSubscriptionPrice)}
                    onChange={(v) => set({ cbSubscriptionPrice: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-subscription-price-${item.id}`}
                  />
                </FieldCard>
              )}

              {/* 배당차액 §57③ — auto-derive + override */}
              <ToneCard tone="emerald" title="배당차액 (§57③) — 자동 산정 입력" bodyClassName="space-y-2" noDark>
                <FieldCard label="1주당 액면가액" unit="원">
                  <CurrencyInput
                    label="1주당 액면가액"
                    value={cur(item.cbFaceValuePerShare)}
                    onChange={(v) => set({ cbFaceValuePerShare: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-face-value-${item.id}`}
                  />
                </FieldCard>
                <FieldCard label="직전기 배당률" unit="%" hint="배당 없으면 비워두세요(배당차액 0)">
                  <DecimalInput
                    value={dec(item.cbPriorDividendRate)}
                    onChange={(v) => set({ cbPriorDividendRate: v.trim() === "" ? undefined : parseDecimal(v) })}
                    data-testid={`cb-prior-dividend-rate-${item.id}`}
                  />
                </FieldCard>
                <FieldCard label="주식수">
                  <DecimalInput
                    value={dec(item.cbShareCount)}
                    onChange={(v) => set({ cbShareCount: parseDecimal(v) || undefined })}
                    data-testid={`cb-share-count-${item.id}`}
                  />
                </FieldCard>
                <FieldCard label="배당기산일" hint="사업연도 개시일~배당기산일 전일 일수 산정">
                  <div data-testid={`cb-dividend-base-date-${item.id}`}>
                    <DateInput
                      value={typeof item.cbDividendBaseDate === "string" ? item.cbDividendBaseDate : ""}
                      onChange={(v) => set({ cbDividendBaseDate: v || undefined })}
                    />
                  </div>
                </FieldCard>
                <FieldCard label="배당차액 직접입력" unit="원" hint="비우면 위 항목으로 자동 산정">
                  <CurrencyInput
                    label="배당차액 override"
                    value={cur(item.cbDividendDifferenceOverride)}
                    onChange={(v) => set({ cbDividendDifferenceOverride: parseAmount(v) || undefined })}
                    hideLabel
                    hideUnit
                    data-testid={`cb-dividend-override-${item.id}`}
                  />
                </FieldCard>
              </ToneCard>
            </ToggleCard>
          </div>
        )}

        <p className="text-xs text-sky-600 dark:text-sky-400">
          거래소 거래분은 종가 기준, 비거래소는 만기상환금액 현가할인(PV)과 전환주식가액을 비교하여 평가합니다.
        </p>
      </EstateBodySection>
    </div>
  );
}

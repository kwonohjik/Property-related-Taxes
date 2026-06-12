"use client";

/**
 * Step 2 — 양도가액·취득가액
 *
 * 입력 순서:
 *   양도가액 모드 → 취득가액 모드 → 환산 (취득 후 상장 / 비상장 보충 평가)
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { FaceValueBlock } from "@/components/calc/stock-transfer/FaceValueBlock";
import { MarketSampleBlock } from "@/components/calc/stock-transfer/MarketSampleBlock";
import { CapitalAdjustmentsBlock } from "@/components/calc/stock-transfer/CapitalAdjustmentsBlock";
import { AcquisitionLotsMatrix } from "@/components/calc/stock-transfer/AcquisitionLotsMatrix";
import {
  createEmptyAcquisitionLot,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

interface Step2Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800 mb-4">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold">
        {n}
      </span>
      {title}
    </h2>
  );
}

export function Step2({ form, onChange }: Step2Props) {
  const transferPriceMode = form.transferPriceMode || "actual";
  const transferActualInputMode = form.transferActualInputMode || "total"; // 3중 패턴 default
  const acquisitionMode = form.acquisitionMode || "actual";
  const acquisitionActualInputMode = form.acquisitionActualInputMode || "per_share"; // 3중 패턴 default
  const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
  const isSplitMode = form.lotsMode === "split";

  // 실가 양도가 합계 미리보기 (per_share 모드)
  const transferTotal = useMemo(() => {
    const perShare = parseAmount(form.perShareTransferPrice);
    const count = parseInt(form.shareCount || "0", 10);
    if (perShare > 0 && count > 0) return perShare * count;
    return null;
  }, [form.perShareTransferPrice, form.shareCount]);

  // 역산 1주당 단가 미리보기 (total 모드, 표시 전용 — store 미러링 금지)
  const reversedPerShare = useMemo(() => {
    const total = parseAmount(form.transferTotalPrice);
    const count = parseInt(form.shareCount || "0", 10);
    if (total <= 0 || count <= 0) return null;
    const isExact = total % count === 0; // 잔돈 0일 때만 "정확"
    return { perShare: total / count, isExact, total, count };
  }, [form.transferTotalPrice, form.shareCount]);

  // 교환 양도가 합계 미리보기
  const exchangeTotal = useMemo(() => {
    const prop = parseAmount(form.exchangePropertyValue);
    const debt = parseAmount(form.exchangeDebtRelief);
    const cash = parseAmount(form.exchangeCash);
    return prop + debt + cash;
  }, [form.exchangePropertyValue, form.exchangeDebtRelief, form.exchangeCash]);

  return (
    <div className="space-y-8">
      {isSplitMode && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-4 text-sm text-violet-900">
          <p className="font-semibold mb-1">🔀 분할 양도 모드 활성</p>
          <p className="text-xs">
            양도가액·취득가액은 Step1의 lot 입력에서 자동 산출됩니다. 본 단계의 1주당 단가 입력은 비활성화됩니다.
            <br />취득가 산정방법은 <strong>실가(actual)</strong>만 지원되며, 환산·매매사례·감정·액면가·교환 모드는 사용할 수 없습니다.
          </p>
        </div>
      )}

      {/* ① 양도가액 모드 */}
      <section>
        <SectionTitle n={1} title="양도가액" />
        <div className="space-y-4">
          <RadioCardGroup
            name="transferPriceMode"
            value={transferPriceMode}
            onChange={(v) => onChange({ transferPriceMode: v as "actual" | "exchange" })}
            tone="emerald"
            layout="inline"
            options={[
              { value: "actual", label: "실가", description: "1주당 양도가액 × 주식수" },
              {
                value: "exchange",
                label: "교환 (PR-2)",
                description: "부동산·채무면제·현금 교환 (비상장·기타자산)",
              },
            ]}
          />

          {/* 실가 양도가 — 서브 입력 방식 분기 */}
          {transferPriceMode === "actual" && (
            <div className="space-y-3">
              {/* 서브 입력 방식 (per_share / total) */}
              <FieldCard label="입력 방식">
                <RadioCardGroup
                  name="transferActualInputMode"
                  value={transferActualInputMode}
                  onChange={(v) =>
                    onChange({ transferActualInputMode: v as "per_share" | "total" })
                  }
                  tone="emerald"
                  layout="inline"
                  options={[
                    {
                      value: "total",
                      label: "합계 직접 입력",
                      description: isSplitMode
                        ? "분할 모드에서는 lot별 단가만 지원됩니다 (Step1)"
                        : "양도가액 총액을 원 단위로 직접 입력 (§96① 실지거래가액)",
                      disabled: isSplitMode,
                    },
                    {
                      value: "per_share",
                      label: "1주당 단가",
                      description: "1주당 양도가액 × 주식수",
                    },
                  ]}
                />
              </FieldCard>

              {/* per_share 분기 */}
              {transferActualInputMode === "per_share" && (
                <>
                  <CurrencyInput
                    label="1주당 양도가액"
                    required
                    disabled={isSplitMode}
                    hint={isSplitMode ? "분할 모드에서는 매도 lot에서 자동 산출됩니다 (Step1 참조)" : "실제 거래 가격 (원)"}
                    value={form.perShareTransferPrice}
                    onChange={(v) => onChange({ perShareTransferPrice: v })}
                  />
                  {transferTotal && (
                    <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
                      양도가액 합계: {parseAmount(form.perShareTransferPrice).toLocaleString()} ×{" "}
                      {parseInt(form.shareCount || "0", 10).toLocaleString()}주 ={" "}
                      <strong>{transferTotal.toLocaleString()}</strong>
                    </div>
                  )}
                </>
              )}

              {/* total 분기 — 합계 직접 입력 */}
              {transferActualInputMode === "total" && (
                <>
                  <CurrencyInput
                    label="양도가액 합계"
                    required
                    hint="계약서·등기부 등에 기재된 총 양도대금 (원)"
                    value={form.transferTotalPrice}
                    onChange={(v) => onChange({ transferTotalPrice: v })}
                  />
                  {reversedPerShare && (
                    reversedPerShare.isExact ? (
                      <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
                        참고: 1주당 단가 = <strong>{reversedPerShare.perShare.toLocaleString()}</strong>
                        {" "}({reversedPerShare.total.toLocaleString()} ÷ {reversedPerShare.count.toLocaleString()}주)
                      </div>
                    ) : (
                      <div className="rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-600">
                        참고: 1주당 단가 = <strong>{reversedPerShare.perShare.toFixed(4)}</strong>
                        {" "}({reversedPerShare.total.toLocaleString()} ÷ {reversedPerShare.count.toLocaleString()}주)
                        {" "}— 정확히 떨어지지 않음. 총액 그대로 사용합니다.
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          )}

          {/* 교환 양도가 (PR-2 실구현) */}
          {transferPriceMode === "exchange" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-700">
                <p className="font-medium">교환 양도가 (비상장·기타자산)</p>
                <p className="text-xs mt-1">
                  부동산 가액 + 채무면제액 + 현금의 합계가 양도가액입니다 (§96①).
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CurrencyInput
                  label="부동산 가액"
                  hint="교환으로 받은 부동산의 시가 (원)"
                  value={form.exchangePropertyValue}
                  onChange={(v) => onChange({ exchangePropertyValue: v })}
                />
                <CurrencyInput
                  label="채무면제액"
                  hint="양수인이 인수한 채무 금액 (원)"
                  value={form.exchangeDebtRelief}
                  onChange={(v) => onChange({ exchangeDebtRelief: v })}
                />
                <CurrencyInput
                  label="현금"
                  hint="교환 과정에서 받은 현금 (원)"
                  value={form.exchangeCash}
                  onChange={(v) => onChange({ exchangeCash: v })}
                />
              </div>
              {exchangeTotal > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-700">
                  교환 양도가액 합계:{" "}
                  <strong>{exchangeTotal.toLocaleString()}</strong>원
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ② 취득가액 모드 */}
      <section>
        <SectionTitle n={2} title="취득가액" />
        <div className="space-y-4">
          <RadioCardGroup
            name="acquisitionMode"
            value={acquisitionMode}
            onChange={(v) =>
              onChange({ acquisitionMode: v as StockTransferFormData["acquisitionMode"] })
            }
            tone="amber"
            layout="stack"
            options={[
              {
                value: "actual",
                label: "실가",
                description: "실제 취득가액 (1주당)",
              },
              {
                value: "estimated",
                label: "환산취득가",
                description: isListed
                  ? "1개월 종가평균 기반 환산 (소령 §165⑤ / §163⑥4)"
                  : "보충적 평가 — 순손익·순자산 가중평균 (소령 §165④)",
                disabled: isSplitMode,
              },
              {
                value: "sale_case",
                label: "매매사례가액",
                description: "비상장·기타자산 전용 (영§176의2③1호 — 주권상장법인 주식등 제외)",
                disabled: isSplitMode,
              },
              // 감정가액 모드 제거 — 영§176의2③2호 단서에 의해 주식등 적용 불가
              {
                value: "face_value",
                label: "액면가 (장부분실)",
                description: "§99①4 — 장부가 분실·멸실된 경우",
                disabled: isSplitMode,
              },
            ]}
          />

          {/* 실가 취득가 */}
          {acquisitionMode === "actual" && isSplitMode && (
            <CurrencyInput
              label="1주당 취득가액"
              required
              disabled
              hint="분할 모드에서는 매수 lot에서 자동 산출됩니다 (Step1 참조)"
              value={form.perShareAcquisitionPrice}
              onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
            />
          )}
          {acquisitionMode === "actual" && !isSplitMode && (
            <div className="space-y-3">
              {/* 서브 입력 방식 (per_share / lots) */}
              <FieldCard label="입력 방식">
                <RadioCardGroup
                  name="acquisitionActualInputMode"
                  value={acquisitionActualInputMode}
                  onChange={(v) => {
                    const mode = v as "per_share" | "lots";
                    if (mode === "lots" && form.acquisitionLots.length === 0) {
                      // 자동 1행 추가 — useEffect 미러링 금지, onChange 내 cross-field
                      onChange({
                        acquisitionActualInputMode: mode,
                        acquisitionLots: [createEmptyAcquisitionLot()],
                      });
                    } else {
                      onChange({ acquisitionActualInputMode: mode });
                    }
                  }}
                  tone="amber"
                  layout="inline"
                  options={[
                    {
                      value: "per_share",
                      label: "1주당 단가",
                      description: "1주당 취득가액 × 양도 주식수",
                    },
                    {
                      value: "lots",
                      label: "일자별 다건",
                      description: "여러 시점 분할 매수 lot별 입력 (§97① 실지거래가액)",
                    },
                  ]}
                />
              </FieldCard>

              {acquisitionActualInputMode === "per_share" && (
                <CurrencyInput
                  label="1주당 취득가액"
                  required
                  hint="실제 취득가액 (원)"
                  value={form.perShareAcquisitionPrice}
                  onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
                />
              )}

              {acquisitionActualInputMode === "lots" && (
                <>
                  {transferActualInputMode === "total" && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-700">
                      <p className="font-medium mb-1">⚠️ 양도가액 합계 + 취득 다건 조합 안내</p>
                      <p>
                        양도가액을 합계로 입력하고 취득가액을 다건으로 입력하면, 엔진은 양도 1주당 단가를{" "}
                        <code className="bg-amber-100 px-1 rounded">round(합계 ÷ 양도 주식수)</code> 로 역산합니다.
                        합계가 양도 주식수로 정확히 나누어 떨어지지 않으면 결과 양도가액에 ±(양도주식수−1)원 잔돈 오차가 발생할 수 있습니다.
                      </p>
                    </div>
                  )}
                  <AcquisitionLotsMatrix
                    lots={form.acquisitionLots}
                    onChange={(lots) => onChange({ acquisitionLots: lots })}
                    costAllocationMethod={form.costAllocationMethod}
                    onCostMethodChange={(method) =>
                      onChange({ costAllocationMethod: method })
                    }
                    specificMatchings={form.specificMatchings}
                    onMatchingsChange={(matchings) =>
                      onChange({ specificMatchings: matchings })
                    }
                    transferShareCount={parseInt(form.shareCount || "0", 10)}
                  />
                </>
              )}
            </div>
          )}

          {/* 환산 — 상장 */}
          {acquisitionMode === "estimated" && isListed && (
            <div className="space-y-4">
              {/* 거래정지·관리종목 §165③ 토글 (분기 선두 — 엔진 분기 순서 일치) */}
              {form.kiwoomTradingHalt && !form.tradingHaltAtTransfer && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 px-4 py-2 text-xs text-amber-800">
                  ⚠ 키움 조회에서 거래정지·관리종목이 감지되었습니다 — 해당 시 아래 토글을 켜세요.
                </div>
              )}
              <ToggleCard
                checked={form.tradingHaltAtTransfer}
                onCheckedChange={(v) => onChange({ tradingHaltAtTransfer: v })}
                title="양도일 거래정지·관리종목 지정 (소령 §165③)"
                description="양도일 이전 1개월 내 거래정지·관리종목 기간이 포함되면 1개월 종가평균 대신 비상장 보충 평가로 환산합니다. ※ 관리종목이라도 적정 시가로 정상 매매 중이면(상증령 §52의2③ 단서) 토글을 켜지 마세요."
                tone="rose"
              >
                {/* 거래정지 우회 — 비상장 보충 평가(simple 전용) */}
                <EstimatedUnlistedBlock form={form} onChange={onChange} simpleOnly />
              </ToggleCard>

              {/* [C-1] 취득일 거래정지 — 양도정지 ON 시 숨김(양도정지 블록이 양·취 모두 수집), 취득후상장 ON 시 숨김(M-4) */}
              {!form.tradingHaltAtTransfer && !form.acquiredBeforeListing && (
                <ToggleCard
                  checked={form.tradingHaltAtAcquisition}
                  onCheckedChange={(v) => onChange({ tradingHaltAtAcquisition: v })}
                  title="취득일 거래정지·관리종목 지정 (소령 §165③)"
                  description="취득일 이전 1개월 내 거래정지·관리종목 기간이 포함되면 취득시 기준시가만 비상장 보충 평가로 환산합니다(양도시 기준시가는 1개월 종가평균 유지). ※ 관리종목이라도 적정 시가로 정상 매매 중이면(상증령 §52의2③ 단서) 토글을 켜지 마세요."
                  tone="rose"
                >
                  {/* 취득측 보충 평가 — 취득연도 NI/NA + 순자산 단독 사유만 */}
                  <EstimatedUnlistedBlock form={form} onChange={onChange} acquisitionSideOnly />
                </ToggleCard>
              )}

              {/* 일반 상장 환산 (시행령 §163⑨) — 거래정지·취득 후 상장 분기가 아닐 때만 노출 */}
              {!form.tradingHaltAtTransfer && !form.acquiredBeforeListing && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
                  <p className="text-sm font-semibold text-emerald-800">
                    환산취득가 (시행령 §163⑨) — 양도가 × (취득시 기준시가 / 양도시 기준시가)
                  </p>
                  <CurrencyInput
                    label="양도시 1주당 기준시가 (양도일 직전 1개월 종가평균)"
                    required
                    hint="모법 §99①3 — 환산비율의 분모"
                    value={form.transferDatePriceAvg1Month}
                    onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
                    placeholder="양도일 직전 1개월 종가평균 (1주당)"
                  />
                  {/* [C-1] 취득정지 ON 시 분자(취득일 종가평균)는 법령상 무효 — 입력 숨김 (잔존값 엔진 미참조) */}
                  {!form.tradingHaltAtAcquisition ? (
                    <CurrencyInput
                      label="취득시 1주당 기준시가 (취득일 직전 1개월 종가평균)"
                      required
                      hint="모법 §99①3 — 환산비율의 분자. 개산공제(§163⑥4) 산정 base"
                      value={form.acquisitionDatePriceAvg1Month}
                      onChange={(v) => onChange({ acquisitionDatePriceAvg1Month: v })}
                      placeholder="취득일 직전 1개월 종가평균 (1주당)"
                    />
                  ) : (
                    <p className="text-xs text-rose-700">
                      취득시 기준시가는 위 토글의 비상장 보충 평가로 산정됩니다 (소령 §165③).
                    </p>
                  )}
                  <p className="text-xs text-emerald-700">
                    ※ 환산 모드에서는 시행령 §163⑥4에 따라 개산공제(취득기준시가 × 1%)가 자동
                    적용되며 실비 입력값은 무시됩니다.
                  </p>
                </div>
              )}

              {/* 취득 후 상장 환산 (사례 48 핵심) — 거래정지 신규 진입 시 숨김(U1-1: 잔존 ON은 유지해 차단 메시지 실행 가능) */}
              {((!form.tradingHaltAtTransfer && !form.tradingHaltAtAcquisition) || form.acquiredBeforeListing) && (
                <PostListingValuationCard form={form} onChange={onChange} />
              )}
            </div>
          )}

          {/* 환산 — 비상장 보충적 평가 (PR-2 실구현) */}
          {acquisitionMode === "estimated" && !isListed && (
            <EstimatedUnlistedBlock form={form} onChange={onChange} />
          )}

          {/* R-1' 매매사례가액 — sale_case 모드 강화 (영§176의2③1호) */}
          {acquisitionMode === "sale_case" && (
            <MarketSampleBlock form={form} onChange={onChange} isListed={isListed} />
          )}

          {/* 감정가액 모드 제거 — 영§176의2③2호 단서: 주식등 적용 불가 (2026-05-19) */}

          {/* 액면가 (장부분실) — PR-2 실구현 */}
          {acquisitionMode === "face_value" && (
            <FaceValueBlock form={form} onChange={onChange} />
          )}

          {/* R-2 자본조정 (무상증자·감자) — 모든 모드 공통 (영§17② 단서) */}
          <CapitalAdjustmentsBlock form={form} onChange={onChange} />
        </div>
      </section>
    </div>
  );
}

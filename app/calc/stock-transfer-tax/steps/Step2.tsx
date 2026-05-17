"use client";

/**
 * Step 2 — 양도가액·취득가액
 *
 * 입력 순서:
 *   양도가액 모드 → 취득가액 모드 → 환산 (취득 후 상장 / 비상장 보충 평가)
 */

import { useMemo } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { EstimatedUnlistedBlock } from "@/components/calc/stock-transfer/EstimatedUnlistedBlock";
import { FaceValueBlock } from "@/components/calc/stock-transfer/FaceValueBlock";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

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
  const acquisitionMode = form.acquisitionMode || "actual";
  const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);

  // 실가 양도가 합계 미리보기
  const transferTotal = useMemo(() => {
    const perShare = parseAmount(form.perShareTransferPrice);
    const count = parseInt(form.shareCount || "0", 10);
    if (perShare > 0 && count > 0) return perShare * count;
    return null;
  }, [form.perShareTransferPrice, form.shareCount]);

  // 교환 양도가 합계 미리보기
  const exchangeTotal = useMemo(() => {
    const prop = parseAmount(form.exchangePropertyValue);
    const debt = parseAmount(form.exchangeDebtRelief);
    const cash = parseAmount(form.exchangeCash);
    return prop + debt + cash;
  }, [form.exchangePropertyValue, form.exchangeDebtRelief, form.exchangeCash]);

  return (
    <div className="space-y-8">
      {/* ① 양도가액 모드 */}
      <section>
        <SectionTitle n={1} title="양도가액" />
        <div className="space-y-4">
          <FieldCard label="양도가액 방식">
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
          </FieldCard>

          {/* 실가 양도가 */}
          {transferPriceMode === "actual" && (
            <div className="space-y-3">
              <CurrencyInput
                label="1주당 양도가액"
                required
                hint="실제 거래 가격 (원)"
                value={form.perShareTransferPrice}
                onChange={(v) => onChange({ perShareTransferPrice: v })}
                placeholder="44,750"
              />
              {transferTotal && (
                <div className="rounded border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700">
                  양도가액 합계: {parseAmount(form.perShareTransferPrice).toLocaleString()} ×{" "}
                  {parseInt(form.shareCount || "0", 10).toLocaleString()}주 ={" "}
                  <strong>{transferTotal.toLocaleString()}</strong>
                </div>
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
          <FieldCard label="취득가액 방식">
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
                },
                {
                  value: "sale_case",
                  label: "매매사례가액",
                  description: "비상장만 (상장주식 미적용) — PR-2에서 완전 지원",
                },
                {
                  value: "appraisal",
                  label: "감정가액",
                  description: "PR-2에서 완전 지원",
                },
                {
                  value: "face_value",
                  label: "액면가 (장부분실)",
                  description: "§99①4 — 장부가 분실·멸실된 경우",
                },
              ]}
            />
          </FieldCard>

          {/* 실가 취득가 */}
          {acquisitionMode === "actual" && (
            <CurrencyInput
              label="1주당 취득가액"
              required
              hint="실제 취득가액 (원)"
              value={form.perShareAcquisitionPrice}
              onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
              placeholder="10,000"
            />
          )}

          {/* 환산 — 상장 */}
          {acquisitionMode === "estimated" && isListed && (
            <div className="space-y-4">
              <CurrencyInput
                label="양도일 직전 1개월 종가 평균"
                required
                hint="양도일 기준 직전 1개월 평균 종가 (원, §99①3)"
                value={form.transferDatePriceAvg1Month}
                onChange={(v) => onChange({ transferDatePriceAvg1Month: v })}
                placeholder="44,750"
              />

              {/* 취득 후 상장 환산 (사례 48 핵심) */}
              <PostListingValuationCard form={form} onChange={onChange} />
            </div>
          )}

          {/* 환산 — 비상장 보충적 평가 (PR-2 실구현) */}
          {acquisitionMode === "estimated" && !isListed && (
            <EstimatedUnlistedBlock form={form} onChange={onChange} />
          )}

          {/* 매매사례가액 */}
          {acquisitionMode === "sale_case" && (
            <div className="space-y-3">
              {isListed && (
                <div className="rounded border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm text-rose-700">
                  상장주식에는 매매사례가액을 적용할 수 없습니다 (비상장 전용).
                </div>
              )}
              <CurrencyInput
                label="1주당 매매사례가액"
                hint="유사 매매사례 가액 (원)"
                value={form.perShareAcquisitionPrice}
                onChange={(v) => onChange({ perShareAcquisitionPrice: v })}
              />
            </div>
          )}

          {/* 감정가액 placeholder */}
          {acquisitionMode === "appraisal" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
              감정가액 입력은 PR-2에서 완전 지원 예정입니다.
            </div>
          )}

          {/* 액면가 (장부분실) — PR-2 실구현 */}
          {acquisitionMode === "face_value" && (
            <FaceValueBlock form={form} onChange={onChange} />
          )}
        </div>
      </section>
    </div>
  );
}

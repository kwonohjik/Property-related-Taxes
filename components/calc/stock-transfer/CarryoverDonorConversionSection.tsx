"use client";

/**
 * CarryoverDonorConversionSection — 이월과세 **증여자 기준 환산**의 분모 입력 (Step 2)
 *
 * §97의2①1호 → §97①1호 나목(환산) · 시행령 §176의2②1호:
 *   시나리오 A 취득가액 = 양도가액 × 증여자 취득 당시 기준시가(1단계 이월과세 카드) ÷ 양도 당시 기준시가
 *
 * 수증자 측 취득가액(Step 2 「실가」)은 영 §163⑨ 증여일 평가액이고 §97의2①이 배제될 때(B) 쓰인다 —
 * 그래서 수증자 모드는 실가로 고정되고, 이 섹션이 A의 **분모만** 따로 받는다.
 *
 * 분자는 증여자 값으로 덮어쓰이므로 분자만 다른 갈래(취득 후 상장 · 취득일 거래정지)는 결과가 같다.
 * 남는 분모는 둘뿐이다(계획서 docs/00-pm/stock-carryover-sale-case-donor-basis.plan.md V-2):
 *   ⓐ 상장 정상 — 양도일 이전 1개월 종가평균 (§99①3)
 *   ⓑ 비상장, 또는 코스닥·코넥스 양도일 거래정지(영 §165③) — 양도연도 보충평가 (영 §165④)
 *
 * ④(`stock-transfer-tax-api.ts` `isDonorConversion`)·⑧·⑫가 같은 두 갈래로 좁힌다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TransferStdPriceSection } from "./TransferStdPriceSection";
import { EstimatedUnlistedBlock } from "./EstimatedUnlistedBlock";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isTradingHaltMarketScopeViolation } from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function CarryoverDonorConversionSection({ form, onChange }: Props) {
  const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
  // 거래정지 우회(영 §165③)는 코스닥·코넥스 전용 — 단일 정본 술어
  const haltAllowed =
    isListed && !isTradingHaltMarketScopeViolation(form.marketType);
  const haltAtTransfer =
    haltAllowed && form.acquisitionStdMode === "halt_transfer";

  // ToneCard는 data-testid를 전달하지 않는다(JSX의 하이픈 속성은 타입 검사도 안 받는다) — 바깥 div에 단다
  return (
    <div data-testid="carryover-donor-conversion">
      <ToneCard
        tone="amber"
        title="이월과세 — 증여자 기준 환산의 분모 (§97의2①1호 · 시행령 §176의2②1호)"
        bodyClassName="space-y-3"
      >
        <p className="text-xs text-amber-800 leading-relaxed">
          이월과세를 적용할 때의 취득가액은 양도가액에 「<strong>증여자 취득 당시 기준시가</strong>(1단계)를{" "}
        <strong>양도 당시 기준시가</strong>(아래)로 나눈 비율」을 곱한 금액입니다. 위 취득가액은 증여일
        평가액이며 이월과세가 배제될 때 쓰입니다 (소득세법 시행령 §163⑨).
      </p>

        {haltAllowed && (
          <FieldCard
            label="양도일 이전 1개월 거래정지·관리종목"
            hint="해당하면 1개월 종가평균 대신 비상장 보충 평가로 양도 당시 기준시가를 정합니다 (소득세법 시행령 §165③)"
          >
            <RadioCardGroup
              name="donorConversionTransferStdMode"
              value={haltAtTransfer ? "halt_transfer" : "monthly_avg"}
              onChange={(v) =>
                onChange({
                  acquisitionStdMode:
                    v as StockTransferFormData["acquisitionStdMode"],
                })
              }
              layout="inline"
              options={[
                { value: "monthly_avg", label: "해당 없음" },
                { value: "halt_transfer", label: "해당" },
              ]}
            />
          </FieldCard>
        )}

        {isListed && !haltAtTransfer ? (
          /* 코스피 등에서 남은 `halt_transfer`는 이 갈래가 아니다(④도 같은 술어로 끊는다) — 표시용으로만 정상화 */
          <TransferStdPriceSection
            form={
              form.acquisitionStdMode === "halt_transfer"
                ? { ...form, acquisitionStdMode: "monthly_avg" }
                : form
            }
            onChange={onChange}
          />
        ) : (
          <ToneCard
            tone="emerald"
            sectionNum={1}
            title="양도 당시 기준시가 — 비상장 보충 평가 (소득세법 시행령 §165④)"
          >
            <EstimatedUnlistedBlock
              form={form}
              onChange={onChange}
              transferSideOnly
            />
          </ToneCard>
        )}
      </ToneCard>
    </div>
  );
}

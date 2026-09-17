"use client";

/**
 * ExitTaxHoldingsBlock — 국외전출세 **2단계**: 보유 종목(간주양도 §178의9)
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` §2 · §3
 * 검증 짝: `validateStep2ExitTax`(행 상세 + **최소 1건**)
 *
 * 🔑 **「최소 1건」 게이트가 이 단계로 함께 왔다.** 매트릭스는 하나의 UI 라 쪼갤 수 없는데
 *   게이트만 1단계에 남기면 **「+ 종목 추가」가 없는 화면에서 막힌다** — 사용자가 풀 수 없다
 *   ([[feedback_required_field_needs_an_input_path]]).
 */

import { ExitTaxHoldingsMatrix } from "@/components/calc/stock-transfer/ExitTaxHoldingsMatrix";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";

export function ExitTaxHoldingsBlock({ form, onChange }: StockStepBlockProps) {
  return (
    <div className="space-y-5">
      {/* ── 섹션 4: 보유 종목 (§178의9) ── */}
      <SectionBox n={1} label="보유 종목 — 간주양도 대상 (§178의9)" tone="amber">
        <p className="text-xs text-amber-700 leading-relaxed">
          §118의9①: §94①3호 가·나목(상장·비상장 주식) <strong>및 §94①4호 다·라목(기타자산: 비상장 과점주주·부동산과다보유법인)</strong> 보유 종목별로 입력하세요.
          기타자산 다·라목도 §94①4 주식이므로 ‘비상장’으로 입력하면 동일 흐름(출국일 시가 × 주수 − 취득가 + §118의11 세율)으로 계산됩니다.
          각 종목의 출국일 시가(간주양도가액 = 시가 × 주수)가 양도차익 계산에 사용됩니다.
        </p>
        <ExitTaxHoldingsMatrix
          holdings={form.etHoldings}
          onChange={(holdings: ExitTaxHoldingForm[]) => onChange({ etHoldings: holdings })}
        />
      </SectionBox>
    </div>
  );
}

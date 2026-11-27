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
import { ExitTaxForeignWorkerBlock } from "@/components/calc/stock-transfer/ExitTaxForeignWorkerBlock";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";

export function ExitTaxHoldingsBlock({ form, onChange }: StockStepBlockProps) {
  // 출국일에서 곧바로 파생 — store에 쓰지 않는다. 새 요소는 전부 era일 때만 마운트(2026 이전 출국은 DOM 불변)
  const era = isExitTaxFrom2027(form.etDepartureDate);
  const hasForeignRow = form.etHoldings.some((h) => h.marketType === "foreign_stock");
  const holdingsSection = (
    <SectionBox n={1} label="보유 종목 — 간주양도 대상 (§178의9)" tone="amber">
      <p className="text-xs text-amber-700 leading-relaxed dark:text-amber-300">
        §118의9①: §94①3호 가·나목(상장·비상장 주식) <strong>및 §94①4호 다·라목(기타자산: 비상장 과점주주·부동산과다보유법인)</strong> 보유 종목별로 입력하세요.
        기타자산 다·라목도 §94①4 주식이므로 ‘비상장’으로 입력하면 동일 흐름(출국일 시가 × 주수 − 취득가 + §118의11 세율)으로 계산됩니다.
        각 종목의 출국일 시가(간주양도가액 = 시가 × 주수)가 양도차익 계산에 사용됩니다.
        {era && (
          <span data-testid="exit-era-holdings-note">
            {" "}출국일이 2027.1.1. 이후라 §94①3호 다목 국외주식등도 대상입니다 — 시장에서 <strong>«국외주식»</strong>을 고르고 외화 단가와
            기준환율로 입력하세요.
          </span>
        )}
      </p>
      <ExitTaxHoldingsMatrix
        holdings={form.etHoldings}
        onChange={(holdings: ExitTaxHoldingForm[]) => onChange({ etHoldings: holdings })}
        departureDate={form.etDepartureDate}
      />
    </SectionBox>
  );

  // 2026 이전 출국은 아래 두 번째 return이 종전과 같은 트리(바깥 div 아래 SectionBox 단일 자식)다 —
  // 형제를 하나라도 더하면 React useId(트리 위치 기반)가 바뀌어 SSR 기준선이 깨진다.
  // 제외 판정(영 §178의8②)은 종목 합계에 의존하므로 보유 종목 다음에 두고, 국외주식 종목이 있을 때만 연다.
  if (era && hasForeignRow) {
    return (
      <div className="space-y-5">
        {holdingsSection}
        <ExitTaxForeignWorkerBlock form={form} onChange={onChange} />
      </div>
    );
  }
  return <div className="space-y-5">{holdingsSection}</div>;
}

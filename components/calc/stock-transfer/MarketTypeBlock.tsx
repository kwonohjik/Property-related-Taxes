"use client";

/**
 * MarketTypeBlock — 시장 유형 선택 (Step 1)
 *
 * §94①3 가목 (상장) / 나목 (비상장) / §94①4 다·라목 (기타자산)
 * §94①3 다목 (외국법인·해외상장) — 본 계산기 미지원 (Case 21)
 * v3 정정 (PR-3-c, 2026-05-19): "별도 도메인" → "본 계산기 현재 미지원"
 *   §94①3 다목은 본 양도소득세 §94 과세대상 내부이지만 본 엔진 미구현.
 *   사용자가 다른 세금(국외전출세 §126의3)과 혼동하지 않도록 라벨 정정.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface MarketTypeBlockProps {
  marketType: StockTransferFormData["marketType"];
  onChange: (marketType: StockTransferFormData["marketType"]) => void;
}

const MARKET_OPTIONS = [
  {
    value: "kospi" as const,
    label: "코스피",
    description: "유가증권시장 상장주식 (§94①3 가목)",
  },
  {
    value: "kosdaq" as const,
    label: "코스닥",
    description: "코스닥시장 상장주식 (§94①3 가목)",
  },
  {
    value: "konex" as const,
    label: "코넥스",
    description: "코넥스시장 상장주식 (§94①3 가목)",
  },
  {
    value: "unlisted" as const,
    label: "비상장",
    description: "주권비상장법인 주식 (§94①3 나목)",
  },
  {
    value: "other_asset" as const,
    label: "기타자산",
    description: "과점주주·부동산과다보유법인 (§94①4 다·라목)",
  },
];

export function MarketTypeBlock({ marketType, onChange }: MarketTypeBlockProps) {
  return (
    <FieldCard
      label="시장 유형"
      hint="양도 주식이 거래되는 시장을 선택하세요. 비상장·기타자산은 별도 과세 요건을 확인하세요."
      required
      trailing={
        <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">
          §94①3·4
        </span>
      }
    >
      <RadioCardGroup
        name="marketType"
        value={marketType || ""}
        onChange={(v) => onChange(v as StockTransferFormData["marketType"])}
        tone="sky"
        layout="stack"
        options={MARKET_OPTIONS}
      />

      {/* Case 21 — §94①3 다목 외국법인·해외상장 주식 (본 엔진 미지원) */}
      <div
        className="mt-3 rounded-lg border border-rose-200/70 bg-rose-50/40 px-4 py-3 opacity-70 cursor-not-allowed"
        aria-disabled="true"
        title="본 계산기 현재 미지원 — 후속 PR에서 지원 예정"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-rose-700">
            외국법인 발행 / 해외상장 주식 (선택 불가)
          </span>
          <span className="text-xs bg-rose-200 text-rose-700 px-1.5 py-0.5 rounded">
            §94①3 다목
          </span>
        </div>
        <p className="text-xs text-rose-700/80 mt-1.5 leading-relaxed">
          본 계산기 현재 미지원. 해외 발행·상장 주식의 양도는 소득세법 §94①3 다목 양도소득세 대상이지만
          본 엔진은 아직 지원하지 않습니다 (후속 PR 지원 예정). 국외전출세(§126의3)와는 별개입니다.
        </p>
      </div>
    </FieldCard>
  );
}

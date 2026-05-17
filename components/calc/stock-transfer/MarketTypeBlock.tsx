"use client";

/**
 * MarketTypeBlock — 시장 유형 선택 (Step 1)
 *
 * §94①3 가목 (상장) / 나목 (비상장) / §94①4 다·라목 (기타자산)
 * 외국법인·해외상장 5번째 옵션은 disabled (별도 도메인 안내)
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

      {/* 외국법인·해외상장 disabled 안내 */}
      <div className="mt-3 rounded-lg border border-slate-200/70 bg-slate-50/70 px-4 py-3 opacity-60 cursor-not-allowed">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">외국법인 발행 / 해외상장 주식</span>
          <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">미지원</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          §94①3 다목 — 해외주식은 별도 도메인 (22% 단일세율, 250만원 공제)
        </p>
      </div>
    </FieldCard>
  );
}

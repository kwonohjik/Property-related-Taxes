"use client";

/**
 * MarketTypeBlock — 시장 유형 선택 (Step 1)
 *
 * §94①3 가목 (상장) / 나목 (비상장) / §94①4 다·라목 (기타자산)
 * §94①3 다목 (외국법인·해외상장) — `foreign_stock` 옵션 (foreign-stock.ts · §118② 준용 트랙)
 * 국외전출세 §118의9~§118의16 — `exit_tax` 옵션 (exit-tax.ts, PR-4B)
 * 정정 (B-2, 2026-06-12): 이전 "본 계산기 미지원" 주석은 해외주식·국외전출세 본체
 *   구현(PR-4A/4B) 이후 stale — 옵션 :48·53 + 엔진 분기(route.ts) 완비됨.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
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
  {
    value: "foreign_stock" as const,
    label: "해외주식",
    description: "외국법인 발행 주식 (§94①3 다목 · 세율 §104①12호나목 20%)",
  },
  {
    value: "exit_tax" as const,
    label: "국외전출세 (§118의9)",
    description: "거주자가 비거주자로 출국하는 경우 보유 주식 간주양도",
  },
];

export function MarketTypeBlock({ marketType, onChange }: MarketTypeBlockProps) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
      <div className="flex items-start justify-end">
        <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">
          §94①3·4
        </span>
      </div>
      <RadioCardGroup
        name="marketType"
        value={marketType || ""}
        onChange={(v) => onChange(v as StockTransferFormData["marketType"])}
        tone="sky"
        layout="stack"
        options={MARKET_OPTIONS}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 space-y-0"
      />
      <p className="text-xs text-muted-foreground">
        양도 주식이 거래되는 시장을 선택하세요. 비상장·기타자산은 별도 과세 요건을 확인하세요.
      </p>
    </div>
  );
}

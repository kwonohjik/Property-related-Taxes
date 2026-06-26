"use client";

/**
 * 공익법인 출연 특수관계법인 주식 한도 입력 (§16②, 갭5a)
 *
 * 토글 ON 시 유형(10/20/5%)·주식수 입력 → 엔진 computeRelatedStockExcess로 초과분 실시간 미리보기.
 * 단일 진실: UI 자체 한도 재계산 금지 — 엔진 헬퍼 직접 import (single-source-engine-helper).
 * 정책: native checkbox/radio 금지(ToggleCard/RadioCardGroup), useEffect→store 미러링 금지(onChange 직접).
 */

import { useMemo } from "react";

import {
  CurrencyInput,
  parseAmount,
  formatKRW,
} from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  computeRelatedStockExcess,
  type PublicInterestType,
} from "@/lib/tax-engine/public-interest-stock-limit";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const TYPE_OPTIONS: Array<{
  value: PublicInterestType;
  label: string;
  description: string;
}> = [
  { value: "general", label: "일반 공익법인 (한도 10%)", description: "§16②2호 본문" },
  {
    value: "charity_no_voting",
    label: "자선·장학·사회복지 + 의결권 미행사 (20%)",
    description: "§16②2호 가목",
  },
  {
    value: "mutual_investment_restricted",
    label: "상호출자제한기업집단 특수관계 (5%)",
    description: "§16②2호 나목",
  },
  { value: "art48_11_unmet", label: "§48⑪ 요건 미충족 (5%)", description: "§16②2호 다목" },
];

function ShareField({
  label,
  unit,
  value,
  onChange,
  testid,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
        {label} <span className="text-gray-400">({unit})</span>
      </label>
      <CurrencyInput
        label=""
        hideUnit
        value={value != null && value > 0 ? String(value) : ""}
        onChange={(v) => {
          const n = parseAmount(v);
          onChange(n > 0 ? n : undefined);
        }}
        placeholder={label}
      />
    </div>
  );
}

interface RelatedStockLimitInputProps {
  item: ExemptionCheckedItem;
  onPatch: (patch: Partial<ExemptionCheckedItem>) => void;
}

export function RelatedStockLimitInput({ item, onPatch }: RelatedStockLimitInputProps) {
  const enabled = item.publicInterestType != null;

  const preview = useMemo(() => {
    if (item.publicInterestType == null) return null;
    const donated = item.relatedStockDonatedShares ?? 0;
    const total = item.relatedStockTotalShares ?? 0;
    const value = item.relatedStockValuePerShare ?? 0;
    if (donated <= 0 || total <= 0 || value <= 0) return null;
    return computeRelatedStockExcess({
      donatedShares: donated,
      totalShares: total,
      priorHeld: item.relatedStockPriorHeld ?? 0,
      type: item.publicInterestType,
      valuePerShare: value,
    });
  }, [
    item.publicInterestType,
    item.relatedStockDonatedShares,
    item.relatedStockTotalShares,
    item.relatedStockPriorHeld,
    item.relatedStockValuePerShare,
  ]);

  return (
    <ToggleCard
      tone="violet"
      title="내국법인 주식 출연 — 특수관계법인 주식 한도 (§16②)"
      description="출연재산에 내국법인 의결권 주식이 포함되면 유형별 한도(10/20/5%) 초과분이 상속세 과세가액에 산입됩니다."
      checked={enabled}
      onCheckedChange={(on) =>
        onPatch(
          on
            ? { publicInterestType: "general" }
            : {
                publicInterestType: undefined,
                relatedStockDonatedShares: undefined,
                relatedStockTotalShares: undefined,
                relatedStockPriorHeld: undefined,
                relatedStockValuePerShare: undefined,
              },
        )
      }
    >
      <div className="space-y-2" data-testid="pi-type-radio">
        <RadioCardGroup<PublicInterestType>
          name={`pi-type-${item.ruleId}`}
          layout="stack"
          tone="violet"
          value={item.publicInterestType ?? "general"}
          options={TYPE_OPTIONS}
          onChange={(v) => onPatch({ publicInterestType: v })}
        />
        <ShareField
          label="발행주식총수등 (자기주식 제외)"
          unit="주"
          testid="pi-total-shares"
          value={item.relatedStockTotalShares}
          onChange={(n) => onPatch({ relatedStockTotalShares: n })}
        />
        <ShareField
          label="출연 주식수"
          unit="주"
          testid="pi-donated-shares"
          value={item.relatedStockDonatedShares}
          onChange={(n) => onPatch({ relatedStockDonatedShares: n })}
        />
        <ShareField
          label="출연 당시 기보유분 (§16②1호 합산)"
          unit="주"
          testid="pi-prior-held"
          value={item.relatedStockPriorHeld}
          onChange={(n) => onPatch({ relatedStockPriorHeld: n })}
        />
        <ShareField
          label="1주당 평가액"
          unit="원"
          testid="pi-value-per-share"
          value={item.relatedStockValuePerShare}
          onChange={(n) => onPatch({ relatedStockValuePerShare: n })}
        />
        {preview && (
          <div
            data-testid="pi-excess-preview"
            className="rounded-md border border-violet-200 bg-violet-100/60 p-2 text-xs text-violet-800 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-200"
          >
            한도 {preview.limitShares.toLocaleString()}주 · 초과 {preview.excessShares.toLocaleString()}주 → 과세가액 산입{" "}
            <strong>{formatKRW(preview.excessStockAmount)}</strong>
            {preview.excessShares === 0 && " (한도 이내 — 전액 불산입)"}
          </div>
        )}
      </div>
    </ToggleCard>
  );
}

"use client";

/**
 * UnlistedStockSpecialReasonSection — 비상장주식 §54④ 순자산가치만 적용 토글
 *
 * 상증법 시행령 §54④ 5개 사유 중 선택 시 가중평균이 아닌 1주당 순자산가치 직접 적용.
 *   - 1호·2호·6호: 무조건 순자산가치
 *   - 3호·5호: 가중평균 < 1주당 순자산가치인 경우만 (단서)
 *
 * 800줄 정책 — StockValuationForm에서 분리.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/calc/inputs/RadioCardGroup";
import type { UnlistedAssetValueOnlyReason } from "@/lib/tax-engine/types/inheritance-gift.types";

const OPTIONS: RadioCardOption<UnlistedAssetValueOnlyReason>[] = [
  {
    value: "liquidation",
    label: "1호 — 청산절차 진행·사업계속 곤란",
    description: "신고기한 이내 청산절차 진행 중이거나 사업주 사망 등으로 사업계속 곤란한 법인 (무조건 순자산가치)",
  },
  {
    value: "lt3y",
    label: "2호 — 사업개시 전·3년 미만·휴업·폐업",
    description: "사업개시 전 법인, 사업개시 후 3년 미만 법인, 휴업·폐업 중인 법인 (무조건 순자산가치)",
  },
  {
    value: "real_estate_80",
    label: "3호 — 부동산 비율 80% 이상",
    description: "법인 자산총액 중 부동산 비율 80% 이상",
    trailing: (
      <span className="text-[10px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
        단서 (조건부)
      </span>
    ),
    hint: "가중평균 < 1주당 순자산가치인 경우만 순자산가치 적용",
  },
  {
    value: "stock_80",
    label: "5호 — 주식 등 가액 80% 이상",
    description: "법인 자산총액 중 주식 등 가액 80% 이상",
    trailing: (
      <span className="text-[10px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
        단서 (조건부)
      </span>
    ),
    hint: "가중평균 < 1주당 순자산가치인 경우만 순자산가치 적용",
  },
  {
    value: "remaining_3y",
    label: "6호 — 잔여 존속기한 3년 이내",
    description: "정관에 존속기한이 확정된 법인으로 평가기준일 현재 잔여 존속기한 3년 이내 (무조건 순자산가치)",
  },
];

interface UnlistedStockSpecialReasonSectionProps {
  value: UnlistedAssetValueOnlyReason | undefined;
  onChange: (next: UnlistedAssetValueOnlyReason | undefined) => void;
}

export function UnlistedStockSpecialReasonSection({
  value,
  onChange,
}: UnlistedStockSpecialReasonSectionProps) {
  const isActive = !!value;

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="rose"
      title="순자산가치만 적용 (상증법 시행령 §54④)"
      description="ON: 5가지 사유 중 선택 — 가중평균 대신 1주당 순자산가치 적용"
      checked={isActive}
      onCheckedChange={(on) => {
        if (on) {
          // 기본값: 가장 빈번한 2호 (사업개시 3년 미만·휴폐업)
          onChange("lt3y");
        } else {
          onChange(undefined);
        }
      }}
    >
      <div className="space-y-2">
        <p className="text-[11px] text-rose-700 dark:text-rose-300">
          ※ 시행령 §54④ 각 호 사유 — 1·2·6호는 무조건 순자산가치 / 3·5호는 단서 적용
          (가중평균 &lt; 1주당 순자산가치인 경우에만)
        </p>
        <RadioCardGroup<UnlistedAssetValueOnlyReason>
          name="assetValueOnlyReason"
          tone="rose"
          options={OPTIONS}
          value={value ?? ""}
          onChange={(next) => onChange(next)}
          layout="stack"
        />
      </div>
    </ToggleCard>
  );
}

"use client";

/**
 * 공유 지분율 입력 위젯 (양도세 자산 카드 — 분자/분모).
 *
 * 동일 물건을 다회 분할 취득(지분 단계취득)하거나 공유 소유한 자산에서
 * 본 자산이 보유한 지분 비율을 입력. 단독 소유는 100/100 기본값.
 *
 * 사용자 입력은 100% 기준 모든 금액(양도가·취득가·필요경비). API 변환 시 × ratio 자동 적용.
 *
 * 참고: 예제 사례 27 (아파트 2회 지분취득) 패턴.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { isFractionalRatioStr } from "@/lib/calc/transfer-tax-api-helpers";
import { cn } from "@/lib/utils";

/** 자산 분할 모드 — 토글 A(함께양도)·토글 B(지분분할)·없음. Step1↔③ 4레벨 prop 공유 타입. */
export type AssetSplitMode = "none" | "companion" | "fractional";

export interface OwnershipRatioInputProps {
  /** 분자 (문자열) */
  numerator: string;
  /** 분모 (문자열) */
  denominator: string;
  /** onChange — 부분 업데이트 patch 전달 */
  onChange: (patch: { numerator?: string; denominator?: string }) => void;
}

/**
 * @deprecated `lib/calc/transfer-tax-api-helpers`의 `isFractionalRatioStr` 사용 권장.
 * 본 export는 기존 호출부 호환을 위해 유지 (CompanionAssetCard 등). 단일 진실 공급원에 위임.
 */
export const isFractionalMode = isFractionalRatioStr;

export function OwnershipRatioInput({
  numerator,
  denominator,
  onChange,
}: OwnershipRatioInputProps) {
  const fractional = isFractionalRatioStr(numerator, denominator);

  return (
    <FieldCard
      label="공유 지분율"
      trailing={
        fractional ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-micro font-semibold text-amber-800">
            지분 모드
          </span>
        ) : null
      }
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-20">
            <DecimalInput
              value={numerator}
              onChange={(v) => onChange({ numerator: v })}
              placeholder="분자"
            />
          </div>
          <span
            className={cn(
              "text-sm font-semibold text-muted-foreground select-none",
            )}
          >
            /
          </span>
          <div className="w-20">
            <DecimalInput
              value={denominator}
              onChange={(v) => onChange({ denominator: v })}
              placeholder="분모"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            (
            {numerator && denominator && parseFloat(denominator) > 0
              ? `${((parseFloat(numerator) / parseFloat(denominator)) * 100).toFixed(2)}%`
              : "—"}
            )
          </span>
        </div>
      </div>
    </FieldCard>
  );
}

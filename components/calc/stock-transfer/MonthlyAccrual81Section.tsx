"use client";

/**
 * 소칙 §81④ 1호 월할 가산 입력 섹션 — 공용 (본체·준용 양 경로 재사용)
 *
 *   - §165⑤ 후단 준용 (취득 후 상장): PostListingValuationCard — "취득·상장" 문구, 보유월수 종점 = 상장일
 *   - §165⑨ 본체 (비상장 환산 양도·취득 기준시가 동일): EstimatedUnlistedBlock — "취득·양도" 문구, 종점 = 양도일
 *
 * 전전연도 NI/NA·직전사업연도 월수는 동일 form 키 공유(두 경로 동시 활성 없음).
 * 토글 필드만 경로별 상이 → checked/onToggle을 부모가 주입. UI dual-truth 방지(단일 컴포넌트).
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";

export interface MonthlyAccrual81SectionProps {
  /** 평가액 동일 판정 후 노출 여부 (활성 우선 — 부모가 계산해 전달) */
  visible: boolean;
  /** 토글 상태 (monthlyAccrualToggle 또는 unlistedSameBizYearToggle) */
  checked: boolean;
  onToggle: (v: boolean) => void;
  /** 전전사업연도 NI/NA·직전사업연도 월수 (공유 form 키) */
  prePriorNI: string;
  prePriorNA: string;
  priorBizYearMonths: string;
  onChangePrePriorNI: (v: string) => void;
  onChangePrePriorNA: (v: string) => void;
  onChangePriorBizYearMonths: (v: string) => void;
  /** 경로별 문구 */
  title: string;
  description: string;
  /** 직전사업연도 월수 hint (보유월수 종점 문구 차이) */
  monthsHint: string;
}

export function MonthlyAccrual81Section({
  visible,
  checked,
  onToggle,
  prePriorNI,
  prePriorNA,
  priorBizYearMonths,
  onChangePrePriorNI,
  onChangePrePriorNA,
  onChangePriorBizYearMonths,
  title,
  description,
  monthsHint,
}: MonthlyAccrual81SectionProps) {
  if (!visible) return null;
  return (
    <ToggleCard
      checked={checked}
      onCheckedChange={onToggle}
      title={title}
      description={description}
      tone="rose"
    >
      <div className="space-y-3">
        <CurrencyInput
          label="전전사업연도 1주당 순손익가치"
          hint="취득일이 속하는 사업연도의 전전사업연도 1주당 순손익가치 (원, §81④ 1호)"
          value={prePriorNI}
          onChange={onChangePrePriorNI}
        />
        <CurrencyInput
          label="전전사업연도 1주당 순자산가치"
          hint="취득일이 속하는 사업연도의 전전사업연도 1주당 순자산가치 (원, §81④ 1호)"
          value={prePriorNA}
          onChange={onChangePrePriorNA}
        />
        <FieldCard label="직전사업연도의 월수" hint={monthsHint}>
          <DecimalInput value={priorBizYearMonths} onChange={onChangePriorBizYearMonths} unit="개월" />
        </FieldCard>
      </div>
    </ToggleCard>
  );
}

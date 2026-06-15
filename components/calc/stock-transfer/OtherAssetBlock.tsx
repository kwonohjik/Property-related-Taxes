"use client";

/**
 * OtherAssetBlock — §94①4 기타자산 판정 (Step 1)
 *
 * 다목: 과점주주 (자산 50% 이상 부동산 + 지분 50% 초과 + 50% 이상 양도)
 * 라목: 부동산과다보유법인 (자산 80% 이상 + 골프장 등)
 *
 * §94② 우선순위: §94①3 (상장·비상장) + §94①4 동시 충족 시 제4호(기타자산) 우선
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface OtherAssetBlockProps {
  form: Pick<
    StockTransferFormData,
    | "isQualifyingBlockShareholder"
    | "isHeavyRealEstateForRate"
    | "isHeavyRealEstateForValuation"
    | "cumulativeTransferRatio"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function OtherAssetBlock({ form, onChange }: OtherAssetBlockProps) {
  const isBothActive = form.isQualifyingBlockShareholder && form.isHeavyRealEstateForRate;

  return (
    <FieldCard
      label="기타자산 해당 여부 (§94①4)"
      hint="과점주주 또는 부동산과다보유법인 주식 — 기타자산으로 분류 시 §55 누진세율 적용"
      trailing={
        <div className="flex flex-wrap gap-1">
          <LawArticleModal legalBasis="소득세법 §94 ① 4호" label="§94①4" />
          <LawArticleModal legalBasis="소득세법 §94 ②" label="§94②" />
        </div>
      }
    >
      {/* §94② 우선순위 안내 */}
      {isBothActive && (
        <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-medium">§94② 우선순위 적용</p>
          <p className="text-xs mt-1">
            <LawArticleModal legalBasis="소득세법 §94 ① 3호" label="§94①3" />(상장·비상장)과{" "}
            <LawArticleModal legalBasis="소득세법 §94 ① 4호" label="§94①4" />(기타자산)를 동시에 충족하면 제4호(기타자산)가 우선 적용됩니다.
            기본공제도 부동산 그룹(<LawArticleModal legalBasis="소득세법 §103 ②" label="§103②" />)에 합산됩니다.
          </p>
        </div>
      )}

      {/* 다목: 과점주주 */}
      <ToggleCard
        checked={form.isQualifyingBlockShareholder}
        onCheckedChange={(v) => onChange({ isQualifyingBlockShareholder: v })}
        title="§94①4 다목 — 과점주주"
        description="자산총액 50% 이상 부동산 + 지분 50% 초과 + 3년 내 50% 이상 양도"
        tone="rose"
      >
        <div className="mt-3">
          <FieldCard
            label="3년 누적 양도 비율"
            hint="최근 3년간 누적 양도 비율 (%, 예: 55 = 55%). 50% 이상이면 해당."
            unit="%"
          >
            <DecimalInput
              value={form.cumulativeTransferRatio}
              onChange={(v) => onChange({ cumulativeTransferRatio: v })}
              placeholder="50"
            />
          </FieldCard>
        </div>
      </ToggleCard>

      {/* 라목: 부동산과다보유법인 */}
      <div className="mt-3">
        <ToggleCard
          checked={form.isHeavyRealEstateForRate}
          onCheckedChange={(v) => onChange({ isHeavyRealEstateForRate: v })}
          title="§94①4 라목 — 부동산과다보유법인"
          description="자산총액 80% 이상 부동산 + 골프장·스키장·휴양콘도 등 (시행령 §158⑤)"
          tone="rose"
        >
          {/* 평가 가중치 반전용 (50% 임계 별도) */}
          <div className="mt-3">
            <ToggleCard
              checked={form.isHeavyRealEstateForValuation}
              onCheckedChange={(v) => onChange({ isHeavyRealEstateForValuation: v })}
              title="보충적 평가 가중치 반전 (자산 50% 이상)"
              description="소령 §165⑤ 단서 — 부동산 50% 이상 시 순손익 2/5 + 순자산 3/5 (가중치 반전)"
              tone="fuchsia"
            />
          </div>
        </ToggleCard>
      </div>
    </FieldCard>
  );
}

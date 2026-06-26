"use client";

/**
 * Section53_8_2Fields — §53⑧2호 전부매각 할증배제 보조입력 (상장·비상장 공용).
 *
 * premiumExclusionReason === "all_sold_within_6m" 선택 시에만 렌더.
 * 부모가 value(undefined 가능) 전달 + onChange로 직접 set (useEffect 미러링 금지 — mirror-pattern).
 *
 * Design: docs/02-design/features/stock-premium-exclusion-53-8-2-correction.ui.design.md §1·§2
 */

import { ToggleChip } from "@/components/calc/inputs/ToggleChip";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { Section53_8_2Input } from "@/lib/tax-engine/types/stock-premium-exclusion.types";

interface Props {
  value: Section53_8_2Input | undefined;
  onChange: (v: Section53_8_2Input) => void;
  idPrefix: string;
  /** 미입력 시 transferType 초기값을 계산 세목(상속/증여)에서 seed — 증여 기간(전6·후3월) 정확성 */
  transferTypeDefault?: "inheritance" | "gift";
}

const TRANSFER_TYPE_OPTIONS: Array<{
  value: "inheritance" | "gift";
  label: string;
  description: string;
}> = [
  { value: "inheritance", label: "상속", description: "평가기준일 전후 6개월" },
  { value: "gift", label: "증여", description: "평가기준일 전 6개월 ~ 후 3개월" },
];

function iso(v: Date | string | undefined): string {
  if (!v) return "";
  return v instanceof Date ? v.toISOString().slice(0, 10) : v;
}

export function Section53_8_2Fields({ value, onChange, idPrefix, transferTypeDefault }: Props) {
  const v: Section53_8_2Input = value ?? {
    allSharesSold: false,
    meetsArticle49_1_1: false,
    saleContractDate: "",
    transferType: transferTypeDefault ?? "inheritance",
  };
  const set = (patch: Partial<Section53_8_2Input>) => onChange({ ...v, ...patch });

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-emerald-700">§53⑧2호 전부매각 요건</p>
        <LawArticleModal legalBasis="상속세 및 증여세법 시행령 §49" label="§49①1호" />
      </div>
      <p className="text-[11px] text-emerald-700/80">
        ⓘ 매각대금에 경영권 프리미엄이 포함돼 시가로 인정되는 경우 — 요건 모두 충족 시 할증평가
        제외. (상속=평가기준일 ±6월 / 증여=전6·후3월 내 매매계약)
      </p>

      <div className="flex flex-wrap gap-1.5">
        <ToggleChip
          tone="emerald"
          label="최대주주 보유 주식 전부 매각"
          checked={v.allSharesSold}
          onCheckedChange={(c) => set({ allSharesSold: c })}
          data-testid={`${idPrefix}-all-sold`}
        />
        <ToggleChip
          tone="emerald"
          label="§49①1호 적합 (특수관계 부당거래 아님)"
          checked={v.meetsArticle49_1_1}
          onCheckedChange={(c) => set({ meetsArticle49_1_1: c })}
          data-testid={`${idPrefix}-art49`}
        />
      </div>

      <FieldCard label="매매계약일 (§49②1호 기준)">
        <div data-testid={`${idPrefix}-sale-date`}>
          <DateInput
            value={iso(v.saleContractDate)}
            onChange={(d) => set({ saleContractDate: d || "" })}
          />
        </div>
      </FieldCard>

      <FieldCard label="구분">
        <div data-testid={`${idPrefix}-transfer-type`}>
          <RadioCardGroup
            lawLinks="상증법"
            layout="inline"
            name={`${idPrefix}-transfer-type`}
            value={v.transferType}
            onChange={(t) => set({ transferType: t as "inheritance" | "gift" })}
            options={TRANSFER_TYPE_OPTIONS}
            tone="emerald"
          />
        </div>
      </FieldCard>
    </div>
  );
}

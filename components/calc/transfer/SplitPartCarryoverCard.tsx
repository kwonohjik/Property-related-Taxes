"use client";

/**
 * 파트 이월과세(소득세법 §97의2①) — **한 파트(토지/건물)의 증여자 취득 입력 카드** (P2 C).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.3·§3.2
 *
 * 증여자가 토지·건물을 다른 날 취득했다면 증여자 취득일·취득가액·자본적지출은 파트마다 다르다. 이 카드는 그 한 파트 분량이다:
 *   증여자 취득일 → 증여자 취득가액 → 증여자가 지출한 자본적 지출 → 증여 신고가액(= 증여세 상당액 안분의 분자 · ②3호 미적용 시 수증자 취득가액)
 *
 * · 환산취득가 토글은 없다 — 파트 환산은 후속(I-4). 증여자 취득가액이 필수이고 모르면 이 입력은 아직 지원하지 않는다.
 * · 증여 신고가액은 기존 파트 취득가액 칸(`landAcquisitionPrice`·`buildingAcquisitionPrice`)을 그대로 바인딩한다 — 이중 진실 금지(엔진 와이어에 파트 평가액 칸이 없다).
 * · 앵커(`data-field`)는 ⑧(`transfer-tax-validate-split-carryover.ts`)이 이동시키는 키와 같다.
 */
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

export interface SplitPartCarryoverCardProps {
  part: "land" | "building";
  /** 섹션 번호 배지 */
  sectionNum: number;
  /** 이 파트의 증여자 서브폼 — 토지 `landCarryover`, 건물 `carryover` */
  value: CarryoverTaxationForm;
  onPatch: (patch: Partial<CarryoverTaxationForm>) => void;
  /** 증여 신고가액(파트 취득가액 칸) */
  valuation: string;
  onValuationChange: (v: string) => void;
  /** ⑧ 이동 앵커 접두 — 토지 `landCarryover`, 건물 `carryover` */
  anchorPrefix: "landCarryover" | "carryover";
  valuationField: "landAcquisitionPrice" | "buildingAcquisitionPrice";
  /** 양도일 ≥ 2024.1.1. — 증여자 자본적지출은 그 이후 양도분부터 반영된다 */
  isAfter2024: boolean;
  /** 건물 카드: 토글을 켜기 전 자산 전체 입력을 이어받는 칸임을 알린다 */
  inheritedNotice?: boolean;
}

export function SplitPartCarryoverCard(props: SplitPartCarryoverCardProps) {
  const { part, value: c, onPatch, anchorPrefix } = props;
  const name = part === "land" ? "토지" : "건물";
  const tid = `split-carryover-${part}`;
  return (
    <ToneCard tone="amber" sectionNum={props.sectionNum} title={`${name} — 증여자 취득`} bodyClassName="space-y-3">
      <div data-testid={`${tid}-card`} className="space-y-3">
        {props.inheritedNotice && (
          <p className="text-caption text-amber-800 dark:text-amber-200" data-testid="split-carryover-building-inherited-note">
            건물 칸은 자산 전체 이월과세에서 입력하던 증여자 정보와 같은 칸입니다 — 토글을 켜기 전에 입력한 값이 있다면 <strong>건물 기준</strong> 값인지 확인하세요.
          </p>
        )}
        <FieldCard
          label="증여자 취득일"
          field={`${anchorPrefix}.donorAcquisitionDate`}
          hint={`증여자가 ${name}을(를) 취득한 날 — 보유기간·장기보유특별공제 기산일 (소득세법 §95④ 단서)`}
        >
          <DateInput
            value={c.donorAcquisitionDate}
            onChange={(v) => onPatch({ donorAcquisitionDate: v })}
            data-testid={`${tid}-donor-date`}
          />
        </FieldCard>

        <FieldCard
          label="증여자 취득가액"
          field={`${anchorPrefix}.donorAcquisitionPrice`}
          hint={`증여자가 ${name}을(를) 취득할 당시의 금액 (소득세법 §97①1호) — 증여자가 상속·증여로 취득했다면 상속개시일·증여일 현재 상속세 및 증여세법상 평가액입니다 (시행령 §163⑨). 금액을 모르면 이 입력은 아직 지원하지 않습니다.`}
        >
          <CurrencyInput
            label=""
            value={c.donorAcquisitionPrice}
            onChange={(v) => onPatch({ donorAcquisitionPrice: v })}
            data-testid={`${tid}-donor-price`}
          />
        </FieldCard>

        <FieldCard
          label="증여자가 지출한 자본적 지출"
          field={`${anchorPrefix}.donorCapitalExpenditure`}
          hint={
            props.isAfter2024
              ? `증여자가 보유기간 중 ${name}에 지출한 자본적 지출 (소득세법 §97의2①2호) — 수증자가 지출한 자본적 지출은 아래 양도 정보의 ${name} 자본적지출 칸에 입력합니다`
              : "2024.1.1. 이후 양도분부터 적용됩니다 (2023.12.31. 신설)"
          }
        >
          <CurrencyInput
            label=""
            value={c.donorCapitalExpenditure}
            onChange={(v) => onPatch({ donorCapitalExpenditure: v })}
            placeholder={props.isAfter2024 ? "없으면 비워두세요" : "해당 없음"}
            disabled={!props.isAfter2024}
            data-testid={`${tid}-donor-capex`}
          />
        </FieldCard>

        <FieldCard
          label="증여 신고가액"
          field={props.valuationField}
          hint={`증여세 신고서에 적은 ${name}의 평가액 — 증여세 상당액 안분의 분자이자, 이월과세를 적용하지 않을 때 수증자의 ${name} 취득가액입니다 (시행령 §163의2②·§163⑨)`}
        >
          <CurrencyInput
            label=""
            value={props.valuation}
            onChange={props.onValuationChange}
            data-testid={`${tid}-gift-valuation`}
          />
        </FieldCard>
      </div>
    </ToneCard>
  );
}

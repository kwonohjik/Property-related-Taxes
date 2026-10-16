"use client";

/**
 * 겸용주택 결과 — ④ 비사업용토지(주택부수토지 배율초과) 섹션.
 *
 * `MixedUseCalculationSections.tsx`에서 분리 (800줄 정책 — 겸용 × 부담부증여 배선으로 735줄이 되어 열린 김에 분리).
 * 동작 무변경 — 순수 이동이다.
 */
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import {
  DivRow,
  ResultSection,
  Row,
  fmt,
  fmtPct,
  fmtPlain,
  fmtSqm,
} from "@/components/calc/results/mixed-use/MixedUseResultCardParts";

interface Props {
  nb: NonNullable<MixedUseGainBreakdown["nonBusinessLandPart"]>;
  /** 주택 토지분 양도차익 (`housingPart.landTransferGain`) */
  landTransferGain: number;
  /** 배율초과 비율 (`housingPart.nonBusinessTransferRatio`) */
  nonBusinessTransferRatio: number;
  open: boolean;
  onToggle: () => void;
}

export function MixedUseNblSection({ nb, landTransferGain, nonBusinessTransferRatio, open, onToggle }: Props) {
  return (
    <ResultSection
      title="④ 비사업용토지 (주택부수토지 배율초과)"
      basis="시행령 §168의12 + §104의3"
      open={open}
      onToggle={onToggle}
    >
      <Row
        label={`적용 배율`}
        value={`${nb.appliedMultiplier}배`}
        formula="수도권 주거지역 3배 / 녹지·외곽 5배 / 도시 외 10배"
      />
      <Row
        label="배율초과 면적"
        value={fmtSqm(nb.excessArea)}
        formula="주택부수토지 면적 - (주택 정착면적 × 배율)"
      />
      <Row
        label="비사업용 양도차익"
        value={fmt(nb.transferGain)}
        formula={`주택 토지분 양도차익 ${fmtPlain(landTransferGain)} × 배율초과 비율 ${fmtPct(nonBusinessTransferRatio)}`}
      />
      <Row
        label={`장기보유공제 (표1, ${fmtPct(nb.longTermDeductionRate)})`}
        value={`△ ${fmt(nb.longTermDeductionAmount)}`}
        formula="토지 보유연수×2% (최대 30%)"
      />
      <DivRow />
      <Row
        label="비사업용토지 양도소득금액 (+10%p 가산)"
        value={fmt(nb.incomeAmount)}
        highlight
        formula={`양도차익 ${fmtPlain(nb.transferGain)} - 장기보유공제 ${fmtPlain(nb.longTermDeductionAmount)} (세율 가산은 합산세액에서 처리)`}
      />
    </ResultSection>
  );
}

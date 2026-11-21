"use client";

/**
 * 겸용주택 결과 — ④ 비사업용토지(주택부수토지 배율초과) 섹션.
 *
 * `MixedUseCalculationSections.tsx`에서 분리 (800줄 정책 — 겸용 × 부담부증여 배선으로 735줄이 되어 열린 김에 분리).
 * 동작 무변경 — 순수 이동이다.
 */
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { nblExclusionBannerText } from "@/components/calc/results/transfer/nbl-surcharge-exclusion-label";
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
  /** 상가 토지분 양도차익 (`commercialPart.landTransferGain`) — OH-17(§154③ 본문)에서 같은 비율로 이 파트에 옮겨 온 몫의 원값 */
  commercialLandTransferGain?: number;
  open: boolean;
  onToggle: () => void;
}

export function MixedUseNblSection({ nb, landTransferGain, nonBusinessTransferRatio, commercialLandTransferGain, open, onToggle }: Props) {
  // V10-BX09 — OH-17(§154③ 본문)이면 한도는 「전체 토지 × 건물 전체 정착면적」, 양도차익은 주택·상가 토지분의 합이다. 문구가 한 가지로 고정되면 값과 어긋난다.
  const whole = nb.excessBasis?.wholeBuildingDeemedHouse === true;
  const addPct = Math.round(nb.additionalRate * 100);
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
        formula={
          whole && nb.excessBasis
            ? `전체 토지 ${fmtPlain(nb.excessBasis.landArea)}㎡ - (건물 전체 정착면적 ${fmtPlain(nb.excessBasis.footprintArea)}㎡ × ${nb.appliedMultiplier}배) — 주택 연면적이 더 커 토지 전부가 주택 부수토지(시행령 §154③ 본문)`
            : "주택부수토지 면적 - (주택 정착면적 × 배율)"
        }
      />
      <Row
        label="비사업용 양도차익"
        value={fmt(nb.transferGain)}
        formula={
          whole && commercialLandTransferGain !== undefined
            ? `주택 토지분 양도차익 ${fmtPlain(landTransferGain)} × 배율초과 비율 ${fmtPct(nonBusinessTransferRatio)} + 상가 부수토지분 양도차익 ${fmtPlain(commercialLandTransferGain)} × 같은 비율 (각각 원 미만 절사)`
            : `주택 토지분 양도차익 ${fmtPlain(landTransferGain)} × 배율초과 비율 ${fmtPct(nonBusinessTransferRatio)}`
        }
      />
      <Row
        label={`장기보유공제 (표1, ${fmtPct(nb.longTermDeductionRate)})`}
        value={`△ ${fmt(nb.longTermDeductionAmount)}`}
        formula="토지 보유연수×2% (최대 30%)"
      />
      <DivRow />
      <Row
        label={
          addPct > 0
            ? `비사업용토지 양도소득금액 (+${addPct}%p 가산)`
            : nb.deemedBusiness
              ? "비사업용토지 양도소득금액 (비사업용 토지로 보지 않아 가산 없음)" // NBL2611-C5
              : "비사업용토지 양도소득금액 (위기취득 — 가산 없음)"
        }
        value={fmt(nb.incomeAmount)}
        highlight
        formula={`양도차익 ${fmtPlain(nb.transferGain)} - 장기보유공제 ${fmtPlain(nb.longTermDeductionAmount)} (세율 가산은 합산세액에서 처리)`}
      />
      {/* NBL2611-C5 — 수용 의제(영 §168의14③3호)·유예(①)로 비사업용이 아닌 초과분: 분리·전액 과세는 그대로, +10%p 가산만 없다. */}
      {nb.deemedBusiness && (
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p data-testid="mixed-nbl-deemed-business">
            {nb.deemedBusiness.detail} — 비사업용 토지로 보지 않아 +10%p 가산을 적용하지 않았습니다 ({nb.deemedBusiness.legalBasis}). 배율 초과분은 비과세 범위가 아니라 과세 대상입니다.
          </p>
        </ToneCard>
      )}
      {nb.surchargeExcludedBy && (
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p data-testid="mixed-nbl-surcharge-excluded">{nblExclusionBannerText(nb.surchargeExcludedBy)}</p>
        </ToneCard>
      )}
    </ResultSection>
  );
}

"use client";

/**
 * 개별주택가격 미공시 취득 — 실시간 미리보기 카드
 *
 * 입력 즉시 calcPreHousingDisclosureGain()을 클라이언트 사이드에서 호출하여
 * P_A_est 등 주요 중간값을 미리 보여준다.
 *
 * 모든 필수 입력값이 채워지지 않으면 안내 메시지를 표시한다.
 *
 * 법령 근거:
 *   소득세법 시행령 §164 ⑤ — P_A_est 추정 공식
 *   소득세법 시행령 §166 ⑥ — 토지/건물 안분
 */

import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import type { PreHousingDisclosureInput } from "@/lib/tax-engine/types/transfer.types";

// ─── Props ────────────────────────────────────────────────────────

interface Props {
  transferPrice: number;
  phdInput: Partial<PreHousingDisclosureInput>;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────

function isComplete(input: Partial<PreHousingDisclosureInput>): input is PreHousingDisclosureInput {
  return !!(
    input.landArea &&
    input.landArea > 0 &&
    input.landPricePerSqmAtAcquisition !== undefined &&
    input.buildingStdPriceAtAcquisition !== undefined &&
    input.landPricePerSqmAtFirstDisclosure !== undefined &&
    input.buildingStdPriceAtFirstDisclosure !== undefined &&
    input.firstDisclosureHousingPrice &&
    input.firstDisclosureHousingPrice > 0 &&
    input.transferHousingPrice &&
    input.transferHousingPrice > 0 &&
    input.landPricePerSqmAtTransfer !== undefined &&
    input.buildingStdPriceAtTransfer !== undefined
  );
}

// ─── 행 컴포넌트 ──────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: string;
  emphasis?: boolean;
  sub?: boolean;
}

function Row({ label, value, emphasis = false, sub = false }: RowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-1 ${
        sub ? "pl-4" : ""
      } ${emphasis ? "border-t border-border pt-2 mt-1" : ""}`}
    >
      <span
        className={`text-sm ${
          emphasis
            ? "font-bold text-foreground"
            : sub
              ? "text-xs text-muted-foreground"
              : "text-sm text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          emphasis ? "text-base font-bold text-primary" : "text-sm text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── 메인 카드 ────────────────────────────────────────────────────

export function PreHousingDisclosurePreviewCard({ transferPrice, phdInput }: Props) {
  if (!isComplete(phdInput)) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          입력값을 모두 채우면 미리보기가 표시됩니다.
        </p>
      </div>
    );
  }

  if (transferPrice <= 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          양도가액을 입력하면 미리보기가 표시됩니다.
        </p>
      </div>
    );
  }

  let result;
  try {
    result = calcPreHousingDisclosureGain(transferPrice, phdInput);
  } catch {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-3">
        <p className="text-xs text-destructive">
          계산 중 오류가 발생했습니다. 입력값을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-4 py-3 space-y-1">
      <p className="text-xs font-semibold text-muted-foreground mb-2">
        §164 ⑤ 미리보기 (저장 전 추정값)
      </p>

      {/* 기준시가 합계 */}
      <Row label="Sum_A (취득시 기준시가 합계)" value={formatKRW(result.sumAtAcquisition)} />
      <Row
        label="Sum_F (최초공시일 기준시가 합계)"
        value={formatKRW(result.sumAtFirstDisclosure)}
      />
      <Row label="Sum_T (양도시 기준시가 합계)" value={formatKRW(result.sumAtTransfer)} />

      {/* P_A_est — 핵심 */}
      <Row
        label="P_A_est (추정 취득시 개별주택가격)"
        value={formatKRW(result.estimatedHousingPriceAtAcquisition)}
        emphasis
      />

      {/* 안분 — 양도가액 */}
      <div className="border-t border-border pt-2 mt-1">
        <p className="text-xs font-semibold text-muted-foreground mb-1">양도가액 분리</p>
        <Row label="토지 양도가액" value={formatKRW(result.landTransferPrice)} sub />
        <Row label="건물 양도가액" value={formatKRW(result.buildingTransferPrice)} sub />
      </div>

      {/* 총 환산취득가 */}
      <div className="border-t border-border pt-2 mt-1">
        <p className="text-xs font-semibold text-muted-foreground mb-1">환산취득가액</p>
        <Row
          label="총 환산취득가"
          value={formatKRW(result.totalEstimatedAcquisitionPrice)}
          emphasis
        />
        <Row label="토지 환산취득가" value={formatKRW(result.landAcquisitionPrice)} sub />
        <Row label="건물 환산취득가" value={formatKRW(result.buildingAcquisitionPrice)} sub />
      </div>

      {/* 개산공제 */}
      <div className="border-t border-border pt-2 mt-1">
        <p className="text-xs font-semibold text-muted-foreground mb-1">개산공제 (§163 ⑥)</p>
        <Row label="토지 개산공제" value={formatKRW(result.landLumpDeduction)} sub />
        <Row label="건물 개산공제" value={formatKRW(result.buildingLumpDeduction)} sub />
      </div>

      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">
        * 이 금액은 입력값 기반 추정이며, 최종 계산은 &apos;계산하기&apos; 버튼 클릭 후 확정됩니다.
      </p>
    </div>
  );
}

// ─── 헬퍼: AssetForm 필드에서 Partial<PreHousingDisclosureInput> 생성 ────

/**
 * AssetForm의 phd* 필드를 Partial<PreHousingDisclosureInput>으로 변환.
 * PreHousingDisclosurePreviewCard의 phdInput prop에 전달할 때 사용.
 */
export function buildPhdInputFromAsset(
  asset: {
    acquisitionArea: string;
    phdFirstDisclosureDate: string;
    phdFirstDisclosureHousingPrice: string;
    phdLandPricePerSqmAtAcq: string;
    phdBuildingStdPriceAtAcq: string;
    phdLandPricePerSqmAtFirst: string;
    phdBuildingStdPriceAtFirst: string;
    phdTransferHousingPrice: string;
    phdLandPricePerSqmAtTransfer: string;
    phdBuildingStdPriceAtTransfer: string;
  }
): Partial<PreHousingDisclosureInput> {
  const area = parseFloat(asset.acquisitionArea || "0");

  return {
    landArea: area > 0 ? area : undefined,
    firstDisclosureDate: asset.phdFirstDisclosureDate
      ? new Date(asset.phdFirstDisclosureDate)
      : undefined,
    firstDisclosureHousingPrice: parseAmount(asset.phdFirstDisclosureHousingPrice) || undefined,
    landPricePerSqmAtAcquisition: parseAmount(asset.phdLandPricePerSqmAtAcq),
    buildingStdPriceAtAcquisition: parseAmount(asset.phdBuildingStdPriceAtAcq),
    landPricePerSqmAtFirstDisclosure: parseAmount(asset.phdLandPricePerSqmAtFirst),
    buildingStdPriceAtFirstDisclosure: parseAmount(asset.phdBuildingStdPriceAtFirst),
    transferHousingPrice: parseAmount(asset.phdTransferHousingPrice) || undefined,
    landPricePerSqmAtTransfer: parseAmount(asset.phdLandPricePerSqmAtTransfer),
    buildingStdPriceAtTransfer: parseAmount(asset.phdBuildingStdPriceAtTransfer),
  };
}

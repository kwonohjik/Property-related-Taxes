"use client";

/**
 * 매매사례가액 추계(§176의2③1호) 입력 섹션
 *
 * CompanionAcqPurchaseBlock에서 분리 (800줄 정책).
 * isSalesCaseAcquisition=true 시 렌더됨:
 *   - 매매사례가액 CurrencyInput (수동 입력 or 자동조회 채움)
 *   - 실거래가 자동조회 버튼 → RtmsSimilarSalesModal(taxType="transfer")
 *   - 출처 배지: "rtms_auto" 시 [실거래가 자동조회] 표시
 *   - 취득시 기준시가 입력 (개산공제 3% base)
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RtmsSimilarSalesModal } from "@/components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal";
import { Button } from "@/components/ui/button";

export interface SalesCaseSectionProps {
  /** 매매사례가액 (원 문자열) */
  similarSalesValue: string;
  onSimilarSalesValueChange: (v: string) => void;
  /** 출처 배지 제어 */
  similarSalesSource?: "rtms_auto" | undefined;
  onSimilarSalesSourceChange?: (v: "rtms_auto" | undefined) => void;
  /** RTMS 자동조회 활성화 조건 */
  acquisitionSigunguCode?: string;
  acquisitionAddress?: string;
  /** 취득 당시 면적 (㎡ 문자열) */
  acquisitionArea?: string;
  /** 취득일 (RTMS valuationDate) */
  acquisitionDate: string;
  /** 건물명 (RTMS aptName) */
  buildingName?: string;
  /** 취득시 기준시가 (원) — 개산공제 3% base */
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
}

export function SalesCaseSection({
  similarSalesValue,
  onSimilarSalesValueChange,
  similarSalesSource,
  onSimilarSalesSourceChange,
  acquisitionSigunguCode,
  acquisitionAddress,
  acquisitionArea,
  acquisitionDate,
  buildingName,
  standardPriceAtAcq,
  onStandardPriceAtAcqChange,
}: SalesCaseSectionProps) {
  const [rtmsOpen, setRtmsOpen] = useState(false);

  const hasAddress = !!acquisitionAddress;
  const hasSigunguCode = !!acquisitionSigunguCode;
  const hasArea = !!acquisitionArea && parseFloat(acquisitionArea) > 0;
  const rtmsDisabled = !hasAddress || !hasSigunguCode || !hasArea;

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            매매사례가액 (원) <span className="text-destructive">*</span>
          </span>
          {similarSalesSource === "rtms_auto" && (
            <span className="inline-flex items-center rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-micro font-semibold text-sky-800">
              실거래가 자동조회
            </span>
          )}
        </div>
        <CurrencyInput
          label=""
          hideLabel
          value={similarSalesValue}
          onChange={(v) => {
            onSimilarSalesValueChange(v);
            // 수동 입력 시 자동조회 출처 제거
            if (similarSalesSource !== undefined) {
              onSimilarSalesSourceChange?.(undefined);
            }
          }}
          hint="소득세법 §176의2③1호: 취득일 전후 3개월 내 유사 면적·용도 매매사례 확인 가격. 필요경비 개산공제(취득시 기준시가 × 3%)가 자동 적용됩니다."
        />
        <Button
          type="button"
          variant="modalLauncher"
          size="default"
          onClick={() => setRtmsOpen(true)}
          disabled={rtmsDisabled}
        >
          실거래가 자동조회 (RTMS)
        </Button>
        {rtmsDisabled && (
          <p className="text-caption text-muted-foreground">
            자동조회를 사용하려면 취득 주소·면적을 먼저 입력하세요.
          </p>
        )}
      </div>

      {/* 취득시 기준시가 — 개산공제 3% base */}
      <CurrencyInput
        label="취득시 기준시가 (원) — 개산공제 base"
        value={standardPriceAtAcq}
        onChange={onStandardPriceAtAcqChange}
        hint="필요경비 개산공제 = 이 금액의 3%. 미입력 시 0% 적용."
      />

      {/* RTMS 자동조회 모달 */}
      {!rtmsDisabled && (
        <RtmsSimilarSalesModal
          open={rtmsOpen}
          onOpenChange={setRtmsOpen}
          sigunguCode={acquisitionSigunguCode!}
          aptName={buildingName ?? ""}
          targetExclusiveAreaM2={acquisitionArea ? parseFloat(acquisitionArea) : undefined}
          valuationDate={acquisitionDate}
          taxType="transfer"
          onSelect={({ amount }) => {
            onSimilarSalesValueChange(String(amount));
            onSimilarSalesSourceChange?.("rtms_auto");
            setRtmsOpen(false);
          }}
        />
      )}
    </div>
  );
}

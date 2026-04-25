"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 취득일 규칙:
 *   - 1985.1.1. 미만 입력 시 1985.1.1.로 강제 클램핑 (소득세법 적용 하한)
 *   - 1990.8.30. 이전이면 공시지가 연도 자동 1990년, Pre1990 섹션 자동 활성화
 */

import { useState, useEffect } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { Pre1990LandValuationInput, type Pre1990FormSlice } from "@/components/calc/inputs/Pre1990LandValuationInput";

const MIN_ACQ_DATE = "1985-01-01";

/**
 * assetKind → StandardPriceInput propertyKind 변환
 * "housing" → house_individual, "land" → land, 그 외 → building_non_residential
 */
function toPropertyKind(
  assetKind?: string,
): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (assetKind === "housing") return "house_individual";
  if (assetKind === "land") return "land";
  return "building_non_residential";
}

interface BlockProps {
  acquisitionDate: string;
  onAcquisitionDateChange: (v: string) => void;
  useEstimatedAcquisition: boolean;
  onUseEstimatedChange: (v: boolean) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 환산취득가 분자: 취득시 기준시가 총액 (원) */
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
  /** 환산취득가 분모: 양도시 기준시가 총액 (원) */
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  /** 양도일 (양도시 기준시가 조회 연도 계산용) */
  transferDate?: string;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
  /** 자산 종류 — 공시가격 API 선택 및 토지 면적 계산용 */
  assetKind?: string;
  /** 취득 당시 면적 (㎡) — 취득시 기준시가 자동계산, Pre1990 환산용 */
  acquisitionArea?: string;
  /** 양도 당시 면적 (㎡) — 양도시 기준시가 자동계산용 */
  transferArea?: string;
  /** 1990 이전 취득 토지 환산 슬라이스 */
  pre1990Form?: Pre1990FormSlice;
  onPre1990Change?: (patch: Partial<Pre1990FormSlice>) => void;
  /** 취득시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtAcq?: string;
  onStandardPricePerSqmAtAcqChange?: (v: string) => void;
  /** 양도시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtTransfer?: string;
  onStandardPricePerSqmAtTransferChange?: (v: string) => void;
}

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  const [dateClampMsg, setDateClampMsg] = useState(false);

  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqmAtAcq, setInternalPricePerSqmAtAcq] = useState("");
  const [internalPricePerSqmAtTransfer, setInternalPricePerSqmAtTransfer] = useState("");

  const acqPricePerSqm = props.standardPricePerSqmAtAcq ?? internalPricePerSqmAtAcq;
  const onAcqPricePerSqmChange = props.onStandardPricePerSqmAtAcqChange ?? setInternalPricePerSqmAtAcq;
  const transferPricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqmAtTransfer;
  const onTransferPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqmAtTransfer;

  const isLand = props.assetKind === "land";
  // acqDatePre1990에서 파생된 derived value — useEffect + setState 불필요
  const acqDatePre1990 = !!(props.acquisitionDate && props.acquisitionDate < "1990-08-30");
  const pre1990ForceYear = acqDatePre1990 ? "1990" : undefined;
  const showPre1990 =
    isLand &&
    !!props.pre1990Form &&
    !!props.onPre1990Change &&
    acqDatePre1990;

  const propertyKind = toPropertyKind(props.assetKind);

  // 취득일 1985.1.1. 미만 클램핑 — 입력 완료(포커스 이탈) 시에만 적용
  function handleAcquisitionDateChange(v: string) {
    props.onAcquisitionDateChange(v);
    setDateClampMsg(false);
  }

  function handleAcquisitionDateBlur() {
    const v = props.acquisitionDate;
    if (v && v < MIN_ACQ_DATE) {
      props.onAcquisitionDateChange(MIN_ACQ_DATE);
      setDateClampMsg(true);
    }
  }

  // 환산취득가 + 1990.8.30. 이전 취득 토지 → pre1990Enabled 자동 체크
  useEffect(() => {
    if (
      props.useEstimatedAcquisition &&
      isLand &&
      acqDatePre1990 &&
      props.onPre1990Change &&
      !props.pre1990Form?.pre1990Enabled
    ) {
      props.onPre1990Change({ pre1990Enabled: true });
    }
  }, [props.useEstimatedAcquisition, isLand, acqDatePre1990]);

  // 취득시 기준시가 조회 단가 → pre1990PricePerSqm_1990 자동 입력
  function handleAcqPricePerSqmChange(v: string) {
    onAcqPricePerSqmChange(v);
    if (showPre1990) {
      props.onPre1990Change?.({ pre1990PricePerSqm_1990: v.replace(/,/g, "") });
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">취득일</label>
        <DateInput
          value={props.acquisitionDate}
          onChange={handleAcquisitionDateChange}
          onBlur={handleAcquisitionDateBlur}
        />
        {dateClampMsg && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            1985.1.1. 의제 취득일로 취득일 변경했습니다.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">취득가액 산정 방식</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(false)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              !props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">실거래가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              매매계약서상 실거래가 입력
            </div>
          </button>
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(true)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">환산취득가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              양도가 × (취득시 ÷ 양도시 기준시가)
            </div>
          </button>
        </div>
      </div>

      {!props.useEstimatedAcquisition ? (
        <CurrencyInput
          label="취득가액 (원)"
          value={props.fixedAcquisitionPrice}
          onChange={props.onFixedAcquisitionPriceChange}
          required
        />
      ) : (
        <>
          {/* 취득시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              취득시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            {isLand && acqDatePre1990 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1990년 이전 취득은 개별공시지가가 없어 아래 토지등급 환산 기능으로 자동 산정됩니다.
              </p>
            )}
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtAcq}
              onTotalPriceChange={props.onStandardPriceAtAcqChange}
              pricePerSqm={acqPricePerSqm}
              onPricePerSqmChange={handleAcqPricePerSqmChange}
              area={props.acquisitionArea}
              jibun={props.jibun}
              referenceDate={props.acquisitionDate}
              hint="환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
              forceYear={pre1990ForceYear}
              enableLookup={!(isLand && acqDatePre1990)}
            />
          </div>

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {showPre1990 && (
            <Pre1990LandValuationInput
              form={props.pre1990Form!}
              onChange={props.onPre1990Change!}
              acquisitionArea={props.acquisitionArea}
              jibun={props.jibun}
              acquisitionDate={props.acquisitionDate}
              transferDate={props.transferDate}
              onCalculatedPrice={(price) => props.onStandardPriceAtAcqChange(String(price))}
            />
          )}

          {/* 양도시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              양도시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtTransfer}
              onTotalPriceChange={props.onStandardPriceAtTransferChange}
              pricePerSqm={transferPricePerSqm}
              onPricePerSqmChange={onTransferPricePerSqmChange}
              area={props.transferArea}
              jibun={props.jibun}
              referenceDate={props.transferDate}
              hint="환산 분모 — 취득시/양도시 기준시가 비율의 분모"
            />
          </div>
        </>
      )}
    </div>
  );
}

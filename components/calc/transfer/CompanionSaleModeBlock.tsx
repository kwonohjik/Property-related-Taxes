"use client";

/**
 * 일괄양도 양도가액 모드 토글 + 자산별 가액 입력 블록
 *
 * 소득세법 시행령 §166 ⑥
 *   - 본문(actual):     계약서에 자산별 가액이 구분 기재된 경우 그 실제 가액 사용
 *   - 단서(apportioned): 구분 불분명한 경우 기준시가 비율 안분
 *
 * 모드는 계약서 단위 단일 결정이므로 Step1 상단에 토글을 두고,
 * 각 동반자산 카드는 모드를 prop으로 받아 입력 필드만 분기한다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type BundledSaleMode = "actual" | "apportioned";

interface ToggleProps {
  value: BundledSaleMode;
  onChange: (mode: BundledSaleMode) => void;
}

/**
 * 양도가액 결정 방식 토글 (Step1 일괄양도 섹션 상단 배치)
 */
export function BundledSaleModeToggle({ value, onChange }: ToggleProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">양도가액 결정 방식 (§166⑥)</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange("actual")}
          className={cn(
            "rounded-md border-2 p-3 text-left transition-all",
            value === "actual"
              ? "border-primary bg-primary/5 text-primary"
              : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
          )}
        >
          <div className="text-sm font-semibold">실가 (계약서 구분 기재)</div>
          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            계약서에 자산별 가액이 명시됨 — 그대로 사용
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange("apportioned")}
          className={cn(
            "rounded-md border-2 p-3 text-left transition-all",
            value === "apportioned"
              ? "border-primary bg-primary/5 text-primary"
              : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
          )}
        >
          <div className="text-sm font-semibold">안분 (기준시가 비율)</div>
          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            구분 불분명 — 양도시 기준시가 비율로 안분
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── 자산 카드 내부 양도가액 입력 ───────────────────────────────

interface BlockProps {
  bundledSaleMode: BundledSaleMode;
  assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right";
  // actual 모드용
  actualSalePrice: string;
  onActualSalePriceChange: (v: string) => void;
  // apportioned 모드용
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  /** 단일 자산 모드: §166⑥ 관련 문구 제거, 레이블 단순화 */
  singleMode?: boolean;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
  /** 양도일 (기준연도 자동 계산용) */
  transferDate?: string;
  /** 양도 당시 면적 (㎡) — 안분 모드 토지에서 기준시가 자동 계산에 사용 */
  transferArea?: string;
  onTransferAreaChange?: (v: string) => void;
  /** ㎡당 양도시 기준시가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtTransfer?: string;
  onStandardPricePerSqmAtTransferChange?: (v: string) => void;
}

/**
 * assetKind → StandardPriceInput propertyKind 변환
 */
function toPropertyKind(
  assetKind: BlockProps["assetKind"],
): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (assetKind === "housing") return "house_individual";
  if (assetKind === "land") return "land";
  return "building_non_residential";
}

// ─── 안분 모드 기준시가 입력 + 공시가격 조회 ─────────────────────

function ApportionedPriceBlock({
  assetKind,
  standardPriceAtTransfer,
  onStandardPriceAtTransferChange,
  jibun,
  transferDate,
  transferArea,
  onTransferAreaChange,
  pricePerSqm,
  onPricePerSqmChange,
}: {
  assetKind: BlockProps["assetKind"];
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  jibun?: string;
  transferDate?: string;
  transferArea?: string;
  onTransferAreaChange?: (v: string) => void;
  pricePerSqm: string;
  onPricePerSqmChange: (v: string) => void;
}) {
  const propertyKind = toPropertyKind(assetKind);

  function handleAreaChange(v: string) {
    onTransferAreaChange?.(v);
    // StandardPriceInput이 area 변경 시 totalPrice를 자동계산하므로
    // 여기서는 onTransferAreaChange만 호출하면 됨
  }

  return (
    <StandardPriceInput
      propertyKind={propertyKind}
      totalPrice={standardPriceAtTransfer}
      onTotalPriceChange={onStandardPriceAtTransferChange}
      pricePerSqm={pricePerSqm}
      onPricePerSqmChange={onPricePerSqmChange}
      area={transferArea}
      onAreaChange={handleAreaChange}
      jibun={jibun}
      referenceDate={transferDate}
      label={
        assetKind === "land"
          ? "양도시 기준시가 (공시지가 × 양도 당시 면적, 원)"
          : "양도시 기준시가 (원)"
      }
      hint="안분 비율 분모 (§166⑥ 단서)"
    />
  );
}

/**
 * 동반자산 카드 내부 — 모드별 양도가액 입력
 */
export function CompanionSaleModeBlock(props: BlockProps) {
  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqm, setInternalPricePerSqm] = useState("");
  const pricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqm;
  const onPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqm;

  if (props.bundledSaleMode === "actual") {
    return (
      <CurrencyInput
        label={props.singleMode ? "양도가액 (원)" : "계약서상 양도가액 (원)"}
        value={props.actualSalePrice}
        onChange={props.onActualSalePriceChange}
        required
        hint={
          props.singleMode
            ? "실제 매매계약서상 거래금액"
            : "이 자산의 매매계약서 명시 가액 (§166⑥ 본문)"
        }
      />
    );
  }

  return (
    <ApportionedPriceBlock
      assetKind={props.assetKind}
      standardPriceAtTransfer={props.standardPriceAtTransfer}
      onStandardPriceAtTransferChange={props.onStandardPriceAtTransferChange}
      jibun={props.jibun}
      transferDate={props.transferDate}
      transferArea={props.transferArea}
      onTransferAreaChange={props.onTransferAreaChange}
      pricePerSqm={pricePerSqm}
      onPricePerSqmChange={onPricePerSqmChange}
    />
  );
}

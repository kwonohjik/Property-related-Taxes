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
          <div className="text-caption text-muted-foreground leading-tight mt-0.5">
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
          <div className="text-caption text-muted-foreground leading-tight mt-0.5">
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
  /** 공동주택 기준시가 조회용 동(예: "201동") — 세대 식별 */
  dong?: string;
  /** 공동주택 기준시가 조회용 호(예: "3204") — 세대 식별 */
  ho?: string;
  /** 양도일 (기준연도 자동 계산용) */
  transferDate?: string;
  /** 양도 당시 면적 (㎡) — 안분 모드 토지에서 기준시가 자동 계산에 사용 */
  transferArea?: string;
  onTransferAreaChange?: (v: string) => void;
  /** ㎡당 양도시 기준시가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtTransfer?: string;
  onStandardPricePerSqmAtTransferChange?: (v: string) => void;
  /**
   * 공유 지분율 분자 — 지분 모드(분자<분모) 시 양도가액 입력란을 자동 계산값으로 대체.
   */
  ownershipNumerator?: string;
  /** 공유 지분율 분모 */
  ownershipDenominator?: string;
  /** 폼-수준 총 양도가액 (지분 모드 자동 계산: total × ratio) */
  contractTotalPrice?: string;
  /**
   * 지분 분할 모드(같은 물건 분할취득) 여부 — splitMode==="fractional".
   * true면 지분율 미입력(공란→100/100)이라도 양도가액 자동계산 안내로 대체하고
   * 양도시 기준시가(§166⑥ 안분) 입력을 노출하지 않는다(모드 기반 게이트).
   */
  isFractionalSplit?: boolean;
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
  dong,
  ho,
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
  dong?: string;
  ho?: string;
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
      dong={dong}
      ho={ho}
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
 * 자동 계산 양도가액 표시 카드 (지분 모드 전용 read-only)
 * 양도가액 = contractTotalPrice × (numerator / denominator), Math.floor.
 */
function FractionalAutoSalePriceCard({
  numerator,
  denominator,
  contractTotalPrice,
}: {
  numerator: string;
  denominator: string;
  contractTotalPrice: string;
}) {
  const total = Number((contractTotalPrice || "").replace(/,/g, "")) || 0;
  const num = parseFloat(numerator);
  const den = parseFloat(denominator);
  const ratio = isFinite(num) && isFinite(den) && den > 0 ? num / den : 0;
  const allocated = total > 0 && ratio > 0 ? Math.floor(total * ratio) : 0;
  const ratioPct = ratio > 0 ? (ratio * 100).toFixed(2).replace(/\.?0+$/, "") : "—";
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 px-3 py-2">
      <div className="text-caption font-medium text-amber-700 mb-0.5">
        자동 계산 (총 양도가액 × 지분율)
      </div>
      <div className="font-mono text-base font-semibold text-amber-900">
        {allocated.toLocaleString()} 원
      </div>
      <div className="text-micro text-amber-700 mt-0.5">
        {total.toLocaleString()} × {numerator || "?"}/{denominator || "?"} = {ratioPct}% × 총양도가
      </div>
    </div>
  );
}

/**
 * 동반자산 카드 내부 — 모드별 양도가액 입력
 *
 * 지분 모드(ownershipNumerator < ownershipDenominator) 시:
 *   - actual 모드: 양도가액 입력란을 자동계산값 카드로 대체 (read-only)
 *   - apportioned 모드: 안분 키(기준시가) 입력란을 안내 메시지로 대체 (지분율 자체가 안분 키)
 */
export function CompanionSaleModeBlock(props: BlockProps) {
  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqm, setInternalPricePerSqm] = useState("");
  const pricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqm;
  const onPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqm;

  // 개별 자산 지분율이 입력돼 자동계산 가능한 상태 — 분자<분모 + contractTotalPrice 존재
  const ownN = parseFloat(props.ownershipNumerator || "100");
  const ownD = parseFloat(props.ownershipDenominator || "100");
  const ratioReady =
    isFinite(ownN) &&
    isFinite(ownD) &&
    ownD > 0 &&
    ownN > 0 &&
    ownN < ownD &&
    !!props.contractTotalPrice;

  // 지분 분할 모드: 양도가액은 총양도가 × 지분율로 자동 결정 → actual 입력·기준시가(§166⑥) 안분 입력
  // 모두 불필요. 모드(isFractionalSplit)로 게이트해 지분율 미입력(공란) 상태에서도 안분 입력을 숨긴다.
  const fractionalActive = props.isFractionalSplit || ratioReady;
  if (fractionalActive) {
    return (
      <div className="space-y-2">
        {ratioReady ? (
          <FractionalAutoSalePriceCard
            numerator={props.ownershipNumerator!}
            denominator={props.ownershipDenominator!}
            contractTotalPrice={props.contractTotalPrice!}
          />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            취득 지분율(분자/분모)을 입력하면 양도가액이 총양도가 × 지분율로 자동 계산됩니다.
          </p>
        )}
        <p className="text-xs text-muted-foreground italic px-1">
          지분 모드 — 양도가액은 총양도가 × 지분율로 자동 결정됩니다. 양도시 기준시가(안분) 입력은 불필요합니다.
        </p>
      </div>
    );
  }

  if (props.bundledSaleMode === "actual") {
    return (
      <CurrencyInput
        label={props.singleMode ? "양도가액 (원)" : "계약서상 양도가액 (원)"}
        value={props.actualSalePrice}
        onChange={props.onActualSalePriceChange}
        required
        // 단건 모드는 힌트 없음 — "양도가액" 라벨만으로 자명(2026-07-16).
        // 다건 모드는 자산별 가액이라는 구분이 필요해 §166⑥ 근거 힌트를 유지한다.
        hint={props.singleMode ? undefined : "이 자산의 매매계약서 명시 가액 (§166⑥ 본문)"}
        data-testid="companion-actual-sale-price"
      />
    );
  }

  return (
    <ApportionedPriceBlock
      assetKind={props.assetKind}
      standardPriceAtTransfer={props.standardPriceAtTransfer}
      onStandardPriceAtTransferChange={props.onStandardPriceAtTransferChange}
      jibun={props.jibun}
      dong={props.dong}
      ho={props.ho}
      transferDate={props.transferDate}
      transferArea={props.transferArea}
      onTransferAreaChange={props.onTransferAreaChange}
      pricePerSqm={pricePerSqm}
      onPricePerSqmChange={onPricePerSqmChange}
    />
  );
}

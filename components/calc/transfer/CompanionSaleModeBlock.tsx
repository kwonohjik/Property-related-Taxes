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

import { useEffect, useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { cn } from "@/lib/utils";
import { useStandardPriceLookup, getDefaultPriceYear } from "@/lib/hooks/useStandardPriceLookup";

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
  /** 토지 면적 (㎡) — 안분 모드 토지에서 기준시가 자동 계산에 사용 */
  landAreaM2?: string;
  onLandAreaM2Change?: (v: string) => void;
}

// ─── 안분 모드 기준시가 입력 + 공시가격 조회 ─────────────────────

function ApportionedPriceBlock({
  assetKind,
  standardPriceAtTransfer,
  onStandardPriceAtTransferChange,
  jibun,
  transferDate,
  landAreaM2,
  onLandAreaM2Change,
}: {
  assetKind: BlockProps["assetKind"];
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  jibun?: string;
  transferDate?: string;
  landAreaM2?: string;
  onLandAreaM2Change?: (v: string) => void;
}) {
  const propertyType = assetKind === "housing" ? "housing" : "land";
  const { loading, msg, year, setYear, yearOptions, lookup } =
    useStandardPriceLookup(propertyType);
  // 마지막으로 조회한 공시지가(원/㎡) — 면적 변경 시 기준시가 재계산에 사용
  const [pricePerSqm, setPricePerSqm] = useState<number>(0);

  useEffect(() => {
    setYear(getDefaultPriceYear(transferDate ?? "", propertyType));
  }, [transferDate, propertyType, setYear]);

  const showLookup = assetKind === "land" || assetKind === "housing";

  function computeAndFill(areaStr: string, sqmPrice: number) {
    const area = parseFloat(areaStr);
    if (area > 0 && sqmPrice > 0) {
      onStandardPriceAtTransferChange(String(Math.floor(area * sqmPrice)));
    }
  }

  function handleAreaChange(v: string) {
    onLandAreaM2Change?.(v);
    computeAndFill(v, pricePerSqm);
  }

  async function handleLookup() {
    const price = await lookup({ jibun: jibun ?? "", propertyType, year });
    if (price === null) return;

    if (assetKind === "land") {
      setPricePerSqm(price);
      computeAndFill(landAreaM2 ?? "", price);
    } else {
      onStandardPriceAtTransferChange(String(price));
    }
  }

  return (
    <div className="space-y-2">
      {showLookup && (
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm bg-background"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleLookup}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm border border-border bg-background hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? "조회 중…" : "공시가격 조회"}
          </button>
        </div>
      )}
      <CurrencyInput
        label={
          assetKind === "land"
            ? "양도시 기준시가 (공시지가 × 면적, 원)"
            : "양도시 기준시가 (원)"
        }
        value={standardPriceAtTransfer}
        onChange={onStandardPriceAtTransferChange}
        required
        hint="안분 비율 분모 (§166⑥ 단서)"
      />
      {msg && (
        <p
          className={cn(
            "text-xs",
            msg.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      )}
      {assetKind === "land" && pricePerSqm > 0 && !landAreaM2 && (
        <p className="text-xs text-muted-foreground">
          위 면적(㎡)을 입력하면 기준시가가 자동 계산됩니다.
        </p>
      )}
    </div>
  );
}

/**
 * 동반자산 카드 내부 — 모드별 양도가액 입력
 */
export function CompanionSaleModeBlock(props: BlockProps) {
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
      landAreaM2={props.landAreaM2}
      onLandAreaM2Change={props.onLandAreaM2Change}
    />
  );
}

"use client";

/**
 * 토지·건물 분리 양도차익 상세 (소득령 §166⑥ · §100②).
 *
 * `TransferTaxResultView`의 인라인 IIFE 블록에서 추출(R1-b) — 일괄(bundled) 자산별 카드에서도
 * 같은 산출근거를 보여주기 위해서다.
 *
 * **`<PrintSection>` 래퍼는 포함하지 않는다.** 단건 뷰는 이 컴포넌트를 감싸 인쇄 선택 출력에
 * 편입하고(id="split-detail"), 일괄 뷰는 그대로 렌더한다 — 인쇄 섹션 id·순서를 단건 뷰가
 * 계속 소유하게 해서 기존 기능을 건드리지 않는다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";

type SplitDetail = NonNullable<TransferTaxResult["splitDetail"]>;

export function SplitGainDetailSection({
  splitDetail,
  assetKind,
}: {
  splitDetail: SplitDetail;
  /**
   * 자산 종류 — 안내 문구가 `building`일 때만 달라진다(아래 §99①1호 나목 분기).
   * 종전에는 `formData.assets[0].assetKind`를 직접 읽었으나, 일괄에서는 **자산별**로 달라지므로
   * prop으로 받는다(자산 0번 고정 참조는 다자산에서 틀린 문구를 낸다).
   */
  assetKind?: string;
}) {
    const selfOwns = splitDetail.selfOwns ?? "both";
    const landIsOwned = selfOwns !== "building_only";
    const buildingIsOwned = selfOwns !== "land_only";
    const ownerLabel = selfOwns === "building_only" ? "건물" : selfOwns === "land_only" ? "토지" : null;
    const colCls = (owned: boolean) =>
      owned ? "font-mono text-right" : "font-mono text-right text-muted-foreground/50 line-through";
    const headerCls = (owned: boolean) =>
      owned ? "font-medium text-center" : "font-medium text-center text-muted-foreground/50";
    const acqModeLabel = (m?: "actual" | "estimated" | "appraisal" | "salesCase") =>
      m === "estimated" ? "환산취득가" : m === "appraisal" ? "감정가액" : m === "salesCase" ? "매매사례가액" : "실지취득가액";
  return (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">토지/건물 분리 양도차익</p>
              {ownerLabel && (
                <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                  본인 신고분: {ownerLabel} (소령 §166⑥·§168②)
                </span>
              )}
            </div>
          </div>
          <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
            <span />
            <span className={headerCls(landIsOwned)}>토지{!landIsOwned && " (타인 소유)"}</span>
            <span className={headerCls(buildingIsOwned)}>건물{!buildingIsOwned && " (타인 소유)"}</span>
            <span className="text-muted-foreground">취득 방식</span>
            <span className={cn(headerCls(landIsOwned), "font-normal")}>{acqModeLabel(splitDetail.land.acqMode)}</span>
            <span className={cn(headerCls(buildingIsOwned), "font-normal")}>{acqModeLabel(splitDetail.building.acqMode)}</span>
            <span className="text-muted-foreground">양도가액</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.transferPrice.toLocaleString()}</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.transferPrice.toLocaleString()}</span>
            <span className="text-muted-foreground">취득가액</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.acquisitionPrice.toLocaleString()}</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.acquisitionPrice.toLocaleString()}</span>
            <span className="text-muted-foreground">필요경비 (개산공제)</span>
            <span className={colCls(landIsOwned)}>
              {splitDetail.land.appraisalDeduction.toLocaleString()}
              {/* base는 엔진이 실제로 쓴 값(지분 기준시가)을 노출한다 — 100% 값을 쓰면
                  지분 자산에서 산식이 표시된 개산공제를 못 만든다. */}
              {splitDetail.land.stdPriceAtAcq != null && (
                <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {(splitDetail.land.lumpDeductionBase ?? splitDetail.land.stdPriceAtAcq).toLocaleString()} × 3%</span>
              )}
            </span>
            <span className={colCls(buildingIsOwned)}>
              {splitDetail.building.appraisalDeduction.toLocaleString()}
              {splitDetail.building.stdPriceAtAcq != null && (
                <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {(splitDetail.building.lumpDeductionBase ?? splitDetail.building.stdPriceAtAcq).toLocaleString()} × 3%</span>
              )}
            </span>
            {splitDetail.building.stdPriceDerivedFromTotal && (
              <span className="col-span-3 text-caption text-muted-foreground/80 leading-snug">
                {/* 결함 표식이 아니다 — 의미가 propertyType별로 정반대다.
                    주택(라목)은 부수토지 포함 결합 공시라 역산이 법정 정상 경로이고,
                    일반 건물은 가목·나목이 각각 공시되므로 역산이 한시 후퇴다. */}
                {assetKind === "building"
                  ? "건물 취득시 기준시가를 직접 입력하지 않아 결합 총액에서 안분한 값입니다 — 건물 취득일 기준 고시분을 입력하면 더 정확합니다 (소득세법 §99①1호 나목)."
                  : "개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다 (소득세법 시행령 §163⑥2호가목)."}
              </span>
            )}
            <span className="text-muted-foreground">양도차익</span>
            <span className={cn(colCls(landIsOwned), landIsOwned && "font-semibold")}>{splitDetail.land.gain.toLocaleString()}</span>
            <span className={cn(colCls(buildingIsOwned), buildingIsOwned && "font-semibold")}>{splitDetail.building.gain.toLocaleString()}</span>
            <span className="text-muted-foreground">보유연수</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.holdingYears}년</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.holdingYears}년</span>
            <span className="text-muted-foreground">장특공제율</span>
            <span className={colCls(landIsOwned)}>{(splitDetail.land.longTermRate * 100).toFixed(0)}%</span>
            <span className={colCls(buildingIsOwned)}>{(splitDetail.building.longTermRate * 100).toFixed(0)}%</span>
            <span className="text-muted-foreground">장특공제액</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.longTermDeduction.toLocaleString()}</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.longTermDeduction.toLocaleString()}</span>
          </div>
        </div>
  );
}

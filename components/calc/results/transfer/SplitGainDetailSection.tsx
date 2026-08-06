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
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { cn } from "@/lib/utils";

type SplitDetail = NonNullable<TransferTaxResult["splitDetail"]>;

const BASIS_LABEL = {
  appraisal: "감정평가가액",
  std_price: "양도시 기준시가",
} as const;

const REJECT_LABEL = {
  out_of_window: "감정일자가 유효 기간을 벗어나 감정평가가액을 쓰지 않았습니다",
  incomplete: "토지·건물 중 한쪽만 평가되어 감정평가가액을 쓰지 않았습니다",
} as const;

const EXEMPTION_LABEL = {
  other_law: "다른 법령에 구분 기준이 있는 경우 (소득세법 시행령 §166⑧1호)",
  demolished_land_only: "건물을 철거하고 토지만 사용하는 경우 (소득세법 시행령 §166⑧2호)",
} as const;

/**
 * §100③ 「구분 기재 가액이 안분가액과 30% 이상 차이 → 불분명 의제」 판정 표시 (Phase 1-E ⑦).
 *
 * 🔴 **엔진 판정을 그대로 읽는다 — 재계산하지 않는다**(계획서 §12.5 · U-9). 이탈률은 엔진이
 *    준 `landDeviationBp`/`buildingDeviationBp`를 퍼센트로 바꾸기만 한다. 화면이 「구분값 대
 *    안분값」을 다시 나누면 경계(정확히 30%)에서 엔진과 갈릴 수 있다.
 *
 * ⚠️ bp는 **절댓값**이다(`sale-split-deemed-unclear.ts` `deviationBp`) — 초과/미달 방향을
 *    화면이 붙이면 그것이 곧 재계산이므로 부호 없이 크기만 보여준다.
 */
function SaleSplitJudgmentBlock({ j }: { j: SaleSplitJudgmentDetail }) {
  /**
   * bp → 퍼센트 문자열. **정수만 거쳐 반올림한다.**
   *
   * `(bp / 100).toFixed(1)`은 부동소수에 걸린다 — 5555bp(=55.55%)가 내부적으로 55.549999…라
   * `"55.5"`가 나온다. 표시 전용이라 세액에 영향은 없지만, **반올림 결과가 우연에 좌우되는 것**은
   * 이 저장소의 정수 연산 원칙과 어긋난다. ⇒ 십분율 정수(`bp/10`)에서 반올림한다.
   * (`Math.round` 금지는 세액 계산 규칙이고, 여기는 화면 문자열이다.)
   */
  const pct = (bp: number) => `${(Math.round(bp / 10) / 10).toFixed(1)}%`;
  const tone = j.deemedUnclear ? "rose" : j.exemptionApplied ? "amber" : "emerald";
  const title = j.deemedUnclear
    ? "구분 기재 가액을 인정하지 않고 안분가액을 적용했습니다 (소득세법 §100③)"
    : j.exemptionApplied
      ? "30% 이상 차이가 있으나 예외로 구분 기재 가액을 인정했습니다"
      : "구분 기재 가액이 안분가액과 30% 미만 차이로 그대로 적용되었습니다";

  const row = (label: string, land: string, building: string, strong = false) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{land}</span>
      <span className={cn("font-mono text-right", strong && "font-semibold")}>{building}</span>
    </>
  );

  return (
    // ⚠️ `ToneCard`는 `data-testid`를 DOM으로 흘리지 않는다(props에 없다 — `ToggleCard`와 같다).
    //    TS는 `data-*`를 JSX 특례로 통과시키므로 **타입만 보고 붙였다가 조용히 사라진다**.
    <div data-testid="sale-split-judgment">
    <ToneCard tone={tone} title={title} className="mt-1">
      <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
        <span />
        <span className="font-medium text-center">토지</span>
        <span className="font-medium text-center">건물</span>
        {row("구분 기재 가액", j.declared.land.toLocaleString(), j.declared.building.toLocaleString())}
        {row("안분 가액", j.apportioned.land.toLocaleString(), j.apportioned.building.toLocaleString())}
        {row("차이", pct(j.landDeviationBp), pct(j.buildingDeviationBp))}
        {row("적용 가액", j.applied.land.toLocaleString(), j.applied.building.toLocaleString(), true)}
      </div>
      <p className="text-caption mt-1.5 leading-snug text-muted-foreground">
        안분 기준: {BASIS_LABEL[j.basisKind]}
        {j.appraisalRejected && ` — ${REJECT_LABEL[j.appraisalRejected]}`}
      </p>
      {j.exemptionApplied && (
        <p className="text-caption leading-snug text-muted-foreground">
          예외 사유: {EXEMPTION_LABEL[j.exemptionApplied]}
        </p>
      )}
    </ToneCard>
    </div>
  );
}

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
          {/*
            §100③ 판정 — **구분 기재가 있고 안분값도 산출된 경우에만** 채워진다. 일괄양도는
            비교 대상이 없어 판정하지 않으므로 이 블록도 뜨지 않는다(엔진 계약 그대로).
          */}
          {splitDetail.saleSplitJudgment && (
            <SaleSplitJudgmentBlock j={splitDetail.saleSplitJudgment} />
          )}
        </div>
  );
}

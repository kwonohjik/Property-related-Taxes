"use client";

type SplitPart = NonNullable<TransferTaxResult["splitDetail"]>["land"];

/** 12억 안분(영 §160①)·비과세 제외로 과세 양도차익이 양도차익보다 작아졌는가. */
function hasProration(part: SplitPart): boolean {
  return (
    part.taxableGainAfterProration !== undefined && part.taxableGainAfterProration !== part.gain
  );
}

/**
 * 취득가액 셀 — §97②2호 단서 swap이 발동한 파트는 **차감되지 않았음**을 밝힌다.
 * 금액은 그대로 보여 준다(사용자가 입력·산정한 값이므로 숨기면 그것대로 혼란이다).
 */
function AcqCell({ owned, part, testId }: { owned: boolean; part: SplitPart; testId: string }) {
  // 표의 다른 금액 칸과 같은 클래스를 쓴다 — 비소유 파트는 종전대로 취소선·연회색이다.
  const cls = owned
    ? "font-mono tabular-nums text-right"
    : "font-mono tabular-nums text-right text-muted-foreground/50 line-through";
  if (!part.swapApplied) {
    return <span className={cls} data-testid={testId}>{part.acquisitionPrice.toLocaleString()}</span>;
  }
  return (
    <span className={cls} data-testid={testId}>
      <span className="line-through">{part.acquisitionPrice.toLocaleString()}</span>
      <span className="block text-caption font-normal text-rose-700 dark:text-rose-400">
        차감 안 됨 (§97②2호 단서 — 자본적지출·양도비 택일)
      </span>
    </span>
  );
}


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
import { SaleSplitJudgmentBlock } from "./SaleSplitJudgmentBlock";
import { Frac, FLine } from "@/components/calc/results/shared/FormulaParts";
import {
  splitAcqBasisView,
  splitAcqModeLabel,
  splitCauseLabel,
  splitRateBasisNote,
  summarizeSplitGain,
} from "@/lib/tax-engine/transfer-tax-split-display";
import { formatLumpRate } from "./split-acq-text";
import { cn } from "@/lib/utils";

type SplitDetail = NonNullable<TransferTaxResult["splitDetail"]>;

export function SplitGainDetailSection({
  splitDetail,
  assetKind,
  exemptionNote,
  isExempt,
}: {
  splitDetail: SplitDetail;
  /**
   * 자산 종류 — 안내 문구가 `building`일 때만 달라진다(아래 §99①1호 나목 분기).
   * 종전에는 `formData.assets[0].assetKind`를 직접 읽었으나, 일괄에서는 **자산별**로 달라지므로
   * prop으로 받는다(자산 0번 고정 참조는 다자산에서 틀린 문구를 낸다).
   */
  assetKind?: string;
  /**
   * §166⑧ 예외 근거 문구 — **엔진을 거치지 않으므로**(계획서 §15.3) 호출부가 폼에서 읽어 넘긴다.
   * 판정 결과(`splitDetail.saleSplitJudgment`)에는 사유(호)만 있고 사용자가 적은 문구는 없다.
   */
  exemptionNote?: string;
  /**
   * 전액 비과세 결과인가 — 장특공제는 과세 양도차익에 곱하는 공제라 비과세 결과에는 적용 대상이 없다.
   * 엔진 파트 echo는 보유연수·공제율을 그대로 싣기 때문에(예: 보유 15년 · 30%·0원) 설명 없이 두면 「공제율은 있는데 공제액이 없다」로 읽힌다.
   */
  isExempt?: boolean;
}) {
    const selfOwns = splitDetail.selfOwns ?? "both";
    const landIsOwned = selfOwns !== "building_only";
    const buildingIsOwned = selfOwns !== "land_only";
    const ownerLabel = selfOwns === "building_only" ? "건물" : selfOwns === "land_only" ? "토지" : null;
    const colCls = (owned: boolean) =>
      owned ? "font-mono tabular-nums text-right" : "font-mono text-right text-muted-foreground/50 line-through";
    const headerCls = (owned: boolean) =>
      owned ? "font-medium text-center" : "font-medium text-center text-muted-foreground/50";
    // 모드 라벨은 입력 화면 라디오·상세명세서·신고서와 **같은 어휘**다(엔진 leaf) — 구 이력(모드 echo 없음)은 실거래가.
    const acqModeLabel = (m?: "actual" | "estimated" | "appraisal" | "salesCase") => splitAcqModeLabel(m ?? "actual");
    // 개산공제율은 엔진이 적용한 율 echo를 읽는다(미등기 0.3% · 분양권 등 1%). echo가 없는 구 이력은 종전 3%.
    const lumpRateLabel = (rate?: number) => (rate !== undefined ? formatLumpRate(rate) : "3%");
    const { mixedCause, rateBasisShown } = summarizeSplitGain(splitDetail);
    // D1-4·D2-4 — 영 §163⑨ 단서 1호(토지)·2호(건물) 비교가 적용된 파트. 엔진 echo를 그대로 읽는다.
    // 두 파트에 동시에 서지 않는다(1호는 건물 매매, 2호는 토지 매매일 때만) — 하나만 렌더한다.
    const acqBasis = splitAcqBasisView(splitDetail.land) ?? splitAcqBasisView(splitDetail.building);
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
            <span className={cn(headerCls(landIsOwned), "font-normal")} data-testid="split-card-acq-mode-land">{acqModeLabel(splitDetail.land.acqMode)}</span>
            <span className={cn(headerCls(buildingIsOwned), "font-normal")} data-testid="split-card-acq-mode-building">{acqModeLabel(splitDetail.building.acqMode)}</span>
            {/*
              D1-3 — 토지·건물 취득원인이 다를 때만(엔진 `mixedCause`) 원인·세율 기산일 행을 낸다(같으면 종전 화면 그대로).
              값은 엔진 echo를 그대로 읽는다 — 「세율 기산일」은 파트 세율 판정에 쓰인 `appliedRateBasisDate`다.
            */}
            {mixedCause && (
              <>
                <span className="text-muted-foreground">취득 원인</span>
                {(["land", "building"] as const).map((k) => (
                  <span key={k} className={cn(headerCls(true), "font-normal")} data-testid={`split-card-cause-${k}`}>
                    {splitCauseLabel(splitDetail[k].acquisitionCause!)}
                  </span>
                ))}
                {/* 세율 기산일은 엔진이 파트별 기산일로 세율을 판정했을 때만 — 결손 등으로 자산 단위 세율이면 계산과 어긋난다. */}
                {rateBasisShown && (
                  <>
                    <span className="text-muted-foreground">세율 기산일 (소득세법 §104②)</span>
                    {(["land", "building"] as const).map((k) => (
                      <span key={k} className="font-mono tabular-nums text-right" data-testid={`split-card-rate-basis-${k}`}>
                        {splitDetail[k].appliedRateBasisDate ?? "-"}
                        {splitRateBasisNote(splitDetail[k], splitDetail.building.acquisitionCause) && (
                          <span className="block text-caption font-sans font-normal text-muted-foreground/80 text-left leading-snug">
                            {splitRateBasisNote(splitDetail[k], splitDetail.building.acquisitionCause)}
                          </span>
                        )}
                      </span>
                    ))}
                  </>
                )}
              </>
            )}
            <span className="text-muted-foreground">양도가액</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.transferPrice.toLocaleString()}</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.transferPrice.toLocaleString()}</span>
            {/*
              🔴 **§97②2호 단서 swap이 발동한 파트는 취득가액이 차감되지 않는다**
                 (2026-09-07 UI 리뷰). 엔진은 그 파트에서 취득가액을 **전혀 빼지 않는다**
                 (`transfer-tax-split-gain.ts:248` — `… − (swapApplied ? 0 : acqPrice) − …`).
                 종전에는 환산취득가액 전액을 그대로 찍어, 억 단위 금액이 차감된 것처럼 보이는
                 표와 그것을 반영하지 않은 양도차익이 나란히 놓였다.
            */}
            <span className="text-muted-foreground">취득가액</span>
            <AcqCell owned={landIsOwned} part={splitDetail.land} testId="split-card-acq-land" />
            <AcqCell owned={buildingIsOwned} part={splitDetail.building} testId="split-card-acq-building" />
            {/*
              D1-4 — 1990.8.30. 전 상속·증여 토지: 취득가액은 평가액과 영 §164④ 가액 중 **많은 금액**이다(D2-4 — 2005.4.30. 전
              상속·증여 건물은 평가액과 영 §164⑦ 가액의 건물 몫). 두 값과 채택을 보인다
              (채택이 ②이면 위 취득가액 칸의 값은 평가액이 아니라 ② — 이 블록 없이는 입력한 평가액과 달라 보인다).
              동점은 평가액(엔진 규약). 구 이력·비교 미적용(echo 없음)은 렌더하지 않는다.
            */}
            {acqBasis && (
              <div className="col-span-3 space-y-0.5 text-caption text-muted-foreground/80 leading-snug" data-testid="split-card-acq-basis" data-part={acqBasis.partLabel}>
                <span className="block font-medium text-foreground/80">
                  {acqBasis.partLabel} 취득가액 비교 ({acqBasis.legalBasis} — 많은 금액)
                </span>
                <FLine>
                  {acqBasis.reportedLabel} <span className="font-mono tabular-nums" data-testid="split-card-acq-basis-reported">{acqBasis.reported.toLocaleString()}</span>
                  {" · "}
                  {acqBasis.sec164Label} <span className="font-mono tabular-nums" data-testid="split-card-acq-basis-sec164">{acqBasis.sec164.toLocaleString()}</span>
                </FLine>
                <FLine>
                  채택: <span className="font-medium text-foreground/80" data-testid="split-card-acq-basis-adopted">{acqBasis.adoptedLabel}</span>{" "}
                  <span className="font-mono tabular-nums">{acqBasis.adoptedValue.toLocaleString()}</span>
                </FLine>
              </div>
            )}
            <span className="text-muted-foreground">필요경비 (개산공제)</span>
            <span className={colCls(landIsOwned)}>
              {splitDetail.land.appraisalDeduction.toLocaleString()}
              {/* base는 엔진이 실제로 쓴 값(지분 기준시가)을 노출한다 — 100% 값을 쓰면
                  지분 자산에서 산식이 표시된 개산공제를 못 만든다. */}
              {splitDetail.land.stdPriceAtAcq != null && (
                <span className="block text-muted-foreground/70 font-normal" data-testid="split-card-lump-base-land">취득시 기준시가 {(splitDetail.land.lumpDeductionBase ?? splitDetail.land.stdPriceAtAcq).toLocaleString()} × {lumpRateLabel(splitDetail.land.lumpDeductionRate)}</span>
              )}
            </span>
            <span className={colCls(buildingIsOwned)}>
              {splitDetail.building.appraisalDeduction.toLocaleString()}
              {splitDetail.building.stdPriceAtAcq != null && (
                <span className="block text-muted-foreground/70 font-normal" data-testid="split-card-lump-base-building">취득시 기준시가 {(splitDetail.building.lumpDeductionBase ?? splitDetail.building.stdPriceAtAcq).toLocaleString()} × {lumpRateLabel(splitDetail.building.lumpDeductionRate)}</span>
              )}
            </span>
            {/*
              S3-1 — 개별주택가격(부수토지 포함 결합 공시)을 토지·건물 기준시가 비율로 **비례 안분**한 내역.
              엔진이 `stdSplit`을 실을 때(일반 주택 비-별개)만 렌더하고 그 값을 **그대로 읽는다**(재계산 금지 —
              `feedback_engine_result_display_drift`). 건물분은 잔액 흡수(`개별주택가격 − 토지분`)다.
              `stdSplit`이 없는 결과(별개 취득·일반건물·종전 저장 이력의 뺄셈 결과)는 아래 종전 안내를 유지한다.
            */}
            {splitDetail.stdSplit && (
              <div className="col-span-3 space-y-0.5 text-caption text-muted-foreground/80 leading-snug" data-testid="split-std-split-detail">
                <span className="block font-medium text-foreground/80">
                  개별주택가격 분할 (취득시 — 소득세법 §99①1호 라목·시행령 §166⑥)
                </span>
                <FLine>
                  토지분 기준시가 = 개별주택가격 {splitDetail.stdSplit.housingTotal.toLocaleString()} ×{" "}
                  <Frac
                    top={`토지 기준시가 ${splitDetail.stdSplit.landStd.toLocaleString()}`}
                    bottom={`토지 기준시가 ${splitDetail.stdSplit.landStd.toLocaleString()} + 건물 기준시가 ${splitDetail.stdSplit.buildingStd.toLocaleString()}`}
                  />{" "}
                  = <span className="font-mono tabular-nums" data-testid="split-std-split-land">{splitDetail.stdSplit.landBasis.toLocaleString()}</span>
                </FLine>
                <FLine>
                  건물분 기준시가 = 개별주택가격 {splitDetail.stdSplit.housingTotal.toLocaleString()} − 토지분{" "}
                  {splitDetail.stdSplit.landBasis.toLocaleString()} ={" "}
                  <span className="font-mono tabular-nums" data-testid="split-std-split-building">{splitDetail.stdSplit.buildingBasis.toLocaleString()}</span>
                </FLine>
              </div>
            )}
            {!splitDetail.stdSplit && splitDetail.building.stdPriceDerivedFromTotal && (
              <span className="col-span-3 text-caption text-muted-foreground/80 leading-snug">
                {/* 결함 표식이 아니다 — 의미가 propertyType별로 정반대다.
                    일반 건물은 가목·나목이 각각 공시되므로 총액에서 안분한 값이 한시 후퇴다.
                    주택(라목)은 이제 `stdSplit`(비례 안분)이 위에서 표시된다 — 이 갈래의 주택 문구는
                    `stdSplit`이 없는 종전 저장 이력(뺄셈으로 계산된 결과 스냅샷)에서만 보인다. */}
                {assetKind === "building"
                  ? "건물 취득시 기준시가를 직접 입력하지 않아 결합 총액에서 안분한 값입니다 — 건물 취득일 기준 고시분을 입력하면 더 정확합니다 (소득세법 §99①1호 나목)."
                  : "개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다 (소득세법 시행령 §163⑥2호가목)."}
              </span>
            )}
            {/*
              🔴 **자본적지출·양도비 행이 없었다** (2026-09-07 UI 리뷰). 엔진 산식은
                 `gain = 양도가액 − 취득가액 − effectiveDirect − 개산공제`
                 (`transfer-tax-split-gain.ts:248~249`)이고, 실지취득가액 파트는
                 `effectiveAppraisalDed: 0 / effectiveDirect: directExp`다(:338~341).
                 ⇒ 가장 흔한 실가 분리취득 사안에서 표는 「필요경비(개산공제) 0」만 찍고
                 실제 차감된 자본적지출·양도비(자산 단위 양도비 안분분 포함)는 **어디에도 없었다** —
                 표만으로 양도차익을 재현할 수 없었다.
            */}
            {(splitDetail.land.directExpenses > 0 || splitDetail.building.directExpenses > 0) && (
              <>
                <span className="text-muted-foreground">자본적지출·양도비</span>
                <span className={colCls(landIsOwned)}>{splitDetail.land.directExpenses.toLocaleString()}</span>
                <span className={colCls(buildingIsOwned)}>{splitDetail.building.directExpenses.toLocaleString()}</span>
              </>
            )}
            <span className="text-muted-foreground">양도차익</span>
            <span className={cn(colCls(landIsOwned), landIsOwned && "font-semibold")}>{splitDetail.land.gain.toLocaleString()}</span>
            <span className={cn(colCls(buildingIsOwned), buildingIsOwned && "font-semibold")}>{splitDetail.building.gain.toLocaleString()}</span>
            {/*
              🔴 **장특공제액의 base는 12억 안분 후 과세 양도차익이다** (2026-09-07 UI 리뷰).
                 `calcLongTermHoldingDeduction`의 split 분기는
                 `applyRate(taxableGainAfterProration, rate)`로 계산한다(`transfer-tax-lthd.ts:388~405`).
                 1세대1주택 고가주택(12억 초과)·부수토지 비과세 제외(G-3) 사안에서는
                 `taxableGainAfterProration < gain`이라 「양도차익 × 공제율 ≠ 장특공제액」이 되고,
                 12억 안분이 적용된 사실 자체가 이 카드에서 사라졌다. 두 값이 다를 때만 행을 낸다.
                 라벨은 「12억 안분」이라 적지 않는다(OH-43) — G-3 부수토지 제외는 안분이 아니고,
                 과거 양도분의 기준금액은 9억·6억이다.
            */}
            {(hasProration(splitDetail.land) || hasProration(splitDetail.building)) && (
              <>
                <span className="text-muted-foreground">과세 양도차익 (비과세분 제외 후)</span>
                <span className={colCls(landIsOwned)}>
                  {(splitDetail.land.taxableGainAfterProration ?? splitDetail.land.gain).toLocaleString()}
                </span>
                <span className={colCls(buildingIsOwned)}>
                  {(splitDetail.building.taxableGainAfterProration ?? splitDetail.building.gain).toLocaleString()}
                </span>
              </>
            )}
            {/* 원인이 다르면 보유연수(장특 — 상속개시일부터)와 세율 기산일(피상속인 취득일부터)이 다른 개념임을 라벨로 가른다. */}
            <span className="text-muted-foreground">{mixedCause ? "보유연수 (장기보유특별공제)" : "보유연수"}</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.holdingYears}년</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.holdingYears}년</span>
            <span className="text-muted-foreground">장특공제율</span>
            <span className={colCls(landIsOwned)}>{(splitDetail.land.longTermRate * 100).toFixed(0)}%</span>
            <span className={colCls(buildingIsOwned)}>{(splitDetail.building.longTermRate * 100).toFixed(0)}%</span>
            <span className="text-muted-foreground">장특공제액</span>
            <span className={colCls(landIsOwned)}>{splitDetail.land.longTermDeduction.toLocaleString()}</span>
            <span className={colCls(buildingIsOwned)}>{splitDetail.building.longTermDeduction.toLocaleString()}</span>
            {isExempt && (
              <span className="col-span-3 text-caption text-muted-foreground/80 leading-snug" data-testid="split-card-exempt-lthd-note">
                비과세 — 장기보유특별공제 없음
              </span>
            )}
          </div>
          {/*
            §100③ 판정 — **구분 기재가 있고 안분값도 산출된 경우에만** 채워진다. 일괄양도는
            비교 대상이 없어 판정하지 않으므로 이 블록도 뜨지 않는다(엔진 계약 그대로).
          */}
          {splitDetail.saleSplitJudgment && (
            <SaleSplitJudgmentBlock
              j={splitDetail.saleSplitJudgment}
              {...(exemptionNote ? { exemptionNote } : {})}
            />
          )}
        </div>
  );
}

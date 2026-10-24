"use client";

import { mixedAcqTimeLabel } from "@/lib/calc/mixed-use-sec163-9";
import { mixedSec163_9ExpenseHint } from "@/lib/calc/mixed-use-sec163-9";
import { mixedSec163_9ReportedHint } from "@/lib/calc/mixed-use-sec163-9";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import { MixedUsePreHousingDisclosureSection } from "./MixedUsePreHousingDisclosureSection";
import { MixedUseAcqHousingLandPriceField } from "./MixedUseAcqHousingLandPriceField";
import { MixedUseHousingBuildingStdField } from "./MixedUseHousingBuildingStdField";
import { isMixedAcqDatesSeparate } from "@/lib/calc/mixed-use-acq-date-split";
import { isMixedBurdenedGift } from "@/lib/calc/burdened-gift-mixed-use-scope";
import { isMixedBgDeemedPath } from "@/lib/calc/burdened-gift-mixed-use-scope";
import { isMixedBgPreDeemedInherited } from "@/lib/calc/burdened-gift-mixed-use-scope";
import { mixedBgReportedOptional } from "@/lib/calc/mixed-use-sec163-9";
import { mixedSec163_9CompareOf } from "@/lib/calc/mixed-use-sec163-9";
import {
  isMixedUsePerPartAcq,
  mixedAnyPartActual,
  mixedAnyPartEstimated,
  mixedExpenseDeclaredOfForm,
  mixedPartAcqNeedsOfForm,
  mixedPartModes,
  mixedUsePhdEffective,
} from "@/lib/calc/mixed-use-part-acq-split";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "@/lib/calc/transfer-pre1990-phd-bridge";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  useEstimatedAcquisition?: boolean;
  housingSectionNum?: number;
  commercialSectionNum?: number;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/**
 * 겸용주택 기준시가 입력 — 자산-우선 레이아웃 (용도변경 없음 `hasPartialUsageChange === false`).
 *
 * 시점-우선(양도시/취득시)이던 현행을 주택 섹션 / 상가 섹션으로 재편.
 * 각 섹션 내부에서 양도(emerald)·취득(amber) sub-block으로 시점을 구분.
 * 상가건물은 한 번의 계산으로 취득·양도를 동시 입력(BuildingStdPriceModalButton onApplyBoth).
 * 쓰기 대상 폼 필드는 현행과 동일 → 엔진 페이로드 불변(API 변환 무관).
 */
export function MixedUseAssetMajorStdPrice({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  housingSectionNum,
  commercialSectionNum,
  jibun,
}: Props) {
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);

  // 상속·증여 취득 겸용주택 — 취득시점 = 상속개시일/증여일이므로 "취득시" 문구를 치환.
  // §163⑨ 취득가액 직접 산정(엔진 정합) — override 입력은 상속/증여일 때만 노출.
  const isInheritance = asset.acquisitionCause === "inheritance";
  const isGift = asset.acquisitionCause === "gift";
  const isDeemed163_9 = isInheritance || isGift; // 상속·증여 공통 §163⑨ 라벨 게이트
  // 매매 실가 모드(법 §100² 안분) — 실비(자본적지출·양도비) 입력 노출 게이트. 환산/감정/매매사례는 제외.
  // B1 — 파트 모델(별개 취득)은 화면에 없는 레거시 3플래그 대신 **파트 모드**로 판정한다: 실거래가 파트가 하나라도 있으면 카드를 연다
  //      (엔진은 actual 파트에 실제 필요경비를 가산하고, 감정·매매사례 파트는 개산공제만 쓴다. 환산 파트는 §97②2호 단서로
  //      이 경비 몫이 「환산취득가액 + 개산공제」보다 크면 그 경비를 쓴다 — U-2). ④의 실비 필드 선택과 같은 술어.
  const isPerPart = isMixedUsePerPartAcq(asset);
  /**
   * 겸용 × 부담부증여 — 취득 입력의 정본은 BG 블록이다(실지취득가액 총액 `bgActualAcquisitionTotal` + 공통 자본적지출·양도비).
   * 파트별 실비 카드는 BG에서 숨긴다 — ④도 그 값을 전송하지 않는다(`buildMixedUsePayload`의 stale 가드). 설계 UI R2 §4 DUP-5.
   */
  const bgMixed = isMixedBurdenedGift(asset);
  /**
   * 부담부증여의 상속·증여 신고가액 칸 — 시가 평가에서만 취득가액(주택분·상가분 평가액 × 부분별 채무비율)이라 **필수**로 연다(PR-7b-7a · ④·⑧과 같은 술어).
   * 기준시가 평가는 §159①1호 괄호가 취득시 기준시가를 쓰게 해 평가액이 계산에 쓰이지 않아 숨긴다. 칸 안의 실제 필요경비는 부담부증여에서 쓰이지 않는다
   * (④가 보내지 않는다 — 자본적지출·양도비는 「자본적 지출, 필요경비」 공통 칸).
   */
  const bgDeemed = isMixedBgDeemedPath(asset);
  const showReported = !bgMixed || bgDeemed;
  const isPurchaseActual = bgMixed
    ? false
    : isPerPart
    ? mixedAnyPartActual(asset)
    : asset.acquisitionCause === "purchase" &&
      !useEstimatedAcquisition &&
      !asset.isAppraisalAcquisition &&
      !asset.isSalesCaseAcquisition;
  /** PHD 실효값(파트 모델은 환산 파트가 있을 때만) — H·양도시 박스·PHD 패널을 가르는 같은 술어(④·⑧과 공유). */
  const phdOn = mixedUsePhdEffective(asset);
  /** 파트 모델의 취득시 H 노출·필수 — `mixedPartAcqNeeds`(④ 전송·⑧ 필수와 같은 술어). 총액 모델은 항상 노출(불변). */
  const partNeeds = isPerPart ? mixedPartAcqNeedsOfForm(asset) : undefined;
  const showHousingPrice = !isPerPart || partNeeds?.housingPriceAtAcq === true;
  const partModes = mixedPartModes(asset);
  const housingPriceReason =
    partModes.land !== "actual" || partModes.building !== "actual"
      ? "토지 또는 건물 파트가 실거래가가 아니어서 환산취득가·개산공제의 기준시가로 쓰입니다."
      : mixedExpenseDeclaredOfForm(asset)
        ? "자본적지출 또는 주택분·상가분 실제 필요경비를 입력하셨으므로 필요합니다 — 경비를 토지·건물 비율로 나누는 데 쓰입니다."
        : undefined;
  /** 파트 모델의 PHD 토글 노출 — 환산 파트가 있을 때만(엔진 X-7). 총액 모델은 항상(불변). */
  const showPhdToggle = !isPerPart || mixedAnyPartEstimated(asset);
  const acqLabel = mixedAcqTimeLabel(asset, isInheritance ? "상속개시일" : isGift ? "증여일" : "취득시");
  // 자동합계 박스 라벨 전용 — 원문이 "취득"(시 없음)이라 별도 변수로 분리 (E2E 문구 회귀 방지).
  const acqSummaryLabel = mixedAcqTimeLabel(asset, isInheritance ? "상속개시일" : isGift ? "증여일" : "취득");
  // §163⑨ 단서 자산 합계 비교 구간(PR-6) — ①·경비 칸 안내(없으면 종전 문구)
  const reportedHint = mixedSec163_9ReportedHint(asset);
  const expenseHint = mixedSec163_9ExpenseHint(asset);
  // 단서 구간(자산 합계 비교)·PHD(§164⑦ 가액)면 평가액이 선택이다 — 두 칸 모두 입력하거나 모두 비운다(PR-7b-7a-2 · 엔진 MB-11과 같은 조건)
  const bgReportedOptional = mixedBgReportedOptional(asset);
  const bgReportedRequired = bgDeemed && !bgReportedOptional;
  // §163⑨ 단서 구간(2005.4.30. 전 상속·증여) — 주택분 취득당시 기준시가는 §164⑦ 환산가액뿐이라 PHD 필수 · 직접 입력 칸을 숨긴다(사용자 결정 R-1 · ⑧·⑫·엔진 MB-11과 같은 술어)
  // 부담부증여 × 의제취득일 전 상속·증여 — 주택분 의제취득일 기준시가도 §164⑦ 환산가액뿐이다(Q-37 · PR-7b-7b · 엔진 MB-11). 시가·기준시가 평가 공통.
  const bgPreDeemed = isMixedBgPreDeemedInherited(asset);
  const clausePhdRequired = mixedSec163_9CompareOf(asset)?.era === "clause" || bgPreDeemed;
  const bgReportedHint = bgDeemed && bgPreDeemed && reportedHint
    ? `${reportedHint} 부담부증여는 이긴 금액의 주택분·상가분에 각 채무비율을 곱합니다(같은 영 §159①1호).`
    : bgReportedRequired
    ? `${isGift ? "증여세" : "상속세"} 신고가액(상증법 §60~66 평가액 — 세무서장등이 결정·경정한 가액이 있으면 그 가액). 부담부증여에서는 주택분·상가분 두 칸을 모두 입력하세요 — 이 평가액이 취득가액이고 주택·상가별 채무비율을 곱합니다(소득세법 시행령 §163⑨·§159①1호).`
    : bgDeemed && reportedHint
      ? `${reportedHint} 부담부증여는 그 금액에 주택·상가별 채무비율을 곱합니다(같은 영 §159①1호).`
      : bgDeemed
        ? `${isGift ? "증여세" : "상속세"} 신고가액 — 주택분·상가분을 모두 입력하거나 모두 비워 두세요. 주택분은 평가액과 아래 §164⑦ 환산가액 중 큰 금액을, 상가분은 평가액(비우면 상가건물 기준시가 + 개별공시지가 합계)을 취득가액으로 쓰고 주택·상가별 채무비율을 곱합니다(소득세법 시행령 §163⑨ 단서 2호·§159①1호).`
        : null;

  // 부수토지 안분 — leaf 헬퍼 단일 소스 + override 반영 (three-state: 빈값→자동, "0"→적법한 0).
  // 면적 입력·수정은 섹션 ①(MixedUseAreaInputs) 단일 소스 — 여기서는 **조회만** 한다.
  // override는 PHD 무관 (2026-07-15 배타 해제 — API·UI·validate·사이드바 동일).
  const landOverrideStr = asset.mixedResidentialLandAreaOverride ?? "";
  const commLandOverrideStr = asset.mixedCommercialLandAreaOverride ?? "";
  const fpOverrideStr = asset.mixedResidentialFootprintOverride ?? "";
  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: parseDecimal(asset.buildingFootprintArea),
    totalLandArea: totalLand,
    ...(landOverrideStr.trim() !== ""
      ? { residentialLandAreaOverride: parseDecimal(landOverrideStr) }
      : {}),
    ...(commLandOverrideStr.trim() !== ""
      ? { commercialLandAreaOverride: parseDecimal(commLandOverrideStr) }
      : {}),
    ...(fpOverrideStr.trim() !== ""
      ? { residentialFootprintOverride: parseDecimal(fpOverrideStr) }
      : {}),
  });
  const commercialLandArea = derived.commercialLandArea;

  // 양도시 상가부분 자동 계산 (mixedTransfer 우선, PHD 토지가액 fallback — API 변환과 동일 우선순위)
  const transferLandPerSqm =
    parseAmount(asset.mixedTransferLandPricePerSqm) || parseAmount(asset.phdLandPricePerSqmAtTransfer);
  const transferCommercialLandStd = multiplyByArea(transferLandPerSqm, commercialLandArea);
  const transferCommercialBuilding = parseAmount(asset.mixedTransferCommercialBuildingPrice) ?? 0;
  const transferCommercialTotal = transferCommercialLandStd + transferCommercialBuilding;

  /**
   * 취득시 상가부분 자동 계산 — ④ 변환(`transfer-tax-api-mixed-use.ts:141~142`)과 **같은 우선순위**.
   *
   * 🔴 **1990.8.30. 이전 취득 등급환산 fallback이 빠져 있었다** (2026-09-07 대장 재대조).
   *    ④는 `mixedAcq → phd → derivePre1990PhdLandPricePerSqmAtAcq` 3단인데 여기는 2단이라,
   *    그 시기 취득 겸용주택은 화면이 「—」를 보여주는 동안 엔진은 환산값으로 계산했다.
   *    3중 패턴(⑤·④·⑧ 같은 파생 함수) 위반이다 — 파생일 뿐 store에 쓰지 않는다.
   */
  const acqLandPerSqm =
    parseAmount(asset.mixedAcqLandPricePerSqm) ||
    parseAmount(asset.phdLandPricePerSqmAtAcq) ||
    (derivePre1990PhdLandPricePerSqmAtAcq(asset, transferDate ?? "") ?? 0);
  const acqCommercialLandStd = multiplyByArea(acqLandPerSqm, commercialLandArea);
  const acqCommercialBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice) ?? 0;
  const acqCommercialTotal = acqCommercialLandStd + acqCommercialBuilding;

  const fmtKrw = (v: number) => (v > 0 ? `${v.toLocaleString()}` : "—");
  const fmtSqm = (v: number) => `${v.toFixed(2)}㎡`;

  // 취득 기준일 — 건물 취득일 기준(§164⑦ 주택 환산·건물 위치지수). 토지 취득일 아님.
  const acqReferenceDate = asset.acquisitionDate;
  // 부수토지 개별공시지가 취득시 추천 연도 전용 기준일 — 토지 취득일 기준(§166⑥ 토지·건물 취득일 상이).
  // 상가부수토지 공시지가는 토지값이므로 건물 취득일이 아닌 토지 취득일로 연도 추천(주택분 PHD 경로와 동일).
  const acqLandReferenceDate = asset.landAcquisitionDate || asset.acquisitionDate;
  // 모달 취득 위치지수 공시지가 prefill 가능 여부 — **토지일 = 건물일일 때만**.
  // 화면 부수토지 공시지가는 토지 취득일 기준(위 acqLandReferenceDate·§166⑥)이고, 모달 취득 위치지수 칸은
  // 건물 취득일 기준(BuildingStdPriceForm landRefFromEvent)이라, 두 날짜가 다르면 **다른 연도의 값**이다.
  // 주입하면 위치지수 오산 → 상가건물 기준시가 오류(세액 영향). 미주입 시 종전대로 빈 값(모달에서 직접 조회).
  // ⚠️ 2001.1.1 값(phdLandPricePerSqmAtAcq2001)은 고정 기준일이라 이 축과 무관 → 게이트 대상 아님.
  const canPrefillAcqLandPrice = acqLandReferenceDate === asset.acquisitionDate;

  const stdPriceAddress = stdPriceAddressOf(asset);
  // snapshotKey는 대상 필드 기준 — 취득·양도 통합 단일 키.
  // ⚠️ `bsp-{id}-phd-…`를 쓰면 안 된다: 주택분 배치 모달(MultiPointBuildingStdPriceModal)이
  // 배치 재적용이 `bsp-{id}-phd` 계열 키를 교체하므로(2026-08-24 B-7부터 키 집합 기준), 용도변경 없음(Case B)에선
  // 배치가 상가 스냅샷을 재생성하지도 않아 통째로 소실됐다. `mx`(mixed) 축으로 분리한다.
  // 시점 세그먼트가 없는 것은 이 모달이 취득·양도 2시점을 한 폼에서 계산하기 때문(gb/cb와 동류).
  const commercialSnapshotKey = `bsp-${asset.assetId}-mx-commercial`;

  return (
    <div className="space-y-3">
      {/* ── ② 주택 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {housingSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-700 select-none">
              {housingSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">주택 기준시가</p>
        </div>

        {/* 취득 sub-block — PHD 토글(amber)이 시점 인디케이터 역할.
            §11-6: PHD ON 시 위젯 자체 tone(amber/violet/emerald PointBlock)에 위임 — 별도 amber 컨테이너 미추가.
            시점 순서: 취득 → 양도 (PHD 3-시점 §164⑦ 법정 시계열과 정렬 — 계획 §2) */}
        <div className="space-y-2">
          {isInheritance && showReported && (
            <ToneCard
              tone="violet"
              title={bgReportedRequired ? "상속개시일 신고가액 직접 입력 (필수)" : "상속개시일 신고가액 직접 입력 (선택)"}
              titleExtra={<LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />}
            >
              <CurrencyInput
                label=""
                value={asset.mixedHousingInheritedValueOverride}
                data-field="mixedHousingInheritedValueOverride"
                onChange={(v) => onChange({ mixedHousingInheritedValueOverride: v })}
                hint={bgReportedHint ?? reportedHint ?? "시가·감정·매매사례로 상속세 신고한 경우만 입력. 미입력 시 아래 개별주택공시가격(보충적평가)을 자동 사용"}
              />
              {!bgMixed && (
                <div className="pt-2">
                  <CurrencyInput
                    label="실제 필요경비 — 자본적지출·양도비 (선택)"
                    value={asset.mixedHousingInheritedExpense}
                    onChange={(v) => onChange({ mixedHousingInheritedExpense: v })}
                    hint={expenseHint ?? "상속(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"}
                  />
                </div>
              )}
            </ToneCard>
          )}
          {isGift && showReported && (
            <ToneCard
              tone="violet"
              title={bgReportedRequired ? "증여일 신고가액 직접 입력 (필수)" : "증여일 신고가액 직접 입력 (선택)"}
              titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}
            >
              <CurrencyInput
                label=""
                value={asset.mixedHousingGiftValueOverride}
                data-field="mixedHousingGiftValueOverride"
                onChange={(v) => onChange({ mixedHousingGiftValueOverride: v })}
                hint={bgReportedHint ?? reportedHint ?? "증여세 신고서·결정통지서상 주택 평가액(상증법 §60~66). 미입력 시 아래 개별주택공시가격(보충적평가)을 자동 사용"}
              />
              {!bgMixed && (
                <div className="pt-2">
                  <CurrencyInput
                    label="실제 필요경비 — 자본적지출·양도비 (선택)"
                    value={asset.mixedHousingGiftExpense}
                    onChange={(v) => onChange({ mixedHousingGiftExpense: v })}
                    hint={expenseHint ?? "증여(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"}
                  />
                </div>
              )}
            </ToneCard>
          )}
          {isPurchaseActual && (
            <ToneCard
              tone="violet"
              title="주택분 실제 필요경비 (선택)"
              titleExtra={<LawArticleModal legalBasis="소득세법 §97 ① 2호·3호" label="법 §97①" />}
            >
              <CurrencyInput
                label="자본적지출·양도비 (주택분)"
                value={asset.mixedHousingActualExpense}
                onChange={(v) => onChange({ mixedHousingActualExpense: v })}
                hint={
                  isPerPart
                    ? "실거래가 파트에는 개산공제(§163⑥) 대신 실제 필요경비가 가산됩니다. 감정·매매사례 파트는 개산공제만이고, 환산 파트는 이 경비 몫이 환산취득가액과 개산공제의 합보다 크면 그 경비를 씁니다(법 §97②2호 단서). 주택분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
                    : "매매 실거래가 취득은 개산공제(§163⑥, 3%)를 적용하지 않습니다. 주택분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
                }
              />
            </ToneCard>
          )}
          <p className="text-caption font-semibold text-amber-700 dark:text-amber-300">{acqLabel}</p>
          {showPhdToggle && (
          <ToggleCard
            tone="amber"
            size="sm"
            data-field="usePreHousingDisclosure"
            // 겸용 × 부담부증여는 PHD와 함께 계산하지 않는다(엔진 MB-2). **켜는 쪽만** 막는다 — 이미 켜져 있으면 사용자가 끌 수 있어야 한다(막다른 길 방지).
            //   상속·증여 취득(시가)은 예외 — §163⑨ 단서 2호의 §164⑦ 가액을 만드는 입력이다(PR-7b-7a-2 · 사용자 결정 M-1 (a)).
            disabled={bgMixed && !bgDeemed && !bgPreDeemed && !asset.usePreHousingDisclosure}
            disabledReason="겸용주택 부담부증여는 개별주택가격 미공시 환산(§164⑦)과 함께 계산할 수 없습니다"
            title={`${isDeemed163_9 ? acqLabel : "취득 당시"} 개별주택가격 미공시 (§164⑦ 3-시점 환산)`}
            description={
              bgPreDeemed
                ? "의제취득일(1985.1.1.) 전 상속·증여라 켜야 계산됩니다 — 주택분 의제취득일 기준시가는 §164⑦ 환산가액입니다(소득세법 시행령 §164⑦·§176조의2④)"
                : clausePhdRequired
                ? "상속개시일·증여일이 개별주택가격 최초 공시(2005.4.30.) 전이라 켜야 계산됩니다 — 주택분 취득당시 기준시가는 §164⑦ 환산가액이고, 그 금액으로 평가액과 비교합니다(소득세법 시행령 §164⑦·§163⑨ 단서 2호)"
                : bgDeemed
                ? "상속개시일·증여일 당시 이 주택의 개별주택가격이 아직 공시되지 않았으면 켜고 최초 고시일을 입력하세요 — §164⑦ 환산가액을 평가액과 비교해 큰 금액을 씁니다(소득세법 시행령 §163⑨ 단서 2호)"
                : isPerPart
                ? "환산취득가로 계산하는 파트에 §164⑦ 3-시점 환산을 적용합니다 (개별주택가격 최초 공시 이전 취득 시 활성화)"
                : useEstimatedAcquisition
                  ? "개별주택가격 최초 공시 이전 취득 시 활성화"
                  : "활성화 시 환산취득가 모드로 자동 전환"
            }
            checked={!!asset.usePreHousingDisclosure}
            onCheckedChange={(checked) => {
              // 파트 모델은 `usePreHousingDisclosure` **한 키만** 쓴다 — 레거시 `useEstimatedAcquisition`을 켜면
              // 토글 OFF(총액 모델) 복귀 후 상단 라디오가 조용히 「환산」으로 바뀐다(왕복 무변화 위반).
              // 부담부증여는 취득 경로를 부담부증여 블록이 정한다 — 레거시 환산 플래그를 켜지 않는다(숨은 값으로 남지 않게).
              onChange(
                isPerPart || bgDeemed
                  ? { usePreHousingDisclosure: checked }
                  : {
                      usePreHousingDisclosure: checked,
                      ...(checked ? { useEstimatedAcquisition: true } : {}),
                    },
              );
            }}
          >
            <MixedUsePreHousingDisclosureSection
              asset={asset}
              transferDate={transferDate ?? ""}
              onChange={onChange}
            />
          </ToggleCard>
          )}

          {!phdOn && showHousingPrice && !clausePhdRequired && (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 dark:bg-amber-950/40">
              <StandardPriceInput
                propertyKind="house_individual"
                totalPrice={asset.mixedAcqHousingPrice}
                data-field="mixedAcqHousingPrice"
                onTotalPriceChange={(v) => onChange({ mixedAcqHousingPrice: v })}
                jibun={asset.addressJibun || undefined}
                referenceDate={acqReferenceDate}
                label="개별주택공시가격"
                hint={
                  isPerPart
                    ? `${housingPriceReason ?? "취득시 기준시가 비율 안분에 쓰입니다."} 미공시 시 비워두세요 — 위 §164⑦ 토글 사용`
                    : "미공시 시 비워두세요 — 위 §164⑦ 토글 사용"
                }
              />
            </div>
          )}
          {/* B0 — 토지·건물 취득일이 다를 때만(술어는 컴포넌트 내부) 건물 취득일 기준 공시지가 */}
          <MixedUseAcqHousingLandPriceField
            asset={asset}
            onChange={onChange}
            jibun={jibun}
            area={derived.residentialLandArea}
          />
          {/* S3-2 — 주택건물 기준시가(나목, 비례 분모). 취득시 sub-block 맨 아래(H·B0 다음) — 술어는 컴포넌트 내부 */}
          <MixedUseHousingBuildingStdField
            asset={asset}
            onChange={onChange}
            timePoint="acq"
            transferDate={transferDate}
            acqLabel={acqLabel}
          />
        </div>

        {/* 양도 sub-block — PHD ON 시 하단 PHD 패널의 양도시 입력이 단일 소스이므로 숨김 */}
        {!phdOn && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-2 dark:bg-emerald-950/40">
            <p className="text-caption font-semibold text-emerald-700 dark:text-emerald-300">양도시</p>
            <StandardPriceInput
              propertyKind="house_individual"
              totalPrice={asset.mixedTransferHousingPrice}
              data-field="mixedTransferHousingPrice"
              onTotalPriceChange={(v) => onChange({ mixedTransferHousingPrice: v })}
              jibun={asset.addressJibun || undefined}
              referenceDate={transferDate}
              label="개별주택공시가격"
              hint="주택건물+주택부수토지 일괄"
            />
            {/* S3-2 — 양도시 주택건물 기준시가(나목). 이미 emerald 시점 박스 안이라 톤 카드를 두르지 않는다 */}
            <MixedUseHousingBuildingStdField
              asset={asset}
              onChange={onChange}
              timePoint="transfer"
              transferDate={transferDate}
              landArea={derived.residentialLandArea}
              embedded
            />
          </div>
        )}
      </div>

      {/* ── ③ 상가 기준시가 ─────────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          {commercialSectionNum !== undefined && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-700 select-none">
              {commercialSectionNum}
            </span>
          )}
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">상가 기준시가</p>
        </div>

        {isInheritance && showReported && (
          <ToneCard
            tone="violet"
            title={bgReportedRequired ? "상속개시일 신고가액 직접 입력 (필수, 상가 전체)" : "상속개시일 신고가액 직접 입력 (선택, 상가 전체)"}
            titleExtra={<LawArticleModal legalBasis="상속세및증여세법 §60" label="상증법 §60" />}
          >
            <CurrencyInput
              label=""
              value={asset.mixedCommercialInheritedValueOverride}
              data-field="mixedCommercialInheritedValueOverride"
              onChange={(v) => onChange({ mixedCommercialInheritedValueOverride: v })}
              hint={bgReportedHint ?? reportedHint ?? "미입력 시 아래 상가건물 기준시가 + 개별공시지가 합계를 자동 사용"}
            />
            {!bgMixed && (
              <div className="pt-2">
                <CurrencyInput
                  label="실제 필요경비 — 자본적지출·양도비 (선택)"
                  value={asset.mixedCommercialInheritedExpense}
                  onChange={(v) => onChange({ mixedCommercialInheritedExpense: v })}
                  hint={expenseHint ?? "상속(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"}
                />
              </div>
            )}
          </ToneCard>
        )}

        {isGift && showReported && (
          <ToneCard
            tone="violet"
            title={bgReportedRequired ? "증여일 신고가액 직접 입력 (필수, 상가 전체)" : "증여일 신고가액 직접 입력 (선택, 상가 전체)"}
            titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163⑨" label="소령 §163⑨" />}
          >
            <CurrencyInput
              label=""
              value={asset.mixedCommercialGiftValueOverride}
              data-field="mixedCommercialGiftValueOverride"
              onChange={(v) => onChange({ mixedCommercialGiftValueOverride: v })}
              hint={bgReportedHint ?? reportedHint ?? "증여세 신고서·결정통지서상 상가 평가액(상증법 §60~66). 미입력 시 아래 상가건물 기준시가 + 개별공시지가 합계를 자동 사용"}
            />
            {!bgMixed && (
              <div className="pt-2">
                <CurrencyInput
                  label="실제 필요경비 — 자본적지출·양도비 (선택)"
                  value={asset.mixedCommercialGiftExpense}
                  onChange={(v) => onChange({ mixedCommercialGiftExpense: v })}
                  hint={expenseHint ?? "증여(실가 의제) 취득은 개산공제(§163⑥, 취득시 기준시가×3%)를 적용하지 않습니다. 자본적지출·양도비가 있으면 입력하세요"}
                />
              </div>
            )}
          </ToneCard>
        )}
        {isPurchaseActual && (
          <ToneCard
            tone="violet"
            title="상가분 실제 필요경비 (선택)"
            titleExtra={<LawArticleModal legalBasis="소득세법 §97 ① 2호·3호" label="법 §97①" />}
          >
            <CurrencyInput
              label="자본적지출·양도비 (상가분)"
              value={asset.mixedCommercialActualExpense}
              onChange={(v) => onChange({ mixedCommercialActualExpense: v })}
              hint={
                isPerPart
                  ? "실거래가 파트에는 개산공제(§163⑥) 대신 실제 필요경비가 가산됩니다. 감정·매매사례 파트는 개산공제만이고, 환산 파트는 이 경비 몫이 환산취득가액과 개산공제의 합보다 크면 그 경비를 씁니다(법 §97②2호 단서). 상가분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
                  : "매매 실거래가 취득은 개산공제(§163⑥, 3%)를 적용하지 않습니다. 상가분 자본적지출·양도비(법 §97①2·3호)가 있으면 입력하세요. 없으면 비워두세요"
              }
            />
          </ToneCard>
        )}

        {/* 상가건물 기준시가 — 양도/취득 나란히 + 통합 계산 모달 */}
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          상가건물 기준시가{" "}
          <span className="text-micro font-normal text-slate-600 dark:text-slate-400">
            (토지 제외)
          </span>
          {isPerPart && (
            <span className="ml-1 text-caption font-normal text-slate-600 dark:text-slate-400" data-testid="mixed-part-commercial-building-day-note">
              취득시는 건물 취득일 기준
            </span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1 dark:bg-amber-950/40">
            <p className="text-caption font-semibold text-amber-700 dark:text-amber-300">{acqLabel}</p>
            <CurrencyInput
              label=""
              value={asset.mixedAcqCommercialBuildingPrice}
              data-field="mixedAcqCommercialBuildingPrice"
              onChange={(v) => onChange({ mixedAcqCommercialBuildingPrice: v })}
              placeholder={`${acqLabel} 상가건물 기준시가 (필수)`}
              hideUnit
            />
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1 dark:bg-emerald-950/40">
            <p className="text-caption font-semibold text-emerald-700 dark:text-emerald-300">양도시</p>
            <CurrencyInput
              label=""
              value={asset.mixedTransferCommercialBuildingPrice}
              onChange={(v) => onChange({ mixedTransferCommercialBuildingPrice: v })}
              placeholder="양도시 상가건물 기준시가"
              hideUnit
            />
          </div>
        </div>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            initialAddress={stdPriceAddress}
            snapshotKey={commercialSnapshotKey}
            prefill={{
              floorArea: asset.nonResidentialFloorArea,
              landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
              acquisitionDate: asset.acquisitionDate,
              transferDate,
              // 공시지가 자동입력 — 화면 표시 fallback과 동일 우선순위(3중 패턴).
              // 취득은 트랙 2종을 모두 넘기고 ≤2000 선택은 모달이 단일 게이트로 판정(§164⑤).
              acqLandPricePerSqm: canPrefillAcqLandPrice
                ? asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq
                : undefined,
              acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001,
              transferLandPricePerSqm:
                asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer,
            }}
            onApplyBoth={(acq, transfer) =>
              onChange({
                mixedAcqCommercialBuildingPrice: String(acq),
                mixedTransferCommercialBuildingPrice: String(transfer),
              })
            }
          />
        </div>

        {/* 상가부수토지 개별공시지가 — 양도/취득 (세로 스택: 기준연도 드롭다운 폭 확보) */}
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          상가부수토지 개별공시지가
          {isMixedAcqDatesSeparate(asset) && (
            <span className="ml-1 text-caption font-normal text-slate-600 dark:text-slate-400">토지 취득일 기준</span>
          )}
        </p>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2 space-y-1 dark:bg-amber-950/40">
          <p className="text-caption font-semibold text-amber-700 dark:text-amber-300">{acqLabel}</p>
          <LandPriceLookupField
            pricePerSqm={asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq}
            data-field="mixedAcqLandPricePerSqm"
            onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqm: v })}
            area={commercialLandArea > 0 ? commercialLandArea : undefined}
            referenceDate={acqLandReferenceDate}
            jibun={jibun}
            label="개별공시지가 (원/㎡)"
            placeholder={`${acqLabel} 개별공시지가 /㎡`}
          />
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2 space-y-1 dark:bg-emerald-950/40">
          <p className="text-caption font-semibold text-emerald-700 dark:text-emerald-300">양도시</p>
          <LandPriceLookupField
            pricePerSqm={asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer}
            data-field="mixedTransferLandPricePerSqm"
            onPricePerSqmChange={(v) => onChange({ mixedTransferLandPricePerSqm: v })}
            area={commercialLandArea > 0 ? commercialLandArea : undefined}
            referenceDate={transferDate}
            jibun={jibun}
            label="개별공시지가 (원/㎡)"
            placeholder="양도시 개별공시지가 /㎡"
          />
        </div>

        {/* 자동합계 — "기준시가 합계" 문구 유지 (E2E transfer-p3-hybrid 방어) */}
        {(transferCommercialLandStd > 0 ||
          transferCommercialBuilding > 0 ||
          acqCommercialLandStd > 0 ||
          acqCommercialBuilding > 0) && (
          <div className="space-y-2">
            {/* 취득(첫째) — 면적 행은 시점 무관 공통값이므로 첫 박스가 담는다.
                게이트는 면적 OR 자기 값 — 면적 게이트만 두면 상가부수토지 0(주택 부수토지
                override = 전체토지)일 때 상가건물 기준시가가 있어도 취득 합계가 통째로 사라진다. */}
            {(commercialLandArea > 0 || acqCommercialLandStd > 0 || acqCommercialBuilding > 0) && (
              <div className="rounded-lg bg-amber-100/60 border border-amber-200 px-3 py-2 text-sm space-y-1 dark:bg-amber-900/40">
                {commercialLandArea > 0 && (
                  <div className="flex justify-between text-xs text-amber-700 dark:text-amber-300">
                    <span>상가부수토지 면적</span>
                    <span>{fmtSqm(commercialLandArea)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-amber-700 dark:text-amber-300">
                  <span>{acqSummaryLabel} 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(acqCommercialLandStd)}</span>
                </div>
                {acqCommercialBuilding > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-amber-900 dark:text-amber-200">
                    <span>{acqSummaryLabel} 상가부분 기준시가 합계 (자동)</span>
                    <span>{fmtKrw(acqCommercialTotal)}</span>
                  </div>
                )}
              </div>
            )}
            {(transferCommercialLandStd > 0 || transferCommercialBuilding > 0) && (
              <div className="rounded-lg bg-emerald-100/60 border border-emerald-200 px-3 py-2 text-sm space-y-1 dark:bg-emerald-900/40">
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-300">
                  <span>양도 상가부수토지 기준시가 (자동)</span>
                  <span>{fmtKrw(transferCommercialLandStd)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  <span>양도 상가부분 기준시가 합계 (자동)</span>
                  <span>{fmtKrw(transferCommercialTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

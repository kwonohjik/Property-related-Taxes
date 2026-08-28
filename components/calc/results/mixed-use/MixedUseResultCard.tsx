"use client";

/**
 * 겸용주택 분리계산 결과 카드 (4-카드 + 합산)
 *
 * 학습·검증 목적: 양도가액 안분 → 주택부분 → 상가부분 → 비사업용토지 → 합산세액
 * 각 항목 하단에 계산 과정(산식)을 한국어로 표기.
 */

import type { MixedUseGainBreakdown, MixedUseTotalTax } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { MixedUseExpropriationValuationCard } from "@/components/calc/results/mixed-use/MixedUseExpropriationValuationCard";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { useState, useMemo } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { expandToggleClass } from "@/components/calc/results/shared/ExpandToggleButton";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import {
  MIXED_USE_PRINT_SECTIONS,
  type MixedUsePrintSectionId,
} from "@/lib/print/mixed-use-print-sections";
import {
  fmt,
  fmtPlain,
  fmtPct,
  fmtSqm,
  ResultSection,
  Row,
  DivRow,
  Frac,
  FLine,
  PartialUsageChangeCard,
} from "@/components/calc/results/mixed-use/MixedUseResultCardParts";
import {
  mixedUseToFilingResult,
  adoptedCalculatedTax,
  deriveBasicRateBracket,
} from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";

// 하위 호환 — 종전에 이 모듈에서 어댑터를 가져가던 소비처 유지.
export { mixedUseToFilingResult };

const MIXED_SECTION_IDS = ["apportion", "housing", "commercial", "nbl", "total"] as const;

interface Props {
  breakdown: MixedUseGainBreakdown;
  formData?: TransferFormData;
}

export function MixedUseResultCard({ breakdown, formData }: Props) {
  // 출력 항목 선택 (PR-F4) — 기존 자체 printScoped("full"/"form-table") → PrintSelectionPanel 통일.
  // ⚠️ pdf 채널 0(ResultPdfDocument에 mixed-use 섹션 부재) → onPrintPdf 미전달.
  //    "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)만 노출. 설계 §2.8.
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  // 계산 섹션(①~④·합산)의 펼침 상태 — 상단 전체 토글로 일괄 제어. 기본 전체 펼침.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MIXED_SECTION_IDS.map((id) => [id, true])),
  );
  // 현재 결과뷰에 실제 렌더되는 leaf id (본문·신고서·명세서 항상 + 건물 기준시가 계산서는
  // 소속 스냅샷이 있을 때만 — 단건 TransferTaxResultView와 동일 판정).
  const availablePrintIds = useMemo<Set<MixedUsePrintSectionId>>(() => {
    const ids = new Set<MixedUsePrintSectionId>(["calculation", "filing-form", "detailed-statement"]);
    if (hasBuildingStdReport({ assets: formData?.assets })) ids.add("building-std-report");
    return ids;
  }, [formData?.assets]);

  if (breakdown.splitMode === "pre-2022-rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold mb-1">겸용주택 분리계산 불가</p>
        {breakdown.warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
      </div>
    );
  }

  // `multiHouseSurcharge`는 더 이상 구조분해하지 않는다 — §95② 배제 표시가 그것을 **재도출**하던
  // 것을 엔진 echo(`surchargeLthdExclusion`)로 대체했기 때문이다(2026-08-25).
  const { apportionment: a, housingPart: h, commercialPart: c, nonBusinessLandPart: nb, total: t, surchargeLthdExclusion } = breakdown;
  const totalTransfer = a.housingTransferPrice + a.commercialTransferPrice;
  // 상속 취득가액 직접 산정(소령 §163⑨) — 단일 소스: calculationRoute.acquisitionConversionRoute만 판독.
  // (part-level acqPriceSource는 dual-truth 회피로 미채택 — plan §4.5 정본 결정)
  const acqRoute = breakdown.calculationRoute.acquisitionConversionRoute;
  const isInheritedAcq = acqRoute === "inheritance_direct" || acqRoute === "inheritance_phd_max";
  const isGiftAcq = acqRoute === "gift_direct" || acqRoute === "gift_phd_max";
  // 매매 취득 실거래가 직접 안분(법 §100²·§97①1호가목) — 실가 산식(개산공제 미표시), 라벨 구분.
  const isActualAcq = acqRoute === "section97_actual";
  // 감정가액·매매사례가액 추계 안분(§176의2②③·법 §100²) — 개산공제 표시(환산 산식 분기 재사용), 라벨만 구분.
  const isAppraisalSalesAcq = acqRoute === "section176_2_appraisal_sales";
  // 실지거래가액 기반(상속·증여 §163⑨ 의제 / 매매 §100² 실가) — 산식 분기(개산공제 미표시·실비)는 공통, 라벨만 구분.
  // ⚠️ 감정·매매사례(isAppraisalSalesAcq)는 개산공제 유지라 isDeemedAcq에 포함하지 않음(환산 산식 분기 사용).
  const isDeemedAcq = isInheritedAcq || isGiftAcq || isActualAcq;
  // 비-의제(환산·감정·매매사례) 취득가액 용어 — 감정/매매사례는 직접 안분이라 "환산취득가액" 아닌 "취득가액".
  const nonDeemedAcqTerm = isAppraisalSalesAcq ? "취득가액" : "환산취득가액";

  // 실제 렌더되는 섹션만 전체 토글 대상 (nbl은 nb 있을 때만).
  const renderedSectionIds = MIXED_SECTION_IDS.filter((id) => id !== "nbl" || !!nb);
  const allSectionsOpen = renderedSectionIds.every((id) => openSections[id]);
  const setAllSections = (value: boolean) =>
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const id of renderedSectionIds) next[id] = value;
      return next;
    });
  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄 — 브라우저 PDF 저장) */}
      <PrintSelectionPanel
        allGroups={MIXED_USE_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
      />

      {/* ── 신고서 양식 표 (결과탭 첫번째 보고서) ── */}
      <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
      {(() => {
        // 겸용주택(propertyType="mixed-use-house")은 재개발과 배타적이므로
        // redevelopmentDetail이 항상 undefined → redev props 비활성. 일관성 차원에서 전달.
        const mixedFilingResult = mixedUseToFilingResult(breakdown);
        const primaryAsset = formData?.assets?.[0];
        const hasRedev = !!mixedFilingResult.redevelopmentDetail;
        return (
          <FilingFormTable
            result={mixedFilingResult}
            formData={formData}
            redevSubject={
              hasRedev
                ? ((primaryAsset?.redevSubject || (primaryAsset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
                : undefined
            }
            redevSettlementDirection={
              hasRedev
                ? ((primaryAsset?.redevSettlementDirection || "pay") as "pay" | "receive")
                : undefined
            }
          />
        );
      })()}
      </PrintSection>

      {/* ── 분리계산 본문 (안분·주택·상가·비사업용·합산세액·계산경로) ── */}
      <PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-4">
      {/* 수정신고·경정청구 hero — 단건 TransferTaxResultView(calculation 섹션 선두)와 동형.
          PrintSection 밖에 두면 인쇄 선택과 무관하게 항상 출력되므로 반드시 내부에 유지. */}
      {breakdown.amendmentDetail && (
        <AmendmentResultCard
          detail={breakdown.amendmentDetail}
          fullTotalTax={t.totalPayable}
        />
      )}
      {/* §164⑨1호 공익수용 특례 산출근거 (P7/D8) — 주택분·상가분 */}
      {breakdown.expropriationDetail && (
        <MixedUseExpropriationValuationCard detail={breakdown.expropriationDetail} />
      )}
      {/* 경고 */}
      {breakdown.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          {breakdown.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* 0. 보유 중 일부 용도변경 (있을 때만) — 시행령 §166⑥ + 집행기준 99-164-10 */}
      {breakdown.partialUsageChange && (
        <PartialUsageChangeCard
          puc={breakdown.partialUsageChange}
          reason={breakdown.calculationRoute.partialUsageChangeReason}
        />
      )}

      {/* 1세대 1주택 비과세 적용 여부 표시 */}
      <div
        className={`rounded-md px-3 py-2 text-xs border ${
          breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "bg-amber-50/60 border-amber-200 text-amber-900"
            : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
        }`}
      >
        <span className="font-semibold">
          1세대 1주택 비과세:{" "}
          {breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "미적용 (전액 과세 + 표1 공제)"
            : breakdown.calculationRoute.highValueRule === "below_threshold_exempt"
              ? "적용 (12억 이하 비과세)"
              : "적용 (12억 초과 안분 과세)"}
        </span>
      </div>

      {/* 계산 섹션 전체 접기/펼치기 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAllSections(!allSectionsOpen)}
          aria-expanded={allSectionsOpen}
          className={expandToggleClass("slate")}
        >
          {allSectionsOpen ? "▲ 전체 접기" : "▼ 전체 펼치기"}
        </button>
      </div>

      {/* 1. 양도가액 안분 */}
      <ResultSection
        title="① 양도가액 안분"
        basis="소득세법 §99 + 시행령 §164"
        open={openSections.apportion}
        onToggle={() => toggleSection("apportion")}
      >
        <Row
          label="양도시 개별주택공시가격"
          value={fmt(a.housingStandardPrice)}
          formula="입력값 — 주택건물+주택부수토지 일괄"
        />
        <Row
          label="양도시 상가부분 기준시가 합계"
          value={fmt(a.commercialStandardPrice)}
          formula="(공시지가/㎡ × 상가부수토지 면적) + 상가건물 기준시가"
        />
        <DivRow />
        <Row
          label={`주택비율`}
          value={fmtPct(a.housingRatio)}
          formula={
            <Frac
              top={`주택부분 기준시가 ${fmtPlain(a.housingStandardPrice)}`}
              bottom={`주택부분 ${fmtPlain(a.housingStandardPrice)} + 상가부분 ${fmtPlain(a.commercialStandardPrice)}`}
            />
          }
        />
        <Row
          label="주택 양도가액"
          value={fmt(a.housingTransferPrice)}
          highlight
          formula={`${fmtPlain(totalTransfer)} × ${fmtPct(a.housingRatio)} → 내림`}
        />
        <Row
          label="상가 양도가액"
          value={fmt(a.commercialTransferPrice)}
          highlight
          formula={`총 양도가액 - 주택 양도가액 = ${fmtPlain(totalTransfer)} - ${fmtPlain(a.housingTransferPrice)}`}
        />
      </ResultSection>

      {/* 2. 주택부분 */}
      <ResultSection
        title="② 주택부분"
        basis="소득세법 §89 ① 3호 단서 + §95 ②"
        open={openSections.housing}
        onToggle={() => toggleSection("housing")}
      >
        <Row
          label={isActualAcq ? "취득 실거래가(취득가액)" : isDeemedAcq ? `${isGiftAcq ? "증여일" : "상속개시일"} 평가액(취득가액)` : isAppraisalSalesAcq ? "주택 감정·매매사례 취득가액" : "주택 환산취득가액"}
          value={fmt(h.estimatedAcquisitionPrice)}
          formula={(() => {
            if (isDeemedAcq && h.inheritedAcquisitionDetail) {
              const d = h.inheritedAcquisitionDetail;
              const base =
                d.selected === "reported"
                  ? `상속개시일 신고가액 ${fmtPlain(d.reportedValue)}`
                  : `상속개시일 보충적평가액(상증법 §60~66) ${fmtPlain(d.standardPriceCandidate)}` +
                    (acqRoute === "inheritance_phd_max" && d.reportedValue !== null
                      ? ` (신고가액 ${fmtPlain(d.reportedValue)}과 §164⑦ 환산가액 중 큰 값 — 소령 §163⑨2호)`
                      : "");
              return `${base} — 취득당시 실지거래가액으로 의제 (소령 §163⑨)`;
            }
            if (isAppraisalSalesAcq) {
              return `감정가액·매매사례가액 총액을 법 §100²에 따라 취득시 기준시가 비율로 주택분에 안분 (§176의2②③ 추계)`;
            }
            if (!h.phdEstimatedAcqHousingPrice) {
              return (
                <FLine>
                  §97: 주택 양도가액 {fmtPlain(a.housingTransferPrice)} ×{" "}
                  {/* 🔴 종전에는 분자에 **값이 없었다**. 미공시(0)면 「주택 환산취득가액 0」과
                      라벨뿐인 분자가 함께 나와, 0으로 잡힌 것인지 입력이 누락된 것인지
                      화면에서 구별할 수 없었다(#077). 바로 아래 상가분은 분자 값을 보여준다. */}
                  <Frac
                    top={`취득시 개별주택공시가격 ${fmtPlain(h.acqHousingStandardPrice ?? 0)}${
                      (h.acqHousingStandardPrice ?? 0) > 0 ? "" : " (미공시)"
                    }`}
                    bottom={`양도시 개별주택공시가격 ${fmtPlain(a.housingStandardPrice)}`}
                  />
                </FLine>
              );
            }
            const ph = h.phdResult?.inputs;
            const fp = h.phdResult?.fourPartApportionment;
            // Case A 4부분 모드 — 주택부분 환산취득가 = 주택토지분 + 주택건물분 (엔진 내부 D11+E11)
            if (fp) {
              return (
                <>
                  <FLine>
                    Case A 4부분 안분 — 주택부분 = 주택토지분 {fmtPlain(Math.floor(fp.housingLandAcqPrice))} +
                    주택건물분 {fmtPlain(Math.floor(fp.housingBuildingAcqPrice))}
                  </FLine>
                  <FLine>
                    산출근거: 전체 환산취득가 {fmtPlain(fp.totalEstAcq)} ×{" "}
                    <Frac
                      top={`취득시 주택분 기준시가 ${fmtPlain(fp.housingLandAcqShare + fp.housingBuildingAcqShare)}`}
                      bottom={`역산 취득시 개별주택가격 ${fmtPlain(h.phdEstimatedAcqHousingPrice)}`}
                    />
                  </FLine>
                </>
              );
            }
            const isAreaSplit =
              !!ph &&
              (ph.landAreaAtAcquisition !== ph.landAreaAtTransfer ||
                ph.landAreaAtFirstDisclosure !== ph.landAreaAtTransfer);
            const base = (
              <FLine>
                시행령 §164⑤ 역산 환산: 주택 양도가액 {fmtPlain(a.housingTransferPrice)} ×{" "}
                <Frac
                  top={`역산한 취득시 개별주택가격 ${fmtPlain(h.phdEstimatedAcqHousingPrice)}`}
                  bottom={`양도시 개별주택공시가격 ${fmtPlain(a.housingStandardPrice)}`}
                />
              </FLine>
            );
            if (!isAreaSplit || !ph) return base;
            return (
              <>
                {base}
                <FLine>
                  시점별 토지면적: 취득시 {ph.landAreaAtAcquisition.toFixed(2)}㎡ · 최초공시{" "}
                  {ph.landAreaAtFirstDisclosure.toFixed(2)}㎡ · 양도시 {ph.landAreaAtTransfer.toFixed(2)}㎡
                </FLine>
              </>
            );
          })()}
        />
        {h.phdResult && h.phdEstimatedAcqHousingPrice && (() => {
          const r = h.phdResult!;
          const ph = r.inputs;
          const fp = r.fourPartApportionment;
          // Case A 4부분 안분 활성 시 — 4부분(주택분토지·주택건물·상가분토지·상가건물) 합산 표시
          const formula = fp ? (
            <>
              <FLine>
                최초공시 개별주택가격 {fmtPlain(ph.firstDisclosureHousingPrice)} ×{" "}
                <Frac
                  top={`취득시 합산기준시가(4부분) ${fmtPlain(r.sumAtAcquisition)}`}
                  bottom={`최초공시 합산기준시가(4부분) ${fmtPlain(r.sumAtFirstDisclosure)}`}
                />
              </FLine>
              <FLine>
                취득시: 주택분토지 {fmtPlain(fp.housingLandStdAtAcq)} + 주택건물 {fmtPlain(fp.housingBuildingStdAtAcq)} +
                상가분토지 {fmtPlain(fp.commercialLandStdAtAcq)} + 상가건물 {fmtPlain(fp.commercialBuildingStdAtAcq)}
              </FLine>
              <FLine>
                최초공시: 주택분토지 {fmtPlain(fp.housingLandStdAtFirst)} + 주택건물 {fmtPlain(fp.housingBuildingStdAtFirst)} +
                상가분토지 {fmtPlain(fp.commercialLandStdAtFirst)} + 상가건물 {fmtPlain(fp.commercialBuildingStdAtFirst)}
              </FLine>
            </>
          ) : (
            <>
              <FLine>
                최초공시 개별주택가격 {fmtPlain(ph.firstDisclosureHousingPrice)} ×{" "}
                <Frac
                  top={`취득시 합산기준시가 ${fmtPlain(r.sumAtAcquisition)}`}
                  bottom={`최초공시 합산기준시가 ${fmtPlain(r.sumAtFirstDisclosure)}`}
                />
              </FLine>
              <FLine>
                취득시: 토지기준시가 {fmtPlain(r.landStdAtAcquisition)} + 건물기준시가 {fmtPlain(r.buildingStdAtAcquisition)}
              </FLine>
              <FLine>
                최초공시: 토지기준시가 {fmtPlain(r.landStdAtFirstDisclosure)} + 건물기준시가{" "}
                {fmtPlain(r.buildingStdAtFirstDisclosure)}
              </FLine>
            </>
          );
          return (
            <Row
              label={fp ? "  ▸ 역산한 취득시 개별주택가격 (Case A 4부분 안분)" : "  ▸ 역산한 취득시 개별주택가격"}
              value={fmtPlain(h.phdEstimatedAcqHousingPrice)}
              small
              formula={formula}
            />
          );
        })()}
        <Row
          label="주택 양도차익"
          value={fmt(h.transferGain)}
          formula={
            isDeemedAcq
              ? "(양도가액 - 취득가액 - 실제 필요경비) — 토지/건물 분리 후 합산"
              : `(양도가액 - ${nonDeemedAcqTerm} - 개산공제) — 토지/건물 분리 후 합산`
          }
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(h.landTransferGain)}
          small
          formula={
            isDeemedAcq
              ? `양도가액 ${fmtPlain(h.landTransferPrice)} - 취득가액 ${fmtPlain(h.landAcqPrice)}`
              : `양도가액 ${fmtPlain(h.landTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(h.landAcqPrice)} - 개산공제 ${fmtPlain(h.landAppraisalDed)} (취득시 토지 기준시가 ${h.landStdPriceAtAcq != null ? fmtPlain(h.landStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(h.buildingTransferGain)}
          small
          formula={
            isDeemedAcq
              ? h.buildingAppraisalDed > 0
                ? `양도가액 ${fmtPlain(h.buildingTransferPrice)} - 취득가액 ${fmtPlain(h.buildingAcqPrice)} - 실제 필요경비 ${fmtPlain(h.buildingAppraisalDed)}`
                : `양도가액 ${fmtPlain(h.buildingTransferPrice)} - 취득가액 ${fmtPlain(h.buildingAcqPrice)}`
              : `양도가액 ${fmtPlain(h.buildingTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(h.buildingAcqPrice)} - 개산공제 ${fmtPlain(h.buildingAppraisalDed)} (취득시 건물 기준시가 ${h.buildingStdPriceAtAcq != null ? fmtPlain(h.buildingStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <DivRow />
        {h.isExempt ? (
          <Row label="12억 이하 → 전액 비과세" value="0" />
        ) : (
          <Row
            label="12억 초과 안분 후 과세대상 양도차익"
            value={fmt(h.proratedTaxableGain)}
            formula={
              <FLine>
                (주택 양도차익 {fmtPlain(h.transferGain)}
                {h.nonBusinessTransferredGain > 0
                  ? ` - 비사업용 이전분 ${fmtPlain(h.nonBusinessTransferredGain)}`
                  : ""}
                ) ×{" "}
                <Frac
                  top={`주택 양도가액 ${fmtPlain(a.housingTransferPrice)} - 12억`}
                  bottom={`주택 양도가액 ${fmtPlain(a.housingTransferPrice)}`}
                />
              </FLine>
            }
          />
        )}
        {(() => {
          /**
           * §95② 본문 괄호 — §104⑦ 각 호(다주택 중과) 해당 주택은 장기보유특별공제 배제.
           *
           * 🔴 **엔진이 확정한 `surchargeLthdExclusion`을 읽는다 — 재도출 금지** (2026-08-25).
           *    종전에는 주석만 그렇게 적고 실제로는 `mhs.surchargeType !== "none" && !isSuspended`를
           *    **다시 계산**했다. 그래서 원시 플래그 fallback으로 배제된 경우(`mhs`가 아예 없다)
           *    「장기보유공제 (표1, **0.0%**)」로 표시돼 **보유기간이 짧아서 0인 것처럼** 읽혔다.
           */
          const excl = surchargeLthdExclusion;
          return (
            <Row
              label={
                excl
                  ? "장기보유공제 (배제)"
                  : `장기보유공제 (표${h.longTermDeductionTable}, ${fmtPct(h.longTermDeductionRate)})`
              }
              value={`△ ${fmt(h.longTermDeductionAmount)}`}
              formula={
                excl
                  ? `조정대상지역 ${excl.houseCount}주택 중과 대상 주택 — 장기보유특별공제 배제 (소득세법 §95② 본문 괄호·§104⑦)` +
                    (excl.fromFallback
                      ? " ※ 세대 보유 주택 목록 미입력 — 「세대 보유 주택 수」로 판정한 근사입니다."
                      : "")
                  : h.longTermDeductionTable === 2
                    ? "보유연수×4% + 거주연수×4% (최대 80%)"
                    : "보유연수×2% (최대 30%)"
              }
            />
          );
        })()}
        <DivRow />
        <Row
          label="주택부분 양도소득금액"
          value={fmt(h.incomeAmount)}
          highlight
          formula={`과세대상 양도차익 ${fmtPlain(h.proratedTaxableGain)} - 장기보유공제 ${fmtPlain(h.longTermDeductionAmount)}`}
        />
        {h.nonBusinessTransferRatio > 0 && (
          <Row
            label={`비사업용 이전 (${fmtPct(h.nonBusinessTransferRatio)})`}
            value={`→ ${fmt(h.nonBusinessTransferredGain)}`}
            small
            formula="주택 토지분 양도차익 중 부수토지 배율초과 면적 비율만큼 ④로 이전"
          />
        )}
      </ResultSection>

      {/* 3. 상가부분 */}
      <ResultSection
        title="③ 상가부분"
        basis="소득세법 §95 ② 표1"
        open={openSections.commercial}
        onToggle={() => toggleSection("commercial")}
      >
        <Row
          label="취득시 상가부분 기준시가 합계"
          value={fmt(c.acqStandardTotal)}
          small
          formula={`상가건물 기준시가 ${fmtPlain(c.acqStandardBuilding)} + 상가부수토지 기준시가 ${fmtPlain(c.acqStandardLand)} (= 개별공시지가 × 상가부수토지 면적, 자동)`}
        />
        <Row
          label={isActualAcq ? "취득 실거래가(취득가액)" : isDeemedAcq ? `${isGiftAcq ? "증여일" : "상속개시일"} 평가액(취득가액)` : isAppraisalSalesAcq ? "상가 감정·매매사례 취득가액" : "상가 환산취득가액"}
          value={fmt(c.estimatedAcquisitionPrice)}
          formula={(() => {
            if (isDeemedAcq && c.inheritedAcquisitionDetail) {
              const d = c.inheritedAcquisitionDetail;
              const base =
                d.selected === "reported"
                  ? `상속개시일 신고가액 ${fmtPlain(d.reportedValue)}`
                  : `상속개시일 보충적평가액(상증법 §60~66) ${fmtPlain(d.standardPriceCandidate)}`;
              return `${base} — 취득당시 실지거래가액으로 의제 (소령 §163⑨)`;
            }
            return (
              <FLine>
                §97: 상가 양도가액 {fmtPlain(a.commercialTransferPrice)} ×{" "}
                <Frac
                  top={`취득시 상가부분 기준시가 ${fmtPlain(c.acqStandardTotal)}`}
                  bottom={`양도시 상가부분 기준시가 ${fmtPlain(a.commercialStandardPrice)}`}
                />
              </FLine>
            );
          })()}
        />
        <Row
          label="상가 양도차익"
          value={fmt(c.transferGain)}
          formula={
            isDeemedAcq
              ? "(양도가액 - 취득가액 - 실제 필요경비) — 토지/건물 분리 후 합산"
              : `(양도가액 - ${nonDeemedAcqTerm} - 개산공제) — 토지/건물 분리 후 합산`
          }
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(c.landTransferGain)}
          small
          formula={
            isDeemedAcq
              ? `양도가액 ${fmtPlain(c.landTransferPrice)} - 취득가액 ${fmtPlain(c.landAcqPrice)}`
              : `양도가액 ${fmtPlain(c.landTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(c.landAcqPrice)} - 개산공제 ${fmtPlain(c.landAppraisalDed)} (취득시 토지 기준시가 ${c.landStdPriceAtAcq != null ? fmtPlain(c.landStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(c.buildingTransferGain)}
          small
          formula={
            isDeemedAcq
              ? c.buildingAppraisalDed > 0
                ? `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)} - 실제 필요경비 ${fmtPlain(c.buildingAppraisalDed)}`
                : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)}`
              : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(c.buildingAcqPrice)} - 개산공제 ${fmtPlain(c.buildingAppraisalDed)} (취득시 건물 기준시가 ${c.buildingStdPriceAtAcq != null ? fmtPlain(c.buildingStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <DivRow />
        <Row
          label={`장기보유공제 (표1, ${fmtPct(c.longTermDeductionRate)})`}
          value={`△ ${fmt(c.longTermDeductionAmount)}`}
          formula="보유연수×2% (최대 30%) — 토지/건물 별 보유연수 적용"
        />
        <DivRow />
        <Row
          label="상가부분 양도소득금액"
          value={fmt(c.incomeAmount)}
          highlight
          formula={`양도차익 ${fmtPlain(c.transferGain)} - 장기보유공제 ${fmtPlain(c.longTermDeductionAmount)}`}
        />
      </ResultSection>

      {/* 4. 비사업용토지 (조건부) */}
      {nb && (
        <ResultSection
          title="④ 비사업용토지 (주택부수토지 배율초과)"
          basis="시행령 §168의12 + §104의3"
          open={openSections.nbl}
          onToggle={() => toggleSection("nbl")}
        >
          <Row
            label={`적용 배율`}
            value={`${nb.appliedMultiplier}배`}
            formula="수도권 주거지역 3배 / 녹지·외곽 5배 / 도시 외 10배"
          />
          <Row
            label="배율초과 면적"
            value={fmtSqm(nb.excessArea)}
            formula="주택부수토지 면적 - (주택 정착면적 × 배율)"
          />
          <Row
            label="비사업용 양도차익"
            value={fmt(nb.transferGain)}
            formula={`주택 토지분 양도차익 ${fmtPlain(h.landTransferGain)} × 배율초과 비율 ${fmtPct(h.nonBusinessTransferRatio)}`}
          />
          <Row
            label={`장기보유공제 (표1, ${fmtPct(nb.longTermDeductionRate)})`}
            value={`△ ${fmt(nb.longTermDeductionAmount)}`}
            formula="토지 보유연수×2% (최대 30%)"
          />
          <DivRow />
          <Row
            label="비사업용토지 양도소득금액 (+10%p 가산)"
            value={fmt(nb.incomeAmount)}
            highlight
            formula={`양도차익 ${fmtPlain(nb.transferGain)} - 장기보유공제 ${fmtPlain(nb.longTermDeductionAmount)} (세율 가산은 합산세액에서 처리)`}
          />
        </ResultSection>
      )}

      {/* 합산 세액 */}
      <ResultSection
        title="합산 세액"
        basis="소득세법 §92~§107"
        open={openSections.total}
        onToggle={() => toggleSection("total")}
      >
        <Row
          label="합산 양도소득금액"
          value={fmt(t.aggregateIncome)}
          formula={`주택부분 ${fmtPlain(h.incomeAmount)} + 상가부분 ${fmtPlain(c.incomeAmount)}${
            nb ? ` + 비사업용토지 ${fmtPlain(nb.incomeAmount)}` : ""
          }`}
        />
        <Row
          label="기본공제"
          value={`△ ${fmt(t.basicDeduction)}`}
          formula="연 250만원 (소득세법 §103)"
        />
        <Row
          label="과세표준"
          value={fmt(t.taxBase)}
          formula={`합산 양도소득금액 ${fmtPlain(t.aggregateIncome)} - 기본공제 ${fmtPlain(t.basicDeduction)}`}
        />
        <DivRow />
        <Row
          label={t.rateBasis === "clause2" ? "산출세액 (자산별 합계)" : "산출세액 (기본세율)"}
          value={fmt(adoptedCalculatedTax(t))}
          formula={(() => {
            // §104⑤2호가 채택되면 세액은 파트별 산출세액의 합이라 `taxByBasicRate`(1호)와 다르다.
            // 1호 값을 그대로 인용하면 표시-계산 drift가 된다.
            // 배율 초과분(비사업용 토지)은 §104⑤ 본문 **후단**에 따라 **별개 자산**으로 보아
            // §104①8호(누진 + 10%p)를 자기 과세표준에만 적용한다. 총액에 별도로 얹지 않으므로
            // 위 「비사업용토지 +10%p 가산세」 행이 뜨지 않는다 — 산식에서마저 빠지면
            // 사용자는 중과가 누락된 것으로 오해한다.
            const nbTerm = nb && t.nonBusinessSurcharge === 0
              ? ` + 비사업용토지분 과세표준 × (누진세율 + 10%p, 소득세법 §104①8호)`
              : "";
            if (t.rateBasis === "clause2") {
              const addon = t.surchargeAddon;
              return addon !== undefined
                ? `주택분 과세표준 × (누진세율 + ${fmtPct(addon)}) + 상가분 과세표준 × 누진세율${nbTerm} — 자산별 산출세액 합계가 합산 누진(${fmtPlain(t.taxByBasicRate)})보다 커서 채택 (소득세법 §104⑤ 2호·§104⑦)`
                : `파트별 과세표준 × 각 적용세율 합계${nbTerm} — 합산 누진(${fmtPlain(t.taxByBasicRate)})보다 커서 채택 (소득세법 §104⑤ 2호)`;
            }
            if (t.taxBase <= 0) return "과세표준 × 누진세율 (6%~45% 8구간) — 소득세법 §104";
            // 엔진이 신규 필드를 채웠으면 그대로 사용, 아니면 taxBase로부터 도출 (캐시 fallback)
            const fallback = deriveBasicRateBracket(t.taxBase);
            const rate = t.appliedRate && t.appliedRate > 0 ? t.appliedRate : fallback.rate;
            const deduction = t.progressiveDeduction && t.progressiveDeduction > 0 ? t.progressiveDeduction : fallback.deduction;
            // 1호(합산 누진)가 채택된 경우 — 비사업용 가산이 포함된 2호보다 1호가 컸다는 뜻이다.
            const nbNote = nbTerm
              ? ` · 비사업용토지분은 별개 자산으로 보아 §104①8호를 적용한 자산별 합계(§104⑤ 2호)와 비교했으나, 합산 누진(1호)이 더 커서 1호가 채택되었습니다`
              : "";
            return `${fmtPlain(t.taxBase)} × ${fmtPct(rate)} - ${fmtPlain(deduction)} (소득세법 §104)${nbNote}`;
          })()}
        />
        {t.nonBusinessSurcharge > 0 && (
          <Row
            label="비사업용토지 +10%p 가산세"
            value={fmt(t.nonBusinessSurcharge)}
            formula={(() => {
              // 중과 base = 비사업용 양도소득금액 − 기본공제 귀속분(최고세율 부분에 전액 귀속).
              // 적용공제 = 합산 양도소득금액 − 과세표준 (§104①8호, 납세자 유리 원칙).
              const surchargeBase = nb
                ? Math.max(0, nb.incomeAmount - (t.aggregateIncome - t.taxBase))
                : 0;
              return `비사업용토지 과세표준 귀속분 ${fmtPlain(surchargeBase)} × 10%`;
            })()}
          />
        )}
        <Row
          label="양도소득세"
          value={fmt(t.transferTax)}
          formula={`산출세액 ${fmtPlain(adoptedCalculatedTax(t))}${
            t.nonBusinessSurcharge > 0
              ? ` + 비사업용토지 가산세 ${fmtPlain(t.nonBusinessSurcharge)}`
              : ""
          }`}
        />
        {/**
         * 산출세액 이후 단계 — 감면세액·결정세액·가산세·농어촌특별세.
         *
         * 🔴 종전에는 이 네 행이 통째로 없었다. 엔진은
         *   `totalPayable = 결정세액 + 지방소득세 + 가산세 + 농특세`인데
         *   (`transfer-tax-mixed-use-totals.ts:249`) 표에는 산출세액·지방소득세·총 납부세액만
         *   있어 총액과 그 아래 산식이 감면·가산세·농특세만큼 어긋났다. 지방소득세 산식도
         *   「양도소득세 × 10%」라고 적혀 있었지만 실제 base는 **결정세액**이라
         *   감면이 붙으면 산식으로 검산이 되지 않았다(결과탭 코드리뷰 #001 · #087).
         */}
        {t.reductionAmount > 0 && (
          <>
            <Row
              label="감면세액"
              value={`△ ${fmt(t.reductionAmount)}`}
              formula="조세특례제한법상 세액감면 — 산출세액에서 차감 (중복배제 후 채택된 1건, 조특법 §127⑦)"
            />
            <Row
              label="결정세액"
              value={fmt(t.determinedTax)}
              formula={`산출세액 ${fmtPlain(t.transferTax)} - 감면세액 ${fmtPlain(t.reductionAmount)}`}
            />
          </>
        )}
        <Row
          label="지방소득세 (10%)"
          value={fmt(t.localTax)}
          formula={`결정세액 ${fmtPlain(t.determinedTax)} × 10% (지방세법 §103의3)`}
        />
        {t.penaltyTax > 0 && (
          <Row
            label="가산세"
            value={fmt(t.penaltyTax)}
            formula="신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4)"
          />
        )}
        {t.ruralSurtax > 0 && (
          <Row
            label="농어촌특별세"
            value={fmt(t.ruralSurtax)}
            formula={`감면세액 ${fmtPlain(t.reductionAmount)} × 20% (농어촌특별세법 §5①1호)`}
          />
        )}
        <DivRow />
        <Row
          // 정정 모드에서는 AmendmentResultCard의 "참고 · 수정/경정 후 전체 세액"과 라벨을 맞춘다
          // (같은 금액에 다른 라벨이 한 화면에 뜨는 것을 방지).
          label={
            breakdown.amendmentDetail
              ? breakdown.amendmentDetail.correctionKind === "refund_claim"
                ? "경정 후 전체 세액"
                : "수정 후 전체 세액"
              : "총 납부세액"
          }
          value={fmt(t.totalPayable)}
          highlight
          large
          formula={[
            `결정세액 ${fmtPlain(t.determinedTax)}`,
            `지방소득세 ${fmtPlain(t.localTax)}`,
            ...(t.penaltyTax > 0 ? [`가산세 ${fmtPlain(t.penaltyTax)}`] : []),
            ...(t.ruralSurtax > 0 ? [`농어촌특별세 ${fmtPlain(t.ruralSurtax)}`] : []),
          ].join(" + ")}
        />
      </ResultSection>
      </PrintSection>

      {/* ── 계산결과 상세명세서 (겸용주택 모드) ── */}
      {/* 신고서 양식 32 항목별 산식·변수값·법령 노출 — mixedUseDetail은 단건 모드로 처리 */}
      <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
      <DetailedCalculationStatementCard
        result={mixedUseToFilingResult(breakdown)}
        formData={formData}
        asset={formData?.assets[0]}
      />
      </PrintSection>

      {/* ── 건물 기준시가 계산서 (PHD 3시점 일괄 스냅샷 소속 시) ── */}
      {/* 겸용 입력폼 PHD 배치가 bsp-{assetId}-phd-* 스냅샷을 저장 → 여기서 소속 재유도·출력.
          엔진·스냅샷 생성 무변경, 단건 TransferTaxResultView와 동일 배선(inputData=assets). */}
      {hasBuildingStdReport({ assets: formData?.assets }) && (
        <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
          <BuildingStdPriceReportSection inputData={{ assets: formData?.assets }} />
        </PrintSection>
      )}
    </div>
  );
}

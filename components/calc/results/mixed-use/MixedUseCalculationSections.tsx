"use client";

/**
 * 겸용주택 결과 — **분리계산 본문** (800줄 분리, 2026-09-11)
 *
 * `MixedUseResultCard.tsx` 가 808줄로 정책(트리거 800 · 착지 ≤700)을 넘겨 분리했다.
 * 이음매는 `<PrintSection id="calculation">` **하나**다 — 620줄로 그 파일의 대부분이었다.
 *
 * 🔑 **`breakdown` 파생부를 함께 옮겼다.** 그 블록이 쓰는 상위 심볼 17개 중 **15개가
 *    `breakdown` 에서 파생**된 것이라, 파생을 부모에 두면 props 가 17개가 된다. 함께
 *    내리면 **7개**로 줄고, 부모에는 파생이 남지 않아 dual-truth 도 생기지 않는다
 *    ([[feedback_800line_split_playbook]] 「거대 단일 함수는 구조분해」의 JSX 판).
 *
 * ⚠️ 섹션 접기 상태(`openSections`)는 **부모 소유**다 — 인쇄 전체펼침 토글이 그 상태를
 *    함께 쓰기 때문이다. 핸들러만 내려받는다.
 *
 * 합산 세액 + 감면 산출근거 카드는 `MixedUseTotalTaxSection.tsx`로 한 번 더 분리했다(2026-09-30, 762줄).
 */

import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { MIXED_USE } from "@/lib/tax-engine/legal-codes/transfer-mixed-use";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { MixedUseExpropriationValuationCard } from "@/components/calc/results/mixed-use/MixedUseExpropriationValuationCard";
import { MixedUseTotalTaxSection } from "@/components/calc/results/mixed-use/MixedUseTotalTaxSection";
import { MixedUseHousingStdSplit } from "@/components/calc/results/mixed-use/MixedUseHousingStdSplit";
import {
  SeparateAcqPartRows,
  SeparateAcqSummary,
  separatePartGainFormula,
} from "@/components/calc/results/mixed-use/MixedUseSeparateAcqRows";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { expandToggleClass } from "@/components/calc/results/shared/ExpandToggleButton";
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

interface Props {
  breakdown: MixedUseGainBreakdown;
  formData?: TransferFormData;
  selectedPrintIds: Set<string>;
  openSections: Record<string, boolean>;
  toggleSection: (id: string) => void;
  allSectionsOpen: boolean;
  setAllSections: (value: boolean) => void;
}

export function MixedUseCalculationSections({
  breakdown,
  formData,
  selectedPrintIds,
  openSections,
  toggleSection,
  allSectionsOpen,
  setAllSections,
}: Props) {
  const { apportionment: a, housingPart: h, commercialPart: c, nonBusinessLandPart: nb, total: t, surchargeLthdExclusion } = breakdown;
  const totalTransfer = a.housingTransferPrice + a.commercialTransferPrice;
  // 상속 취득가액 직접 산정(소령 §163⑨) — 단일 소스: calculationRoute.acquisitionConversionRoute만 판독.
  // (part-level acqPriceSource는 dual-truth 회피로 미채택 — plan §4.5 정본 결정)
  const acqRoute = breakdown.calculationRoute.acquisitionConversionRoute;
  /**
   * 🔴 B1 별개 취득 파트 모델 echo — **route 분기보다 먼저** 읽는다. 엔진은 파트 모델에 새 route 값을 만들지 않아
   * (`section97_direct`/`phd_corrected`로 나온다) route만 보면 실거래가 파트에도 「환산취득가액」 거짓 라벨이 붙는다.
   * echo가 있으면 취득가액·양도차익 행은 파트별 산정방식을 그린다(아래 `sep ? … : 종전`).
   */
  const sep = breakdown.separateAcquisition;
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

  /** 주택 취득가액 산식 — 종전 행과 B1 환산 파트 행이 **같은 산식**을 쓴다(복제 금지). */
  const housingAcqFormula = (): React.ReactNode => {
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
                  {/* 토지·건물 취득일이 다르면 분자는 건물 취득일 개별주택가격을 토지 취득일로 옮긴
                      취득당시 주택가격이다(집행기준 99-164-9) — 「주택분 기준시가 분할」의 환산값과 같은 값. */}
                  <Frac
                    top={
                      h.housingStdSplit?.acq?.kind === "separate_date_converted"
                        ? `취득당시 주택가격(토지·건물 취득일 상이 환산) ${fmtPlain(h.acqHousingStandardPrice ?? 0)}`
                        : `취득시 개별주택공시가격 ${fmtPlain(h.acqHousingStandardPrice ?? 0)}${
                            (h.acqHousingStandardPrice ?? 0) > 0 ? "" : " (미공시)"
                          }`
                    }
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
  };

  return (
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
      {/* 경고 — 🔴 종전에는 겸용만 자체 마크업이라 공용 카드의 「확인이 필요한 사항」 제목과
             다크모드 색이 없었다. 나머지 세 결과뷰는 모두 이 leaf를 쓴다 (#086). */}
      <CalculationWarningsCard warnings={breakdown.warnings} />

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
        {sep && <SeparateAcqSummary breakdown={breakdown} />}
        {sep ? (
          <SeparateAcqPartRows kind="housing" breakdown={breakdown} estimatedFormula={housingAcqFormula()} />
        ) : (
          <Row
            label={isActualAcq ? "취득 실거래가(취득가액)" : isDeemedAcq ? `${isGiftAcq ? "증여일" : "상속개시일"} 평가액(취득가액)` : isAppraisalSalesAcq ? "주택 감정·매매사례 취득가액" : "주택 환산취득가액"}
            value={fmt(h.estimatedAcquisitionPrice)}
            formula={housingAcqFormula()}
          />
        )}
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
        {/* S3-2 — 개별주택가격 → 토지분·건물분 분할(양도가액·취득가액 안분·개산공제의 base). echo가 있을 때만 */}
        {h.housingStdSplit && <MixedUseHousingStdSplit split={h.housingStdSplit} />}
        <Row
          label="주택 양도차익"
          value={fmt(h.transferGain)}
          formula={
            sep
              ? "(양도가액 - 취득가액 - 필요경비[실거래가 파트는 실제 필요경비, 그 밖은 개산공제]) — 토지/건물 분리 후 합산"
              : isDeemedAcq
              ? "(양도가액 - 취득가액 - 실제 필요경비) — 토지/건물 분리 후 합산"
              : `(양도가액 - ${nonDeemedAcqTerm} - 개산공제) — 토지/건물 분리 후 합산`
          }
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(h.landTransferGain)}
          small
          formula={
            sep
              ? separatePartGainFormula(sep, "housingLand", h.landTransferPrice, h.landAcqPrice, h.landAppraisalDed, h.landStdPriceAtAcq)
              : isDeemedAcq
              ? `양도가액 ${fmtPlain(h.landTransferPrice)} - 취득가액 ${fmtPlain(h.landAcqPrice)}`
              : `양도가액 ${fmtPlain(h.landTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(h.landAcqPrice)} - 개산공제 ${fmtPlain(h.landAppraisalDed)} (취득시 토지분 기준시가 ${h.landStdPriceAtAcq != null ? fmtPlain(h.landStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(h.buildingTransferGain)}
          small
          formula={
            sep
              ? separatePartGainFormula(sep, "housingBuilding", h.buildingTransferPrice, h.buildingAcqPrice, h.buildingAppraisalDed, h.buildingStdPriceAtAcq)
              : isDeemedAcq
              ? h.buildingAppraisalDed > 0
                ? `양도가액 ${fmtPlain(h.buildingTransferPrice)} - 취득가액 ${fmtPlain(h.buildingAcqPrice)} - 실제 필요경비 ${fmtPlain(h.buildingAppraisalDed)}`
                : `양도가액 ${fmtPlain(h.buildingTransferPrice)} - 취득가액 ${fmtPlain(h.buildingAcqPrice)}`
              : `양도가액 ${fmtPlain(h.buildingTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(h.buildingAcqPrice)} - 개산공제 ${fmtPlain(h.buildingAppraisalDed)} (취득시 건물분 기준시가 ${h.buildingStdPriceAtAcq != null ? fmtPlain(h.buildingStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <DivRow />
        {/*
          OH-61 — 이 행은 엔진이 **실제로 쓴** 규칙·분모를 읽는다(재도출 금지):
            · 비과세 미적용(`non_one_house_full_taxation`) — 안분 없이 전액이 과세대상이다.
            · 12억 초과 안분 — 분모는 엔진 echo `highValueBase`(공유지분이면 물건 전체 주택분, 영 §156①).
            · L-10 — 판정 분모가 다르면 엔진 echo `highValueJudgmentBase`(건물 전체, 영 §156②)를 따로 그린다.
        */}
        {h.isExempt ? (
          <Row label="12억 이하 → 전액 비과세" value="0" />
        ) : breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation" ? (
          <Row
            label="1세대1주택 비과세 미적용 → 과세대상 양도차익 (전액)"
            value={fmt(h.proratedTaxableGain)}
            formula={`주택 양도차익 ${fmtPlain(h.transferGain)}${
              h.nonBusinessTransferredGain > 0
                ? ` - 비사업용 이전분 ${fmtPlain(h.nonBusinessTransferredGain)}`
                : ""
            } — 비과세 요건 미충족이라 12억 초과분 안분을 하지 않습니다`}
          />
        ) : (
          (() => {
            const base = h.highValueBase ?? a.housingTransferPrice;
            const baseLabel =
              a.wholeHousingTransferPrice !== undefined ? "물건 전체 주택분 양도가액" : "주택 양도가액";
            // L-10 — 판정(건물 전체, 영 §156②)과 산식(주택 부분, 영 §160① 괄호)의 분모가 다르면 판정 행을 먼저 그린다.
            const judged = h.highValueJudgmentBase;
            return (
              <>
                {judged !== undefined && (
                  <Row
                    label="고가주택 판정 — 건물 전체 실지거래가액"
                    value={fmt(judged)}
                    formula={`주택 연면적 > 주택 외 연면적 → 주택 외 부분 포함 12억 초과 → 고가주택 (${MIXED_USE.HIGH_VALUE_WHOLE_BUILDING})`}
                  />
                )}
                <Row
                  label="12억 초과 안분 후 과세대상 양도차익"
                  value={fmt(h.proratedTaxableGain)}
                  formula={
                    base <= 1_200_000_000 ? (
                      `${baseLabel} ${fmtPlain(base)} ≤ 12억 → 12억 초과분 없음 — 산식은 주택 부분만 (${MIXED_USE.HIGH_VALUE_FORMULA_HOUSING_ONLY})`
                    ) : (
                      <FLine>
                        (주택 양도차익 {fmtPlain(h.transferGain)}
                        {h.nonBusinessTransferredGain > 0
                          ? ` - 비사업용 이전분 ${fmtPlain(h.nonBusinessTransferredGain)}`
                          : ""}
                        ) ×{" "}
                        <Frac
                          top={`${baseLabel} ${fmtPlain(base)} - 12억`}
                          bottom={`${baseLabel} ${fmtPlain(base)}`}
                        />
                      </FLine>
                    )
                  }
                />
              </>
            );
          })()
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
        {/* B1 — 양쪽 실거래가 + 용도별 계약액이면 상가 취득시 기준시가가 쓰이지 않아 0이다 — 쓰이지 않는 0을 보여주지 않는다. */}
        {(!sep || c.acqStandardTotal > 0) && (
        <Row
          label="취득시 상가부분 기준시가 합계"
          value={fmt(c.acqStandardTotal)}
          small
          formula={`상가건물 기준시가 ${fmtPlain(c.acqStandardBuilding)} + 상가부수토지 기준시가 ${fmtPlain(c.acqStandardLand)} (= 개별공시지가 × 상가부수토지 면적, 자동)`}
        />
        )}
        {sep ? (
          <SeparateAcqPartRows
            kind="commercial"
            breakdown={breakdown}
            estimatedFormula={
              <FLine>
                §97: 상가 양도가액 {fmtPlain(a.commercialTransferPrice)} ×{" "}
                <Frac
                  top={`취득시 상가부분 기준시가 ${fmtPlain(c.acqStandardTotal)}`}
                  bottom={`양도시 상가부분 기준시가 ${fmtPlain(a.commercialStandardPrice)}`}
                />
              </FLine>
            }
          />
        ) : (
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
        )}
        <Row
          label="상가 양도차익"
          value={fmt(c.transferGain)}
          formula={
            sep
              ? "(양도가액 - 취득가액 - 필요경비[실거래가 파트는 실제 필요경비, 그 밖은 개산공제]) — 토지/건물 분리 후 합산"
              : isDeemedAcq
              ? "(양도가액 - 취득가액 - 실제 필요경비) — 토지/건물 분리 후 합산"
              : `(양도가액 - ${nonDeemedAcqTerm} - 개산공제) — 토지/건물 분리 후 합산`
          }
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(c.landTransferGain)}
          small
          formula={
            sep
              ? separatePartGainFormula(sep, "commercialLand", c.landTransferPrice, c.landAcqPrice, c.landAppraisalDed, c.landStdPriceAtAcq)
              : isDeemedAcq
              ? `양도가액 ${fmtPlain(c.landTransferPrice)} - 취득가액 ${fmtPlain(c.landAcqPrice)}`
              : `양도가액 ${fmtPlain(c.landTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(c.landAcqPrice)} - 개산공제 ${fmtPlain(c.landAppraisalDed)} (취득시 토지 기준시가 ${c.landStdPriceAtAcq != null ? fmtPlain(c.landStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(c.buildingTransferGain)}
          small
          formula={
            sep
              ? separatePartGainFormula(sep, "commercialBuilding", c.buildingTransferPrice, c.buildingAcqPrice, c.buildingAppraisalDed, c.buildingStdPriceAtAcq)
              : isDeemedAcq
              ? c.buildingAppraisalDed > 0
                ? `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)} - 실제 필요경비 ${fmtPlain(c.buildingAppraisalDed)}`
                : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)}`
              : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(c.buildingAcqPrice)} - 개산공제 ${fmtPlain(c.buildingAppraisalDed)} (취득시 건물 기준시가 ${c.buildingStdPriceAtAcq != null ? fmtPlain(c.buildingStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        <DivRow />
        {c.deemedHouseBy154_3Main ? (
          // OH-17 — 엔진이 §154③ 본문으로 건물 전부를 주택으로 봤다(주택 연면적 > 상가 · 전체 12억 이하).
          <Row
            label="주택으로 봄 → 1세대1주택 비과세"
            value="0"
            highlight
            formula={`주택 연면적이 주택 외 연면적보다 커 건물 전부를 주택으로 봅니다(소득세법 시행령 §154③ 본문) — 전체 실지거래가액이 12억 이하라 이 부분도 비과세(§156②)${
              nb ? " · 배율 초과 토지분은 ④ 비사업용토지로 이전" : ""
            }`}
          />
        ) : (
          <>
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
          </>
        )}
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

      <MixedUseTotalTaxSection
        breakdown={breakdown}
        formData={formData}
        open={openSections.total}
        onToggle={() => toggleSection("total")}
      />
      </PrintSection>
  );
}

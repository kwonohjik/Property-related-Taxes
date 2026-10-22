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
import { mixedPartLthdRates } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { mixedPartLthdRateText } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { MixedUseExpropriationValuationCard } from "@/components/calc/results/mixed-use/MixedUseExpropriationValuationCard";
import { MixedSec163_9ComparisonCard } from "@/components/calc/results/mixed-use/MixedSec163_9ComparisonCard";
import { mixedSec163_9PartFormula } from "@/components/calc/results/mixed-use/MixedSec163_9ComparisonCard";
import { MixedUseNblSection } from "@/components/calc/results/mixed-use/MixedUseNblSection";
import { MixedUseTotalTaxSection } from "@/components/calc/results/mixed-use/MixedUseTotalTaxSection";
import { MixedUseHousingStdSplit } from "@/components/calc/results/mixed-use/MixedUseHousingStdSplit";
import {
  MixedUseApportionSection,
  MixedBuildingExtrasNote,
  PerPartConversionFormula,
} from "@/components/calc/results/mixed-use/MixedUseApportionSection";
import {
  SeparateAcqPartRows,
  SeparateAcqSummary,
  separatePartGainFormula,
} from "@/components/calc/results/mixed-use/MixedUseSeparateAcqRows";
import {
  MixedBgNoTransferBanner,
  MixedUseBgAcqRows,
  MixedUseBgApportionSection,
  MixedBgNotTransferred,
  mixedBgPartGainFormula,
  mixedBgSideTransferred,
} from "@/components/calc/results/mixed-use/MixedUseBurdenedGiftSection";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { expandToggleClass } from "@/components/calc/results/shared/ExpandToggleButton";
import {
  fmt,
  fmtPlain,
  fmtPct,
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
  // 겸용 × 부담부증여 — 이 값의 존재로 분기한다. 양도가액이 «양도로 보는 채무액»이라 일반 겸용 문구가 맞지 않는다.
  const bg = breakdown.burdenedGift;
  const bgHousingOn = !bg || mixedBgSideTransferred(bg, "housing");
  const bgCommercialOn = !bg || mixedBgSideTransferred(bg, "commercial");
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
  // §163⑨ 단서 자산 합계 비교(PR-6) — 있으면 상속·증여 취득가액 행은 «어느 후보가 이겼는지»를 그린다(종전 «상속개시일 평가액» 문구는 ② 채택에서 틀린다).
  const sec163_9 = breakdown.sec163_9Comparison;
  // 비-의제(환산·감정·매매사례) 취득가액 용어 — 감정/매매사례는 직접 안분이라 "환산취득가액" 아닌 "취득가액".
  const nonDeemedAcqTerm = isAppraisalSalesAcq ? "취득가액" : "환산취득가액";
  // 새 안분(계약서 구분·감정가액) + 환산 — 엔진이 토지·건물 파트별로 환산한다(Q-8). 그 경우만 산식을 바꾼다(M-2).
  const perPartConversion = breakdown.saleSplit && !isDeemedAcq && !isAppraisalSalesAcq ? breakdown.saleSplit : undefined;

  /** 주택 취득가액 산식 — 종전 행과 B1 환산 파트 행이 **같은 산식**을 쓴다(복제 금지). */
  const housingAcqFormula = (): React.ReactNode => {
            if (sec163_9 && sec163_9.selected !== "converted") return mixedSec163_9PartFormula(sec163_9, "housing", h.estimatedAcquisitionPrice);
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
            if (perPartConversion) {
              return (
                <PerPartConversionFormula
                  side="housing" saleSplit={perPartConversion}
                  landStdAtAcq={h.landStdPriceAtAcq} buildingStdAtAcq={h.buildingStdPriceAtAcq}
                />
              );
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
                시행령 §164⑦ 역산 환산: 주택 양도가액 {fmtPlain(a.housingTransferPrice)} ×{" "}
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
      {sec163_9 && <MixedSec163_9ComparisonCard cmp={sec163_9} />}
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

      {/* 부담부증여 — 양도 없는 쪽은 「양도 없음」(비과세 아님)으로 그린다 */}
      {bg && <MixedBgNoTransferBanner bg={bg} />}
      {/* 1세대 1주택 비과세 적용 여부 표시 — 주택분 양도가 없으면 판정 대상이 아니라 그리지 않는다 */}
      {bgHousingOn && (
      <div
        className={`rounded-md px-3 py-2 text-xs border ${
          breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "bg-amber-50/60 border-amber-200 text-amber-900 dark:text-amber-200 dark:bg-amber-950/40"
            : "bg-emerald-50/60 border-emerald-200 text-emerald-900 dark:text-emerald-200 dark:bg-emerald-950/40"
        }`}
      >
        <span className="font-semibold">
          1세대 1주택 비과세:{" "}
          {breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "미적용 (전액 과세 + 표1 공제)"
            : breakdown.calculationRoute.highValueRule === "below_threshold_exempt"
              ? h.laterLandExemptExcluded
                ? "적용 (12억 이하 비과세 — 나중에 취득한 부수토지분은 보유요건 미달로 과세)"
                : "적용 (12억 이하 비과세)"
              : h.laterLandExemptExcluded
                ? "적용 (12억 초과 안분 과세 — 나중에 취득한 부수토지분은 보유요건 미달로 전액 과세)"
                : "적용 (12억 초과 안분 과세)"}
        </span>
      </div>
      )}

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

      {/* 1. 양도가액 안분 — 부담부증여는 채무 귀속·채무비율 섹션으로 대체 */}
      {bg && (
        <MixedUseBgApportionSection bg={bg} open={openSections.apportion} onToggle={() => toggleSection("apportion")} />
      )}
      {!bg && (
        <MixedUseApportionSection breakdown={breakdown} open={openSections.apportion} onToggle={() => toggleSection("apportion")} />
      )}

      {/* 2. 주택부분 */}
      <ResultSection
        title="② 주택부분"
        basis="소득세법 §89 ① 3호 단서 + §95 ②"
        open={openSections.housing}
        onToggle={() => toggleSection("housing")}
      >
        {sep && <SeparateAcqSummary breakdown={breakdown} />}
        {bg ? (
          <MixedUseBgAcqRows bg={bg} side="housing" />
        ) : sep ? (
          <SeparateAcqPartRows kind="housing" breakdown={breakdown} estimatedFormula={housingAcqFormula()} />
        ) : (
          <Row
            label={sec163_9 && sec163_9.selected !== "converted" ? "취득가액(§163⑨ 합계 비교)" : isActualAcq ? "취득 실거래가(취득가액)" : isDeemedAcq ? `${isGiftAcq ? "증여일" : "상속개시일"} 평가액(취득가액)` : isAppraisalSalesAcq ? "주택 감정·매매사례 취득가액" : "주택 환산취득가액"}
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
            bg
              ? "(양도가액 - 취득가액 - 필요경비) — 토지/건물 분리 후 합산, 부분별 채무비율 적용 후 값"
              : sep
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
            bg
              ? mixedBgPartGainFormula(bg, "housingLand")
              : sep
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
            bg
              ? mixedBgPartGainFormula(bg, "housingBuilding")
              : sep
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
        {!bgHousingOn ? (
          <Row label="고가주택 판정: 해당 없음 (주택분 양도 없음)" value="-" />
        ) : h.isExempt && h.laterLandExemptExcluded ? (
          // #2141 — 나중에 취득한 부수토지가 보유요건(영 §154①) 미만이면 토지분은 비과세 대상이 아니다. 건물분만 비과세.
          <Row
            label="12억 이하 → 건물분 비과세 · 나중에 취득한 부수토지분 과세"
            value={fmt(h.proratedTaxableGain)}
            formula={`부수토지 양도차익 ${fmtPlain(h.landTransferGain)}${
              h.nonBusinessTransferredGain > 0
                ? ` - 비사업용 이전분 ${fmtPlain(h.nonBusinessTransferredGain)}`
                : ""
            } — 주택보다 나중에 취득해 보유기간이 보유요건(소득세법 시행령 §154①)에 못 미치므로 비과세에서 제외`}
          />
        ) : h.isExempt ? (
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
                    ) : h.highValueExcessRuling ? (
                      // 재산세제과-915(2011.10.27.) 회신 방식 — 엔진 echo를 그대로 읽는다(안분 후 값에서 초과분을 한 번만 뺀다).
                      <FLine>
                        기준면적 이내 토지분 [전체 부수토지 양도차익 {fmtPlain(h.highValueExcessRuling.wholeLandGain)} ×{" "}
                        <Frac
                          top={`${baseLabel} ${fmtPlain(base)} - 12억`}
                          bottom={`${baseLabel} ${fmtPlain(base)}`}
                        />
                        {" "}= {fmtPlain(h.highValueExcessRuling.wholeLandProrated)} - 비사업용 이전분 {fmtPlain(h.nonBusinessTransferredGain)}
                        {h.highValueExcessRuling.wholeLandProrated - h.nonBusinessTransferredGain < 0 ? " (음수여서 0)" : ""}
                        {" "}= {fmtPlain(h.highValueExcessRuling.landTaxableGain)}] + 건물분 {fmtPlain(h.buildingTransferGain)} ×{" "}
                        <Frac
                          top={`${baseLabel} ${fmtPlain(base)} - 12억`}
                          bottom={`${baseLabel} ${fmtPlain(base)}`}
                        />
                        {" "}(기획재정부 재산세제과-915, 2011.10.27. 회신 방식)
                      </FLine>
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
        {!bgHousingOn ? null : (() => {
          /**
           * §95② 본문 괄호 — §104⑦ 각 호(다주택 중과) 해당 주택은 장기보유특별공제 배제.
           *
           * 🔴 **엔진이 확정한 `surchargeLthdExclusion`을 읽는다 — 재도출 금지** (2026-08-25).
           *    종전에는 주석만 그렇게 적고 실제로는 `mhs.surchargeType !== "none" && !isSuspended`를
           *    **다시 계산**했다. 그래서 원시 플래그 fallback으로 배제된 경우(`mhs`가 아예 없다)
           *    「장기보유공제 (표1, **0.0%**)」로 표시돼 **보유기간이 짧아서 0인 것처럼** 읽혔다.
           */
          const excl = surchargeLthdExclusion;
          // 토지·건물 공제율이 다르면 대표 율(건물 기준) 하나 대신 파트별 표·율과 산식을 적는다(상세명세서·계산 단계와 같은 판정).
          const rates = mixedPartLthdRates(h);
          const app = h.appurtenantLthd;
          return (
            <Row
              label={
                excl
                  ? "장기보유공제 (배제)"
                  : rates
                    ? `장기보유공제 (${mixedPartLthdRateText(rates, fmtPct)})`
                    : `장기보유공제 (표${h.longTermDeductionTable}, ${fmtPct(h.longTermDeductionRate)})`
              }
              value={`△ ${fmt(h.longTermDeductionAmount)}`}
              formula={
                excl
                  ? `조정대상지역 ${excl.houseCount}주택 중과 대상 주택 — 장기보유특별공제 배제 (소득세법 §95② 본문 괄호·§104⑦)` +
                    (excl.fromFallback
                      ? " ※ 다른 보유 주택 목록 미입력 — 「세대 보유 주택 수」로 판정한 근사입니다."
                      : "")
                  : rates
                    ? `토지분 ${fmtPlain(rates.land.echo.taxableGain)} × ${fmtPct(rates.land.echo.longTermRate)} = ${fmtPlain(rates.land.echo.longTermDeduction)}` +
                      ` + 건물분 ${fmtPlain(rates.building.echo.taxableGain)} × ${fmtPct(rates.building.echo.longTermRate)} = ${fmtPlain(rates.building.echo.longTermDeduction)}` +
                      (app?.table1Applied
                        ? ` — 토지분은 주택보다 먼저 취득해 표1·표2 중 큰 공제율(${app.basis.source === "circular" ? "소득세법 기본통칙 95-0…1" : "과세관청 해석 재산세과-4375(2008.12.24.)"})`
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
        {bg ? (
          <MixedUseBgAcqRows bg={bg} side="commercial" />
        ) : sep ? (
          <SeparateAcqPartRows
            kind="commercial"
            breakdown={breakdown}
            estimatedFormula={
              perPartConversion ? (
                <PerPartConversionFormula
                  side="commercial" saleSplit={perPartConversion}
                  landStdAtAcq={c.landStdPriceAtAcq} buildingStdAtAcq={c.buildingStdPriceAtAcq}
                />
              ) : (
                <FLine>
                  §97: 상가 양도가액 {fmtPlain(a.commercialTransferPrice)} ×{" "}
                  <Frac
                    top={`취득시 상가부분 기준시가 ${fmtPlain(c.acqStandardTotal)}`}
                    bottom={`양도시 상가부분 기준시가 ${fmtPlain(a.commercialStandardPrice)}`}
                  />
                </FLine>
              )
            }
          />
        ) : (
          <Row
            label={sec163_9 && sec163_9.selected !== "converted" ? "취득가액(§163⑨ 합계 비교)" : isActualAcq ? "취득 실거래가(취득가액)" : isDeemedAcq ? `${isGiftAcq ? "증여일" : "상속개시일"} 평가액(취득가액)` : isAppraisalSalesAcq ? "상가 감정·매매사례 취득가액" : "상가 환산취득가액"}
            value={fmt(c.estimatedAcquisitionPrice)}
            formula={(() => {
              if (sec163_9 && sec163_9.selected !== "converted") return mixedSec163_9PartFormula(sec163_9, "commercial", c.estimatedAcquisitionPrice);
              if (isDeemedAcq && c.inheritedAcquisitionDetail) {
                const d = c.inheritedAcquisitionDetail;
                const base =
                  d.selected === "reported"
                    ? `상속개시일 신고가액 ${fmtPlain(d.reportedValue)}`
                    : `상속개시일 보충적평가액(상증법 §60~66) ${fmtPlain(d.standardPriceCandidate)}`;
                return `${base} — 취득당시 실지거래가액으로 의제 (소령 §163⑨)`;
              }
              if (perPartConversion) {
                return (
                  <PerPartConversionFormula
                    side="commercial" saleSplit={perPartConversion}
                    landStdAtAcq={c.landStdPriceAtAcq} buildingStdAtAcq={c.buildingStdPriceAtAcq}
                  />
                );
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
            bg
              ? "(양도가액 - 취득가액 - 필요경비) — 토지/건물 분리 후 합산, 부분별 채무비율 적용 후 값"
              : sep
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
            bg
              ? mixedBgPartGainFormula(bg, "commercialLand")
              : sep
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
            bg
              ? mixedBgPartGainFormula(bg, "commercialBuilding")
              : sep
              ? separatePartGainFormula(sep, "commercialBuilding", c.buildingTransferPrice, c.buildingAcqPrice, c.buildingAppraisalDed, c.buildingStdPriceAtAcq)
              : isDeemedAcq
              ? c.buildingAppraisalDed > 0
                ? `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)} - 실제 필요경비 ${fmtPlain(c.buildingAppraisalDed)}`
                : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - 취득가액 ${fmtPlain(c.buildingAcqPrice)}`
              : `양도가액 ${fmtPlain(c.buildingTransferPrice)} - ${nonDeemedAcqTerm} ${fmtPlain(c.buildingAcqPrice)} - 개산공제 ${fmtPlain(c.buildingAppraisalDed)} (취득시 건물 기준시가 ${c.buildingStdPriceAtAcq != null ? fmtPlain(c.buildingStdPriceAtAcq) + " " : ""}× 3%)`
          }
        />
        {breakdown.buildingExtras && <MixedBuildingExtrasNote extras={breakdown.buildingExtras} />}
        <DivRow />
        {!bgCommercialOn ? (
          bg && <MixedBgNotTransferred side="commercial" />
        ) : c.deemedHouseBy154_3Main && h.laterLandExemptExcluded ? (
          // #2141 — 주택으로 본 상가 부분도 나중에 취득한 토지분은 보유요건 미달로 과세(건물분은 비과세). 장특은 보유 미달로 0.
          <Row
            label="주택으로 봄 → 건물분 비과세 · 나중에 취득한 토지분 과세"
            value={fmt(c.incomeAmount)}
            highlight
            formula={`주택 연면적이 주택 외 연면적보다 커 건물 전부를 주택으로 봅니다(소득세법 시행령 §154③ 본문). 토지는 주택보다 나중에 취득해 보유요건(같은 영 §154①)에 못 미치므로 상가 토지분 양도차익 ${fmtPlain(c.landTransferGain)}${
              nb ? "(배율 초과분은 ④ 비사업용토지로 이전)" : ""
            }을 과세합니다 — 세율은 상가 토지 그대로`}
          />
        ) : c.deemedHouseBy154_3Main ? (
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
            {(() => {
              // 토지·건물 보유연수가 달라 공제율이 다르면 대표 율(긴 보유연수 기준) 하나 대신 파트별로 적는다.
              const rates = mixedPartLthdRates(c);
              const yrs = (y: number | undefined) => (y === undefined ? "" : `(보유 ${y}년)`);
              return (
                <Row
                  label={
                    rates
                      ? `장기보유공제 (${mixedPartLthdRateText(rates, fmtPct)})`
                      : `장기보유공제 (표1, ${fmtPct(c.longTermDeductionRate)})`
                  }
                  value={`△ ${fmt(c.longTermDeductionAmount)}`}
                  formula={
                    rates
                      ? `토지분 ${fmtPlain(rates.land.echo.taxableGain)} × ${fmtPct(rates.land.echo.longTermRate)}${yrs(rates.land.echo.holdingYears)} = ${fmtPlain(rates.land.echo.longTermDeduction)}` +
                        ` + 건물분 ${fmtPlain(rates.building.echo.taxableGain)} × ${fmtPct(rates.building.echo.longTermRate)}${yrs(rates.building.echo.holdingYears)} = ${fmtPlain(rates.building.echo.longTermDeduction)}`
                      : "보유연수×2% (최대 30%) — 토지/건물 별 보유연수 적용"
                  }
                />
              );
            })()}
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

      {/* 4. 비사업용토지 (조건부) → `MixedUseNblSection.tsx` (800줄 정책 분리) */}
      {nb && (
        <MixedUseNblSection
          nb={nb}
          landTransferGain={h.landTransferGain}
          nonBusinessTransferRatio={h.nonBusinessTransferRatio}
          open={openSections.nbl}
          onToggle={() => toggleSection("nbl")}
        />
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

/**
 * 결과 PDF — **양도세 섹션**(단건 · 분리취득 · 다자산).
 *
 * `ResultPdfDocument.tsx`에서 분리했다(800줄 정책). 그 파일은 문서 전체의 조립을 맡고,
 * 여기는 양도세 세목 섹션만 맡는다. 방향은 한쪽뿐이다(문서 → 여기).
 */
import { Fragment } from "react";
import { type R, C, s, fmt, fmtRate, num, str, bool } from "./ResultPdfPrimitives";
import { donorBuiltPenaltyView, resultDonorBuiltEchoes } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import {
  View,
  Text,
} from "@react-pdf/renderer";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";
import { assetTaxableGain, sumAssetGains } from "@/components/calc/results/transfer/exempt-gross-gain";
import { nontaxableIncomeLabel } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/display-labels";
import {
  splitAcqBasisFormula,
  splitAcqBasisView,
  splitAcqModeLabel,
  splitCauseLabel,
  splitRateBasisNote,
  splitRateBasisDateText,
  splitRateHoldingLines,
  summarizeSplitGain,
  type SplitGainPartSummary,
} from "@/lib/tax-engine/transfer-tax-split-display";
import { lossOffsetGiverText } from "@/lib/tax-engine/transfer-tax-split-display";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import {
  splitCarryoverAcquisitionText,
  splitCarryoverApportionText,
  splitCarryoverEstimatedExpenseText,
  splitCarryoverNotices,
  splitCarryoverVerdictText,
  splitCarryoverView,
} from "@/lib/tax-engine/transfer-tax-split-carryover-display";

// ─── 세금 유형별 상세 섹션 ────────────────────────────────────────

export function TransferSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  if (bool(r.isExempt)) return null;
  // calculation 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (계산 내역, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("calculation")) return null;
  // Round 11 (2026-05-07): 양도세 신고서 양식 통일 — FilingFormTable과 동일 흐름.
  const transferGain = (num(r.transferGain) ?? 0) as number;
  const ltdAmount = (num(r.longTermHoldingDeduction) ?? 0) as number;
  // 장기임대주택 거주주택 특례(§155⑳·§154⑩)는 신고서 표(`FilingFormTableHelpers`)와 같은 순서다 —
  // 양도차익(전체) − 장특 = §95① 양도소득금액, 엔진 `taxableGain`은 이미 **과세대상 양도소득금액**이라 다시 장특을 빼면 0이 된다(S06-8).
  const rhDetail = r.rentalHousingExceptionDetail as { applied?: boolean; scenarioId?: string } | undefined;
  const isRH = rhDetail?.applied === true;
  const taxableGain = (isRH ? transferGain : (num(r.taxableGain) ?? transferGain)) as number;
  const incomeAmount = isRH ? transferGain - ltdAmount : Math.max(0, taxableGain - ltdAmount);
  const reducibleIncome = (num(r.reducibleIncome) ?? 0) as number;
  const eligible19 = reductionEligibleIncome(
    r.reductionTypeApplied as string | undefined,
    incomeAmount,
    reducibleIncome,
    (r.replacementLandDetail as { eligibleTransferIncome?: number } | undefined)?.eligibleTransferIncome,
    num(r.eligibleIncomeAfterLoss),
  );
  const new993 = r.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
  const new993Reducible = (new993?.isEligible && new993.reducibleTransferIncome) ? new993.reducibleTransferIncome : 0;
  // 「감면후 소득금액」에서 빼는 것은 **§90②(소득금액 차감방식)뿐**이다.
  // §90①(세액감면방식)은 세액을 감면할 뿐 소득금액을 줄이지 않는다
  // — 별지84호 본 서식 ⑧ 과세표준 = ④+⑤−⑥−⑦에서 차감 대상 ⑥은 「소득감면대상 소득금액」이고,
  //   작성방법 6번이 이를 §90② 적용 시로 한정한다.
  // 종전에는 세액감면분(reducibleIncome)까지 빼서 화면(DetailedStatementHelpers)과 어긋났다.
  const incomeAmountAfter = isRH ? ((num(r.taxableGain) ?? 0) as number) : Math.max(0, incomeAmount - new993Reducible);
  // 농특세 총액 echo가 정본 — `new993.ruralSurtax`만 보면 세액감면형(§77 계열)이 빠진다.
  const ruralSurtax = (num(r.ruralSurtax) ?? new993?.ruralSurtax ?? 0) as number;
  /**
   * ㉘ 가산세액 — **두 축의 합**이다(「소득세법」 제92조 제3항 제3호).
   *   · `r.penaltyTax`    : 「소득세법」 제114조의2 환산가액적용가산세
   *   · `r.penaltyDetail` : 「국세기본법」 제47조의2~제47조의4 신고불성실·납부지연
   *
   * 🔴 G-01: 종전에는 §114조의2분만 실어, **같은 PDF의 총 납부세액 카드와 어긋났다**
   * (총액은 엔진 `totalTax`이고 그 안에는 국기법분이 들어 있다 —
   *  `transfer-tax-finalize.ts:502`). 화면 신고서 표는 이미 두 축을 합산한다
   * (`components/calc/results/transfer/FilingFormTableHelpers.ts:657` — 같은 식).
   */
  const penaltyDetailTotal = ((r.penaltyDetail as { totalPenalty?: number } | undefined)
    ?.totalPenalty ?? 0) as number;
  const penaltyTax = ((num(r.penaltyTax) ?? 0) as number) + penaltyDetailTotal;
  const determinedTax = (num(r.determinedTax) ?? 0) as number;
  const totalDeterminedTax = determinedTax + penaltyTax;
  // 단건은 echo 하나, 집계(일반건물·일괄·다건)는 카드별 여러 장 — 카드 라벨을 붙여 각각 그린다
  const donorViews = resultDonorBuiltEchoes(r as Parameters<typeof resultDonorBuiltEchoes>[0]).flatMap(({ label, echo }) => {
    const v = donorBuiltPenaltyView(echo);
    return v ? [{ label, view: v }] : [];
  });
  return (
    <>
      <Text style={s.sectionTitle}>신고서 양식</Text>
      <TransferSplitSection r={r} />
      <View style={s.table}>
        {num(r.transferPrice) !== undefined && (<View style={s.row}><Text style={s.lbl}>양도가액</Text><Text style={s.val}>{fmt(r.transferPrice)}</Text></View>)}
        {num(r.acquisitionPrice) !== undefined && (<View style={s.row}><Text style={s.lbl}>취득가액</Text><Text style={s.val}>{fmt(r.acquisitionPrice)}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>전체 양도차익</Text><Text style={s.val}>{fmt(transferGain)}</Text></View>
        {taxableGain !== transferGain && (<View style={s.row}><Text style={s.lblSub}>과세대상 양도차익</Text><Text style={s.val}>{fmt(taxableGain)}</Text></View>)}
        {num(r.longTermHoldingRate) !== undefined && (<View style={s.row}><Text style={s.lbl}>장기보유특별공제 ({fmtRate(r.longTermHoldingRate)})</Text><Text style={s.val}>{ltdAmount > 0 ? `- ${fmt(ltdAmount)}` : "해당없음"}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>양도소득금액</Text><Text style={s.val}>{fmt(incomeAmount)}</Text></View>
        {num(r.nontaxableGainAmount) !== undefined && (r.nontaxableGainAmount as number) > 0 && (<View style={s.row}><Text style={s.lblSub}>{nontaxableIncomeLabel(rhDetail?.scenarioId)}</Text><Text style={s.val}>- {fmt(r.nontaxableGainAmount)}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>세액감면대상금액</Text><Text style={s.val}>{eligible19 > 0 ? fmt(eligible19) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>소득금액 감면대상</Text><Text style={s.val}>{new993Reducible > 0 ? fmt(new993Reducible) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>감면후 소득금액</Text><Text style={s.val}>{fmt(incomeAmountAfter)}</Text></View>
        {num(r.basicDeduction) !== undefined && (<View style={s.row}><Text style={s.lbl}>기본공제</Text><Text style={s.val}>{(r.basicDeduction as number) > 0 ? `- ${fmt(r.basicDeduction)}` : "0"}</Text></View>)}
        {num(r.taxBase) !== undefined && (<View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>)}
        {num(r.calculatedTax) !== undefined && (<View style={s.row}><Text style={s.lbl}>산출세액 ({fmtRate(r.appliedRate)}{num(r.surchargeRate) ? ` + 중과 ${fmtRate(r.surchargeRate)}` : ""})</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>)}
        {num(r.reductionAmount) !== undefined && (r.reductionAmount as number) > 0 && (<View style={s.row}><Text style={s.lbl}>감면세액 ({str(r.reductionType) ?? ""})</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(determinedTax)}</Text></View>
        {penaltyTax > 0 && (<View style={s.row}><Text style={s.lbl}>가산세액</Text><Text style={s.val}>{fmt(penaltyTax)}</Text></View>)}
        {/* 이월과세 × 증여자 신축·증축 §114조의2 — 가산세 근거·고지(화면과 같은 문장 정본). 입력이 없으면 아무것도 그리지 않는다. */}
        {donorViews.map(({ label, view }, k) => (
          <Fragment key={`dbv${k}`}>
            {view.formulaLines.map((line, i) => (<View key={`db${k}-${i}`} style={s.row}><Text style={s.lblSub}>{label ? `[${label}] ${line}` : line}</Text></View>))}
            <View style={s.row}><Text style={s.lblSub}>{label ? `[${label}] ${view.notice}` : view.notice}</Text></View>
          </Fragment>
        ))}
        <View style={s.rowBg}><Text style={s.lbl}>총결정세액</Text><Text style={s.valAccent}>{fmt(totalDeterminedTax)}</Text></View>
        {ruralSurtax > 0 && (<View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(ruralSurtax)}</Text></View>)}
        {num(r.localIncomeTax) !== undefined && (<View style={s.rowLast}><Text style={s.lbl}>지방소득세 산출세액 (10%)</Text><Text style={s.val}>{fmt(r.localIncomeTax)}</Text></View>)}
      </View>
    </>
  );
}

export function TransferSplitSection({ r }: { r: R }) {
  const sd = r.splitDetail as R | undefined;
  const phd = r.preHousingDisclosureDetail as R | undefined;
  if (!sd) return null;
  const land = sd.land as R;
  const bldg = sd.building as R;
  const nb = sd.nonBusinessLandPart as { excessArea: number; gain: number; taxableGainAfterProration?: number; longTermDeduction: number } | undefined;
  /**
   * 파트별 산정방식·취득가액·필요경비는 화면(카드·신고서·명세서)과 **같은 정본**(`summarizeSplitGain`)을 읽는다.
   * 종전에는 취득가액 행을 「환산취득가」로 못 박고 개산공제만 보여, 실거래가 파트·감정가액 파트·§97②2호 단서(swap) 파트가
   * 화면과 다르게 적혔다. 구 이력(파트 `acqMode` echo 부재)은 종전 표를 그대로 쓴다.
   * 소유 판정(`partOf` — `summary.parts`는 `selfOwns`로 거른 소유 파트)은 구 이력에도 건다 — 종전에는 `modern`일 때만 걸려
   * 구 이력의 타인 소유 파트 값이 표지 없이 찍혔다(계획서 `split-owner-nonowned-part-display.plan.md`).
   */
  const summary = summarizeSplitGain(sd as unknown as SplitGainResult);
  const modern = summary.parts.length > 0 && summary.parts.every((p) => p.mode !== undefined);
  const partOf = (key: "land" | "building"): SplitGainPartSummary | undefined => summary.parts.find((p) => p.key === key);
  const cell = (key: "land" | "building", pick: (p: SplitGainPartSummary) => string) => {
    const p = partOf(key);
    return p ? pick(p) : "-"; // 소유자 분리의 비소유 파트(타인 소유)는 값을 싣지 않는다
  };
  const ownerNote = (key: "land" | "building") => (partOf(key) ? "" : " (타인 소유)");
  const swapParts = summary.parts.filter((p) => p.swapApplied);
  const carryover = splitCarryoverView(sd as unknown as SplitGainResult);
  return (
    <>
      <Text style={s.sectionTitle}>토지/건물 분리 내역 (§164⑤·§166⑥)</Text>
      {phd && (
        <View style={s.table}>
          <View style={s.row}><Text style={s.lbl}>취득시 기준시가 합계 Sum_A</Text><Text style={s.val}>{fmt(phd.sumAtAcquisition)}</Text></View>
          <View style={s.row}><Text style={s.lbl}>최초공시일 기준시가 합계 Sum_F</Text><Text style={s.val}>{fmt(phd.sumAtFirstDisclosure)}</Text></View>
          <View style={s.rowBg}><Text style={s.lbl}>추정 취득시 주택가격 P_A_est</Text><Text style={s.valAccent}>{fmt(phd.estimatedHousingPriceAtAcquisition)}</Text></View>
          <View style={s.row}><Text style={s.lbl}>총 환산취득가</Text><Text style={s.val}>{fmt(phd.totalEstimatedAcquisitionPrice)}</Text></View>
        </View>
      )}
      <View style={s.table}>
        <View style={[s.row, { backgroundColor: "#f3f4f6" }]}>
          <Text style={{ ...s.lbl, flex: 2 }}> </Text>
          <Text style={{ ...s.val, flex: 1, textAlign: "center" }}>토지{ownerNote("land")}</Text>
          <Text style={{ ...s.val, flex: 1, textAlign: "center" }}>건물{ownerNote("building")}</Text>
        </View>
        {modern && (
          <View style={s.row}>
            <Text style={{ ...s.lbl, flex: 2 }}>취득 방식</Text>
            <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => splitAcqModeLabel(p.mode!))}</Text>
            <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => splitAcqModeLabel(p.mode!))}</Text>
          </View>
        )}
        {/* D1-3 — 토지·건물 취득원인이 다를 때만(엔진 `mixedCause`) 원인·세율 기산일 행(화면 카드와 같은 문구). */}
        {modern && summary.mixedCause && (
          <>
            <View style={s.row}>
              <Text style={{ ...s.lbl, flex: 2 }}>취득 원인</Text>
              <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => splitCauseLabel(p.acquisitionCause!))}</Text>
              <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => splitCauseLabel(p.acquisitionCause!))}</Text>
            </View>
            {/* 세율 기산일은 엔진이 파트별 기산일로 세율을 판정했을 때만(`rateBasisShown`). */}
            {summary.rateBasisShown && (
              <View style={s.row}>
                <Text style={{ ...s.lbl, flex: 2 }}>세율 기산일 (소득세법 §104②)</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => splitRateBasisDateText(p))}</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => splitRateBasisDateText(p))}</Text>
              </View>
            )}
            {summary.rateBasisShown && summary.parts.map((p) => {
              const note = splitRateBasisNote(p, partOf("building")?.acquisitionCause);
              return note ? (
                <View key={p.key} style={s.row}>
                  <Text style={{ ...s.lbl, flex: 4 }}>{`${p.label} 세율 기산일: ${note}`}</Text>
                </View>
              ) : null;
            })}
          </>
        )}
        {/* 구주택 멸실·신축 통산(해석 (5)) — 토지 세율 보유기간의 두 구간·합산 개월·환산 기산일(화면 카드와 같은 문구). `mixedCause`와 무관. */}
        {summary.parts.some((p) => p.rateHoldingAggregation) && (
          <>
            <View style={s.row}>
              <Text style={{ ...s.lbl, flex: 4 }}>토지 세율 보유기간 — 구주택 멸실·신축 통산 (서면법규과-1222 · 사전-2023-법규재산-0097)</Text>
            </View>
            {splitRateHoldingLines(sd as unknown as SplitGainResult).map((line, i) => (
              <View key={i} style={s.row}>
                <Text style={{ ...s.lbl, flex: 4 }}>{line}</Text>
              </View>
            ))}
          </>
        )}
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>양도가액</Text>
          <Text style={{ ...s.val, flex: 1 }}>{modern ? cell("land", (p) => fmt(p.transferPrice)) : partOf("land") ? fmt(land.transferPrice) : "-"}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{modern ? cell("building", (p) => fmt(p.transferPrice)) : partOf("building") ? fmt(bldg.transferPrice) : "-"}</Text>
        </View>
        {modern ? (
          <>
            {/* 취득가액 — 엔진이 **차감한** 값이다(§97②2호 단서 swap 파트는 0). */}
            <View style={s.row}>
              <Text style={{ ...s.lbl, flex: 2 }}>취득가액</Text>
              <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => fmt(p.acquisitionDeducted))}</Text>
              <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => fmt(p.acquisitionDeducted))}</Text>
            </View>
            {/* D1-4·D2-4 — 영 §163⑨ 단서 1호(토지)·2호(건물) 비교가 적용된 파트: 화면 카드와 같은 문장. */}
            {summary.parts.map((p) => {
              const basis = splitAcqBasisView(p);
              return basis ? (
                <View key={`basis-${p.key}`} style={s.row}>
                  <Text style={{ ...s.lblSub, flex: 1 }}>{`${splitAcqBasisFormula(basis)} — ${basis.legalBasis}`}</Text>
                </View>
              ) : null;
            })}
            {summary.parts.some((p) => p.directExpenses > 0) && (
              <View style={s.row}>
                <Text style={{ ...s.lbl, flex: 2 }}>자본적지출·양도비 (필요경비)</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => (p.directExpenses > 0 ? fmt(p.directExpenses) : "-"))}</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => (p.directExpenses > 0 ? fmt(p.directExpenses) : "-"))}</Text>
              </View>
            )}
            {summary.parts.some((p) => p.appraisalDeduction > 0) && (
              <View style={s.row}>
                <Text style={{ ...s.lbl, flex: 2 }}>개산공제 (필요경비, §163⑥)</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("land", (p) => (p.appraisalDeduction > 0 ? fmt(p.appraisalDeduction) : "-"))}</Text>
                <Text style={{ ...s.val, flex: 1 }}>{cell("building", (p) => (p.appraisalDeduction > 0 ? fmt(p.appraisalDeduction) : "-"))}</Text>
              </View>
            )}
            {swapParts.map((p) => (
              <View key={p.key} style={s.row}>
                <Text style={{ ...s.lblSub, flex: 1 }}>
                  {p.label}: 「소득세법」 §97②2호 단서 — 환산취득가액 {fmt(p.acquisitionPrice)}을 차감하지 않고 자본적지출·양도비를 필요경비로 적용
                </Text>
              </View>
            ))}
            {/* 파트 이월과세(§97의2①) — 파트별 판정·기산일·취득가액 분해·증여세 상당액 안분·②3호 비교 (화면 카드·상세명세서·신고서와 같은 view). */}
            {carryover?.parts.map((p) => (
              <View key={`co-${p.key}`} style={s.row}>
                <Text style={{ ...s.lblSub, flex: 1 }}>
                  {`${splitCarryoverVerdictText(p)} — ${splitCarryoverAcquisitionText(p)}${splitCarryoverEstimatedExpenseText(p) ? ` — ${splitCarryoverEstimatedExpenseText(p)}` : ""} — ${splitCarryoverApportionText(carryover, p)}`}
                </Text>
              </View>
            ))}
            {carryover && splitCarryoverNotices(carryover).map((n, i) => (
              <View key={`co-note-${i}`} style={s.row}>
                <Text style={{ ...s.lblSub, flex: 1 }}>{`확인 필요 — ${n}`}</Text>
              </View>
            ))}
          </>
        ) : (
          <>
            <View style={s.row}>
              <Text style={{ ...s.lbl, flex: 2 }}>환산취득가</Text>
              <Text style={{ ...s.val, flex: 1 }}>{partOf("land") ? fmt(land.acquisitionPrice) : "-"}</Text>
              <Text style={{ ...s.val, flex: 1 }}>{partOf("building") ? fmt(bldg.acquisitionPrice) : "-"}</Text>
            </View>
            {(partOf("land") && (num(land.appraisalDeduction) ?? 0) > 0) || (partOf("building") && (num(bldg.appraisalDeduction) ?? 0) > 0) ? (
              <View style={s.row}>
                <Text style={{ ...s.lbl, flex: 2 }}>개산공제 (필요경비, §163⑥)</Text>
                <Text style={{ ...s.val, flex: 1 }}>{partOf("land") && num(land.appraisalDeduction) ? fmt(land.appraisalDeduction) : "-"}</Text>
                <Text style={{ ...s.val, flex: 1 }}>{partOf("building") && num(bldg.appraisalDeduction) ? fmt(bldg.appraisalDeduction) : "-"}</Text>
              </View>
            ) : null}
          </>
        )}
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>양도차익</Text>
          <Text style={{ ...s.val, flex: 1 }}>{modern ? cell("land", (p) => fmt(p.gain)) : partOf("land") ? fmt(land.gain) : "-"}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{modern ? cell("building", (p) => fmt(p.gain)) : partOf("building") ? fmt(bldg.gain) : "-"}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>보유연수</Text>
          <Text style={{ ...s.val, flex: 1 }}>{partOf("land") ? `${num(land.holdingYears)}년` : "-"}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{partOf("building") ? `${num(bldg.holdingYears)}년` : "-"}</Text>
        </View>
        <View style={nb ? s.row : s.rowLast}>
          <Text style={{ ...s.lbl, flex: 2 }}>장기보유특별공제</Text>
          <Text style={{ ...s.val, flex: 1 }}>{partOf("land") ? fmt(land.longTermDeduction) : "-"}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{partOf("building") ? fmt(bldg.longTermDeduction) : "-"}</Text>
        </View>
        {/* 배율 초과 부수토지(비사업용 토지) 파트(#17) — 위 토지 열은 기준면적 이내분이라 이 두 행을 더해야 자산 값과 맞는다(화면 분리 카드와 같은 echo). */}
        {nb && (
          <>
            <View style={s.row}>
              <Text style={{ ...s.lbl, flex: 2 }}>{`배율 초과 부수토지 ${nb.excessArea}㎡ (비사업용 토지) 과세 양도차익`}</Text>
              <Text style={{ ...s.val, flex: 2 }}>{fmt(nb.taxableGainAfterProration ?? nb.gain)}</Text>
            </View>
            <View style={s.rowLast}>
              <Text style={{ ...s.lbl, flex: 2 }}>배율 초과 부수토지 장기보유특별공제 (표1)</Text>
              <Text style={{ ...s.val, flex: 2 }}>{fmt(nb.longTermDeduction)}</Text>
            </View>
          </>
        )}
      </View>
    </>
  );
}

export function TransferMultiSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  // form-table(1차 소유)·summary(회귀호환 별칭) 대표 노드 — 둘 다 미포함일 때만 null (단일 렌더, 중복 없음)
  if (
    selectedSectionIds !== undefined &&
    !selectedSectionIds.includes("summary") &&
    !selectedSectionIds.includes("form-table")
  )
    return null;
  const props = Array.isArray(r.properties) ? (r.properties as R[]) : [];
  const lossTable = Array.isArray(r.lossOffsetTable) ? (r.lossOffsetTable as R[]) : [];
  const comparedTax = str(r.comparedTaxApplied) ?? "none";

  // Round 11 (2026-05-07): 다건 모드 신고서 양식 통일 — 자산별 §99의3 reducible · 농특세 합산
  let aggReducibleIncome = 0;
  let aggNew993Reducible = 0;
  let aggRuralSurtax = 0;
  for (const p of props) {
    // D-13 — 자산별로 화면과 같은 헬퍼를 태운 뒤 합산한다(§77 계열은 「양도소득금액 전액」 분기)
    aggReducibleIncome += reductionEligibleIncome(
      p.reductionType as string | undefined,
      (num(p.income) ?? 0) as number,
      (num(p.reducibleIncome) ?? 0) as number,
      (p.replacementLandDetail as { eligibleTransferIncome?: number } | undefined)?.eligibleTransferIncome,
      num(p.eligibleIncomeAfterLoss),
    );
    const np = p.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
    if (np?.isEligible) {
      aggNew993Reducible += np.reducibleTransferIncome ?? 0;
      aggRuralSurtax += np.ruralSurtax ?? 0;
    }
  }
  // G2-6 — 부분 비과세(고가주택·§155⑳)가 있으면 `totalTransferGain`은 안분 전 값이라 정본 leaf 합으로 3행을 낸다(요약 카드와 같은 규칙).
  const aggGains = sumAssetGains(
    props.map((p) => ({
      isExempt: bool(p.isExempt),
      exemptGrossGain: num(p.exemptGrossGain) as number | undefined,
      transferGain: (num(p.transferGain) ?? 0) as number,
      income: (num(p.income) ?? 0) as number,
      longTermHoldingDeduction: (num(p.longTermHoldingDeduction) ?? 0) as number,
    })),
  );
  const totalIncomeAfterOffset = (num(r.totalIncomeAfterOffset) ?? 0) as number;
  // D-14 — 세액감면분(aggReducibleIncome)은 소득금액에서 빼지 않는다(위 단건과 같은 근거)
  const incomeAmountAfter = Math.max(0, totalIncomeAfterOffset - aggNew993Reducible);
  const determinedTax = (num(r.determinedTax) ?? 0) as number;
  const penaltyTax = (num(r.penaltyTax) ?? 0) as number;
  const totalDeterminedTax = determinedTax + penaltyTax;

  return (
    <>
      <Text style={s.sectionTitle}>합산 신고서 양식</Text>
      <View style={s.table}>
        {aggGains.exempt > 0 ? (
          <>
            <View style={s.row}><Text style={s.lbl}>총 양도차익</Text><Text style={s.val}>{fmt(aggGains.gross)}</Text></View>
            <View style={s.row}><Text style={s.lblSub}>비과세 양도차익</Text><Text style={s.val}>- {fmt(aggGains.exempt)}</Text></View>
            <View style={s.row}><Text style={s.lblSub}>과세대상 양도차익</Text><Text style={s.val}>{fmt(aggGains.taxable)}</Text></View>
          </>
        ) : (
          <View style={s.row}><Text style={s.lbl}>총 양도차익</Text><Text style={s.val}>{fmt(r.totalTransferGain)}</Text></View>
        )}
        {num(r.totalLongTermHoldingDeduction) !== undefined && (r.totalLongTermHoldingDeduction as number) > 0 && (<View style={s.row}><Text style={s.lbl}>장기보유특별공제</Text><Text style={s.val}>- {fmt(r.totalLongTermHoldingDeduction)}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>통산 후 양도소득금액</Text><Text style={s.val}>{fmt(totalIncomeAfterOffset)}</Text></View>
        {(num(r.unusedLoss) ?? 0) > 0 && (<View style={s.row}><Text style={s.lblSub}>소멸 차손 (이월 불인정)</Text><Text style={s.val}>- {fmt(r.unusedLoss)}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>세액감면대상금액</Text><Text style={s.val}>{aggReducibleIncome > 0 ? fmt(aggReducibleIncome) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>소득금액 감면대상</Text><Text style={s.val}>{aggNew993Reducible > 0 ? fmt(aggNew993Reducible) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>감면후 소득금액</Text><Text style={s.val}>{fmt(incomeAmountAfter)}</Text></View>
        <View style={s.row}><Text style={s.lbl}>기본공제 (§103)</Text><Text style={s.val}>- {fmt(r.basicDeduction)}</Text></View>
        <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        {comparedTax !== "none" && (<><View style={s.row}><Text style={s.lblSub}>방법 A — 전체 누진</Text><Text style={s.val}>{fmt(r.calculatedTaxByGeneral)}</Text></View><View style={s.row}><Text style={s.lblSub}>방법 B — 세율군별 (§104의2)</Text><Text style={s.val}>{fmt(r.calculatedTaxByGroups)}</Text></View></>)}
        <View style={s.row}><Text style={s.lbl}>산출세액{comparedTax !== "none" ? ` (${comparedTax === "groups" ? "방법 B" : "방법 A"} 적용)` : ""}</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>
        {(num(r.reductionAmount) ?? 0) > 0 && (<View style={s.row}><Text style={s.lbl}>감면세액 합계</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(determinedTax)}</Text></View>
        {penaltyTax > 0 && (<View style={s.row}><Text style={s.lbl}>가산세액</Text><Text style={s.val}>{fmt(penaltyTax)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>총결정세액</Text><Text style={s.valAccent}>{fmt(totalDeterminedTax)}</Text></View>
        {aggRuralSurtax > 0 && (<View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(aggRuralSurtax)}</Text></View>)}
        <View style={s.rowLast}><Text style={s.lbl}>지방소득세 산출세액 (10%)</Text><Text style={s.val}>{fmt(r.localIncomeTax)}</Text></View>
      </View>

      {lossTable.length > 0 && (
        <>
          <Text style={s.sectionTitle}>양도차손 통산 내역 (§102②)</Text>
          <View style={s.table}>
            {lossTable.map((row, i) => (
              <View key={i} style={i === lossTable.length - 1 ? s.rowLast : s.row}>
                <Text style={s.lbl}>
                  [{lossOffsetGiverText(str(row.fromPropertyId) ?? "", str(row.fromPart) as Parameters<typeof lossOffsetGiverText>[1])}] → [{str(row.toPropertyId) ?? ""}]{" "}
                  ({str(row.scope) === "same_group" ? "동일그룹" : "타군안분"})
                </Text>
                <Text style={s.val}>- {fmt(row.amount)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {props.length > 0 && (
        <>
          <Text style={s.sectionTitle}>자산별 신고서 양식</Text>
          {props.map((p, idx) => {
            const np = p.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
            const propIncome = (num(p.income) ?? 0) as number;
            /**
             * 고가주택 안분 후 과세대상 양도차익 (OH-62 형제) — `transferGain`은 안분 전 전체 차익이고
             * `income`은 안분 후 차익 − 장특공제다. 이 행이 없으면 「전체 양도차익 − 장특공제 ≠
             * 양도소득금액」이 된다. 역산은 화면 아코디언·신고서 어댑터와 같은 leaf다(#019).
             */
            const propTransferGain = (num(p.transferGain) ?? 0) as number;
            const propTaxableGain = assetTaxableGain({
              isExempt: bool(p.isExempt),
              exemptGrossGain: num(p.exemptGrossGain) as number | undefined,
              transferGain: propTransferGain,
              income: propIncome,
              longTermHoldingDeduction: (num(p.longTermHoldingDeduction) ?? 0) as number,
            });
            const propReducibleIncome = reductionEligibleIncome(
              p.reductionType as string | undefined,
              propIncome,
              (num(p.reducibleIncome) ?? 0) as number,
              (p.replacementLandDetail as { eligibleTransferIncome?: number } | undefined)?.eligibleTransferIncome,
              num(p.eligibleIncomeAfterLoss),
            );
            const propNew993Reducible = (np?.isEligible && np.reducibleTransferIncome) ? np.reducibleTransferIncome : 0;
            // 영 §163⑨ 단서 1호·2호 채택값 각주 — 화면 합산 신고서(`FilingFormTableAggregateHelpers` acqNotes)와 같은 leaf·문구(#11).
            const propSplit = p.splitDetail as SplitGainResult | undefined;
            const propAcqBasisNotes = propSplit
              ? summarizeSplitGain(propSplit).parts.flatMap((part) => {
                  const basis = splitAcqBasisView(part);
                  return basis && !part.swapApplied ? [`${splitAcqBasisFormula(basis)} (${basis.legalBasis})`] : [];
                })
              : [];
            // D-14 — 세액감면분은 소득금액에서 빼지 않는다(§90①은 세액만 감면)
            const propIncomeAfter = Math.max(0, propIncome - propNew993Reducible);
            return (
              <View key={idx} style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 3 }}>{str(p.propertyLabel) ?? `자산 ${idx + 1}`}{bool(p.isExempt) ? "  [비과세]" : ""}</Text>
                {bool(p.isExempt) ? (
                  <Text style={{ fontSize: 8, color: C.muted, paddingLeft: 8 }}>{str(p.exemptReason) ?? "비과세 대상"}</Text>
                ) : (
                  <View style={s.table}>
                    {num(p.transferPrice) !== undefined && (<View style={s.row}><Text style={s.lbl}>양도가액</Text><Text style={s.val}>{fmt(p.transferPrice)}</Text></View>)}
                    {num(p.acquisitionPrice) !== undefined && (<View style={s.row}><Text style={s.lbl}>취득가액</Text><Text style={s.val}>{fmt(p.acquisitionPrice)}</Text></View>)}
                    {propAcqBasisNotes.map((note, ni) => (<Text key={ni} style={{ fontSize: 7, color: C.muted, paddingLeft: 8, marginBottom: 2 }}>※ {note}</Text>))}
                    {/* 필요경비 — 엔진 자산별 표시 echo(`PerPropertyBreakdown.necessaryExpense`, 양도가액 − 취득가액 − 양도차익과 같은 축).
                        종전엔 빠져 이 표가 「양도가액 − 취득가액 ≠ 양도차익」이었다(2026-10-11 #9). */}
                    {num(p.necessaryExpense) !== undefined && (<View style={s.row}><Text style={s.lbl}>필요경비</Text><Text style={s.val}>{fmt(p.necessaryExpense)}</Text></View>)}
                    <View style={s.row}><Text style={s.lbl}>전체 양도차익</Text><Text style={s.val}>{fmt(p.transferGain)}</Text></View>
                    {propTaxableGain !== propTransferGain && (<View style={s.row}><Text style={s.lblSub}>과세대상 양도차익</Text><Text style={s.val}>{fmt(propTaxableGain)}</Text></View>)}
                    {(num(p.longTermHoldingDeduction) ?? 0) > 0 && (<View style={s.row}><Text style={s.lbl}>장기보유특별공제</Text><Text style={s.val}>- {fmt(p.longTermHoldingDeduction)}</Text></View>)}
                    <View style={s.row}><Text style={s.lbl}>양도소득금액</Text><Text style={s.val}>{fmt(propIncome)}</Text></View>
                    {(num(p.lossOffsetFromSameGroup) ?? 0) > 0 && (<View style={s.row}><Text style={s.lblSub}>차손 통산 (동일그룹, §102②)</Text><Text style={s.val}>- {fmt(p.lossOffsetFromSameGroup)}</Text></View>)}
                    {(num(p.lossOffsetFromOtherGroup) ?? 0) > 0 && (<View style={s.row}><Text style={s.lblSub}>차손 통산 (타군안분, 시행령 §167의2)</Text><Text style={s.val}>- {fmt(p.lossOffsetFromOtherGroup)}</Text></View>)}
                    <View style={s.row}><Text style={s.lbl}>세액감면대상금액</Text><Text style={s.val}>{propReducibleIncome > 0 ? fmt(propReducibleIncome) : "0"}</Text></View>
                    <View style={s.row}><Text style={s.lbl}>소득금액 감면대상</Text><Text style={s.val}>{propNew993Reducible > 0 ? fmt(propNew993Reducible) : "0"}</Text></View>
                    <View style={s.row}><Text style={s.lbl}>감면후 소득금액</Text><Text style={s.val}>{fmt(propIncomeAfter)}</Text></View>
                    <View style={s.rowBg}><Text style={s.lbl}>과세표준 기여분</Text><Text style={s.valAccent}>{fmt(p.taxBaseShare)}</Text></View>
                    {num(p.calculatedTax) !== undefined && (<View style={s.row}><Text style={s.lblSub}>산출세액 기여분 (참고)</Text><Text style={s.val}>{fmt(p.calculatedTax)}</Text></View>)}
                    {num(p.determinedTax) !== undefined && (<View style={s.row}><Text style={s.lblSub}>결정세액 기여분 (참고)</Text><Text style={s.val}>{fmt(p.determinedTax)}</Text></View>)}
                    {(np?.ruralSurtax ?? 0) > 0 && (<View style={s.rowLast}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(np?.ruralSurtax)}</Text></View>)}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
    </>
  );
}

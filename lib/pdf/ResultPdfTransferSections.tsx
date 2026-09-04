/**
 * 결과 PDF — **양도세 섹션**(단건 · 분리취득 · 다자산).
 *
 * `ResultPdfDocument.tsx`에서 분리했다(800줄 정책). 그 파일은 문서 전체의 조립을 맡고,
 * 여기는 양도세 세목 섹션만 맡는다. 방향은 한쪽뿐이다(문서 → 여기).
 */
import { type R, C, s, fmt, fmtRate, num, str, bool } from "./ResultPdfPrimitives";
import {
  View,
  Text,
} from "@react-pdf/renderer";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";

// ─── 세금 유형별 상세 섹션 ────────────────────────────────────────

export function TransferSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  if (bool(r.isExempt)) return null;
  // calculation 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (계산 내역, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("calculation")) return null;
  // Round 11 (2026-05-07): 양도세 신고서 양식 통일 — FilingFormTable과 동일 흐름.
  const transferGain = (num(r.transferGain) ?? 0) as number;
  const ltdAmount = (num(r.longTermHoldingDeduction) ?? 0) as number;
  const taxableGain = (num(r.taxableGain) ?? transferGain) as number;
  const incomeAmount = Math.max(0, taxableGain - ltdAmount);
  const reducibleIncome = (num(r.reducibleIncome) ?? 0) as number;
  const eligible19 = reductionEligibleIncome(
    r.reductionTypeApplied as string | undefined,
    incomeAmount,
    reducibleIncome,
    (r.replacementLandDetail as { eligibleTransferIncome?: number } | undefined)?.eligibleTransferIncome,
  );
  const new993 = r.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
  const new993Reducible = (new993?.isEligible && new993.reducibleTransferIncome) ? new993.reducibleTransferIncome : 0;
  // 「감면후 소득금액」에서 빼는 것은 **§90②(소득금액 차감방식)뿐**이다.
  // §90①(세액감면방식)은 세액을 감면할 뿐 소득금액을 줄이지 않는다
  // — 별지84호 본 서식 ⑧ 과세표준 = ④+⑤−⑥−⑦에서 차감 대상 ⑥은 「소득감면대상 소득금액」이고,
  //   작성방법 6번이 이를 §90② 적용 시로 한정한다.
  // 종전에는 세액감면분(reducibleIncome)까지 빼서 화면(DetailedStatementHelpers)과 어긋났다.
  const incomeAmountAfter = Math.max(0, incomeAmount - new993Reducible);
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
        {num(r.nontaxableGainAmount) !== undefined && (r.nontaxableGainAmount as number) > 0 && (<View style={s.row}><Text style={s.lblSub}>비과세 양도소득금액 (소령 §161①)</Text><Text style={s.val}>- {fmt(r.nontaxableGainAmount)}</Text></View>)}
        <View style={s.row}><Text style={s.lbl}>세액감면대상금액</Text><Text style={s.val}>{eligible19 > 0 ? fmt(eligible19) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>소득금액 감면대상</Text><Text style={s.val}>{new993Reducible > 0 ? fmt(new993Reducible) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>감면후 소득금액</Text><Text style={s.val}>{fmt(incomeAmountAfter)}</Text></View>
        {num(r.basicDeduction) !== undefined && (<View style={s.row}><Text style={s.lbl}>기본공제</Text><Text style={s.val}>{(r.basicDeduction as number) > 0 ? `- ${fmt(r.basicDeduction)}` : "0"}</Text></View>)}
        {num(r.taxBase) !== undefined && (<View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>)}
        {num(r.calculatedTax) !== undefined && (<View style={s.row}><Text style={s.lbl}>산출세액 ({fmtRate(r.appliedRate)}{num(r.surchargeRate) ? ` + 중과 ${fmtRate(r.surchargeRate)}` : ""})</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>)}
        {num(r.reductionAmount) !== undefined && (r.reductionAmount as number) > 0 && (<View style={s.row}><Text style={s.lbl}>감면세액 ({str(r.reductionType) ?? ""})</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(determinedTax)}</Text></View>
        {penaltyTax > 0 && (<View style={s.row}><Text style={s.lbl}>가산세액</Text><Text style={s.val}>{fmt(penaltyTax)}</Text></View>)}
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
          <Text style={{ ...s.val, flex: 1, textAlign: "center" }}>토지</Text>
          <Text style={{ ...s.val, flex: 1, textAlign: "center" }}>건물</Text>
        </View>
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>양도가액</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(land.transferPrice)}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(bldg.transferPrice)}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>환산취득가</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(land.acquisitionPrice)}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(bldg.acquisitionPrice)}</Text>
        </View>
        {(num(land.appraisalDeduction) ?? 0) > 0 || (num(bldg.appraisalDeduction) ?? 0) > 0 ? (
          <View style={s.row}>
            <Text style={{ ...s.lbl, flex: 2 }}>개산공제 (필요경비, §163⑥)</Text>
            <Text style={{ ...s.val, flex: 1 }}>{num(land.appraisalDeduction) ? fmt(land.appraisalDeduction) : "-"}</Text>
            <Text style={{ ...s.val, flex: 1 }}>{num(bldg.appraisalDeduction) ? fmt(bldg.appraisalDeduction) : "-"}</Text>
          </View>
        ) : null}
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>양도차익</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(land.gain)}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(bldg.gain)}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ ...s.lbl, flex: 2 }}>보유연수</Text>
          <Text style={{ ...s.val, flex: 1 }}>{num(land.holdingYears)}년</Text>
          <Text style={{ ...s.val, flex: 1 }}>{num(bldg.holdingYears)}년</Text>
        </View>
        <View style={s.rowLast}>
          <Text style={{ ...s.lbl, flex: 2 }}>장기보유특별공제</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(land.longTermDeduction)}</Text>
          <Text style={{ ...s.val, flex: 1 }}>{fmt(bldg.longTermDeduction)}</Text>
        </View>
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
    );
    const np = p.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
    if (np?.isEligible) {
      aggNew993Reducible += np.reducibleTransferIncome ?? 0;
      aggRuralSurtax += np.ruralSurtax ?? 0;
    }
  }
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
        <View style={s.row}><Text style={s.lbl}>총 양도차익</Text><Text style={s.val}>{fmt(r.totalTransferGain)}</Text></View>
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
                  [{str(row.fromPropertyId) ?? ""}] → [{str(row.toPropertyId) ?? ""}]{" "}
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
            const propReducibleIncome = reductionEligibleIncome(
              p.reductionType as string | undefined,
              propIncome,
              (num(p.reducibleIncome) ?? 0) as number,
              (p.replacementLandDetail as { eligibleTransferIncome?: number } | undefined)?.eligibleTransferIncome,
            );
            const propNew993Reducible = (np?.isEligible && np.reducibleTransferIncome) ? np.reducibleTransferIncome : 0;
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
                    <View style={s.row}><Text style={s.lbl}>전체 양도차익</Text><Text style={s.val}>{fmt(p.transferGain)}</Text></View>
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

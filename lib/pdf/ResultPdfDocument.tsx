/**
 * 세금 계산 결과 PDF 문서 컴포넌트
 * 6개 세금 유형(양도·상속·증여·취득·재산·종부세) 전용 섹션 + 입력 조건 요약 지원
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { InheritanceHeirAllocationSection } from "@/lib/pdf/sections/inheritance-heir-allocation-section";
import { InheritanceSelectedBesshiPages } from "@/lib/pdf/inheritance-besshi-pages";
import { GiftSelectedBesshiPages } from "@/lib/pdf/gift-besshi-pages";
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─── 공통 타입 ──────────────────────────────────────────────────
interface CalcStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis?: string;
}

// result_data를 Record로 받아 각 세금 유형에 맞게 필드 접근
type R = Record<string, unknown>;

export interface ResultPdfProps {
  taxType: string;       // "transfer" | "acquisition" | "inheritance" | "gift" | "property" | "comprehensive_property"
  taxTypeLabel: string;
  createdAt: string;
  resultData: R;
  inputData?: R;
  /**
   * 선택 출력(상속세, PR-2). 지정 시 해당 leaf id만 PDF에 포함.
   * undefined(GET 하위호환)면 전체 렌더.
   * 현재 매핑: "tax-summary"→계산 내역 표, "heir-allocation-summary"→상속인별 집계.
   */
  selectedSectionIds?: string[];
}

// ─── 색상·스타일 ──────────────────────────────────────────────────
const C = {
  primary: "#1e293b",
  accent: "#2563eb",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f8fafc",
  success: "#059669",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 9,
    color: C.primary,
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 42,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    borderBottomStyle: "solid",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  appName: { fontSize: 11, fontWeight: 700, color: C.accent },
  headerDate: { fontSize: 8, color: C.muted },
  headerTitle: { fontSize: 18, fontWeight: 800, color: C.primary, marginTop: 4 },
  badge: {
    marginTop: 5,
    backgroundColor: C.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 8, fontWeight: 700, color: "#ffffff" },
  // 총 납부 카드
  totalCard: {
    backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 6, padding: 14, marginBottom: 12,
  },
  totalCardExempt: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1, borderColor: "#6ee7b7", borderStyle: "solid",
    borderRadius: 6, padding: 14, marginBottom: 12, alignItems: "center",
  },
  totalLabel: { fontSize: 8, color: C.muted, marginBottom: 4 },
  totalAmount: { fontSize: 22, fontWeight: 800, color: C.primary },
  totalSub: { flexDirection: "row", marginTop: 5 },
  totalSubText: { fontSize: 8, color: C.muted, marginRight: 12 },
  exemptTitle: { fontSize: 13, fontWeight: 700, color: "#047857", marginBottom: 4 },
  exemptSub: { fontSize: 8, color: "#065f46" },
  // 섹션 제목
  sectionTitle: { fontSize: 9, fontWeight: 700, color: C.primary, marginBottom: 5, marginTop: 10 },
  // 범용 테이블
  table: {
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 4, overflow: "hidden", marginBottom: 6,
  },
  row: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
  },
  rowLast: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5 },
  rowBg: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: C.bg,
  },
  lbl: { flex: 1, fontSize: 9, color: C.primary },
  lblSub: { flex: 1, fontSize: 8, color: C.muted, paddingLeft: 10 },
  val: { fontSize: 9, fontWeight: 700, color: C.primary },
  valAccent: { fontSize: 9, fontWeight: 700, color: C.accent },
  // 계산 단계
  stepsTable: {
    borderWidth: 1, borderColor: C.border, borderStyle: "solid",
    borderRadius: 4, overflow: "hidden",
  },
  stepRow: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border,
    borderBottomStyle: "solid", paddingHorizontal: 10, paddingVertical: 5,
  },
  stepRowLast: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5 },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 8, fontWeight: 700 },
  stepFormula: { fontSize: 7, color: C.muted, marginTop: 1 },
  stepLegal: { fontSize: 7, color: "#94a3b8", marginTop: 1 },
  stepAmount: { fontSize: 8, fontWeight: 700 },
  // 입력 조건
  inputGrid: { flexDirection: "row", flexWrap: "wrap" },
  inputItem: { width: "50%", paddingVertical: 3, paddingHorizontal: 2 },
  inputKey: { fontSize: 7, color: C.muted },
  inputVal: { fontSize: 8, fontWeight: 700, color: C.primary, marginTop: 1 },
  // 면책
  disclaimer: {
    marginTop: 18, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: C.border, borderTopStyle: "solid",
  },
  disclaimerText: { fontSize: 7, color: "#94a3b8", lineHeight: 1.5 },
  pageNumber: {
    position: "absolute", bottom: 24, left: 0, right: 0,
    textAlign: "center", fontSize: 7, color: "#94a3b8",
  },
});

// ─── 헬퍼 ────────────────────────────────────────────────────────
function fmt(v: unknown): string {
  if (typeof v === "number") return v.toLocaleString("ko-KR");
  return "-";
}
function fmtRate(v: unknown): string {
  if (typeof v === "number") return `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return "-";
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function bool(v: unknown): boolean {
  return v === true;
}

// 세금 유형별 총 납부세액 필드 매핑
function getTotalTax(taxType: string, r: R): number | undefined {
  if (taxType === "transfer" || taxType === "transfer_multi") return num(r.totalTax);
  if (taxType === "acquisition") return num(r.totalTaxAfterReduction) ?? num(r.totalTax);
  if (taxType === "inheritance" || taxType === "gift") return num(r.finalTax) ?? num(r.totalTax);
  if (taxType === "property") return num(r.totalPayable) ?? num(r.totalTax);
  if (taxType === "comprehensive_property") return num(r.grandTotal) ?? num(r.totalTax);
  return num(r.totalTax);
}

// ─── 세금 유형별 상세 섹션 ────────────────────────────────────────

function TransferSection({ r }: { r: R }) {
  if (bool(r.isExempt)) return null;
  // Round 11 (2026-05-07): 양도세 신고서 양식 통일 — FilingFormTable과 동일 흐름.
  const transferGain = (num(r.transferGain) ?? 0) as number;
  const ltdAmount = (num(r.longTermHoldingDeduction) ?? 0) as number;
  const taxableGain = (num(r.taxableGain) ?? transferGain) as number;
  const incomeAmount = Math.max(0, taxableGain - ltdAmount);
  const reducibleIncome = (num(r.reducibleIncome) ?? 0) as number;
  const new993 = r.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
  const new993Reducible = (new993?.isEligible && new993.reducibleTransferIncome) ? new993.reducibleTransferIncome : 0;
  const incomeAmountAfter = Math.max(0, incomeAmount - reducibleIncome - new993Reducible);
  const ruralSurtax = new993?.ruralSurtax ?? 0;
  const penaltyTax = (num(r.penaltyTax) ?? 0) as number;
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
        <View style={s.row}><Text style={s.lbl}>세액감면대상금액</Text><Text style={s.val}>{reducibleIncome > 0 ? fmt(reducibleIncome) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>소득금액 감면대상</Text><Text style={s.val}>{new993Reducible > 0 ? fmt(new993Reducible) : "0"}</Text></View>
        <View style={s.row}><Text style={s.lbl}>감면후 소득금액</Text><Text style={s.val}>{fmt(incomeAmountAfter)}</Text></View>
        {num(r.basicDeduction) !== undefined && (<View style={s.row}><Text style={s.lbl}>기본공제</Text><Text style={s.val}>{(r.basicDeduction as number) > 0 ? `- ${fmt(r.basicDeduction)}` : "0"}</Text></View>)}
        {num(r.taxBase) !== undefined && (<View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>)}
        {num(r.calculatedTax) !== undefined && (<View style={s.row}><Text style={s.lbl}>산출세액 ({fmtRate(r.appliedRate)}{num(r.surchargeRate) ? ` + 중과 ${fmtRate(r.surchargeRate)}` : ""})</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>)}
        {num(r.reductionAmount) !== undefined && (r.reductionAmount as number) > 0 && (<View style={s.row}><Text style={s.lbl}>감면세액 ({str(r.reductionType) ?? ""})</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(determinedTax)}</Text></View>
        {penaltyTax > 0 && (<View style={s.row}><Text style={s.lbl}>가산세액</Text><Text style={s.val}>{fmt(penaltyTax)}</Text></View>)}
        <View style={s.rowBg}><Text style={s.lbl}>총결정세액</Text><Text style={s.valAccent}>{fmt(totalDeterminedTax)}</Text></View>
        {ruralSurtax > 0 && (<View style={s.row}><Text style={s.lbl}>농어촌특별세 (§99의3 등)</Text><Text style={s.val}>{fmt(ruralSurtax)}</Text></View>)}
        {num(r.localIncomeTax) !== undefined && (<View style={s.rowLast}><Text style={s.lbl}>지방소득세 산출세액 (10%)</Text><Text style={s.val}>{fmt(r.localIncomeTax)}</Text></View>)}
      </View>
    </>
  );
}

function TransferSplitSection({ r }: { r: R }) {
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

function TransferMultiSection({ r }: { r: R }) {
  const props = Array.isArray(r.properties) ? (r.properties as R[]) : [];
  const lossTable = Array.isArray(r.lossOffsetTable) ? (r.lossOffsetTable as R[]) : [];
  const comparedTax = str(r.comparedTaxApplied) ?? "none";

  // Round 11 (2026-05-07): 다건 모드 신고서 양식 통일 — 자산별 §99의3 reducible · 농특세 합산
  let aggReducibleIncome = 0;
  let aggNew993Reducible = 0;
  let aggRuralSurtax = 0;
  for (const p of props) {
    aggReducibleIncome += (num(p.reducibleIncome) ?? 0) as number;
    const np = p.new993Detail as { isEligible?: boolean; reducibleTransferIncome?: number; ruralSurtax?: number } | undefined;
    if (np?.isEligible) {
      aggNew993Reducible += np.reducibleTransferIncome ?? 0;
      aggRuralSurtax += np.ruralSurtax ?? 0;
    }
  }
  const totalIncomeAfterOffset = (num(r.totalIncomeAfterOffset) ?? 0) as number;
  const incomeAmountAfter = Math.max(0, totalIncomeAfterOffset - aggReducibleIncome - aggNew993Reducible);
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
        {aggRuralSurtax > 0 && (<View style={s.row}><Text style={s.lbl}>농어촌특별세 (§99의3 등)</Text><Text style={s.val}>{fmt(aggRuralSurtax)}</Text></View>)}
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
            const propReducibleIncome = (num(p.reducibleIncome) ?? 0) as number;
            const propNew993Reducible = (np?.isEligible && np.reducibleTransferIncome) ? np.reducibleTransferIncome : 0;
            const propIncomeAfter = Math.max(0, propIncome - propReducibleIncome - propNew993Reducible);
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
                    {(np?.ruralSurtax ?? 0) > 0 && (<View style={s.rowLast}><Text style={s.lbl}>농어촌특별세 (§99의3 등)</Text><Text style={s.val}>{fmt(np?.ruralSurtax)}</Text></View>)}
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

function AcquisitionSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  const isExempt = bool(r.isExempt);
  if (isExempt) return null;
  // tax-detail 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (단일 계산표, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("tax-detail")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {num(r.acquisitionValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>취득가액</Text><Text style={s.val}>{fmt(r.acquisitionValue)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}>
            <Text style={s.lbl}>적용 세율{bool(r.isSurcharged) ? " (중과)" : ""}</Text>
            <Text style={s.val}>{fmtRate(r.appliedRate)}</Text>
          </View>
        )}
        {num(r.acquisitionTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>취득세 본세</Text><Text style={s.val}>{fmt(r.acquisitionTax)}</Text></View>
        )}
        {num(r.ruralSpecialTax) !== undefined && (r.ruralSpecialTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(r.ruralSpecialTax)}</Text></View>
        )}
        {num(r.localEducationTax) !== undefined && (r.localEducationTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>지방교육세</Text><Text style={s.val}>{fmt(r.localEducationTax)}</Text></View>
        )}
        {num(r.totalTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>총 납부세액 (감면 전)</Text><Text style={s.valAccent}>{fmt(r.totalTax)}</Text></View>
        )}
        {num(r.reductionAmount) !== undefined && (r.reductionAmount as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>생애최초 감면</Text><Text style={s.val}>- {fmt(r.reductionAmount)}</Text></View>
        )}
        {num(r.totalTaxAfterReduction) !== undefined && (r.reductionAmount as number) > 0 && (
          <View style={s.rowLast}><Text style={s.lbl}>감면 후 납부세액</Text><Text style={s.val}>{fmt(r.totalTaxAfterReduction)}</Text></View>
        )}
      </View>
      {str(r.filingDeadline) && (
        <Text style={{ fontSize: 8, color: C.muted, marginTop: 3 }}>신고기한: {str(r.filingDeadline)}</Text>
      )}
    </>
  );
}

function InheritanceGiftSection({
  r,
  taxType,
  inputData,
  selectedSectionIds,
}: {
  r: R;
  taxType: string;
  inputData?: R;
  selectedSectionIds?: string[];
}) {
  const isInheritance = taxType === "inheritance";
  // 선택 필터 (상속세 PR-2·증여세 PR-B1). 미지정(전체 GET)이면 항상 렌더.
  // 증여세 pdf 채널은 tax-summary(계산표) 1종 — 별지는 PR-B2에서 승격.
  const filtered = selectedSectionIds !== undefined;
  const showSummary = !filtered || selectedSectionIds!.includes("tax-summary");
  const showHeirAllocation =
    !filtered || selectedSectionIds!.includes("heir-allocation-summary");
  return (
    <>
      {showSummary && (
      <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {isInheritance && num(r.grossEstateValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>상속재산가액</Text><Text style={s.val}>{fmt(r.grossEstateValue)}</Text></View>
        )}
        {!isInheritance && num(r.grossGiftValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>증여재산가액</Text><Text style={s.val}>{fmt(r.grossGiftValue)}</Text></View>
        )}
        {!isInheritance && num(r.aggregatedGiftValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>10년 합산 증여가액</Text><Text style={s.val}>{fmt(r.aggregatedGiftValue)}</Text></View>
        )}
        {isInheritance && num(r.exemptAmount) !== undefined && (r.exemptAmount as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>비과세 차감</Text><Text style={s.val}>- {fmt(r.exemptAmount)}</Text></View>
        )}
        {isInheritance && num(r.taxableEstateValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>상속세 과세가액</Text><Text style={s.val}>{fmt(r.taxableEstateValue)}</Text></View>
        )}
        {num(r.totalDeduction) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>{isInheritance ? "상속공제" : "증여재산공제"}</Text><Text style={s.val}>- {fmt(r.totalDeduction)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.computedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.computedTax)}</Text></View>
        )}
        {num(r.generationSkipSurcharge) !== undefined && (r.generationSkipSurcharge as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>세대생략 할증</Text><Text style={s.val}>+ {fmt(r.generationSkipSurcharge)}</Text></View>
        )}
        {num(r.totalTaxCredit) !== undefined && (r.totalTaxCredit as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>세액공제</Text><Text style={s.val}>- {fmt(r.totalTaxCredit)}</Text></View>
        )}
        {num(r.finalTax) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(r.finalTax)}</Text></View>
        )}
      </View>
      </>
      )}

      {/* Phase D: 상속인별 상속세부담액 집계 표 (이미지 8) — 상속세 한정·heirs 존재 시 */}
      {showHeirAllocation && isInheritance && r.heirAllocationResult && Array.isArray(inputData?.heirs) && (inputData!.heirs as unknown[]).length > 0 && (
        <InheritanceHeirAllocationSection
          result={r as unknown as InheritanceTaxResult}
          heirs={inputData!.heirs as unknown as Heir[]}
        />
      )}
    </>
  );
}

function PropertySection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  // computed-tax 대표 노드 — 선택 필터(POST) 적용 시 미포함이면 null (단일 계산표, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("computed-tax")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역</Text>
      <View style={s.table}>
        {num(r.publishedPrice) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공시가격</Text><Text style={s.val}>{fmt(r.publishedPrice)}</Text></View>
        )}
        {num(r.fairMarketRatio) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공정시장가액비율</Text><Text style={s.val}>{fmtRate(r.fairMarketRatio)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>적용 세율</Text><Text style={s.val}>{fmtRate(r.appliedRate)}</Text></View>
        )}
        {num(r.calculatedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>
        )}
        {num(r.determinedTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>확정세액</Text><Text style={s.valAccent}>{fmt(r.determinedTax)}</Text></View>
        )}
        {num(r.totalSurtax) !== undefined && (r.totalSurtax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>부가세 합계</Text><Text style={s.val}>{fmt(r.totalSurtax)}</Text></View>
        )}
        {num(r.totalPayable) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>총 납부세액</Text><Text style={s.val}>{fmt(r.totalPayable)}</Text></View>
        )}
      </View>
      {bool(r.oneHouseSpecialApplied) && (
        <Text style={{ fontSize: 8, color: C.success, marginTop: 3 }}>1세대1주택 특례 적용됨</Text>
      )}
    </>
  );
}

function ComprehensiveSection({ r, selectedSectionIds }: { r: R; selectedSectionIds?: string[] }) {
  // housing-tax 대표 노드 — 선택 필터 적용 시 미포함이면 null (주택분 계산표만, 토지분 PDF 없음, 검토 U1)
  if (selectedSectionIds !== undefined && !selectedSectionIds.includes("housing-tax")) return null;
  return (
    <>
      <Text style={s.sectionTitle}>계산 내역 (주택분)</Text>
      <View style={s.table}>
        {num(r.includedAssessedValue) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>과세 대상 공시가격 합계</Text><Text style={s.val}>{fmt(r.includedAssessedValue)}</Text></View>
        )}
        {num(r.basicDeduction) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>기본공제</Text><Text style={s.val}>- {fmt(r.basicDeduction)}</Text></View>
        )}
        {num(r.fairMarketRatio) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>공정시장가액비율</Text><Text style={s.val}>{fmtRate(r.fairMarketRatio)}</Text></View>
        )}
        {num(r.taxBase) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>과세표준</Text><Text style={s.valAccent}>{fmt(r.taxBase)}</Text></View>
        )}
        {num(r.appliedRate) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>적용 세율</Text><Text style={s.val}>{fmtRate(r.appliedRate)}</Text></View>
        )}
        {num(r.calculatedTax) !== undefined && (
          <View style={s.row}><Text style={s.lbl}>산출세액</Text><Text style={s.val}>{fmt(r.calculatedTax)}</Text></View>
        )}
        {num(r.determinedHousingTax) !== undefined && (
          <View style={s.rowBg}><Text style={s.lbl}>결정세액</Text><Text style={s.valAccent}>{fmt(r.determinedHousingTax)}</Text></View>
        )}
        {num(r.housingRuralSpecialTax) !== undefined && (r.housingRuralSpecialTax as number) > 0 && (
          <View style={s.row}><Text style={s.lbl}>농어촌특별세</Text><Text style={s.val}>{fmt(r.housingRuralSpecialTax)}</Text></View>
        )}
        {num(r.totalHousingTax) !== undefined && (
          <View style={s.rowLast}><Text style={s.lbl}>주택분 총납부세액</Text><Text style={s.val}>{fmt(r.totalHousingTax)}</Text></View>
        )}
      </View>
      {bool(r.isOneHouseOwner) && (
        <Text style={{ fontSize: 8, color: C.success, marginTop: 3 }}>1세대1주택자 세액공제 적용됨</Text>
      )}
    </>
  );
}

// 입력 조건 요약 — 핵심 키만 표시
const INPUT_FIELD_LABELS: Record<string, Record<string, string>> = {
  transfer: {
    transferPrice: "양도가액",
    acquisitionPrice: "취득가액",
    holdingYears: "보유기간(년)",
    residenceYears: "거주기간(년)",
    propertyType: "자산 유형",
    isAdjustedArea: "조정대상지역",
  },
  acquisition: {
    acquisitionPrice: "취득가액",
    propertyType: "물건 종류",
    acquisitionCause: "취득 원인",
    isFirstHome: "생애최초",
    isAdjustedArea: "조정대상지역",
  },
  inheritance: {
    totalPropertyValue: "상속재산 총액",
    numberOfHeirs: "상속인 수",
    spouseInherits: "배우자 상속",
  },
  gift: {
    propertyValue: "증여재산가액",
    donorRelation: "증여자 관계",
    isGenerationSkip: "세대생략 여부",
  },
  property: {
    officialPrice: "공시가격",
    propertyType: "과세 유형",
    isOneHousehold: "1세대1주택",
  },
  comprehensive_property: {
    officialPrice: "공시가격",
    isOneHouseOwner: "1세대1주택",
    numberOfHouses: "주택 수",
  },
};

function InputSection({ taxType, inputData }: { taxType: string; inputData: R }) {
  const fields = INPUT_FIELD_LABELS[taxType] ?? {};
  const entries = Object.entries(fields)
    .map(([key, label]) => {
      const v = inputData[key];
      if (v === undefined || v === null) return null;
      let display: string;
      if (typeof v === "boolean") display = v ? "예" : "아니오";
      else if (typeof v === "number") display = key.toLowerCase().includes("price") || key.toLowerCase().includes("value") ? fmt(v) : String(v);
      else display = String(v);
      return { label, display };
    })
    .filter(Boolean) as { label: string; display: string }[];

  if (entries.length === 0) return null;

  return (
    <>
      <Text style={s.sectionTitle}>입력 조건 요약</Text>
      <View style={[s.table, { marginBottom: 6 }]}>
        <View style={s.inputGrid}>
          {entries.map(({ label, display }, i) => (
            <View key={i} style={s.inputItem}>
              <Text style={s.inputKey}>{label}</Text>
              <Text style={s.inputVal}>{display}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}

// ─── 메인 PDF 문서 ────────────────────────────────────────────────
export function ResultPdfDocument({
  taxType,
  taxTypeLabel,
  createdAt,
  resultData: r,
  inputData,
  selectedSectionIds,
}: ResultPdfProps) {
  const isExempt = bool(r.isExempt);
  const totalTax = getTotalTax(taxType, r);
  const steps = Array.isArray(r.steps) ? (r.steps as CalcStep[])
    : Array.isArray(r.breakdown) ? (r.breakdown as CalcStep[])
    : [];
  const determinedTax = num(r.determinedTax);
  const localIncomeTax = num(r.localIncomeTax);

  return (
    <Document title={`${taxTypeLabel} 계산 결과`} author="KoreanTaxCalc">
      <Page size="A4" style={s.page}>

        {/* 헤더 */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <Text style={s.appName}>KoreanTaxCalc</Text>
            <Text style={s.headerDate}>{createdAt} 생성</Text>
          </View>
          <Text style={s.headerTitle}>세금 계산 결과서</Text>
          <View style={s.badge}><Text style={s.badgeText}>{taxTypeLabel}</Text></View>
        </View>

        {/* 총 납부세액 카드 */}
        {isExempt ? (
          <View style={s.totalCardExempt}>
            <Text style={s.exemptTitle}>비과세</Text>
            <Text style={s.exemptSub}>{str(r.exemptReason) ?? "납부세액 0"}</Text>
          </View>
        ) : (
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>총 납부세액</Text>
            <Text style={s.totalAmount}>{fmt(totalTax)}</Text>
            {determinedTax !== undefined && localIncomeTax !== undefined && (
              <View style={s.totalSub}>
                <Text style={s.totalSubText}>결정세액 {fmt(determinedTax)}</Text>
                <Text style={s.totalSubText}>지방소득세 {fmt(localIncomeTax)}</Text>
              </View>
            )}
          </View>
        )}

        {/* 입력 조건 요약 */}
        {inputData && <InputSection taxType={taxType} inputData={inputData} />}

        {/* 세금 유형별 상세 섹션 */}
        {taxType === "transfer" && <TransferSection r={r} />}
        {taxType === "transfer_multi" && <TransferMultiSection r={r} />}
        {taxType === "acquisition" && <AcquisitionSection r={r} selectedSectionIds={selectedSectionIds} />}
        {(taxType === "inheritance" || taxType === "gift") && <InheritanceGiftSection r={r} taxType={taxType} inputData={inputData} selectedSectionIds={selectedSectionIds} />}
        {taxType === "property" && <PropertySection r={r} selectedSectionIds={selectedSectionIds} />}
        {taxType === "comprehensive_property" && <ComprehensiveSection r={r} selectedSectionIds={selectedSectionIds} />}

        {/* 계산 단계 */}
        {steps.length > 0 && (
          <>
            <Text style={s.sectionTitle}>계산 단계</Text>
            <View style={s.stepsTable}>
              {steps.map((step, i) => (
                <View key={i} style={i === steps.length - 1 ? s.stepRowLast : s.stepRow}>
                  <View style={s.stepInfo}>
                    <Text style={s.stepLabel}>{step.label}</Text>
                    <Text style={s.stepFormula}>{step.formula}</Text>
                    {step.legalBasis && <Text style={s.stepLegal}>{step.legalBasis}</Text>}
                  </View>
                  <Text style={s.stepAmount}>{fmt(step.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 면책 고지 */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            ※ 이 계산서는 참고용이며 법적 효력이 없습니다. 실제 납부세액은 과세관청 신고 또는 전문 세무사 상담을 통해 확인하시기 바랍니다.
          </Text>
          <Text style={[s.disclaimerText, { marginTop: 2 }]}>
            ※ 세법 개정으로 인해 실제 세액과 다를 수 있습니다. 중요한 의사결정 전 반드시 전문가와 상의하시기 바랍니다.
          </Text>
        </View>

        <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* 상속세 별지 선택 출력 (PR-3a/3b) — filing-form-9·부표2·부표3묶음·상장·비상장 */}
      {taxType === "inheritance" && (
        <InheritanceSelectedBesshiPages
          resultData={r}
          inputData={inputData}
          selectedSectionIds={selectedSectionIds}
        />
      )}

      {/* 증여세 별지 선택 출력 (PR-B2) — 별지10호·부표1·상장·비상장 */}
      {taxType === "gift" && (
        <GiftSelectedBesshiPages
          resultData={r}
          inputData={inputData}
          selectedSectionIds={selectedSectionIds}
        />
      )}
    </Document>
  );
}

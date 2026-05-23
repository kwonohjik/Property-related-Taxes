/**
 * 비상장주식 평가서(별지 제4호 부표3) react-pdf Document — 5쪽 PDF 출력
 *
 * HTML 재현(`components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView.tsx`)과
 * 동일한 표 구조·셀 번호·숫자를 PDF로 변환.
 *
 * 페이지 구성 (사례 6 기준 5쪽 — 제3쪽 미사용):
 *   제1쪽: 1.평가대상 + 2.순자산 단독 + 3.1주당 가액 ③~⑨
 *   제2쪽: 4.순자산가액 (자산 ①~⑧ + 부채 ⑨~⑲ + 다·라·마)
 *   제4쪽: 5.평가차액 (조건부 — evaluationDeltaRows 있을 때만)
 *   제5쪽: 6.영업권 (가~자 9행)
 *   제6쪽: 7.순손익액 (3년치)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-pdf-export.plan.md
 * 법령: 상증법 §63 + 상증령 §54·§55·§56·§59 + 상증규 §17·§17의2·§17의3·§19
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
  UnlistedNetAssetCalculation,
  UnlistedGoodwillResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

registerFonts();

// ─────────────────────────────────────────────────────────────────
// 색상·스타일
// ─────────────────────────────────────────────────────────────────

const C = {
  black: "#000000",
  gray100: "#f3f4f6",
  gray50: "#f9fafb",
  yellow50: "#fefce8",
  emerald50: "#ecfdf5",
  rose50: "#fef2f2",
  rose700: "#b91c1c",
  amber50: "#fffbeb",
  amber700: "#b45309",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 9,
    color: C.black,
    padding: 30,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: { fontSize: 8, textAlign: "right", marginBottom: 6 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    borderLeftWidth: 3,
    borderLeftColor: C.black,
    borderLeftStyle: "solid",
    paddingLeft: 5,
    marginTop: 8,
    marginBottom: 4,
  },
  // 표 컬럼 (View flexDirection: row)
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.black,
    borderBottomStyle: "solid",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.gray100,
    borderTopWidth: 0.5,
    borderTopColor: C.black,
    borderTopStyle: "solid",
    borderBottomWidth: 0.5,
    borderBottomColor: C.black,
    borderBottomStyle: "solid",
  },
  cellNum: {
    width: 30,
    padding: 3,
    fontSize: 8,
    textAlign: "center",
    borderRightWidth: 0.5,
    borderRightColor: C.black,
    borderRightStyle: "solid",
  },
  cellLabel: {
    flex: 1,
    padding: 3,
    fontSize: 8,
    borderRightWidth: 0.5,
    borderRightColor: C.black,
    borderRightStyle: "solid",
  },
  cellAmount: {
    width: 100,
    padding: 3,
    fontSize: 8,
    textAlign: "right",
  },
  cellSubtract: {
    width: 80,
    padding: 3,
    fontSize: 8,
    textAlign: "right",
    borderRightWidth: 0.5,
    borderRightColor: C.black,
    borderRightStyle: "solid",
  },
  emphasized: { backgroundColor: C.yellow50, fontWeight: 700 },
  groupRow: { backgroundColor: C.gray50, fontWeight: 700 },
  finalRow: {
    backgroundColor: C.emerald50,
    fontWeight: 700,
    borderTopWidth: 1,
    borderTopColor: C.black,
    borderTopStyle: "solid",
  },
  badge: {
    fontSize: 8,
    backgroundColor: C.rose50,
    borderWidth: 0.5,
    borderColor: "#fecaca",
    borderStyle: "solid",
    padding: 4,
    color: C.rose700,
    marginTop: 4,
  },
  amberFooter: {
    fontSize: 8,
    backgroundColor: C.amber50,
    borderWidth: 0.5,
    borderColor: "#fde68a",
    borderStyle: "solid",
    padding: 4,
    color: C.amber700,
    marginTop: 4,
  },
  metaRow: { flexDirection: "row", marginBottom: 2 },
  metaLabel: { width: 100, fontSize: 8, fontWeight: 700, backgroundColor: C.gray100, padding: 4 },
  metaValue: { flex: 1, fontSize: 8, padding: 4, borderBottomWidth: 0.3, borderBottomColor: C.black, borderBottomStyle: "solid" },
  footer: {
    fontSize: 7,
    textAlign: "center",
    color: "#6b7280",
    marginTop: 12,
  },
});

// ─────────────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function renderDelta(n: number): string {
  return n < 0 ? `△${fmt(Math.abs(n))}` : fmt(n);
}

const NET_ASSET_ONLY_REASON_LABEL: Record<string, string> = {
  liquidation: "1호 — 청산절차 진행",
  lt3y: "2호 — 사업개시 3년 미만·휴·폐업",
  real_estate_80: "3호 — 부동산 80% 이상 (단서)",
  stock_holding_80: "5호 — 주식 80% 이상 (단서)",
  remaining_3y: "6호 — 잔여 존속기한 3년 이내",
};

const EXCLUDED_REASON_LABEL: Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 2호 본문 — 부동산 80% 이상 → 영업권 가산 없음",
  lt3y: "§55③ 2호 단서 — 사업개시 3년 미만·휴·폐업",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};

// ─────────────────────────────────────────────────────────────────
// 제1쪽 — 평가대상 + 1주당 가액
// ─────────────────────────────────────────────────────────────────

function Page1Cover({ input, result }: { input: UnlistedStockValuationInput; result?: UnlistedStockValuationResult }) {
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>비상장주식 등 평가서</Text>
      <Text style={s.subtitle}>평가심의위원회 운영규정 별지 제4호 서식 부표3 (2021.3.4. 개정)</Text>

      <Text style={s.sectionTitle}>1. 평가대상 비상장법인</Text>
      <View style={{ borderWidth: 0.5, borderColor: C.black, borderStyle: "solid" }}>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>법인명</Text>
          <Text style={s.metaValue}>{input.corpName || "-"}</Text>
          <Text style={s.metaLabel}>대표자</Text>
          <Text style={s.metaValue}>{input.representative || "-"}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>① 발행주식총수</Text>
          <Text style={s.metaValue}>{fmt(input.totalShares)}주</Text>
          <Text style={s.metaLabel}>1주당 액면가</Text>
          <Text style={s.metaValue}>{fmt(input.faceValuePerShare)}원</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>평가기준일</Text>
          <Text style={s.metaValue}>{input.evaluationDate.toISOString().slice(0, 10)}</Text>
          <Text style={s.metaLabel}>② 부동산과다보유</Text>
          <Text style={s.metaValue}>{input.isRealEstateHeavy ? "예 (가중치 반전)" : "아니오"}</Text>
        </View>
      </View>

      {input.netAssetOnlyReason && (
        <>
          <Text style={s.sectionTitle}>2. 순자산가치로만 평가 [v] (상증령 §54④)</Text>
          <Text style={s.badge}>선택 사유: {NET_ASSET_ONLY_REASON_LABEL[input.netAssetOnlyReason] || "-"}</Text>
        </>
      )}

      {result && (
        <>
          <Text style={s.sectionTitle}>3. 1주당 가액의 평가</Text>
          <View>
            <ResultRow cellNum="③" label="순자산가액" value={result.netAssetTotal} />
            <ResultRow cellNum="④" label="1주당 순자산가액 (③ ÷ 발행주식총수)" value={result.netAssetPerShare} />
            <ResultRow cellNum="⑤" label="1주당 순손익가치 (최근 3년 가중평균 ÷ 환원율)" value={result.netIncomePerShare} />
            <ResultRow cellNum="⑥-㉠" label="가중평균 [(④ × 2 + ⑤ × 3) ÷ 5]" value={result.weightedAvgPerShare} />
            <ResultRow cellNum="⑥-㉡" label="순자산가액 × 80% (하한)" value={result.netAssetFloor80} />
            <ResultRow cellNum="⑥" label="1주당 평가액 (㉠과 ㉡ 중 큰 금액)" value={result.finalPerShareValue} emphasized />
            {result.premiumRate > 0 ? (
              <ResultRow
                cellNum="⑧"
                label={`최대주주 할증평가 (⑥ × ${((1 + result.premiumRate) * 100).toFixed(0)}%)`}
                value={result.premiumPerShare}
              />
            ) : (
              <ResultRow cellNum="⑦" label="비최대주주 1주당 평가액" value={result.perShareValueNonMaxShareholder} />
            )}
            <ResultRow cellNum="⑨" label="보충적 평가가액" value={result.finalPerShareForReporting} emphasized />
            <ResultRow
              cellNum="총"
              label={`상속재산가액 (⑨ × 보유주식수 ${fmt(input.ownedShares)}주)`}
              value={result.totalValuation}
              emphasized
            />
          </View>
        </>
      )}
    </Page>
  );
}

function ResultRow({ cellNum, label, value, emphasized }: { cellNum: string; label: string; value: number; emphasized?: boolean }) {
  return (
    <View style={[s.tableRow, emphasized ? s.emphasized : {}]}>
      <Text style={s.cellNum}>{cellNum}</Text>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellAmount}>{fmt(value)}원</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제2쪽 — 4. 순자산가액
// ─────────────────────────────────────────────────────────────────

function Page2NetAsset({
  raw,
  netAssetTotal,
  goodwillFinal,
}: {
  raw: UnlistedNetAssetCalculation;
  netAssetTotal: number;
  goodwillFinal: number;
}) {
  const assetSubtotal =
    raw.bsTotalAssets + raw.assetValuationDelta + raw.corpTaxReservedAmount +
    raw.paidInCapitalIncrease + raw.otherEarnedRights - raw.prepaidExpenses - raw.preGiftRetainedEarnings;

  const liabilitySubtotal =
    raw.bsTotalLiabilities + raw.corporateTaxPayable + raw.farmingSurtax + raw.localIncomeTax +
    raw.dividendPayable + raw.retirementProvision - raw.otherProvision - raw.reserveExcluded -
    raw.allowanceExcluded - raw.deferredTaxAdjustment;

  const preGoodwill = assetSubtotal - liabilitySubtotal;

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>4. 순자산가액 (별지 제2쪽)</Text>

      {/* 가. 자산총액 */}
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={{ ...s.cellLabel, flex: 0, width: "100%", padding: 3 }}>가. 자산총액</Text>
      </View>
      <NetAssetRow cellNum="①" label="재무상태표상의 자산가액" amount={raw.bsTotalAssets} />
      <NetAssetRow cellNum="②" label="평가차액 → 제4쪽 5.가.② 기재" amount={raw.assetValuationDelta} />
      <NetAssetRow cellNum="③" label="법인세법상 유보금액" amount={raw.corpTaxReservedAmount} />
      <NetAssetRow cellNum="④" label="유상증자 등" amount={raw.paidInCapitalIncrease} />
      <NetAssetRow cellNum="⑤" label="평가기준일 현재 지급받을 권리 확정 가액" amount={raw.otherEarnedRights} />
      <NetAssetRow cellNum="⑥" label="선급비용 등" amount={raw.prepaidExpenses} isSubtract />
      <NetAssetRow cellNum="⑦" label="증자일 전의 잉여금의 유보액" amount={raw.preGiftRetainedEarnings} isSubtract />
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.cellNum}>⑧</Text>
        <Text style={s.cellLabel}>소계 (①+②+③+④+⑤−⑥−⑦)</Text>
        <Text style={s.cellAmount}>{fmt(assetSubtotal)}</Text>
      </View>

      {/* 나. 부채총액 */}
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={{ ...s.cellLabel, flex: 0, width: "100%", padding: 3 }}>나. 부채총액</Text>
      </View>
      <NetAssetRow cellNum="⑨" label="재무상태표상의 부채액" amount={raw.bsTotalLiabilities} />
      <NetAssetRow cellNum="⑩" label="법인세" amount={raw.corporateTaxPayable} />
      <NetAssetRow cellNum="⑪" label="농어촌특별세" amount={raw.farmingSurtax} />
      <NetAssetRow cellNum="⑫" label="지방소득세" amount={raw.localIncomeTax} />
      <NetAssetRow cellNum="⑬" label="배당금·상여금" amount={raw.dividendPayable} />
      <NetAssetRow cellNum="⑭" label="퇴직급여추계액" amount={raw.retirementProvision} />
      <NetAssetRow cellNum="⑮" label="기타충당금" amount={raw.otherProvision} isSubtract />
      <NetAssetRow cellNum="⑯" label="제준비금" amount={raw.reserveExcluded} isSubtract />
      <NetAssetRow cellNum="⑰" label="제충당금" amount={raw.allowanceExcluded} isSubtract />
      <NetAssetRow cellNum="⑱" label="기타(이연법인세대 등)" amount={raw.deferredTaxAdjustment} isSubtract />
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.cellNum}>⑲</Text>
        <Text style={s.cellLabel}>소계 (⑨+⑩+⑪+⑫+⑬+⑭−⑮−⑯−⑰−⑱)</Text>
        <Text style={s.cellAmount}>{fmt(liabilitySubtotal)}</Text>
      </View>

      {/* 다·라·마 */}
      <View style={[s.tableRow, { borderTopWidth: 1, borderTopColor: C.black, borderTopStyle: "solid" }]}>
        <Text style={s.cellNum}>다</Text>
        <Text style={s.cellLabel}>영업권 포함 전 순자산가액 (⑧ − ⑲)</Text>
        <Text style={s.cellAmount}>{fmt(preGoodwill)}</Text>
      </View>
      <View style={s.tableRow}>
        <Text style={s.cellNum}>라</Text>
        <Text style={s.cellLabel}>영업권 ← 제5쪽 6.자.영업권 평가액</Text>
        <Text style={s.cellAmount}>{fmt(goodwillFinal)}</Text>
      </View>
      <View style={[s.tableRow, s.finalRow]}>
        <Text style={s.cellNum}>마</Text>
        <Text style={s.cellLabel}>순자산가액 (다 + 라)</Text>
        <Text style={s.cellAmount}>{fmt(netAssetTotal)}</Text>
      </View>
    </Page>
  );
}

function NetAssetRow({
  cellNum,
  label,
  amount,
  isSubtract,
}: {
  cellNum: string;
  label: string;
  amount: number;
  isSubtract?: boolean;
}) {
  return (
    <View style={s.tableRow}>
      <Text style={s.cellNum}>{cellNum}</Text>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellSubtract}>{isSubtract ? fmt(amount) : ""}</Text>
      <Text style={s.cellAmount}>{!isSubtract ? fmt(amount) : ""}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제4쪽 — 5. 평가차액 (조건부)
// ─────────────────────────────────────────────────────────────────

function Page4ValuationDelta({ raw }: { raw: UnlistedNetAssetCalculation }) {
  const rows = raw.evaluationDeltaRows ?? [];
  if (rows.length === 0) return null;

  const assetRows = rows.filter((r) => r.category === "asset");
  const liabilityRows = rows.filter((r) => r.category === "liability");
  const assetTotal = assetRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0);
  const liabilityTotal = liabilityRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0);

  const dCellNum = { ...s.cellNum, width: 50 };
  const dCellLabel = { ...s.cellLabel, flex: 2 };
  const dCellAmount = { ...s.cellAmount, width: 80 };

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>5. 평가차액 (별지 제4쪽 — 자산·부채 계정과목별)</Text>
      <View style={s.tableHeader}>
        <Text style={dCellNum}>구분</Text>
        <Text style={dCellLabel}>계정과목</Text>
        <Text style={dCellAmount}>상증법 평가액</Text>
        <Text style={dCellAmount}>재무상태표</Text>
        <Text style={dCellAmount}>차액</Text>
      </View>
      {assetRows.map((row, i) => {
        const delta = row.evaluationAmount - row.bookAmount;
        return (
          <View style={s.tableRow} key={row.rowId}>
            <Text style={dCellNum}>{i === 0 ? "자산" : ""}</Text>
            <Text style={dCellLabel}>{row.accountName}</Text>
            <Text style={dCellAmount}>{fmt(row.evaluationAmount)}</Text>
            <Text style={dCellAmount}>{fmt(row.bookAmount)}</Text>
            <Text style={dCellAmount}>{renderDelta(delta)}</Text>
          </View>
        );
      })}
      {assetRows.length > 0 && (
        <View style={[s.tableRow, s.groupRow]}>
          <Text style={{ ...dCellLabel, flex: 1 }}>① 자산 합계</Text>
          <Text style={dCellAmount}>{fmt(assetTotal)}</Text>
        </View>
      )}
      {liabilityRows.map((row, i) => {
        const delta = row.evaluationAmount - row.bookAmount;
        return (
          <View style={s.tableRow} key={row.rowId}>
            <Text style={dCellNum}>{i === 0 ? "부채" : ""}</Text>
            <Text style={dCellLabel}>{row.accountName}</Text>
            <Text style={dCellAmount}>{fmt(row.evaluationAmount)}</Text>
            <Text style={dCellAmount}>{fmt(row.bookAmount)}</Text>
            <Text style={dCellAmount}>{renderDelta(delta)}</Text>
          </View>
        );
      })}
      {liabilityRows.length > 0 && (
        <View style={[s.tableRow, s.groupRow]}>
          <Text style={{ ...dCellLabel, flex: 1 }}>② 부채 합계</Text>
          <Text style={dCellAmount}>{fmt(liabilityTotal)}</Text>
        </View>
      )}
      <View style={[s.tableRow, s.finalRow]}>
        <Text style={{ ...dCellLabel, flex: 1 }}>가. 평가차액 (① − ②) → 제2쪽 4.가.② 기재</Text>
        <Text style={dCellAmount}>{renderDelta(assetTotal - liabilityTotal)}</Text>
      </View>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제5쪽 — 6. 영업권
// ─────────────────────────────────────────────────────────────────

function Page5Goodwill({
  goodwill,
  fyb,
}: {
  goodwill: UnlistedGoodwillResult;
  fyb: [FiscalYearBreakdown, FiscalYearBreakdown, FiscalYearBreakdown];
}) {
  const naMinusMa = goodwill.weightedAvgHalf - goodwill.selfCapitalRate;
  const showZeroAnomalyFooter = naMinusMa > 0 && goodwill.goodwillFinal === 0 && !goodwill.excludedByLaw;

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>6. 영업권 (별지 제5쪽)</Text>
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.cellNum}>가</Text>
        <Text style={s.cellLabel}>평가기준일 이전 3년간 순손익액의 가중평균 (①×3 + ②×2 + ③×1) ÷ 6</Text>
        <Text style={s.cellAmount}>{fmt(goodwill.weightedAvg3y)}</Text>
      </View>
      <SubFiscalRow label="① 1년전 사업연도 (×3)" fy={fyb[0]} />
      <SubFiscalRow label="② 2년전 사업연도 (×2)" fy={fyb[1]} />
      <SubFiscalRow label="③ 3년전 사업연도 (×1)" fy={fyb[2]} />
      <SimpleRow cellNum="나" label="가 × 50%" value={fmt(goodwill.weightedAvgHalf)} />
      <SimpleRow cellNum="다" label="평가기준일 현재 자기자본 (영업권 포함 전 순자산가액)" value={fmt(goodwill.selfCapital)} />
      <SimpleRow cellNum="라" label="기획재정부령 이자율 (상증규 §19①)" value={`${(goodwill.rate * 100).toFixed(0)}%`} />
      <SimpleRow cellNum="마" label="다 × 라" value={fmt(goodwill.selfCapitalRate)} />
      <SimpleRow cellNum="바" label="영업권 지속연수" value={`${goodwill.durationYears}년`} />
      <SimpleRow cellNum="사" label="영업권 계산액 Σⁿ₌₁⁵ (나 − 마) / (1 + 0.1)ⁿ" value={fmt(goodwill.goodwillCalc)} />
      <SimpleRow cellNum="아" label="영업권 상당액 중 매입 무체재산권 감가상각비 공제분" value={fmt(goodwill.intangibleDeduction)} />
      <View style={[s.tableRow, s.finalRow]}>
        <Text style={s.cellNum}>자</Text>
        <Text style={s.cellLabel}>영업권 평가액 (사 − 아) → 제2쪽 4.라 기재</Text>
        <Text style={s.cellAmount}>{fmt(goodwill.goodwillFinal)}</Text>
      </View>

      {goodwill.excludedByLaw && (
        <Text style={s.badge}>⚠ {EXCLUDED_REASON_LABEL[goodwill.excludedByLaw]}</Text>
      )}
      {showZeroAnomalyFooter && (
        <Text style={s.amberFooter}>
          ※ 나(가 × 50%) − 마(다 × 라) = {fmt(naMinusMa)}원 양수이나 5년 PV 산식 적용 후 영업권 평가액이 0으로 산출됨.
        </Text>
      )}
    </Page>
  );
}

function SubFiscalRow({ label, fy }: { label: string; fy: FiscalYearBreakdown }) {
  return (
    <View style={s.tableRow}>
      <Text style={s.cellNum}>{label.slice(0, 1)}</Text>
      <Text style={s.cellLabel}>
        {label.slice(2)} {fy.label}
      </Text>
      <Text style={s.cellAmount}>{renderDelta(fy.finalNetIncome)}</Text>
    </View>
  );
}

function SimpleRow({ cellNum, label, value }: { cellNum: string; label: string; value: string }) {
  return (
    <View style={s.tableRow}>
      <Text style={s.cellNum}>{cellNum}</Text>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellAmount}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제6쪽 — 7. 순손익액 (3년치)
// ─────────────────────────────────────────────────────────────────

function Page6NetIncomeBreakdown({ result }: { result: UnlistedStockValuationResult }) {
  const fyb = result.fiscalYearBreakdowns;
  const fyCol = { width: 90, padding: 3, fontSize: 8, textAlign: "right" as const };
  const labelCol = { flex: 1, padding: 3, fontSize: 8 };

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>7. 순손익액 (3년치 — 별지 제6쪽)</Text>
      <View style={s.tableHeader}>
        <Text style={labelCol}>구분</Text>
        {fyb.map((fy, i) => (
          <Text key={i} style={fyCol}>
            {fy.label} (×{i === 0 ? 3 : i === 1 ? 2 : 1})
          </Text>
        ))}
      </View>
      <FYBreakdownRow label="① 각 사업연도 소득금액" values={fyb.map((fy) => fy.taxableIncome)} />
      <FYBreakdownRow label="가산 합계 (②~⑦)" values={fyb.map((fy) => fy.addTotal)} />
      <FYBreakdownRow label="차감 합계 (⑧~㉒)" values={fyb.map((fy) => fy.subTotal)} />
      <FYBreakdownRow label="다. 순손익액" values={fyb.map((fy) => fy.adjustedNetIncome)} emphasized />
      <FYBreakdownRow label="라. 유상증자·감자 반영액 (§56⑤)" values={fyb.map((fy) => fy.capitalIncreaseAdjustment)} />
      <FYBreakdownRow label="마. 최종 순손익액" values={fyb.map((fy) => fy.finalNetIncome)} emphasized />
      <FYBreakdownRow label="바. 환산주식수" values={fyb.map((fy) => fy.convertedShares)} unit="주" />
      <FYBreakdownRow label="사. 1주당 순손익액" values={fyb.map((fy) => fy.perShareNetIncome)} />
      <Text style={{ fontSize: 8, marginTop: 6 }}>
        <Text style={{ fontWeight: 700 }}>아. 1주당 가중평균 순손익액</Text> = {fmt(result.weightedNetIncomePerShare)}원
      </Text>
      <Text style={{ fontSize: 8, marginTop: 2 }}>
        <Text style={{ fontWeight: 700 }}>자. 환원율</Text> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)
      </Text>
      <Text style={{ fontSize: 8, marginTop: 2 }}>
        <Text style={{ fontWeight: 700 }}>차. 1주당 가액</Text> = 아 ÷ 자 = {fmt(result.netIncomePerShare)}원 (제1쪽 ⑤)
      </Text>

      <Text style={s.footer}>
        ※ 본 양식은 평가심의위원회 운영규정 별지 제4호 서식 부표3을 기준으로 작성되었습니다.{"\n"}
        KoreanLaw MCP 검증: 상증법 §63·시행령 §54·§55·§56·§59 + 시행규칙 §17·§17의2·§17의3·§19
      </Text>
    </Page>
  );
}

function FYBreakdownRow({
  label,
  values,
  emphasized,
  unit = "",
}: {
  label: string;
  values: number[];
  emphasized?: boolean;
  unit?: string;
}) {
  return (
    <View style={[s.tableRow, emphasized ? s.emphasized : {}]}>
      <Text style={{ flex: 1, padding: 3, fontSize: 8 }}>{label}</Text>
      {values.map((v, i) => (
        <Text key={i} style={{ width: 90, padding: 3, fontSize: 8, textAlign: "right" }}>
          {renderDelta(v)}
          {unit}
        </Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 진입점: UnlistedStockBesshiPdfDocument
// ─────────────────────────────────────────────────────────────────

export interface UnlistedStockBesshiPdfDocumentProps {
  input: UnlistedStockValuationInput;
}

export function UnlistedStockBesshiPdfDocument({ input }: UnlistedStockBesshiPdfDocumentProps) {
  let result: UnlistedStockValuationResult | undefined;
  try {
    if (input.totalShares > 0 && input.ownedShares > 0) {
      result = evaluateUnlistedStockV2(input);
    }
  } catch {
    result = undefined;
  }

  const hasEvaluationDeltaRows =
    !!input.netAssetValueRaw.evaluationDeltaRows &&
    input.netAssetValueRaw.evaluationDeltaRows.length > 0;

  return (
    <Document>
      <Page1Cover input={input} result={result} />
      {result && (
        <Page2NetAsset
          raw={input.netAssetValueRaw}
          netAssetTotal={result.netAssetTotal}
          goodwillFinal={result.goodwillCalculation.goodwillFinal}
        />
      )}
      {hasEvaluationDeltaRows && <Page4ValuationDelta raw={input.netAssetValueRaw} />}
      {result && (
        <Page5Goodwill goodwill={result.goodwillCalculation} fyb={result.fiscalYearBreakdowns} />
      )}
      {result && <Page6NetIncomeBreakdown result={result} />}
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────
// 파일명 generator — `비상장주식평가서_{corpName}_{YYYY-MM-DD}.pdf`
// ─────────────────────────────────────────────────────────────────

export function generateBesshiPdfFilename(input: UnlistedStockValuationInput): string {
  const corp = (input.corpName || "법인미입력").replace(/[/\\:*?"<>|]/g, "_");
  const date = input.evaluationDate.toISOString().slice(0, 10);
  return `비상장주식평가서_${corp}_${date}.pdf`;
}

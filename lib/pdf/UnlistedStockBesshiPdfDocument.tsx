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
} from "@react-pdf/renderer";
import { registerFonts } from "./fonts";
import { C, s } from "./besshi-pdf-styles";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import {
  NET_ASSET_REASON_ROWS,
  BESSHI_P1_SECTION3,
  BESSHI_P2_SECTION4,
  BESSHI_P2_ASSET_ROWS,
  BESSHI_P2_LIABILITY_ROWS,
  BESSHI_P4_SECTION5,
  BESSHI_P5_SECTION6,
  BESSHI_P6_SECTION7,
  P6_ADD_ROWS,
  P6_SUB_ROWS,
  sumNetAssetRows,
  resolveCapitalDisplay,
} from "@/components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants";
import { resolveEvaluationDelta } from "@/lib/tax-engine/property-valuation/evaluation-delta";
import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
  UnlistedNetAssetCalculation,
  UnlistedGoodwillResult,
  FiscalYearBreakdown,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

registerFonts();

// 색상·스타일은 ./besshi-pdf-styles 로 추출 (800줄 정책 — Page5 정합 선행 분리)

// ─────────────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function renderDelta(n: number): string {
  return n < 0 ? `△${fmt(Math.abs(n))}` : fmt(n);
}

const EXCLUDED_REASON_LABEL: Record<NonNullable<UnlistedGoodwillResult["excludedByLaw"]>, string> = {
  liquidation: "§55③ 1호 — 청산절차 진행 → 영업권 가산 없음",
  real_estate_80: "§55③ 2호 본문 — 부동산 80% 이상 → 영업권 가산 없음",
  lt3y: "§55③ 2호 단서 — 사업개시 3년 미만·휴·폐업",
  continuous_loss_3y: "§55③ 3호 — 직전 3년 계속 결손 → 영업권 자동 0",
};

// ─────────────────────────────────────────────────────────────────
// 제1쪽 — 평가대상 + 1주당 가액
// ─────────────────────────────────────────────────────────────────

// 제1쪽 1번 6셀 메타 행 스타일 (인라인)
const m6Label = {
  width: 80, fontSize: 8, fontWeight: 700 as const, backgroundColor: C.gray100,
  padding: 4, borderWidth: 0.3, borderColor: C.black, borderStyle: "solid" as const,
};
const m6Value = {
  flex: 1, fontSize: 8, padding: 4,
  borderWidth: 0.3, borderColor: C.black, borderStyle: "solid" as const,
};
// 제1쪽 2번 6행 체크 표 스타일
const reasonCode = { ...s.cellNum, width: 28 };
const reasonCheck = {
  width: 36, padding: 3, fontSize: 8, textAlign: "center" as const,
};

function Page1Cover({ input, result }: { input: UnlistedStockValuationInput; result?: UnlistedStockValuationResult }) {
  const evalDate = toOptionalDate(input.evaluationDate);
  const evalDateStr =
    evalDate instanceof Date && !isNaN(evalDate.getTime()) ? evalDate.toISOString().slice(0, 10) : "-";
  const pct = (result?.premiumRate ?? 0) * 100;
  const capitalDisplay = resolveCapitalDisplay(input.capital, input.faceValuePerShare, input.totalShares);

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>비상장주식 등 평가서</Text>
      <Text style={s.subtitle}>평가심의위원회 운영규정 별지 제4호 서식 부표3 (2025.07.10. 개정)</Text>

      {/* 1. 평가대상 비상장법인 — 3행 6셀 */}
      <Text style={s.sectionTitle}>1. 평가대상 비상장법인</Text>
      <View>
        <View style={{ flexDirection: "row" }}>
          <Text style={m6Label}>법인명</Text>
          <Text style={m6Value}>{input.corpName || "-"}</Text>
          <Text style={m6Label}>사업자등록번호</Text>
          <Text style={m6Value}>{input.businessRegistrationNumber || "-"}</Text>
          <Text style={m6Label}>대표자 성명</Text>
          <Text style={m6Value}>{input.representative || "-"}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={m6Label}>① 발행주식총수</Text>
          <Text style={m6Value}>{fmt(input.totalShares)}주</Text>
          <Text style={m6Label}>1주당 액면가</Text>
          <Text style={m6Value}>{fmt(input.faceValuePerShare)}원</Text>
          <Text style={m6Label}>자본금</Text>
          <Text style={m6Value}>{capitalDisplay ? `${fmt(capitalDisplay)}원` : "-"}</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Text style={m6Label}>평가기준일</Text>
          <Text style={m6Value}>{evalDateStr}</Text>
          <Text style={m6Label}>② 부동산과다보유법인</Text>
          <Text style={{ ...m6Value, flex: 3 }}>{input.isRealEstateHeavy ? "예 (가중치 반전)" : "아니오"}</Text>
        </View>
      </View>

      {/* 2. 순자산가치로만 평가하는 경우 [v] — 6행 상시 표시 */}
      <Text style={s.sectionTitle}>2. 순자산가치로만 평가하는 경우 [v] 표시 (상증령 §54④)</Text>
      <View style={{ borderTopWidth: 0.5, borderTopColor: C.black, borderTopStyle: "solid" }}>
        {NET_ASSET_REASON_ROWS.map((row) => (
          <View
            key={row.code}
            style={[s.tableRow, row.deleted ? { backgroundColor: C.gray50 } : {}]}
          >
            <Text style={reasonCode}>{row.code}</Text>
            <Text style={{ ...s.cellLabel, color: row.deleted ? "#9ca3af" : C.black }}>{row.label}</Text>
            <Text style={reasonCheck}>
              {row.deleted ? "—" : input.netAssetOnlyReason === row.reason ? "[v]" : "[ ]"}
            </Text>
          </View>
        ))}
      </View>

      {result && (
        <>
          <Text style={s.sectionTitle}>3. 1주당 가액의 평가</Text>
          <View>
            <ResultRow cellNum="③" label={BESSHI_P1_SECTION3.netAssetTotal} value={result.netAssetTotal} />
            <ResultRow cellNum="④" label={BESSHI_P1_SECTION3.netAssetPerShare} value={result.netAssetPerShare} />
            <ResultRow cellNum="⑤" label={BESSHI_P1_SECTION3.netIncomeValue} value={result.netIncomePerShare} />
            {/* 공식 순서: ⑥ 헤더(많은 금액) → ㉮(가중평균) → ㉯(80%) */}
            <ResultRow cellNum="⑥" label={BESSHI_P1_SECTION3.finalPerShareHeader} value={result.finalPerShareValue} emphasized />
            <ResultRow
              cellNum="⑥㉮"
              label={
                input.isRealEstateHeavy
                  ? `${BESSHI_P1_SECTION3.weightedAvgNormal} ${BESSHI_P1_SECTION3.weightedAvgRealEstateNote}`
                  : BESSHI_P1_SECTION3.weightedAvgNormal
              }
              value={result.weightedAvgPerShare}
            />
            <ResultRow cellNum="⑥㉯" label={BESSHI_P1_SECTION3.netAssetFloor80} value={result.netAssetFloor80} />
            {/* 공식 순서: ⑦ 헤더 → ㉮(⑥×할증율) → ㉯(⑥+㉮) */}
            {result.premiumRate > 0 ? (
              <>
                <ResultRow cellNum="⑦" label={BESSHI_P1_SECTION3.maxShareholderHeader} value={result.premiumPerShare} emphasized />
                <ResultRow
                  cellNum="⑦㉮"
                  label={BESSHI_P1_SECTION3.premiumSurcharge(pct.toFixed(0))}
                  value={result.premiumPerShare - result.finalPerShareValue}
                />
                <ResultRow cellNum="⑦㉯" label={BESSHI_P1_SECTION3.premiumTotal} value={result.premiumPerShare} emphasized />
              </>
            ) : (
              <ResultRow cellNum="⑦" label={BESSHI_P1_SECTION3.nonMaxShareholder} value={result.perShareValueNonMaxShareholder} />
            )}
            <ResultRow cellNum="⑨" label={BESSHI_P1_SECTION3.reportingValue} value={result.finalPerShareForReporting} emphasized />
            <ResultRow cellNum="총" label={BESSHI_P1_SECTION3.total(fmt(input.ownedShares))} value={result.totalValuation} emphasized />
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
  // 화면·엔진(`net-asset-calc`)과 동일 부호 — ⑮(otherProvision)은 가산 (§17의2 3호 가)
  const assetSubtotal = sumNetAssetRows(BESSHI_P2_ASSET_ROWS, raw);
  const liabilitySubtotal = sumNetAssetRows(BESSHI_P2_LIABILITY_ROWS, raw);
  const preGoodwill = assetSubtotal - liabilitySubtotal;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.p2UnitRow}>
        <Text style={s.p2Unit}>{BESSHI_P2_SECTION4.unitNote}</Text>
        <Text style={s.p2Unit}>{BESSHI_P2_SECTION4.pageNote}</Text>
      </View>
      <Text style={s.sectionTitle}>{BESSHI_P2_SECTION4.header}</Text>

      {/* 가. 자산총액 */}
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={{ ...s.cellLabel, flex: 0, width: "100%", padding: 3 }}>{BESSHI_P2_SECTION4.assetGroup}</Text>
      </View>
      {BESSHI_P2_ASSET_ROWS.map((r) => (
        <P2Row key={r.cellNum} cellNum={r.cellNum} label={r.label} amount={raw[r.field]} refText={r.ref} />
      ))}
      <P2Row cellNum="⑧" label={BESSHI_P2_SECTION4.assetSubtotalFormula} amount={assetSubtotal} variant="emphasized" />

      {/* 나. 부채총액 */}
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={{ ...s.cellLabel, flex: 0, width: "100%", padding: 3 }}>{BESSHI_P2_SECTION4.liabilityGroup}</Text>
      </View>
      {BESSHI_P2_LIABILITY_ROWS.map((r) => (
        <P2Row key={r.cellNum} cellNum={r.cellNum} label={r.label} amount={raw[r.field]} refText={r.ref} />
      ))}
      <P2Row cellNum="⑲" label={BESSHI_P2_SECTION4.liabilitySubtotalFormula} amount={liabilitySubtotal} variant="emphasized" />

      {/* 다·라·마 */}
      <P2Row cellNum="다" label={BESSHI_P2_SECTION4.preGoodwillLabel} amount={preGoodwill} variant="top" />
      <P2Row cellNum="라" label={BESSHI_P2_SECTION4.goodwillLabel} amount={goodwillFinal} refText={BESSHI_P2_SECTION4.goodwillRef} />
      <P2Row cellNum="마" label={BESSHI_P2_SECTION4.netAssetLabel} amount={netAssetTotal} variant="final" />
    </Page>
  );
}

/** 제2쪽 순자산가액 행 — [번호][라벨][값 1열][회색 참조열] 공식 2단 레이아웃 */
function P2Row({
  cellNum,
  label,
  amount,
  refText,
  variant,
}: {
  cellNum: string;
  label: string;
  amount?: number;
  refText?: string;
  variant?: "emphasized" | "final" | "top";
}) {
  const rowStyle =
    variant === "emphasized"
      ? [s.tableRow, s.emphasized]
      : variant === "final"
        ? [s.tableRow, s.finalRow]
        : variant === "top"
          ? [s.tableRow, s.p2TopBorder]
          : s.tableRow;
  return (
    <View style={rowStyle}>
      <Text style={s.cellNum}>{cellNum}</Text>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.p2Value}>{amount === undefined ? "" : fmt(amount)}</Text>
      <Text style={s.p2Ref}>{refText ?? ""}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제4쪽 — 5. 평가차액 (항상 표시 · 공식 좌우 2블록)
// ─────────────────────────────────────────────────────────────────

type P4RowCells = [string, string, string, string];

/** 제4쪽 한 행 — 자산 4열 + 부채 4열 (5번째 셀에 블록 구분선) */
function P4Row({ left, right, variant }: { left: P4RowCells; right: P4RowCells; variant?: "head" | "total" }) {
  const rowStyle =
    variant === "head" ? [s.tableRow, s.groupRow] : variant === "total" ? [s.tableRow, s.emphasized] : s.tableRow;
  return (
    <View style={rowStyle}>
      <Text style={s.p4Name}>{left[0]}</Text>
      <Text style={s.p4Amt}>{left[1]}</Text>
      <Text style={s.p4Amt}>{left[2]}</Text>
      <Text style={s.p4Amt}>{left[3]}</Text>
      <Text style={s.p4NameDiv}>{right[0]}</Text>
      <Text style={s.p4Amt}>{right[1]}</Text>
      <Text style={s.p4Amt}>{right[2]}</Text>
      <Text style={s.p4Amt}>{right[3]}</Text>
    </View>
  );
}

function Page4ValuationDelta({ raw }: { raw: UnlistedNetAssetCalculation }) {
  // ★ 「①·②·가」는 엔진 resolveEvaluationDelta 단일 도출 (raw.assetValuationDelta 직접 사용 금지 — 행 모드 stale)
  const allRows = raw.evaluationDeltaRows ?? [];
  const resolved = resolveEvaluationDelta({
    assetDeltaRows: allRows.filter((r) => r.category === "asset"),
    liabilityDeltaRows: allRows.filter((r) => r.category === "liability"),
    assetEvaluationDeltaTotal: raw.assetValuationDelta,
  });
  const assetRows = resolved.assetRows;
  const liabilityRows = resolved.liabilityRows;
  const isTotalMode = resolved.source === "total";

  const assetEvalSum = assetRows.reduce((sum, r) => sum + r.evaluationAmount, 0);
  const assetBookSum = assetRows.reduce((sum, r) => sum + r.bookAmount, 0);
  const liabEvalSum = liabilityRows.reduce((sum, r) => sum + r.evaluationAmount, 0);
  const liabBookSum = liabilityRows.reduce((sum, r) => sum + r.bookAmount, 0);

  const bodyCount = Math.max(assetRows.length, liabilityRows.length);
  const renderCount = bodyCount > 0 ? bodyCount : BESSHI_P4_SECTION5.emptyTemplateRows;
  const C5 = BESSHI_P4_SECTION5;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.p2UnitRow}>
        <Text style={s.p2Unit}>{C5.unitNote}</Text>
        <Text style={s.p2Unit}>{C5.pageNote}</Text>
      </View>
      <Text style={s.sectionTitle}>{C5.header}</Text>

      {/* 헤더 바 — 가.평가차액 계산 | 제2쪽 cross-ref */}
      <View style={s.p4HeaderBar}>
        <Text style={s.p4HeaderL}>{C5.calcTitle}</Text>
        <Text style={s.p4HeaderR}>{C5.crossRef}</Text>
      </View>

      {/* 블록 헤더 자산금액 | 부채금액 */}
      <View style={s.tableRow}>
        <Text style={s.p4BlockTitle}>{C5.assetBlock}</Text>
        <Text style={[s.p4BlockTitle, { borderLeftWidth: 1.5, borderLeftColor: C.black, borderLeftStyle: "solid" }]}>
          {C5.liabilityBlock}
        </Text>
      </View>

      {/* 컬럼 헤더 ×2 */}
      <P4Row variant="head" left={[...C5.columns]} right={[...C5.columns]} />

      {/* ① 합계 / ② 합계 (맨 위) */}
      <P4Row
        variant="total"
        left={[C5.assetTotalLabel, fmt(assetEvalSum), fmt(assetBookSum), renderDelta(resolved.assetDelta)]}
        right={[C5.liabilityTotalLabel, fmt(liabEvalSum), fmt(liabBookSum), renderDelta(resolved.liabilityDelta)]}
      />

      {/* 데이터 행 (좌우 병치, 짧은 쪽 빈칸 / 데이터 없으면 빈 양식 N행) */}
      {Array.from({ length: renderCount }).map((_, i) => {
        const a = assetRows[i];
        const l = liabilityRows[i];
        return (
          <P4Row
            key={i}
            left={a ? [a.accountName, fmt(a.evaluationAmount), fmt(a.bookAmount), renderDelta(a.delta)] : ["", "", "", ""]}
            right={l ? [l.accountName, fmt(l.evaluationAmount), fmt(l.bookAmount), renderDelta(l.delta)] : ["", "", "", ""]}
          />
        );
      })}

      {/* 가. 평가차액 (① − ②) */}
      <View style={[s.tableRow, s.finalRow]}>
        <Text style={{ ...s.cellLabel, flex: 1 }}>{C5.deltaLabel}</Text>
        <Text style={{ ...s.cellAmount, width: 120 }}>{renderDelta(resolved.evaluationDelta)}</Text>
      </View>
      {isTotalMode && resolved.evaluationDelta !== 0 && (
        <Text style={s.amberFooter}>{C5.totalModeNote}</Text>
      )}

      {/* 작성방법 */}
      <Text style={s.p4GuideTitle}>{C5.guideTitle}</Text>
      <Text style={s.p4GuideBody}>{C5.guideBody}</Text>
      {C5.guideItems.map((item, i) => (
        <Text key={i} style={s.p4GuideItem}>{`${i + 1}. ${item}`}</Text>
      ))}
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
  const P5 = BESSHI_P5_SECTION6;
  const naMinusMa = goodwill.weightedAvgHalf - goodwill.selfCapitalRate;
  const showZeroAnomalyFooter = naMinusMa > 0 && goodwill.goodwillFinal === 0 && !goodwill.excludedByLaw;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.p2UnitRow}>
        <Text style={s.p2Unit}>{P5.unitNote}</Text>
        <Text style={s.p2Unit}>{P5.pageNote}</Text>
      </View>
      <Text style={s.sectionTitle}>{P5.header}</Text>

      <P5Row cellNum="가" labelLines={[P5.weightedAvgLabel]} amount={goodwill.weightedAvg3y} col3={P5.weightedAvgFormula} variant="head" />
      <P5Row cellNum="①" labelLines={[P5.fy1Label, `(${fyb[0].label})`]} amount={fyb[0].finalNetIncome} />
      <P5Row cellNum="②" labelLines={[P5.fy2Label, `(${fyb[1].label})`]} amount={fyb[1].finalNetIncome} />
      <P5Row cellNum="③" labelLines={[P5.fy3Label, `(${fyb[2].label})`]} amount={fyb[2].finalNetIncome} />
      <P5Row cellNum="나" labelLines={[P5.halfLabel]} amount={goodwill.weightedAvgHalf} />
      <P5Row cellNum="다" labelLines={[P5.selfCapitalLabel]} amount={goodwill.selfCapital} />
      {/* 라·바는 금액 아닌 파라미터 → col2 빈칸, 값은 col3 */}
      <P5Row cellNum="라" labelLines={[P5.rateLabel]} col3={P5.ratePct(goodwill.rate)} />
      <P5Row cellNum="마" labelLines={[P5.selfCapitalRateLabel]} amount={goodwill.selfCapitalRate} />
      <P5Row cellNum="바" labelLines={[P5.durationLabel]} col3={P5.durationLabel2(goodwill.durationYears)} />
      <P5Row cellNum="사" labelLines={[P5.goodwillCalcLabel, P5.goodwillCalcFormula, P5.goodwillCalcNote]} amount={goodwill.goodwillCalc} />
      <P5Row cellNum="아" labelLines={[P5.intangibleLabel]} amount={goodwill.intangibleDeduction} />
      <P5Row cellNum="자" labelLines={[P5.finalLabel]} amount={goodwill.goodwillFinal} col3={P5.finalCrossRef} variant="final" />

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

/** 제5쪽 행 — [번호][라벨(다단)][금액 col2][산식·참조·회색 col3]. 라·바는 amount 미지정(col2 빈칸) */
function P5Row({
  cellNum,
  labelLines,
  amount,
  col3,
  variant,
}: {
  cellNum: string;
  labelLines: string[];
  amount?: number;
  col3?: string;
  variant?: "head" | "final";
}) {
  const rowStyle = variant === "head" ? [s.tableRow, s.emphasized] : variant === "final" ? [s.tableRow, s.finalRow] : s.tableRow;
  return (
    <View style={rowStyle}>
      <Text style={s.cellNum}>{cellNum}</Text>
      <View style={s.p5LabelCell}>
        {labelLines.map((ln, i) => (
          <Text key={i} style={i === 0 ? s.p5LabelMain : s.p5LabelSub}>{ln}</Text>
        ))}
      </View>
      <Text style={s.p5Amt}>{amount === undefined ? "" : renderDelta(amount)}</Text>
      <Text style={col3 ? s.p5Col3 : s.p5Col3Gray}>{col3 ?? ""}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// 제6쪽 — 7. 순손익액 (3년치)
// ─────────────────────────────────────────────────────────────────

function Page6NetIncomeBreakdown({ result }: { result: UnlistedStockValuationResult }) {
  const P6 = BESSHI_P6_SECTION7;
  const fyb = result.fiscalYearBreakdowns;
  const yrCells = (vals: number[], unit = "") =>
    vals.map((v, i) => (
      <Text key={i} style={s.p6FyCol}>
        {renderDelta(v)}
        {unit}
      </Text>
    ));
  const echo = (key: keyof FiscalYearBreakdown) =>
    fyb.map((fy) => (fy[key] as number | undefined) ?? 0);

  return (
    <Page size="A4" style={s.page}>
      <View style={s.p2UnitRow}>
        <Text style={s.p2Unit}>{P6.unitNote}</Text>
        <Text style={s.p2Unit}>{P6.pageNote}</Text>
      </View>
      <Text style={s.sectionTitle}>{P6.header}</Text>

      {/* 사업연도 헤더 */}
      <View style={[s.tableRow, s.groupRow]}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.fyHeaderLabel}</Text>
        {fyb.map((fy, i) => (
          <Text key={i} style={s.p6FyCol}>
            {fy.label} (×{i === 0 ? 3 : i === 1 ? 2 : 1})
          </Text>
        ))}
      </View>

      {/* ① 각 사업연도 소득금액 */}
      <View style={s.tableRow}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.incomeLabel}</Text>
        {yrCells(fyb.map((fy) => fy.taxableIncome))}
      </View>

      {/* 소득에 가산할 금액 ②~⑦ (좌측 그룹 라벨) */}
      <View style={{ flexDirection: "row" }}>
        <View style={s.p6GroupLabel}>
          <Text>{P6.addGroupLabel}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {P6_ADD_ROWS.map((r) => (
            <View key={r.num} style={s.tableRow}>
              <Text style={s.p6Item}>{`${r.num} ${r.label}`}</Text>
              {yrCells(echo(r.key))}
            </View>
          ))}
        </View>
      </View>
      {/* 가. 소계 */}
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.addSubtotalLabel}</Text>
        {yrCells(fyb.map((fy) => fy.taxableIncome + fy.addTotal))}
      </View>

      {/* 소득에서 차감할 금액 ⑧~㉒ (좌측 그룹 라벨) */}
      <View style={{ flexDirection: "row" }}>
        <View style={s.p6GroupLabel}>
          <Text>{P6.subGroupLabel}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {P6_SUB_ROWS.map((r) => (
            <View key={r.num} style={s.tableRow}>
              <Text style={s.p6Item}>{`${r.num} ${r.label}`}</Text>
              {yrCells(echo(r.key))}
            </View>
          ))}
        </View>
      </View>
      {/* 나. 소계 */}
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.subSubtotalLabel}</Text>
        {yrCells(fyb.map((fy) => fy.subTotal))}
      </View>

      {/* 다·라·마·바·사 */}
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.netLabel}</Text>
        {yrCells(fyb.map((fy) => fy.adjustedNetIncome))}
      </View>
      <View style={s.tableRow}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.capAdjLabel}</Text>
        {yrCells(fyb.map((fy) => fy.capitalIncreaseAdjustment))}
      </View>
      <View style={[s.tableRow, s.emphasized]}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.finalLabel}</Text>
        {yrCells(fyb.map((fy) => fy.finalNetIncome))}
      </View>
      <View style={s.tableRow}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{P6.sharesLabel}</Text>
        {yrCells(fyb.map((fy) => fy.convertedShares), "주")}
      </View>
      <View style={s.tableRow}>
        <Text style={s.p6Spacer}> </Text>
        <Text style={s.p6Item}>{`${P6.perShareLabel} ${P6.perShareMarkers.join("")}`}</Text>
        {yrCells(fyb.map((fy) => fy.perShareNetIncome))}
      </View>

      {/* 아·자·차 */}
      <Text style={s.p6TextLine}>
        <Text style={{ fontWeight: 700 }}>{P6.weightedAvgLabel}</Text> = {fmt(result.weightedNetIncomePerShare)}원
      </Text>
      <Text style={s.p6TextLine}>
        <Text style={{ fontWeight: 700 }}>{P6.rateLabel}</Text> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)
      </Text>
      <Text style={s.p6TextLine}>
        <Text style={{ fontWeight: 700 }}>{P6.finalPerShareLabel}</Text> = {fmt(result.netIncomePerShare)}원 (제1쪽 ⑤)
      </Text>

      <Text style={s.footer}>
        ※ 본 양식은 평가심의위원회 운영규정 별지 제4호 서식 부표3을 기준으로 작성되었습니다.{"\n"}
        KoreanLaw MCP 검증: 상증법 §63·시행령 §54·§55·§56·§59 + 시행규칙 §17·§17의2·§17의3·§19
      </Text>
    </Page>
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
      {/* 제4쪽 평가차액 — raw만 필요 → 항상 표시 (화면 BesshiForm4Buppyo3PrintView와 동일 ungated) */}
      <Page4ValuationDelta raw={input.netAssetValueRaw} />
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
  const evalDate = toOptionalDate(input.evaluationDate);
  const date = evalDate ? evalDate.toISOString().slice(0, 10) : "날짜미상";
  return `비상장주식평가서_${corp}_${date}.pdf`;
}

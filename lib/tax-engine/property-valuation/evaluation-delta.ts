/**
 * PR-N — 평가차액 행 단위 헬퍼 (별지 부표3 3쪽 5.평가차액)
 *
 * 별지 부표3 3쪽은 자산·부채 계정과목별 행 단위 입력 (상증법 평가액 vs 재무상태표 차액).
 * 본 PR 엔진(`net-asset-calc.ts`)은 총액(`assetValuationDelta`)만 받으므로,
 * 본 헬퍼가 행 단위 입력을 받아 총액으로 환산한다 (3중 패턴 — 행 단위 우선, 총액 fallback).
 *
 * 법령 근거: 상증령 §55② + 상증규 §17의2 (KoreanLaw 검증 2026-05-22)
 *   "재정경제부령이 정하는 무형고정자산·준비금·충당금등 기타 자산 및 부채의 평가와 관련된
 *    금액은 이를 자산과 부채의 가액에서 각각 차감하거나 가산한다."
 *
 * 별지 양식 3쪽 산식:
 *   ① 자산 합계 = Σ(상증법 평가액 − 재무상태표 금액) for 자산 행
 *   ② 부채 합계 = Σ(상증법 평가액 − 재무상태표 금액) for 부채 행
 *   가. 평가차액 = ① − ②   → 2쪽 4.가.② 기재
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §4-3
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §6-1
 */

/**
 * 평가차액 입력 행 (자산 또는 부채 1개 계정과목)
 */
export interface EvaluationDeltaRow {
  /** UI key — crypto.randomUUID() 권장 */
  rowId: string;
  /** 행 종류 */
  category: "asset" | "liability";
  /** 계정과목 (예: "미수이자", "매출채권", "외화채무") */
  accountName: string;
  /** 상증법에 따른 평가액 */
  evaluationAmount: number;
  /** 재무상태표상 금액 */
  bookAmount: number;
  // 차액(evaluationAmount − bookAmount)은 derive — 자동 계산
}

/**
 * 행 단위 입력의 자산·부채 합계 도출 결과
 */
export interface EvaluationDeltaResult {
  /** ① 자산 합계 = Σ(자산 행의 evaluation − book) */
  assetDelta: number;
  /** ② 부채 합계 = Σ(부채 행의 evaluation − book) */
  liabilityDelta: number;
  /** 가. 평가차액 = ① − ②   → 2쪽 4.가.② 기재 */
  evaluationDelta: number;
  /** 행 단위 입력 사용 여부 — 총액 fallback과 구분 */
  source: "rows" | "total";
  /** 자산 행 (차액 derive 포함) */
  assetRows: Array<EvaluationDeltaRow & { delta: number }>;
  /** 부채 행 (차액 derive 포함) */
  liabilityRows: Array<EvaluationDeltaRow & { delta: number }>;
}

/**
 * 단일 행 그룹(자산 또는 부채)의 합계 계산
 */
function sumDelta(rows: EvaluationDeltaRow[]): number {
  return rows.reduce((sum, row) => sum + (row.evaluationAmount - row.bookAmount), 0);
}

/**
 * 행에 차액 derive 부착
 */
function withDelta(rows: EvaluationDeltaRow[]): Array<EvaluationDeltaRow & { delta: number }> {
  return rows.map((row) => ({
    ...row,
    delta: row.evaluationAmount - row.bookAmount,
  }));
}

/**
 * 평가차액 행 단위 입력 → 총액 환산 (3중 패턴)
 *
 * - 행 단위 입력이 있으면(둘 중 하나라도 길이 > 0) 행 단위 우선
 * - 행 단위 미입력 시 총액 fallback (`assetEvaluationDeltaTotal` / `liabilityEvaluationDeltaTotal`)
 *
 * @example PDF 사례 6 (3쪽)
 *   자산 8행 합계 = 444,770 + 515,500 + (−2,000,000) + (−5,500,000) + 24,667,500
 *                  + (−5,370,150) + 70,050,000 + 24,516,530 = 107,324,150
 *   부채 3행 합계 = (−15,224,200) + 26,000,000 + 5,000,000 = 15,775,800
 *   평가차액 가 = 107,324,150 − 15,775,800 = 91,548,350   → 2쪽 4.가.② 기재
 */
export function resolveEvaluationDelta(input: {
  assetDeltaRows?: EvaluationDeltaRow[];
  liabilityDeltaRows?: EvaluationDeltaRow[];
  assetEvaluationDeltaTotal?: number;
  liabilityEvaluationDeltaTotal?: number;
}): EvaluationDeltaResult {
  const assetRowsRaw = input.assetDeltaRows ?? [];
  const liabilityRowsRaw = input.liabilityDeltaRows ?? [];
  const hasRows = assetRowsRaw.length > 0 || liabilityRowsRaw.length > 0;

  if (hasRows) {
    const assetDelta = sumDelta(assetRowsRaw);
    const liabilityDelta = sumDelta(liabilityRowsRaw);
    return {
      assetDelta,
      liabilityDelta,
      evaluationDelta: assetDelta - liabilityDelta,
      source: "rows",
      assetRows: withDelta(assetRowsRaw),
      liabilityRows: withDelta(liabilityRowsRaw),
    };
  }

  // 총액 fallback
  const assetDelta = input.assetEvaluationDeltaTotal ?? 0;
  const liabilityDelta = input.liabilityEvaluationDeltaTotal ?? 0;
  return {
    assetDelta,
    liabilityDelta,
    evaluationDelta: assetDelta - liabilityDelta,
    source: "total",
    assetRows: [],
    liabilityRows: [],
  };
}

/**
 * 순자산가액 표(별지 2쪽 4.가.②) 표시용 — `assetValuationDelta`(②)를 행 단위 입력 시
 * `resolveEvaluationDelta` 결과(자산 합 − 부채 합)로 치환한 사본을 반환한다.
 *
 * 화면 입력폼(`NetAssetCalculationTable`)·별지 화면 제2쪽(`Page2NetAssetTable`)·
 * PDF 제2쪽(`UnlistedStockBesshiPdfDocument`)이 `raw.assetValuationDelta`를 직접 읽어
 * 행 모드에서 ②=0 stale가 되던 dual-truth 버그를 단일 진실로 해소한다.
 * (엔진 `unlisted-orchestrator`는 이미 동일 보정을 적용 — 최종 세액은 영향 없음, 표시만 정정)
 *
 * - 행 입력 있음(`source === "rows"`): `assetValuationDelta`를 보정값으로 치환한 **새 객체** 반환.
 * - 행 미입력(`source === "total"`): 원본을 **그대로** 반환(참조 동일 — useMemo 안정).
 *
 * category 자산/부채 행 분리 필터를 본 헬퍼가 단일 처리한다(소비처 중복 제거).
 */
export function withResolvedEvaluationDelta<
  T extends { assetValuationDelta: number; evaluationDeltaRows?: EvaluationDeltaRow[] },
>(raw: T): T {
  const resolved = resolveEvaluationDelta({
    assetDeltaRows: raw.evaluationDeltaRows?.filter((r) => r.category === "asset"),
    liabilityDeltaRows: raw.evaluationDeltaRows?.filter((r) => r.category === "liability"),
    assetEvaluationDeltaTotal: raw.assetValuationDelta,
  });
  if (resolved.source === "total") return raw;
  return { ...raw, assetValuationDelta: resolved.evaluationDelta };
}

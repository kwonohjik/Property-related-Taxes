/**
 * RTMS 유사매매사례가액 순수 필터 함수
 *
 * 법령 근거:
 *   - 상증령 §49① 본문: 평가기간 (상속 전후 6개월 / 증여 전 6개월~후 3개월)
 *   - 상증령 §49④: 신고일 절단 (신고한 경우 신고일까지)
 *   - 상증령 §49②1호: 매매계약일 기준, 가장 가까운 날 + 평균
 *   - 시행규칙 §15③1호: 공동주택 유사재산 3요건 (단지·면적±5%·공시가격±5%)
 *   - 상증령 §49①1호가목: 특수관계인 거래 배제 (경고만 — 자동 판별 불가)
 *
 * 설계 원칙:
 *   - DB·fetch 없는 순수 함수
 *   - 정수 연산 (거래금액은 원 단위 정수)
 *   - Math.round 금지 — Math.floor 사용
 *   - 입력 타입 RtmsTradeRecord[] + SimilarSalesFilterCriteria → SimilarSalesFilterResult
 *
 * §9 D4: filterSimilarSales (filterSimilarSalesLocal 폐기)
 * §9 D10: valuationDate: Date
 * §10 P3: umdNm 일치 추가
 * §11 P7: reportDate optional 신고일 절단
 * §11 P8: cdealType="O" 해제거래 제외
 * §11 P9: dealingType 보존
 * §11 P10: 등거리 전체 평균
 */

import { addMonths } from "date-fns";

// ============================================================
// 타입 정의
// ============================================================

/** RTMS 단건 거래 정규화 결과 */
export interface RtmsTradeRecord {
  aptName: string;           // 단지명 원문
  aptNameNormalized: string; // 정규화 (공백·특수문자 제거 소문자)
  dealDate: string;          // 매매계약일 "YYYY-MM-DD" (§49②1호 기준)
  exclusiveAreaM2: number;   // 전용면적 (㎡, §15③1호나목 비교 기준)
  dealAmountWon: number;     // 거래금액 (원, 만원 × 10_000 정수)
  floor: number;             // 층
  buildYear: number;         // 건축연도
  jibun: string;             // 지번
  umdNm: string;             // 읍면동 (§15③1호가목 단지 식별 보조)
  lawdCd: string;            // 법정동코드 5자리
  /** 해제여부 — 해제 시 "O" (공공데이터포털 기술문서 기준, §11 P8) */
  cdealType?: string;
  /** 해제사유발생일 (YYYYMMDD 또는 YYYY.MM.DD) */
  cdealDay?: string;
  /** 거래유형 (§11 P9) — RTMS "중개거래"|"직거래"|"기타" */
  dealingType?: "중개거래" | "직거래" | "기타" | string;
}

/**
 * 필터 기준 입력
 * §9 D9: targetAptName 필수
 * §10 P3: targetUmdNm optional (있으면 읍면동 일치 추가)
 * §9 D10: valuationDate: Date
 * §11 P7: reportDate optional
 */
export interface SimilarSalesFilterCriteria {
  /** 대상 단지명 (원문 — 정규화는 함수 내부) */
  targetAptName: string;
  /** 대상 읍면동 (optional — 있으면 매칭에 추가) */
  targetUmdNm?: string;
  /** 대상 지번 (optional — 보조 식별자) */
  targetJibun?: string;
  /** 대상 전용면적 (㎡) — 미입력 시 면적 필터 skip + 경고 */
  targetExclusiveAreaM2?: number;
  /** 대상 공동주택가격 (원) — Phase 1: 경고만, Phase 2: ±5% 적용 */
  targetStandardPrice?: number;
  /** 평가기준일 (Date) */
  valuationDate: Date;
  /** 세목 — 평가기간 산정 */
  taxType: "inheritance" | "gift";
  /**
   * 신고일 (선택) — 상증령 §49④ 괄호
   * 입력 시 후 기간 상한을 min(평가기간상한, 신고일)로 절단.
   * 통상 신고 전 시뮬레이션이므로 미입력이 기본.
   */
  reportDate?: Date;
}

/** 필터 통과 후보 단건 */
export interface SimilarSalesCandidate {
  trade: RtmsTradeRecord;
  /** 평가기준일 ~ 매매계약일 절대 일수 (§49②1호 가장 가까운 날 정렬 기준) */
  daysFromValuationDate: number;
  /** 면적 차이율 (%) — |후보-대상| × 100 / 대상 (float, 비교만) */
  areaDiffRatePct: number;
  /** 공시가격 차이율 (%) — Phase 1: undefined */
  stdPriceDiffRatePct?: number;
  /** 평가기간 통과 여부 */
  isWithinPeriod: boolean;
  /** §49② 가장 가까운 날 해당 여부 */
  isRecommended: boolean;
}

/** 필터 결과 */
export interface SimilarSalesFilterResult {
  /** 단지명 + 기간 + 면적±5% 모두 통과한 후보 */
  candidates: SimilarSalesCandidate[];
  /** 기간 외 참고 후보 (단지명 + 면적 통과, 기간 외) */
  outOfPeriod: SimilarSalesCandidate[];
  /**
   * §49② 가장 가까운 날 기준 추천값 (원, 원 미만 절사).
   * 후보 없으면 null. 등거리(P10) 시 평균.
   */
  recommendedValue: number | null;
  /** 적용된 기준 (확인용) */
  appliedCriteria: {
    areaMin: number;
    areaMax: number;
    periodStart: string;
    periodEnd: string;
  };
  /** Phase 1: false (후보 공시가격 미확보) */
  stdPriceFilterApplied: boolean;
  /** 경고 목록 (면적 미적용·공시가격 미적용·특수관계인·후보 0건) */
  warnings: string[];
}

// ============================================================
// 내부 유틸
// ============================================================

/**
 * 단지명 정규화 — 공백·특수문자(괄호·점·하이픈·가운뎃점·쉼표) 제거 후 소문자.
 * 시행규칙 §15③1호가목 "동일한 공동주택단지" 비교용.
 */
export function normalizeAptName(name: string): string {
  return name.replace(/[\s\-().·,]/g, "").toLowerCase();
}

/**
 * RTMS 거래금액(만원 문자열 "85,000") → 원 정수 환산.
 * 음수·NaN·0 → 0 반환 (필터에서 제외됨).
 * Math.round 금지 — parseInt는 정수.
 */
export function parseDealAmountWon(raw: string): number {
  // 원문에 '-' 가 있으면 음수 → 0 반환 (해제·오기 방어)
  if (raw.trimStart().startsWith("-")) return 0;
  const manwon = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (isNaN(manwon) || manwon <= 0) return 0;
  return manwon * 10_000; // 만원 × 10,000 — 정수 × 정수
}

/** Date → "YYYY-MM-DD" 문자열 (ISO slice) */
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date (시간대 문제 없이 UTC midnight으로 파싱) */
function parseYMD(s: string): Date {
  // UTC midnight으로 파싱: "2024-06-15" → Date("2024-06-15T00:00:00.000Z")
  return new Date(s + "T00:00:00.000Z");
}

/** 두 Date 사이 절대 일수 (밀리초 → 정수 일수) */
function absDaysDiff(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// ============================================================
// 핵심 필터 함수
// ============================================================

/**
 * RTMS 거래 목록에서 유사매매사례 후보를 필터링·정렬·추천값 산출.
 *
 * @param records  RTMS 프록시가 반환한 전체 거래 목록
 * @param criteria 필터 기준 (대상 자산 정보 + 평가기준일 + 세목)
 * @returns        SimilarSalesFilterResult
 *
 * 필터 순서:
 *   1. 해제거래 제외 (cdealType === "O") — P8
 *   2. 거래금액 유효성 (> 0)
 *   3. 단지명 정규화 일치 + umdNm 일치 — §15③1호가목 + P3
 *   4. 평가기간 내 (신고일 절단 포함) — §49①·§49④ + P7
 *   5. 전용면적 ±5% — §15③1호나목 + P4
 *   6. (Phase 2) 공시가격 ±5% — §15③1호다목 (현재 경고만)
 *   7. §49② 가장 가까운 날 정렬 + 등거리 평균 — P10
 */
export function filterSimilarSales(
  records: RtmsTradeRecord[],
  criteria: SimilarSalesFilterCriteria,
): SimilarSalesFilterResult {
  const warnings: string[] = [];
  const { valuationDate, taxType, reportDate, targetExclusiveAreaM2, targetStandardPrice } = criteria;

  // ── 평가기간 산출 ───────────────────────────────
  // 상속: 기준일 ±6개월 / 증여: -6개월~+3개월 (addMonths — 180일 근사 아님)
  const periodStart = addMonths(valuationDate, -6);
  const monthsAfter = taxType === "inheritance" ? 6 : 3;
  let periodEnd = addMonths(valuationDate, monthsAfter);

  // §49④ 신고일 절단 (P7): 신고일 입력 시 후 상한 = min(기간 상한, 신고일)
  if (reportDate !== undefined && reportDate < periodEnd) {
    periodEnd = reportDate;
  }

  // ── 면적 필터 준비 ─────────────────────────────
  const hasTargetArea =
    targetExclusiveAreaM2 !== undefined && targetExclusiveAreaM2 > 0;
  if (!hasTargetArea) {
    warnings.push(
      "전용면적 미입력 — 시행규칙 §15③1호나목 면적 ±5% 필터 미적용",
    );
  }

  // ── 공시가격 필터 준비 (Phase 1: 경고만) ────────
  const hasTargetStdPrice =
    targetStandardPrice !== undefined && targetStandardPrice > 0;
  if (!hasTargetStdPrice) {
    warnings.push(
      "공동주택가격 미입력 — 시행규칙 §15③1호다목 공시가격 ±5% 필터 미적용 (Phase 2에서 자동 조회 예정)",
    );
  } else {
    // 대상 공시가격 있으나 후보별 공시가격 미확보 (Phase 1)
    warnings.push(
      "공동주택가격 ±5% 필터 미적용 (후보 공시가격 미확보). 직접 확인 권장. (Phase 2에서 자동 적용 예정)",
    );
  }

  // ── 단지명 정규화 ──────────────────────────────
  const targetNameNorm = normalizeAptName(criteria.targetAptName);
  const targetUmdNmTrim = criteria.targetUmdNm?.trim() ?? "";

  // 면적 관련 범위 계산 (경고 출력용 — hasTargetArea 보장 후 사용)
  const areaMin = hasTargetArea ? targetExclusiveAreaM2! * (1 - 0.05) : 0;
  const areaMax = hasTargetArea ? targetExclusiveAreaM2! * (1 + 0.05) : Infinity;

  // ── 필터링 루프 ─────────────────────────────────
  const candidates: SimilarSalesCandidate[] = [];
  const outOfPeriod: SimilarSalesCandidate[] = [];

  for (const trade of records) {
    // Step 1: 해제거래 제외 (P8) — cdealType==="O" → 해제됨
    if (trade.cdealType === "O") continue;

    // Step 2: 거래금액 유효성
    if (trade.dealAmountWon <= 0) continue;

    // Step 3: 단지명 정규화 일치
    if (normalizeAptName(trade.aptName) !== targetNameNorm) continue;

    // Step 3b: umdNm 일치 (targetUmdNm 입력 시 추가 필터 — P3)
    if (targetUmdNmTrim) {
      const tradeUmd = trade.umdNm?.trim() ?? "";
      if (tradeUmd !== targetUmdNmTrim) continue;
    }

    // Step 4: 전용면적 ±5% (P4)
    let areaDiffRatePct = 0;
    if (hasTargetArea) {
      const diff = Math.abs(trade.exclusiveAreaM2 - targetExclusiveAreaM2!);
      // 면적은 float(㎡), 비율 비교는 부등호로 충분 (5% = float threshold)
      areaDiffRatePct = (diff * 100) / targetExclusiveAreaM2!;
      if (areaDiffRatePct > 5) continue;
    }

    // Step 5: 평가기간 판단 (§49②1호 매매계약일 기준)
    const dealDateObj = parseYMD(trade.dealDate);
    const isWithinPeriod =
      dealDateObj >= periodStart && dealDateObj <= periodEnd;

    const daysFromValuationDate = absDaysDiff(dealDateObj, valuationDate);

    const candidate: SimilarSalesCandidate = {
      trade,
      daysFromValuationDate,
      areaDiffRatePct,
      stdPriceDiffRatePct: undefined, // Phase 2
      isWithinPeriod,
      isRecommended: false, // 아래에서 설정
    };

    if (isWithinPeriod) {
      candidates.push(candidate);
    } else {
      outOfPeriod.push(candidate);
    }
  }

  // ── 후보 0건 ───────────────────────────────────
  if (candidates.length === 0) {
    warnings.push("평가기간 내 유사 매매사례가 없습니다.");
    return {
      candidates: [],
      outOfPeriod,
      recommendedValue: null,
      appliedCriteria: {
        areaMin,
        areaMax,
        periodStart: toYMD(periodStart),
        periodEnd: toYMD(periodEnd),
      },
      stdPriceFilterApplied: false,
      warnings,
    };
  }

  // ── 특수관계인 경고 (§49①1호가목) — 고정 ────────
  warnings.push(
    "특수관계인 간 거래(상증령 §49①1호가목)는 시가 인정이 제외됩니다. 거래 당사자를 직접 확인하세요.",
  );

  // 직거래 개별 경고 (P9)
  const directTrades = candidates.filter(
    (c) => c.trade.dealingType === "직거래",
  );
  if (directTrades.length > 0) {
    warnings.push(
      `직거래 ${directTrades.length}건 포함 — 특수관계인 거래 가능성이 높습니다 (§49①1호가목). 거래 당사자를 반드시 확인하세요.`,
    );
  }

  // ── §49② 가장 가까운 날 정렬 + 등거리 평균 (P10) ─
  // 정렬: daysFromValuationDate 오름차순
  candidates.sort((a, b) => a.daysFromValuationDate - b.daysFromValuationDate);

  const closestDays = candidates[0].daysFromValuationDate;
  // 등거리(P10): 동일 절대 일수 그룹 전체가 추천군
  const closestGroup = candidates.filter(
    (c) => c.daysFromValuationDate === closestDays,
  );

  // 추천 표시
  closestGroup.forEach((c) => {
    c.isRecommended = true;
  });

  // 평균 (원 미만 절사 — §49② "평균액", Math.round 금지)
  const sumWon = closestGroup.reduce((s, c) => s + c.trade.dealAmountWon, 0);
  const recommendedValue = Math.floor(sumWon / closestGroup.length);

  return {
    candidates,
    outOfPeriod,
    recommendedValue,
    appliedCriteria: {
      areaMin,
      areaMax,
      periodStart: toYMD(periodStart),
      periodEnd: toYMD(periodEnd),
    },
    stdPriceFilterApplied: false, // Phase 1
    warnings,
  };
}

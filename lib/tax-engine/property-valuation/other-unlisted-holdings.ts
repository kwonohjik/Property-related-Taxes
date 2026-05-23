/**
 * PR-P — §54③ 다른 비상장주식 10% 이하 보유 옵션 (이동평균법 취득가액 갈음)
 *
 * 법령: 상증령 §54③ + 법인령 §74①1호마목 (KoreanLaw MCP 2026-05-24 검증)
 *
 * §54③ 본문: 평가법인이 다른 비상장주식 발행법인의 발행주식총수(자기주식·자기출자지분 제외)
 *           10% 이하 보유 시 → §54①·② 보충적 평가 대신 법인령 §74①1호마목 취득가액 갈음 가능
 * §54③ 단서: §60① 시가가 있으면 시가 우선 적용 (강제)
 *
 * 법인령 §74①1호마목 (이동평균법): 자산을 취득할 때마다 장부시재금액을 장부시재수량으로 나누어
 *                                 평균단가를 산출하고 그 평균단가에 의하여 산출한 취득가액
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-other-holdings-section-54-3.plan.md
 */

// ─────────────────────────────────────────────────────────────────
// 공개 타입
// ─────────────────────────────────────────────────────────────────

export interface OtherUnlistedHolding {
  /** 행 식별자 (UI 편집용 — 후속 PR-N-1) */
  rowId: string;
  /** 다른 비상장주식 발행법인명 (참고용 — 결과 카드 라벨) */
  issuerCorpName: string;
  /** 평가법인이 보유한 주식수 */
  holdingShares: number;
  /** 다른 비상장주식 발행법인의 발행주식총수 (자기주식·자기출자지분 미공제 원본) */
  totalShares: number;
  /** 자기주식·자기출자지분 (분모 차감 — §54③ 본문 "(자기주식과 자기출자지분은 제외한다)") */
  treasuryShares?: number;
  /**
   * 법인령 §74①1호마목 이동평균법 취득가액.
   * 옵션 적용 시 보충적 평가 대신 사용.
   */
  movingAverageAcquisitionValue?: number;
  /**
   * §60① 시가 (매매사례·감정 등). 입력 시 단서에 따라 강제 우선 적용.
   * 미입력 시 movingAverageAcquisitionValue 사용 가능.
   */
  marketValue?: number;
}

export type OtherUnlistedHoldingMethod =
  | "market_value"                   // §60① 시가 (단서 강제)
  | "moving_average_acquisition"     // §54③ 본문 + 법인령 §74①1호마목
  | "not_applicable";                // 10% 초과 → 옵션 적용 불가 (보충적 평가 필요)

export type OtherUnlistedHoldingWarningReason =
  | "exceeds_10pct"                  // 10% 초과 → 옵션 미적용
  | "no_method_available"            // 시가·취득가액 둘 다 미입력 → 평가 불가
  | "invalid_total_shares";          // totalShares ≤ 0 또는 treasuryShares ≥ totalShares

export interface OtherUnlistedHoldingResult {
  rowId: string;
  issuerCorpName: string;
  holdingShares: number;
  /** 자기주식 공제 후 분모 — totalShares - treasuryShares */
  effectiveDenominator: number;
  /** 보유 비율 (decimal — 0.10 = 10%) */
  holdingRatio: number;
  appliedMethod: OtherUnlistedHoldingMethod;
  /** 적용된 평가액 (옵션 적용 시 marketValue 또는 movingAverageAcquisitionValue) */
  valuatedAmount: number;
  warnings: Array<{ reason: OtherUnlistedHoldingWarningReason; message: string }>;
  /** 법령 인용 근거 */
  appliedLegalBasis: string;
}

// ─────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────

/**
 * §54③ 10% 이하 보유 판정 (자기주식·자기출자지분 분모 제외).
 *
 * effectiveDenominator = totalShares - treasuryShares
 * ratio = holdingShares / effectiveDenominator
 * 결과: ratio <= 0.10
 *
 * 경계: 10.0000% 정확히 = 포함 (이하).
 */
export function isWithinTenPercentThreshold(
  holdingShares: number,
  totalShares: number,
  treasuryShares: number = 0,
): { withinThreshold: boolean; effectiveDenominator: number; ratio: number } {
  const effectiveDenominator = totalShares - treasuryShares;
  if (effectiveDenominator <= 0) {
    return { withinThreshold: false, effectiveDenominator: 0, ratio: 0 };
  }
  const ratio = holdingShares / effectiveDenominator;
  return { withinThreshold: ratio <= 0.10, effectiveDenominator, ratio };
}

// ─────────────────────────────────────────────────────────────────
// 평가
// ─────────────────────────────────────────────────────────────────

/**
 * 다른 비상장주식 1건 평가 (§54③ 옵션).
 *
 * 우선순위 (§54③ 단서):
 *   1. §60① 시가 (marketValue) — 입력 시 강제 우선
 *   2. 법인령 §74①1호마목 이동평균법 취득가액 (movingAverageAcquisitionValue)
 *   3. 둘 다 없음 → warnings.no_method_available + valuatedAmount=0 fallback
 *
 * 10% 초과 시:
 *   - 옵션 적용 차단 (appliedMethod="not_applicable") + warnings.exceeds_10pct
 *   - valuatedAmount=0 (보충적 평가는 사용자가 별도 입력 필요)
 *
 * 유효성:
 *   - totalShares ≤ 0 또는 treasuryShares ≥ totalShares → warnings.invalid_total_shares
 *     + appliedMethod="not_applicable"
 */
export function evaluateOtherUnlistedHolding(h: OtherUnlistedHolding): OtherUnlistedHoldingResult {
  const warnings: OtherUnlistedHoldingResult["warnings"] = [];
  const treasury = h.treasuryShares ?? 0;
  const { withinThreshold, effectiveDenominator, ratio } = isWithinTenPercentThreshold(
    h.holdingShares,
    h.totalShares,
    treasury,
  );

  // 유효성 검증
  if (effectiveDenominator <= 0) {
    warnings.push({
      reason: "invalid_total_shares",
      message: `발행주식총수(${h.totalShares}) - 자기주식(${treasury}) <= 0 — 분모 무효`,
    });
    return {
      rowId: h.rowId,
      issuerCorpName: h.issuerCorpName,
      holdingShares: h.holdingShares,
      effectiveDenominator,
      holdingRatio: 0,
      appliedMethod: "not_applicable",
      valuatedAmount: 0,
      warnings,
      appliedLegalBasis: "상증령 §54③ 본문 (분모 무효)",
    };
  }

  // 10% 초과 → 옵션 적용 불가
  if (!withinThreshold) {
    warnings.push({
      reason: "exceeds_10pct",
      message: `보유비율 ${(ratio * 100).toFixed(4)}% > 10% — §54③ 옵션 적용 불가 (보충적 평가 필요)`,
    });
    return {
      rowId: h.rowId,
      issuerCorpName: h.issuerCorpName,
      holdingShares: h.holdingShares,
      effectiveDenominator,
      holdingRatio: ratio,
      appliedMethod: "not_applicable",
      valuatedAmount: 0,
      warnings,
      appliedLegalBasis: "상증령 §54③ 본문 (10% 초과 — 옵션 미적용)",
    };
  }

  // §54③ 단서: §60① 시가 우선 (강제)
  if (typeof h.marketValue === "number" && h.marketValue > 0) {
    return {
      rowId: h.rowId,
      issuerCorpName: h.issuerCorpName,
      holdingShares: h.holdingShares,
      effectiveDenominator,
      holdingRatio: ratio,
      appliedMethod: "market_value",
      valuatedAmount: h.marketValue,
      warnings,
      appliedLegalBasis: "상증령 §54③ 단서 + 상증법 §60① (시가 우선)",
    };
  }

  // §54③ 본문 + 법인령 §74①1호마목: 이동평균법 취득가액
  if (typeof h.movingAverageAcquisitionValue === "number" && h.movingAverageAcquisitionValue >= 0) {
    return {
      rowId: h.rowId,
      issuerCorpName: h.issuerCorpName,
      holdingShares: h.holdingShares,
      effectiveDenominator,
      holdingRatio: ratio,
      appliedMethod: "moving_average_acquisition",
      valuatedAmount: h.movingAverageAcquisitionValue,
      warnings,
      appliedLegalBasis: "상증령 §54③ 본문 + 법인령 §74①1호마목 (이동평균법 취득가액)",
    };
  }

  // 시가·취득가액 둘 다 미입력
  warnings.push({
    reason: "no_method_available",
    message: "marketValue·movingAverageAcquisitionValue 모두 미입력 — 평가 불가",
  });
  return {
    rowId: h.rowId,
    issuerCorpName: h.issuerCorpName,
    holdingShares: h.holdingShares,
    effectiveDenominator,
    holdingRatio: ratio,
    appliedMethod: "not_applicable",
    valuatedAmount: 0,
    warnings,
    appliedLegalBasis: "상증령 §54③ 본문 (입력 누락)",
  };
}

/**
 * 다중 다른 비상장주식 평가 (배치).
 */
export function evaluateOtherUnlistedHoldings(
  holdings: OtherUnlistedHolding[] | undefined,
): OtherUnlistedHoldingResult[] | undefined {
  if (!holdings || holdings.length === 0) return undefined;
  return holdings.map(evaluateOtherUnlistedHolding);
}

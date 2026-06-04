/**
 * 법인 영농·가업상속 주식 — 사업무관자산 차감 엔진
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21·2026-06-04)
 *
 * 산식: adjustedValue = floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 *
 * BigInt 정수 연산 — 1조 단위 자산 곱셈 정밀도 보장.
 * Number 한계 분석:
 *   - stockValue ≤ Number.MAX_SAFE_INTEGER (사용자 입력)
 *   - businessAssets × stockValue ≤ 1e30 (BigInt 무제한)
 *   - adjustedBigInt ≤ stockValue (ratio ≤ 1) → Number 변환 안전
 *
 * PR-3-b (라목 과다현금 자동산정 + 나·다목 2025.2.28. 제외 단서):
 *   - 과다현금 = max(0, 상속개시일 보유현금 − 직전 5개 사업연도말 평균현금 × 비율)
 *   - 비율: 2025.2.28. 이후 200% / 이전 150% (PDF 375p, 상증령 부칙 2)
 *   - 나목 사택·다목 학자금/전세금 제외 단서는 2025.2.28. 신설 → 그 이후 상속에만 적용
 */

import type {
  CorporateNonBusinessAssets,
  CorporateStockAdjustedResult,
} from "./types/inheritance-corporate-non-business.types";

/**
 * 과다보유현금 초과 비율 — 상속개시일 시기별 (상증령 §15⑤2호 라목, PDF 375p).
 * 2025.2.28. 이후 상속개시 분부터 200%, 이전은 150% (상증령 부칙 2). 미입력 → 현행 200%.
 */
export function getExcessCashRatioByDate(deathDate?: string): number {
  if (deathDate && deathDate < "2025-02-28") return 1.5;
  return 2.0;
}

/**
 * 나·다목 제외 단서(사택·학자금·전세금) 적용 여부 (2025.2.28. 신설 → 이전 상속은 단서 없음).
 */
function applyExclusionByDate(deathDate?: string): boolean {
  return !deathDate || deathDate >= "2025-02-28";
}

interface ExcessCashResolution {
  excessCash: number;
  auto: boolean;
  avg5y?: number;
  ratio?: number;
}

/**
 * 과다보유현금 산정 — currentCash + cashByYearEnd 입력 시 자동, 없으면 excessCash 직접입력.
 * 이중차감 가드: 자동산정 모드(currentCash·cashByYearEnd 둘 다 입력)이면 excessCash 직접입력 무시.
 */
function resolveExcessCash(
  assets: CorporateNonBusinessAssets,
  deathDate?: string,
): ExcessCashResolution {
  const years = (assets.cashByYearEnd ?? []).filter((v) => Number.isFinite(v));
  if (assets.currentCash != null && years.length > 0) {
    const avg5y = years.reduce((s, v) => s + Math.max(0, v), 0) / years.length;
    const ratio = getExcessCashRatioByDate(deathDate);
    const excessCash = Math.max(0, Math.floor(assets.currentCash - avg5y * ratio));
    return { excessCash, auto: true, avg5y, ratio };
  }
  return { excessCash: Math.max(0, assets.excessCash ?? 0), auto: false };
}

function sumNonBusinessAssets(
  assets: CorporateNonBusinessAssets | undefined,
  deathDate: string | undefined,
): { sum: number; excess: ExcessCashResolution } {
  if (!assets) {
    return { sum: 0, excess: { excessCash: 0, auto: false } };
  }
  const exclude = applyExclusionByDate(deathDate);
  // 나목 — 임대부동산 − 사택 제외분 (시기 가드)
  const rented = Math.max(
    0,
    Math.max(0, assets.rentedRealEstate ?? 0) -
      (exclude ? Math.max(0, assets.rentedRealEstateExclusion ?? 0) : 0),
  );
  // 다목 — 대여금 − 학자금·전세금 제외분 (시기 가드)
  const loans = Math.max(
    0,
    Math.max(0, assets.externalLoans ?? 0) -
      (exclude ? Math.max(0, assets.externalLoansExclusion ?? 0) : 0),
  );
  // 라목 — 과다현금 자동산정 또는 직접입력
  const excess = resolveExcessCash(assets, deathDate);

  const sum =
    Math.max(0, assets.nonBusinessLand ?? 0) +
    rented +
    loans +
    excess.excessCash +
    Math.max(0, assets.nonOperatingFinancial ?? 0);

  return { sum, excess };
}

/**
 * 법인 영농·가업상속 주식 사업무관자산 차감.
 *
 * @param stockValue        주식 평가가액 (한도 적용 전)
 * @param totalAssets       법인 총자산 (분모)
 * @param nonBusinessAssets 사업무관자산 5종 (+ 과다현금 자동산정·제외 단서)
 * @param deathDate         상속개시일 (과다현금 비율·제외 단서 시기 판정) — 미입력 시 현행
 *
 * 경계:
 *   - totalAssets ≤ 0: ratio=0, adjustedValue=0
 *   - sumOfNonBusiness > totalAssets: businessAssets=0 → adjustedValue=0
 *   - nonBusinessAssets=undefined: sumOfNonBusiness=0 → adjustedValue=stockValue
 */
export function calcCorporateStockAdjustedValue(
  stockValue: number,
  totalAssets: number,
  nonBusinessAssets: CorporateNonBusinessAssets | undefined,
  deathDate?: string,
): CorporateStockAdjustedResult {
  const { sum, excess } = sumNonBusinessAssets(nonBusinessAssets, deathDate);
  const excessMeta = {
    excessCash: excess.excessCash,
    excessCashAuto: excess.auto,
    excessCashAvg5y: excess.avg5y,
    excessCashRatio: excess.ratio,
  };

  if (totalAssets <= 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0, ...excessMeta };
  }
  if (stockValue <= 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0, ...excessMeta };
  }

  const businessAssets = Math.max(0, totalAssets - sum);
  if (businessAssets === 0) {
    return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0, ...excessMeta };
  }

  // BigInt 곱셈 — 1조 × 1조까지 정밀도 보장
  const adjustedBigInt =
    (BigInt(stockValue) * BigInt(businessAssets)) / BigInt(totalAssets);

  // adjustedBigInt ≤ stockValue (ratio ≤ 1) → Number 변환 안전
  const adjustedValue = Number(adjustedBigInt);

  return {
    adjustedValue,
    sumOfNonBusiness: sum,
    ratio: businessAssets / totalAssets,
    ...excessMeta,
  };
}

/**
 * 비상장주식 평가 이력 조회·변환 — Mediator (UI ↔ Storage ↔ EstateItem)
 *
 * 책임:
 *   1. IndexedDB의 상속·증여 이력에서 비상장주식 평가 후보 추출
 *   2. 다중 자산(estateItems[] / giftItems[]) 각각을 독립 후보로 분리
 *   3. UnlistedStockCandidate → Partial<UnlistedStockValuationInput> 변환 (Q1 B안 — 법인 정보만)
 *
 * 정책:
 *   - memory `history-lookup-modal` skill 전수 준수
 *   - 후보 함수는 records 인자만 받음 (repository 호출 책임은 modal에 위임)
 *   - 손상 레코드는 warnings에 기록 후 silent skip (throw 금지)
 *   - 상속·증여 cross 조회 허용 (Q6 A안 — 법인 정보 공용)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-history-lookup.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md
 *
 * KoreanLaw 영향: 없음 (UI 메타데이터만 — 엔진 산식 무영향)
 */

import type {
  UnlistedStockValuationInput,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import type { CalculationRecord } from "@/lib/storage/types";

// ============================================================
// 공개 타입
// ============================================================

export interface UnlistedStockCandidate {
  /** Source 식별자 — `${record.id}-${item.id}` 합성 (1 record → N candidates 분리용) */
  calculationId: string;
  /** record 원본 ID (sourceCalculationId 추적용) */
  recordId: string;
  /** EstateItem.id (다중 자산 식별) */
  itemId: string;
  /** 의뢰인 ID (세무사 모드 — null = 본인) */
  clientId: string | null;

  /** ★ 매칭 키: 법인명 */
  corpName: string;
  /** 평가기준일 (ISO YYYY-MM-DD) */
  evaluationDate: string;

  /** 발행주식총수 (참고용 표시) */
  totalShares: number;
  /** 1주당 액면가 */
  faceValuePerShare: number;
  /** 1주당 평가액 (⑥) — 카드 라벨 표시 (result 추출, 없으면 0) */
  finalPerShareValue: number;
  /** 총 평가액 — 카드 라벨 표시 */
  totalValuation: number;

  /** 상속·증여 구분 (UI 배지) */
  sourceTaxType: "inheritance" | "gift";
  /** 저장 시각 — 정렬 동률 시 사용 */
  createdAt: string;
  /** record.title */
  title: string;

  /** ★ 전체 입력 객체 (prefill 원본) — Partial 추출용 */
  fullInput: UnlistedStockValuationInput;
}

export type UnlistedStockLookupWarningReason =
  | "corp_missing"
  | "input_missing"
  | "result_missing"
  | "excluded"
  | "different_client"
  | "different_corp";

export interface UnlistedStockLookupWarning {
  calculationId: string;
  reason: UnlistedStockLookupWarningReason;
  message: string;
}

export interface UnlistedStockLookupResult {
  candidates: UnlistedStockCandidate[];
  warnings: UnlistedStockLookupWarning[];
}

// ============================================================
// 내부 헬퍼
// ============================================================

interface EstateItemLite {
  id?: unknown;
  category?: unknown;
  unlistedStockValuationV2?: unknown;
}

interface UnlistedStockV2Lite {
  corpName?: unknown;
  evaluationDate?: unknown;
  totalShares?: unknown;
  ownedShares?: unknown;
  faceValuePerShare?: unknown;
  [k: string]: unknown;
}

/**
 * record.inputData에서 비상장주식 V2 자산 목록을 추출.
 * 상속세: estateItems[] / 증여세: giftItems[]
 */
function extractUnlistedStockItems(input: Record<string, unknown> | undefined): EstateItemLite[] {
  if (!input) return [];
  const candidates: EstateItemLite[] = [];
  for (const key of ["estateItems", "giftItems"]) {
    const arr = input[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object") {
          candidates.push(item as EstateItemLite);
        }
      }
    }
  }
  return candidates;
}

/**
 * record.resultData에서 특정 EstateItem의 평가 결과(1주당·총액) 추출.
 * itemId 매칭 — orchestrator가 estateItemId로 키.
 *
 * 결과 구조: { estateValuations: [{ estateItemId, valuatedAmount, breakdown }] }
 *   또는 { result: { estateValuations: [...] } }
 */
function extractItemResult(
  resultData: Record<string, unknown> | undefined,
  itemId: string,
): { totalValuation: number; finalPerShareValue: number } | null {
  if (!resultData) return null;
  const root =
    resultData.result && typeof resultData.result === "object"
      ? (resultData.result as Record<string, unknown>)
      : resultData;

  const valuations = root.estateValuations;
  if (!Array.isArray(valuations)) return null;
  const matched = valuations.find(
    (v) =>
      v && typeof v === "object" && (v as Record<string, unknown>).estateItemId === itemId,
  ) as Record<string, unknown> | undefined;
  if (!matched) return null;

  const totalValuation =
    typeof matched.valuatedAmount === "number" ? matched.valuatedAmount : 0;

  // breakdown에서 "1주당 평가액 ⑥" 라벨로 추출 (정확한 매칭 — Page1CoverSection 라벨과 동일)
  let finalPerShareValue = 0;
  const breakdown = matched.breakdown;
  if (Array.isArray(breakdown)) {
    const perShareRow = breakdown.find(
      (b) =>
        b &&
        typeof b === "object" &&
        typeof (b as Record<string, unknown>).label === "string" &&
        ((b as Record<string, unknown>).label as string).includes("1주당 평가액"),
    ) as Record<string, unknown> | undefined;
    if (perShareRow && typeof perShareRow.value === "number") {
      finalPerShareValue = perShareRow.value;
    }
  }

  return { totalValuation, finalPerShareValue };
}

/**
 * Date 복원 — JSON round-trip 후 string으로 직렬화된 Date 필드를 복원.
 * UnlistedStockValuationInput의 Date 필드:
 *   - businessStartDate
 *   - evaluationDate
 *   - fiscalYears[i].fiscalYearEndDate
 *   - capitalChanges[i].changeDate
 */
function restoreDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.length > 0) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

function restoreUnlistedStockInput(raw: UnlistedStockV2Lite): UnlistedStockValuationInput | null {
  const businessStartDate = restoreDate(raw.businessStartDate);
  const evaluationDate = restoreDate(raw.evaluationDate);
  if (!businessStartDate || !evaluationDate) return null;

  const fiscalYearsRaw = raw.fiscalYears;
  if (!Array.isArray(fiscalYearsRaw) || fiscalYearsRaw.length !== 3) return null;
  const fiscalYears = fiscalYearsRaw.map((fy) => {
    const fyObj = fy as Record<string, unknown>;
    const d = restoreDate(fyObj.fiscalYearEndDate);
    if (!d) return null;
    return {
      fiscalYearLabel: String(fyObj.fiscalYearLabel ?? ""),
      fiscalYearEndDate: d,
      taxableIncome: typeof fyObj.taxableIncome === "number" ? fyObj.taxableIncome : 0,
      addRefundInterest: typeof fyObj.addRefundInterest === "number" ? fyObj.addRefundInterest : undefined,
      addDividendInclude: typeof fyObj.addDividendInclude === "number" ? fyObj.addDividendInclude : undefined,
      addCarryoverDonation: typeof fyObj.addCarryoverDonation === "number" ? fyObj.addCarryoverDonation : undefined,
      addCarryoverEntertainment: typeof fyObj.addCarryoverEntertainment === "number" ? fyObj.addCarryoverEntertainment : undefined,
      addForeignExchangeIncomeUnrealized: typeof fyObj.addForeignExchangeIncomeUnrealized === "number" ? fyObj.addForeignExchangeIncomeUnrealized : undefined,
      subCorpTax: typeof fyObj.subCorpTax === "number" ? fyObj.subCorpTax : undefined,
      subFarmingSurtax: typeof fyObj.subFarmingSurtax === "number" ? fyObj.subFarmingSurtax : undefined,
      subLocalIncomeTax: typeof fyObj.subLocalIncomeTax === "number" ? fyObj.subLocalIncomeTax : undefined,
      subPenaltyTax: typeof fyObj.subPenaltyTax === "number" ? fyObj.subPenaltyTax : undefined,
      subWithholdingPenalty: typeof fyObj.subWithholdingPenalty === "number" ? fyObj.subWithholdingPenalty : undefined,
      subEntertainmentExcess: typeof fyObj.subEntertainmentExcess === "number" ? fyObj.subEntertainmentExcess : undefined,
      subDonationExcess: typeof fyObj.subDonationExcess === "number" ? fyObj.subDonationExcess : undefined,
      subUnrelatedExpense: typeof fyObj.subUnrelatedExpense === "number" ? fyObj.subUnrelatedExpense : undefined,
      subUnrelatedInterest: typeof fyObj.subUnrelatedInterest === "number" ? fyObj.subUnrelatedInterest : undefined,
      subDepreciationShortfall: typeof fyObj.subDepreciationShortfall === "number" ? fyObj.subDepreciationShortfall : undefined,
      subForeignExchangeLossUnrealized: typeof fyObj.subForeignExchangeLossUnrealized === "number" ? fyObj.subForeignExchangeLossUnrealized : undefined,
    };
  });
  if (fiscalYears.some((fy) => fy === null)) return null;

  const capitalChangesRaw = raw.capitalChanges;
  const capitalChanges = Array.isArray(capitalChangesRaw)
    ? capitalChangesRaw.map((c) => {
        const cObj = c as Record<string, unknown>;
        const d = restoreDate(cObj.changeDate);
        if (!d) return null;
        return {
          changeType: cObj.changeType as "paid_in" | "free_issue" | "capital_reduction",
          changeDate: d,
          sharesIssued: typeof cObj.sharesIssued === "number" ? cObj.sharesIssued : 0,
          pricePerShare: typeof cObj.pricePerShare === "number" ? cObj.pricePerShare : undefined,
        };
      })
    : [];
  if (capitalChanges.some((c) => c === null)) return null;

  return {
    corpName: String(raw.corpName ?? ""),
    representative: typeof raw.representative === "string" ? raw.representative : undefined,
    businessStartDate,
    evaluationDate,
    faceValuePerShare: typeof raw.faceValuePerShare === "number" ? raw.faceValuePerShare : 0,
    totalShares: typeof raw.totalShares === "number" ? raw.totalShares : 0,
    ownedShares: typeof raw.ownedShares === "number" ? raw.ownedShares : 0,
    isRealEstateHeavy: Boolean(raw.isRealEstateHeavy),
    section22MajorShareholderMode: raw.section22MajorShareholderMode as "auto" | "manual_on" | "manual_off" | undefined,
    netAssetOnlyReason: raw.netAssetOnlyReason as UnlistedStockValuationInput["netAssetOnlyReason"],
    fiscalYears: fiscalYears as unknown as UnlistedStockValuationInput["fiscalYears"],
    capitalChanges: capitalChanges as unknown as UnlistedStockValuationInput["capitalChanges"],
    netAssetValueRaw: (raw.netAssetValueRaw as UnlistedStockValuationInput["netAssetValueRaw"]) ?? {
      bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0, paidInCapitalIncrease: 0,
      otherEarnedRights: 0, prepaidExpenses: 0, preGiftRetainedEarnings: 0,
      bsTotalLiabilities: 0, corporateTaxPayable: 0, farmingSurtax: 0, localIncomeTax: 0,
      dividendPayable: 0, retirementProvision: 0, otherProvision: 0, reserveExcluded: 0,
      allowanceExcluded: 0, deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: Boolean(raw.isContinuousLossLastThreeYears),
    capitalizationRate: typeof raw.capitalizationRate === "number" ? raw.capitalizationRate : 0.10,
    goodwillRate: typeof raw.goodwillRate === "number" ? raw.goodwillRate : undefined,
    isMaxShareholder: Boolean(raw.isMaxShareholder),
    companySize: (raw.companySize as "small" | "medium" | "large") ?? "large",
  };
}

// ============================================================
// 후보 필터링
// ============================================================

/**
 * 상속·증여 이력에서 비상장주식 평가 후보를 추출.
 *
 * @param records 전체 사용자 이력 (taxType 무관)
 * @param currentClientId 세무사 모드 의뢰인 ID (null = 본인)
 * @param currentCorpName 매칭 필터 (undefined = 전체 / set = corpName 정확 일치)
 * @param excludeCalculationIds 이미 자산 목록에 추가된 calculationId 배열
 *
 * 알고리즘 (Design §2):
 *   1. taxType !== inheritance && !== gift → silent skip
 *   2. clientId !== currentClientId → warnings.different_client
 *   3. inputData에서 unlistedStockValuationV2 자산 추출 (estateItems / giftItems 양쪽)
 *   4. 각 자산을 독립 후보로 분리 (calculationId = `${recordId}-${itemId}`)
 *   5. corpName 누락 → warnings.corp_missing
 *   6. totalShares/ownedShares 누락 → warnings.input_missing
 *   7. result 누락 → 카드는 표시하되 finalPerShareValue·totalValuation = 0 (warnings 미푸시)
 *   8. excludeCalculationIds 포함 → warnings.excluded
 *   9. currentCorpName 지정 + 불일치 → warnings.different_corp (silent — UI에서 "다른 법인" 그룹)
 *
 * 정렬: evaluationDate desc → createdAt desc
 */
export function filterUnlistedStockCandidates(
  records: CalculationRecord[],
  currentClientId: string | null,
  currentCorpName: string | undefined,
  excludeCalculationIds: ReadonlyArray<string>,
): UnlistedStockLookupResult {
  const candidates: UnlistedStockCandidate[] = [];
  const warnings: UnlistedStockLookupWarning[] = [];
  const excludeSet = new Set(excludeCalculationIds);
  const normalizedCorpFilter = currentCorpName?.trim() || undefined;

  for (const record of records) {
    if (record.taxType !== "inheritance" && record.taxType !== "gift") continue;

    if (record.clientId !== currentClientId) {
      warnings.push({
        calculationId: record.id,
        reason: "different_client",
        message: `${record.title}: 다른 의뢰인의 이력 — 격리됨`,
      });
      continue;
    }

    const input = record.inputData as Record<string, unknown> | undefined;
    const items = extractUnlistedStockItems(input);

    for (const item of items) {
      if (item.category !== "unlisted_stock") continue;
      const itemId = typeof item.id === "string" ? item.id : "";
      const calcId = `${record.id}-${itemId}`;
      const v2Raw = item.unlistedStockValuationV2 as UnlistedStockV2Lite | undefined;

      if (!v2Raw || typeof v2Raw !== "object") {
        warnings.push({
          calculationId: calcId,
          reason: "input_missing",
          message: `${record.title}: V2 입력 누락`,
        });
        continue;
      }

      const corpName = typeof v2Raw.corpName === "string" ? v2Raw.corpName.trim() : "";
      if (!corpName) {
        warnings.push({
          calculationId: calcId,
          reason: "corp_missing",
          message: `${record.title}: 법인명 미입력`,
        });
        continue;
      }

      if (
        typeof v2Raw.totalShares !== "number" ||
        v2Raw.totalShares <= 0 ||
        typeof v2Raw.ownedShares !== "number" ||
        v2Raw.ownedShares <= 0
      ) {
        warnings.push({
          calculationId: calcId,
          reason: "input_missing",
          message: `${record.title}: 발행주식·보유주식수 누락`,
        });
        continue;
      }

      if (excludeSet.has(calcId)) {
        warnings.push({
          calculationId: calcId,
          reason: "excluded",
          message: `${record.title}: 이미 자산 목록에 추가됨`,
        });
        continue;
      }

      if (normalizedCorpFilter && corpName !== normalizedCorpFilter) {
        warnings.push({
          calculationId: calcId,
          reason: "different_corp",
          message: `${record.title}: 다른 법인 "${corpName}"`,
        });
        continue;
      }

      // Date 복원 검증
      const fullInput = restoreUnlistedStockInput(v2Raw);
      if (!fullInput) {
        warnings.push({
          calculationId: calcId,
          reason: "input_missing",
          message: `${record.title}: Date 필드 복원 실패`,
        });
        continue;
      }

      // 평가일 ISO 추출
      const evalDate = fullInput.evaluationDate;
      const evalDateIso = evalDate.toISOString().slice(0, 10);

      // 결과 추출 (없으면 0 — 카드는 표시)
      const resultData = record.resultData as Record<string, unknown> | undefined;
      const itemResult = extractItemResult(resultData, itemId);

      candidates.push({
        calculationId: calcId,
        recordId: record.id,
        itemId,
        clientId: record.clientId,
        corpName,
        evaluationDate: evalDateIso,
        totalShares: fullInput.totalShares,
        faceValuePerShare: fullInput.faceValuePerShare,
        finalPerShareValue: itemResult?.finalPerShareValue ?? 0,
        totalValuation: itemResult?.totalValuation ?? 0,
        sourceTaxType: record.taxType as "inheritance" | "gift",
        createdAt: record.createdAt,
        title: record.title,
        fullInput,
      });
    }
  }

  // 정렬: evaluationDate desc → createdAt desc
  candidates.sort((a, b) => {
    if (a.evaluationDate !== b.evaluationDate) return b.evaluationDate.localeCompare(a.evaluationDate);
    return b.createdAt.localeCompare(a.createdAt);
  });

  return { candidates, warnings };
}

// ============================================================
// 후보 → Partial<Input> 변환 (Q1 B안 — 법인 정보만)
// ============================================================

/**
 * UnlistedStockCandidate → Partial<UnlistedStockValuationInput> 변환.
 *
 * Q1 B안 — 법인 정보만 prefill:
 *   ✅ 포함: corpName·representative·businessStartDate·faceValuePerShare·totalShares·
 *           isRealEstateHeavy·section22MajorShareholderMode·netAssetOnlyReason·
 *           fiscalYears·capitalChanges·netAssetValueRaw(17 + evaluationDeltaRows + 보험 3)·
 *           isContinuousLossLastThreeYears·capitalizationRate·goodwillRate·companySize
 *   ❌ 제외: evaluationDate·ownedShares·isMaxShareholder (사용자 입력 보존 — Q1·Q7 B안)
 */
export function candidateToUnlistedStockInput(
  c: UnlistedStockCandidate,
): Partial<UnlistedStockValuationInput> {
  const src = c.fullInput;
  return {
    // 법인 정보
    corpName: src.corpName,
    representative: src.representative,
    businessStartDate: src.businessStartDate,
    faceValuePerShare: src.faceValuePerShare,
    totalShares: src.totalShares,

    // §54⑤ 부동산과다 + §22② 자동 도출 모드
    isRealEstateHeavy: src.isRealEstateHeavy,
    section22MajorShareholderMode: src.section22MajorShareholderMode,

    // §54④ 순자산 단독 평가 사유
    netAssetOnlyReason: src.netAssetOnlyReason,

    // 3년 사업연도·자본금변동·재무상태표 (PR-N evaluationDeltaRows + PR-M 보험 3필드 포함)
    fiscalYears: src.fiscalYears,
    capitalChanges: src.capitalChanges,
    netAssetValueRaw: src.netAssetValueRaw,

    // 영업권·환원율
    isContinuousLossLastThreeYears: src.isContinuousLossLastThreeYears,
    capitalizationRate: src.capitalizationRate,
    goodwillRate: src.goodwillRate,

    // 회사 규모 (할증 배제 분기)
    companySize: src.companySize,

    // ❌ 제외 — 사용자 입력 보존
    // evaluationDate, ownedShares, isMaxShareholder
  };
}

/**
 * 비상장주식 V2 입력 편의 3종 anchor
 *
 * 1. 사업자등록번호 자동 하이픈 포맷 formatBizRegNo
 * 2. 평가기준일 fallback (deathDate/giftDate → effectiveEvaluationDate)
 *    - validateUnlistedStockV2 ctx.evaluationDateFallback 인식
 *    - validate 통과/차단 정합
 * 3. 자본금 display fallback (faceValuePerShare × totalShares)
 *    - capital이 있으면 명시 입력 우선
 *    - capital이 없으면 faceValuePerShare * totalShares
 *
 * anchor 구성 (16):
 *   F-1 ~ F-4: 사업자등록번호 하이픈 포맷
 *   V-1 ~ V-6: 평가기준일 fallback (validate + 엔진 정합)
 *   C-1 ~ C-6: 자본금 fallback 계산
 */

import { describe, expect, test } from "vitest";
import {
  validateUnlistedStockV2,
} from "@/lib/calc/inheritance-validate";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// ────────────────────────────────────────────────────────────
// 헬퍼 — 최소 V2 입력 팩토리
// ────────────────────────────────────────────────────────────
function makeFiscalYear(yearOffset: number) {
  const d = new Date(new Date().getFullYear() - yearOffset, 11, 31);
  return { fiscalYearLabel: String(new Date().getFullYear() - yearOffset), fiscalYearEndDate: d, taxableIncome: 0 };
}

function makeV2(patch: Partial<UnlistedStockValuationInput> = {}): UnlistedStockValuationInput {
  return {
    corpName: "테스트법인",
    businessStartDate: new Date(2010, 0, 1),
    evaluationDate: new Date(2026, 0, 1), // 기본 있음
    faceValuePerShare: 5000,
    totalShares: 1000,
    ownedShares: 100,
    isRealEstateHeavy: false,
    fiscalYears: [makeFiscalYear(1), makeFiscalYear(2), makeFiscalYear(3)],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0, otherEarnedRights: 0, prepaidExpenses: 0,
      preGiftRetainedEarnings: 0, bsTotalLiabilities: 0, corporateTaxPayable: 0,
      farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0, retirementProvision: 0,
      otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.10,
    isMaxShareholder: false,
    companySize: "large",
    ...patch,
  };
}

function makeItem(v2: UnlistedStockValuationInput): EstateItem {
  return { id: "t1", category: "unlisted_stock", name: "테스트주식", unlistedStockValuationV2: v2 };
}

// ────────────────────────────────────────────────────────────
// 사업자등록번호 하이픈 포맷 (formatBizRegNo) — 컴포넌트 로직을 직접 재현
// ────────────────────────────────────────────────────────────
function formatBizRegNo(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

describe("F: 사업자등록번호 자동 하이픈 포맷", () => {
  test("F-1: 숫자만 10자리 → ###-##-##### 형식", () => {
    expect(formatBizRegNo("1234578945")).toBe("123-45-78945");
  });

  test("F-2: 중간 수정 — 5자리까지 입력 시 ###-## 형식", () => {
    expect(formatBizRegNo("12345")).toBe("123-45");
  });

  test("F-3: 3자리 이하 — 하이픈 없음", () => {
    expect(formatBizRegNo("123")).toBe("123");
  });

  test("F-4: 10자리 초과 입력 차단 — 10자리까지만", () => {
    expect(formatBizRegNo("12345678901234")).toBe("123-45-67890");
  });

  test("F-5: 이미 하이픈 포함된 입력 재포맷 — 자연스러운 수정", () => {
    // 사용자가 "123-45-7" 입력 후 삭제/수정 시 숫자 재추출 후 재포맷
    expect(formatBizRegNo("123-45-7")).toBe("123-45-7");
  });

  test("F-6: 빈 값 → 빈 문자열", () => {
    expect(formatBizRegNo("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// V: 평가기준일 fallback — validateUnlistedStockV2
// ────────────────────────────────────────────────────────────
describe("V: 평가기준일 fallback (validateUnlistedStockV2 ctx)", () => {
  test("V-1: evaluationDate 있음 → 정상 통과", () => {
    const v2 = makeV2({ evaluationDate: new Date(2026, 4, 1) });
    expect(validateUnlistedStockV2(makeItem(v2))).toBeNull();
  });

  test("V-2: evaluationDate 없음 + ctx fallback 있음 → 통과 (fallback 인식)", () => {
    const v2 = makeV2({ evaluationDate: undefined });
    // ctx fallback = deathDate = 2026-05-01 → 사업개시일(2010-01-01) 이후이므로 통과
    expect(validateUnlistedStockV2(makeItem(v2), { evaluationDateFallback: "2026-05-01" })).toBeNull();
  });

  test("V-3: evaluationDate 없음 + ctx fallback 없음 → 평가기준일 비교 건너뜀 (undefined < Date = false)", () => {
    const v2 = makeV2({ evaluationDate: undefined });
    // evaluationDate도 없고 fallback도 없으면 비교 로직 건너뜀 → null 통과
    expect(validateUnlistedStockV2(makeItem(v2))).toBeNull();
  });

  test("V-4: evaluationDate ctx fallback < businessStartDate → 오류 차단", () => {
    const v2 = makeV2({
      evaluationDate: undefined,
      businessStartDate: new Date(2026, 5, 1), // 2026-06-01
    });
    // fallback 2026-05-01 < businessStartDate 2026-06-01 → 오류
    const result = validateUnlistedStockV2(makeItem(v2), { evaluationDateFallback: "2026-05-01" });
    expect(result).not.toBeNull();
    expect(result).toContain("평가기준일");
  });

  test("V-5: evaluationDate 명시 입력 우선 — ctx fallback 무시", () => {
    const v2 = makeV2({ evaluationDate: new Date(2026, 4, 1) });
    // evaluationDate(2026-05-01) > businessStartDate(2010-01-01) → 통과. fallback은 쓰지 않음
    expect(validateUnlistedStockV2(makeItem(v2), { evaluationDateFallback: "2020-01-01" })).toBeNull();
  });

  test("V-6: 자본금 변동 변동일 > ctx fallback evaluationDate → 오류", () => {
    const v2 = makeV2({
      evaluationDate: undefined,
      capitalChanges: [
        {
          changeType: "paid_in",
          changeDate: new Date(2027, 0, 1), // 2027-01-01 — fallback보다 미래
          sharesIssued: 100,
          pricePerShare: 5000,
        },
      ],
    });
    const result = validateUnlistedStockV2(makeItem(v2), { evaluationDateFallback: "2026-05-01" });
    expect(result).not.toBeNull();
    expect(result).toContain("평가기준일 이전");
  });
});

// ────────────────────────────────────────────────────────────
// C: 자본금 display fallback 계산 로직 (CorporateInfoSection 내부 로직 재현)
// ────────────────────────────────────────────────────────────
function resolveCapitalDisplay(capital: number | undefined, faceValuePerShare: number, totalShares: number): string {
  return capital
    ? String(capital)
    : faceValuePerShare > 0 && totalShares > 0
      ? String(faceValuePerShare * totalShares)
      : "";
}

describe("C: 자본금 display fallback (액면가 × 발행주식총수)", () => {
  test("C-1: capital 명시 입력 → 명시 값 우선", () => {
    expect(resolveCapitalDisplay(30_000_000, 5000, 1000)).toBe("30000000");
  });

  test("C-2: capital 없음 → 액면가 × 발행주식총수 자동 계산", () => {
    expect(resolveCapitalDisplay(undefined, 5000, 1000)).toBe("5000000");
  });

  test("C-3: capital=0 → falsy로 취급 — 액면가 × 주식수로 fallback", () => {
    // capital=0은 사용자가 명시 입력하지 않은 것과 동일하게 취급 (미입력 fallback)
    expect(resolveCapitalDisplay(0, 5000, 1000)).toBe("5000000");
  });

  test("C-4: faceValuePerShare=0 → 빈 문자열 (계산 불가)", () => {
    expect(resolveCapitalDisplay(undefined, 0, 1000)).toBe("");
  });

  test("C-5: totalShares=0 → 빈 문자열 (계산 불가)", () => {
    expect(resolveCapitalDisplay(undefined, 5000, 0)).toBe("");
  });

  test("C-6: 액면가 × 발행주식총수 정확도 — 5,000 × 100,000 = 500,000,000", () => {
    expect(resolveCapitalDisplay(undefined, 5000, 100_000)).toBe("500000000");
  });
});

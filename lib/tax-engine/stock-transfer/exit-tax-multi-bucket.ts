/**
 * 국외전출세 2027.1.1. 개정 — 세율 구분별 기본공제 배분·구분별 세액·구분별 지방소득세 (순수 leaf)
 *
 * 법령(소득세법 2027.1.1. 시행본, KoreanLaw MCP 2026-11-27 실독):
 *   §118의10③ 「양도소득금액은 … 양도가액에서 … 필요경비를 공제한 금액」
 *   §118의10④ 「양도소득과세표준은 제3항에 따른 양도소득금액에서 연 250만원을 공제한 금액」
 *   §118의11  「양도소득과세표준에 다음 각 호의 세율을 적용」 — 1호 누진표 / 2호가목 10% / 2호나목 20%
 *   → 공제는 연 1회·한 번의 과세표준이고 세율만 호별이다. 구분별 배분·구분별 공제 한도·구분 간 손실 상계 규정은 법·시행령 어디에도 없다
 *     (§103①의 「소득별로 각각」과 다르다). 그래서 구분이 둘 이상이면 배분을 사용자 입력으로 받고(C-1), 구분 간 손실은 차단한다(C-2).
 *
 * 이 파일은 구분이 하나일 때도 같은 경로를 쓴다 — 하나이고 입력이 없으면 종전(`min(250만원, 양도소득금액)`) 값과 정확히 같다.
 */

import type {
  ExitTaxBasicDeductionAllocation,
  ExitTaxBucketDetail,
  ExitTaxHoldingResult,
  ExitTaxInput,
  ExitTaxRateBucket,
} from "./types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { STOCK_EXIT_TAX_CONSTS } from "@/lib/tax-engine/legal-codes/stock";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { calcBucketTax, calcLocalIncomeTaxTable, floorTen } from "./exit-tax-bucket";

const BUCKET_ORDER: readonly ExitTaxRateBucket[] = ["clause1", "clause2a", "clause2b"];

const BUCKET_LABEL: Record<ExitTaxRateBucket, string> = {
  clause1: "1호(국내 상장·비상장 주식)",
  clause2a: "2호가목(국외주식 중 중소기업)",
  clause2b: "2호나목(국외주식 그 밖)",
};

function invalid(message: string, path: string): TaxCalculationError {
  return new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { path });
}

/** canonical 순서(1호 → 2호가목 → 2호나목)로 정렬·중복 제거 */
function orderedBuckets(buckets: ExitTaxRateBucket[]): ExitTaxRateBucket[] {
  return BUCKET_ORDER.filter((b) => buckets.includes(b));
}

/**
 * 배분 입력 검증 — 통과하면 구분별 배분액을 돌려준다. 자동 안분 fallback은 없다.
 *  - 과세 구분의 값은 명시해야 한다(0 포함). 비우면 0으로 채우지 않고 거부한다.
 *  - 과세 구분이 아닌 쪽은 비우거나 0이어야 한다.
 *  - 모든 값은 0 이상의 정수(원)여야 한다.
 *  - 합계 = 공제액 `D = min(250만원, 합산 양도소득금액)`. 합산 양도소득금액이 250만원 이상이면 정확히 250만원이다.
 *  - 각 값 ≤ 그 구분 양도소득금액 — 법문에 근거는 없다(§118의10④는 합계에서 공제). 소득금액을 넘는 공제를 입력받아
 *    그 구분 과세표준이 음수가 되는 것을 막는 방어이며, 근거가 생기면 풀 수 있다.
 */
function validateAllocation(
  alloc: ExitTaxBasicDeductionAllocation,
  buckets: ExitTaxRateBucket[],
  gainByBucket: Record<ExitTaxRateBucket, number>,
  expectedTotal: number,
): Record<ExitTaxRateBucket, number> {
  const out = { clause1: 0, clause2a: 0, clause2b: 0 } as Record<ExitTaxRateBucket, number>;
  for (const b of BUCKET_ORDER) {
    const v = alloc[b];
    const path = `basicDeductionAllocation.${b}`;
    const taxed = buckets.includes(b);
    if (v == null) {
      if (taxed) {
        throw invalid(
          `기본공제 배분: 과세 구분 ${BUCKET_LABEL[b]}의 배분액이 없습니다 — 0원이라도 직접 입력해야 합니다(자동으로 채우지 않습니다)`,
          path,
        );
      }
      continue;
    }
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      throw invalid(`기본공제 배분: ${BUCKET_LABEL[b]}의 배분액은 0 이상의 정수(원)여야 합니다`, path);
    }
    if (!taxed && v !== 0) {
      throw invalid(
        `기본공제 배분: ${BUCKET_LABEL[b]}은(는) 과세 대상 구분이 아니어서 배분액을 넣을 수 없습니다`,
        path,
      );
    }
    if (taxed && v > gainByBucket[b]) {
      throw invalid(
        `기본공제 배분: ${BUCKET_LABEL[b]}의 배분액 ${v.toLocaleString()}원이 그 구분 양도소득금액 ${gainByBucket[b].toLocaleString()}원을 넘습니다`,
        path,
      );
    }
    out[b] = v;
  }
  const sum = out.clause1 + out.clause2a + out.clause2b;
  if (sum !== expectedTotal) {
    throw invalid(
      `기본공제 배분 합계 ${sum.toLocaleString()}원이 공제액 ${expectedTotal.toLocaleString()}원과 다릅니다 — 연 250만원(합산 양도소득금액이 더 적으면 그 금액)을 구분별로 나눠 합계를 맞춰야 합니다 (소득세법 §118의10④)`,
      "basicDeductionAllocation",
    );
  }
  return out;
}

export type BucketCalcResult = {
  details: ExitTaxBucketDetail[];
  totalGain: number;
  basicDeduction: number;
  taxBase: number;
  incomeTax: number;
  /** 구분이 둘 이상이라 배분을 입력값으로 정했는가 */
  userAllocated: boolean;
};

/**
 * 과세 종목의 구분별 양도소득금액 → 기본공제 배분 → 구분별 과세표준·산출세액.
 *
 * @param taxedDetails scope="taxed"이고 rateBucket이 채워진 종목 결과
 */
export function calcBuckets(input: ExitTaxInput, taxedDetails: ExitTaxHoldingResult[]): BucketCalcResult {
  const gainByBucket = { clause1: 0, clause2a: 0, clause2b: 0 } as Record<ExitTaxRateBucket, number>;
  const present: ExitTaxRateBucket[] = [];
  for (const d of taxedDetails) {
    const b = d.rateBucket ?? "clause1";
    gainByBucket[b] += d.transferGain; // 구분 안 종목 간 손실은 §118의10③ 문언대로 통산(현행 유지)
    present.push(b);
  }
  const buckets = orderedBuckets(present);
  const multi = buckets.length >= 2;

  // C-2: 구분 간 손실 상계 규정이 없어 어느 구분이든 음수면 차단한다(구분이 하나이면 종전처럼 과세표준 0).
  if (multi) {
    for (const b of buckets) {
      if (gainByBucket[b] < 0) {
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          `${BUCKET_LABEL[b]} 양도소득금액이 ${gainByBucket[b].toLocaleString()}원(손실)입니다 — 구분 간 손실 상계 규정이 법령에 없어 계산하지 않습니다 (같은 구분 안 종목 간 통산만 반영)`,
          { path: "holdings", bucket: b },
        );
      }
    }
  }

  const totalGain = buckets.reduce((s, b) => s + gainByBucket[b], 0);
  // §118의10④ 기본공제 250만원 — 합산 양도소득금액이 더 적으면 그 금액까지
  const basicDeduction =
    totalGain > 0 ? Math.min(STOCK_EXIT_TAX_CONSTS.BASIC_DEDUCTION, totalGain) : 0;

  const given = input.basicDeductionAllocation;
  let alloc: Record<ExitTaxRateBucket, number>;
  if (given != null) {
    alloc = validateAllocation(given, buckets, gainByBucket, basicDeduction);
  } else if (multi) {
    throw invalid(
      "과세 구분이 둘 이상(국내 1호 + 국외 2호, 또는 2호 가목·나목 혼재)이면 기본공제 250만원의 구분별 배분(basicDeductionAllocation)을 입력해야 합니다 — 법령에 배분 규정이 없어 자동으로 나누지 않습니다",
      "basicDeductionAllocation",
    );
  } else {
    alloc = { clause1: 0, clause2a: 0, clause2b: 0 };
    if (buckets.length === 1) alloc[buckets[0]] = basicDeduction; // 구분 하나 — 법문 직접 적용
  }

  const details: ExitTaxBucketDetail[] = buckets.map((b) => {
    const taxBase = Math.max(0, gainByBucket[b] - alloc[b]);
    const t = calcBucketTax(b, taxBase);
    return {
      bucket: b,
      transferGain: gainByBucket[b],
      basicDeductionAllocated: alloc[b],
      taxBase,
      appliedRate: t.rate,
      progressiveDeduction: t.progressiveDeduction,
      calculatedTax: t.tax,
    };
  });

  return {
    details,
    totalGain,
    basicDeduction,
    taxBase: details.reduce((s, d) => s + d.taxBase, 0),
    incomeTax: details.reduce((s, d) => s + d.calculatedTax, 0),
    userAllocated: multi,
  };
}

export type MultiBucketLocalTax = {
  /** 주값 — 1호 구분은 소득세 산출세액의 10%, 2호 구분은 지방세법 §103의3⑧ 표를 그 구분 과세표준에 직독 (구분별 10원 미만 절사 후 합) */
  primary: number;
  /** 참고값 — 모든 구분을 소득세 산출세액의 10%로 본 값 (구분별 10원 미만 절사 후 합) */
  alternative: number;
  /** 참고값 — §103의3⑧ 표를 합산 과세표준에 한 번 직독한 값 (구분별 적용과의 차이를 고지하기 위한 비교용) */
  aggregateTable: number;
};

/**
 * 구분별 지방소득세. 지방세법 §103의3⑧은 호 구분이 없는 단일표이고 구분 간 적용 방식(구분별 vs 합산 과세표준)도
 * 명시하지 않는다 — 사용자 결정 C-5에 따라 구분별을 주값으로 하고 합산 직독은 비교값으로 고지한다(확인 필요).
 */
export function calcMultiBucketLocalTax(details: ExitTaxBucketDetail[]): MultiBucketLocalTax {
  let primary = 0;
  let alternative = 0;
  for (const d of details) {
    const tenth = floorTen(applyRate(d.calculatedTax, 0.1));
    alternative += tenth;
    primary += d.bucket === "clause1" ? tenth : calcLocalIncomeTaxTable(d.taxBase);
  }
  return {
    primary,
    alternative,
    aggregateTable: calcLocalIncomeTaxTable(details.reduce((s, d) => s + d.taxBase, 0)),
  };
}

/** 구분이 둘 이상일 때 결과에 싣는 고지 (배분 규정 없음 · 지방소득세 · 1호 3억원 구간 기준 — 모두 확인 필요) */
export function multiBucketNotices(
  details: ExitTaxBucketDetail[],
  local: MultiBucketLocalTax,
): string[] {
  const notices = [
    `과세 구분이 둘 이상이라 §118의10④ 기본공제 250만원을 구분별로 나눈 값(${details
      .map((d) => `${BUCKET_LABEL[d.bucket]} ${d.basicDeductionAllocated.toLocaleString()}원`)
      .join(", ")})으로 계산했습니다 — 법령에 구분별 배분 규정이 없어 입력값 기준이며, 배분에 따라 산출세액이 달라집니다`,
    `지방소득세는 구분별로 계산했습니다(1호 구분은 소득세 산출세액의 10%, 2호 구분은 지방세법 §103의3⑧ 표를 그 구분 과세표준에 적용) ${local.primary.toLocaleString()}원 — §103의3⑧ 표를 합산 과세표준에 한 번 적용하면 ${local.aggregateTable.toLocaleString()}원, 모두 소득세 산출세액의 10%로 보면 ${local.alternative.toLocaleString()}원으로 달라지므로 확인 필요`,
  ];
  if (details.some((d) => d.bucket === "clause1")) {
    notices.push(
      "1호 세율표의 3억원 구간은 1호 구분의 과세표준만으로 판정했습니다 — §118의11이 구분 간 과세표준 합산 여부를 따로 정하지 않아 확인 필요",
    );
  }
  return notices;
}

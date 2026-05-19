/**
 * 주식 양도소득세 — 매매사례가액 평가 모듈 (R-1' PR-2 잔여)
 *
 * 소득세법 §97①1나목 → 시행령 §163⑫ → 시행령 §176의2③1호
 *   "양도일 또는 취득일 전후 각 3개월 이내에 해당 자산
 *    (주권상장법인의 주식등은 제외한다)과 동일성 또는 유사성이 있는
 *    자산의 매매사례가 있는 경우 그 가액"
 *
 * 시행령 §176의2③ 단서:
 *   §98① 특수관계인과의 거래로서 객관적으로 부당한 경우 적용 배제
 *
 * 적용 범위:
 *   - 비상장(`marketType="unlisted"`): ✅
 *   - 기타자산(`marketType="other_asset"`): ✅
 *   - 코스피·코스닥·코넥스: ❌ (validate·Zod에서 차단)
 *
 * 매매사례가액 = "실지거래가액 의제" (법§97②1호)
 *   → §163⑥ 개산공제 미적용
 *   → §97②2호 단서 swap 비교 비대상 (swap은 환산취득가액 전용)
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

export interface MarketSampleEvaluationResult {
  acquisitionApplied: boolean;
  transferApplied: boolean;
  acquisitionPerShare?: number;
  transferPerShare?: number;
  acquisitionTotal?: number;
  transferTotal?: number;
  acquisitionDeltaDays?: number;
  transferDeltaDays?: number;
  acquisitionOverThreeMonths: boolean;
  transferOverThreeMonths: boolean;
  warnings: string[];
  appliedRules: string[];
}

/**
 * 두 일자 차이 (절대값, 일 단위)
 */
function diffDays(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / 86_400_000);
}

/**
 * ±3개월 (약 90일) 초과 여부 — 시행령 §176의2③1호 본문
 * 정확한 "전후 3개월" 정의는 달의 일수 가변이지만, 본 엔진에서는 90일 기준 안내(warning)만 발동.
 * 차단은 시장 유형 게이트 외 추가하지 않음 (사용자 자율 신고 책임 — 결정·경정 단계 부인 가능).
 */
function isOverThreeMonths(deltaDays: number): boolean {
  return deltaDays > 90;
}

/**
 * 매매사례가액 평가 — 취득·양도 양쪽 모두 평가 가능
 *
 * 호출 위치: stock-transfer-tax.ts STEP 2.5(양도가액) + STEP 3(취득가액)
 *   - acquisitionMode === "sale_case" 시 acquisitionMarketSample* 사용
 *   - transferMarketSamplePrice 입력 시 perShareTransferPrice 우선 무시 (사례가 우선)
 */
export function evaluateMarketSample(input: {
  shareCount: number;
  acquisitionDate: Date;
  transferDate: Date;
  acquisitionMarketSamplePrice?: number;
  acquisitionMarketSampleDate?: Date;
  acquisitionMarketSampleCounterparty?: string;
  transferMarketSamplePrice?: number;
  transferMarketSampleDate?: Date;
  transferMarketSampleCounterparty?: string;
}): MarketSampleEvaluationResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  let acquisitionApplied = false;
  let transferApplied = false;
  let acquisitionPerShare: number | undefined;
  let transferPerShare: number | undefined;
  let acquisitionTotal: number | undefined;
  let transferTotal: number | undefined;
  let acquisitionDeltaDays: number | undefined;
  let transferDeltaDays: number | undefined;
  let acquisitionOverThreeMonths = false;
  let transferOverThreeMonths = false;

  if (input.acquisitionMarketSamplePrice !== undefined && input.acquisitionMarketSamplePrice > 0) {
    acquisitionApplied = true;
    acquisitionPerShare = Math.floor(input.acquisitionMarketSamplePrice);
    acquisitionTotal = acquisitionPerShare * input.shareCount;
    if (input.acquisitionMarketSampleDate) {
      acquisitionDeltaDays = diffDays(input.acquisitionMarketSampleDate, input.acquisitionDate);
      acquisitionOverThreeMonths = isOverThreeMonths(acquisitionDeltaDays);
      if (acquisitionOverThreeMonths) {
        warnings.push(
          `취득 매매사례 거래일이 취득일과 ${acquisitionDeltaDays}일 차이 — 시행령 §176의2③1호 본문 "전후 3개월" 초과. 결정·경정 단계 부인 가능성 안내.`,
        );
      }
    }
    if (input.acquisitionMarketSampleCounterparty && /(대표|이사|친족|배우자|자녀|특수관계)/.test(input.acquisitionMarketSampleCounterparty)) {
      warnings.push(`취득 매매사례 거래상대 "${input.acquisitionMarketSampleCounterparty}" — 특수관계인 의심. §98① + §176의2③ 단서 검토 권장.`);
    }
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_176_2_3_1_MARKET_SAMPLE);
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_163_12);
  }

  if (input.transferMarketSamplePrice !== undefined && input.transferMarketSamplePrice > 0) {
    transferApplied = true;
    transferPerShare = Math.floor(input.transferMarketSamplePrice);
    transferTotal = transferPerShare * input.shareCount;
    if (input.transferMarketSampleDate) {
      transferDeltaDays = diffDays(input.transferMarketSampleDate, input.transferDate);
      transferOverThreeMonths = isOverThreeMonths(transferDeltaDays);
      if (transferOverThreeMonths) {
        warnings.push(
          `양도 매매사례 거래일이 양도일과 ${transferDeltaDays}일 차이 — "전후 3개월" 초과.`,
        );
      }
    }
    if (input.transferMarketSampleCounterparty && /(대표|이사|친족|배우자|자녀|특수관계)/.test(input.transferMarketSampleCounterparty)) {
      warnings.push(`양도 매매사례 거래상대 "${input.transferMarketSampleCounterparty}" — 특수관계인 의심.`);
    }
  }

  return {
    acquisitionApplied,
    transferApplied,
    acquisitionPerShare,
    transferPerShare,
    acquisitionTotal,
    transferTotal,
    acquisitionDeltaDays,
    transferDeltaDays,
    acquisitionOverThreeMonths,
    transferOverThreeMonths,
    warnings,
    appliedRules,
  };
}

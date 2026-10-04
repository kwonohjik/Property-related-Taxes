/**
 * 주식 양도소득세 — **취득** 매매사례가액 평가 모듈 (R-1' PR-2 잔여)
 *
 * 소득세법 §97①1나목 → 시행령 §163⑫ → 시행령 §176의2③1호
 *   "양도일 또는 취득일 전후 각 3개월 이내에 해당 자산
 *    (주권상장법인의 주식등은 제외한다)과 동일성 또는 유사성이 있는
 *    자산의 매매사례가 있는 경우 그 가액"
 *
 * 시행령 §176의2③ 단서:
 *   §98① 특수관계인과의 거래로서 객관적으로 부당한 경우 적용 배제 — 사실판단이라 엔진은 판정하지 않는다
 *
 * 적용 범위:
 *   - 비상장(`marketType="unlisted"`): ✅
 *   - 기타자산(`marketType="other_asset"`): ✅
 *   - 코스피·코스닥·코넥스: ❌ (validate·Zod에서 차단)
 *
 * 매매사례가액으로 취득가액을 산정하면 (법 §97②2호 본문 — 「제1항제1호나목의 금액에 자산별로
 * 대통령령으로 정하는 금액을 더한 금액」)
 *   → 시행령 §163⑥4 개산공제(취득당시 기준시가 × 1%) **적용** — 기준시가 산정은 `stock-acquisition-basis.ts`
 *   → §97②2호 **단서**(실비로 갈아타기)는 「환산취득가액으로 하는 경우」 한정이라 비대상
 *
 * ⚠️ **양도**측 매매사례가액은 없다. 양도가액은 §96① 실지거래가액이고, 매매사례가액·기준시가로 갈음하는
 *    것은 §114⑦ 과세관청의 결정·경정(추계조사) 축이라 신고 단계의 우선 규정이 없다(2026-10-02 제거).
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import type { StockTransferInput } from "./types/stock-transfer.types";

/**
 * **매매사례가액을 쓸 수 있는 시장인가** — 시행령 §176의2③1호 본문 괄호
 * 「해당 자산(**주권상장법인의 주식등은 제외한다**)과 동일성 또는 유사성이 있는 자산의 매매사례」.
 *
 * 종전에는 validate·Zod에만 게이트가 있었고 둘 다 `acquisitionMode === "sale_case"` 축이라,
 * 취득모드를 실가로 되돌리면 상장주식에도 양도측 치환이 그대로 통했다.
 * UI 배너는 안내일 뿐 입력을 막지 않으므로 **엔진이 최종 가드**를 든다.
 */
export function isMarketSampleAllowedMarket(
  marketType: StockTransferInput["marketType"],
): boolean {
  return marketType !== "kospi" && marketType !== "kosdaq" && marketType !== "konex";
}

export interface MarketSampleEvaluationResult {
  acquisitionApplied: boolean;
  acquisitionPerShare?: number;
  acquisitionTotal?: number;
  acquisitionDeltaDays?: number;
  acquisitionOverThreeMonths: boolean;
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
 * 취득 매매사례가액 평가
 *
 * 호출 위치: stock-transfer-pr2-detail.ts (acquisitionMode === "sale_case" 시 acquisitionMarketSample* 사용)
 */
export function evaluateMarketSample(input: {
  shareCount: number;
  acquisitionDate: Date;
  /** 경고 문구의 기준일 이름 — 이월과세 A는 「증여자 취득일」 (기본 「취득일」) */
  acquisitionDateLabel?: string;
  acquisitionMarketSamplePrice?: number;
  acquisitionMarketSampleDate?: Date;
}): MarketSampleEvaluationResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  let acquisitionApplied = false;
  let acquisitionPerShare: number | undefined;
  let acquisitionTotal: number | undefined;
  let acquisitionDeltaDays: number | undefined;
  let acquisitionOverThreeMonths = false;

  if (input.acquisitionMarketSamplePrice !== undefined && input.acquisitionMarketSamplePrice > 0) {
    acquisitionApplied = true;
    acquisitionPerShare = Math.floor(input.acquisitionMarketSamplePrice);
    acquisitionTotal = acquisitionPerShare * input.shareCount;
    if (input.acquisitionMarketSampleDate) {
      acquisitionDeltaDays = diffDays(input.acquisitionMarketSampleDate, input.acquisitionDate);
      acquisitionOverThreeMonths = isOverThreeMonths(acquisitionDeltaDays);
      if (acquisitionOverThreeMonths) {
        warnings.push(
          `취득 매매사례 거래일이 ${input.acquisitionDateLabel ?? "취득일"}과 ${acquisitionDeltaDays}일 차이 — 시행령 §176의2③1호 본문 "전후 3개월" 초과. 결정·경정 단계 부인 가능성 안내.`,
        );
      }
    }
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_176_2_3_1_MARKET_SAMPLE);
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_163_12);
  }

  return {
    acquisitionApplied,
    acquisitionPerShare,
    acquisitionTotal,
    acquisitionDeltaDays,
    acquisitionOverThreeMonths,
    warnings,
    appliedRules,
  };
}

/**
 * 국외전출세 2027.1.1. 이후 — 과세 세율 구분 미리보기 (단일 소스: 엔진 분류 helper)
 *
 * 기본공제 250만원 배분 칸(§118의10④ · 사용자 결정 C-1)은 **과세 구분이 둘 이상일 때만** 열린다.
 * 어느 종목이 «과세»인지(5억 합계·외국인근로자 제외)와 어느 «구분»인지(1호/2호가목/2호나목)는
 * 엔진 소유 판정이라 화면이 다시 구현하지 않는다 — 엔진이 쓰는 같은 함수
 * (`calcHoldingResult` · `classifyExitTaxHoldings`)를 그대로 호출한다.
 *
 * ④(`buildExitTaxApiBody`)의 배분 전송 게이트와 ⑤(입력칸 노출)가 **같은 결과**를 쓴다 — 칸이 안 보이는데
 * 값이 전송되거나(숨은 값), 칸이 보이는데 전송되지 않는 모순을 막는다.
 */

import type { ExitTaxRateBucket } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { calcHoldingResult } from "@/lib/tax-engine/stock-transfer/exit-tax";
import { classifyExitTaxHoldings } from "@/lib/tax-engine/stock-transfer/exit-tax-regime";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";

/** 엔진 분류 helper의 입력 화면용 요약 — 과세 구분과 «과세» 종목 id (제외 종목은 빠진다) */
export type ExitTaxClassificationPreview = {
  buckets: ExitTaxRateBucket[];
  taxedIds: ReadonlySet<string>;
};

/**
 * 엔진 분류 결과(`classifyExitTaxHoldings`)를 그대로 읽는다. 입력이 덜 채워져 엔진이 환산·분류를 못 하면 `null`
 * (배분 칸·종목별 실제 양도 칸은 닫히고 ④도 싣지 않는다 — 그 단계의 미비는 ⑧이 해당 필드를 가리킨다).
 *
 * @param body `buildExitTaxApiBodyCore` 결과(배분·실제 양도 제외) — ⑫ Zod가 받는 것과 같은 모양
 */
export function previewExitTaxClassificationFromBody(
  body: Record<string, unknown>,
): ExitTaxClassificationPreview | null {
  try {
    const input = buildExitTaxEngineInput(body);
    const regime = isExitTaxFrom2027(input.departureDate) ? "from2027" : "pre2027";
    const computed = input.holdings.map((h) => calcHoldingResult(h));
    const cls = classifyExitTaxHoldings(input, regime, computed);
    return { buckets: cls.buckets, taxedIds: new Set(cls.taxedHoldings.map((h) => h.id)) };
  } catch {
    return null;
  }
}

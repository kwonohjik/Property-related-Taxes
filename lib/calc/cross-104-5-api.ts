/**
 * §104⑤ 크로스 합산 — 클라이언트 → `/api/calc/cross-104-5` (C-3c)
 *
 * ⚠️ **세율은 서버가 연도별로 로드한다.** §55① 누진표는 `effective_date`가 1990·2018·2021·현행
 *   넷이라 클라이언트 정적 상수를 쓰면 과거 연도가 조용히 틀린다(라우트 헤더 참조).
 */
import type { CrossSide } from "./cross-104-5-adapter";
import type { Cross1045Result } from "@/lib/tax-engine/comparative-104-5-cross";

export interface CrossCalcResponse extends Cross1045Result {
  input: {
    totalTaxBase: number;
    realEstateClause1TaxBase: number;
    otherAssetClause1TaxBase: number;
    clause8TaxBase: number;
    clause9TaxBase: number;
    otherClausesTax: number;
  };
  /** 두 계산기가 각각 낸 §104⑤2호의 단순합 = 「현행(교차 미적용)」 */
  currentSum: number;
  /** `calculatedTax − currentSum` */
  difference: number;
}

export async function callCross1045API(args: {
  taxYear: number;
  realEstate: CrossSide;
  otherAsset: CrossSide;
}): Promise<CrossCalcResponse> {
  const res = await fetch("/api/calc/cross-104-5", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as CrossCalcResponse;
}

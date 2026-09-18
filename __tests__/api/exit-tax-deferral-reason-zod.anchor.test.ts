/**
 * anchor: §118의16 납부유예 — **기본 5년(사유 미선택)도 Zod 를 통과한다**
 *
 * 제보 —「국외전출세 납부유예(§118의16) 행 추가해」를 구현하던 중 실측으로 드러난 결함.
 *
 * ## 실측 (E2E probe)
 *
 * 납부유예 토글만 켜고 계산하면 화면에 「계산 오류 / Validation failed」만 뜬다:
 *
 * ```
 * {"path":["deferralReason"],"message":"납부유예 신청 시 유예 사유를 선택하세요"}
 * ```
 *
 * ## 세 층이 서로 달랐다
 *
 * | 층 | `deferralRequested=true` + `reason="none"` |
 * |---|---|
 * | UI (`ExitTaxSettlementBlock`) | **정당한 선택지**로 제시 — 「일반 사유 (5년 유예)」가 `"none"`에 매핑된다 |
 * | 클라이언트 validate | **허용** (「기본 5년("none") 포함 모든 값 허용」) |
 * | 엔진 (`exit-tax.ts:400`) | **5년으로 처리** (`study_abroad \|\| other_10yr` 가 아니면 5년) |
 * | Zod (`stock-transfer-exit-tax-schema.ts`) | 🔴 **거부** |
 *
 * 법령도 5년이 원칙이다 — §118의16② 「출국일부터 **5년**(국외전출자의 국외유학 등 대통령령으로
 * 정하는 사유에 해당하는 경우에는 10년으로 한다) 이내에 …」. 10년이 예외다.
 * ⇒ Zod refine 이 과도했다.
 *
 * ⚠️ 클라이언트 validate 주석은 「Zod도 동일 허용」이라고 **단언**하고 있었다 — 확인되지 않은
 *   단언이 주석으로 굳으면 그 갭을 아무도 다시 보지 않는다.
 */

import { describe, it, expect } from "vitest";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-exit-tax-schema";

/** 최소 유효 입력 — 납부유예 축만 케이스별로 바꾼다. */
function makeInput(over: Record<string, unknown> = {}) {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 10,
    departureDate: "2025-06-01",
    isMajorShareholder: true,
    holdings: [
      {
        id: "h1",
        stockName: "삼성전자",
        marketType: "kospi",
        shareCount: 1000,
        acquisitionDate: "2020-01-02",
        perShareAcquisitionPrice: 50000,
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: 80000,
      },
    ],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    ...over,
  };
}

describe("§118의16 납부유예 — deferralReason Zod", () => {
  it("DZ-1: 신청 + 사유 미선택(none) 은 **통과**한다 (§118의16② 기본 5년)", () => {
    const r = exitTaxInputSchema.safeParse(
      makeInput({ deferralRequested: true, deferralReason: "none" }),
    );
    expect(
      r.success,
      r.success ? "" : JSON.stringify(r.error.issues),
    ).toBe(true);
  });

  it("DZ-2: 10년 사유도 통과한다 (회귀 방지)", () => {
    for (const reason of ["study_abroad", "other_10yr"]) {
      const r = exitTaxInputSchema.safeParse(
        makeInput({ deferralRequested: true, deferralReason: reason }),
      );
      expect(r.success, `${reason}: ${r.success ? "" : JSON.stringify(r.error.issues)}`).toBe(true);
    }
  });

  it("DZ-3: 미신청 + none 도 통과한다 (기본 상태)", () => {
    expect(exitTaxInputSchema.safeParse(makeInput()).success).toBe(true);
  });

  it("DZ-4: enum 밖의 값은 여전히 거부한다 (게이트가 느슨해진 게 아니다)", () => {
    const r = exitTaxInputSchema.safeParse(
      makeInput({ deferralRequested: true, deferralReason: "default_5yr" }),
    );
    expect(r.success).toBe(false);
  });
});

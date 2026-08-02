/**
 * anchor: §40 전환사채등 — **목(目) 선택 + 공모 발행 적용제외**
 *
 * 계획서: docs/00-pm/convertible-bond-clause-public-offering.plan.md v1.1
 *
 * ── 법문 실측 (KoreanLaw MCP 본문, 2026-08-02 · MST 276123/283637) ──────────
 * 「상증법」§40①1호나목 괄호:
 *   「전환사채등을 발행한 법인(「자본시장과 금융투자업에 관한 법률」에 따른 **주권상장법인으로서**
 *    같은 법 **§9⑦ 유가증권의 모집방법**(대통령령으로 정하는 경우를 제외한다)으로 전환사채등을
 *    **발행**한 법인은 **제외**한다. **이하 이 항에서 같다**)」
 * 「상증령」§30④: 「1호나목의 "대통령령으로 정하는 경우" = 자본시장법 시행령 **§11③**」= 간주모집
 *
 * ⇒ **이중부정**: 공모 발행이면 제외(과세 없음) → 그 모집이 §11③ 간주모집이면 제외 취소(과세).
 *
 * ⭐ **적용 범위는 §40① 전체가 아니다.** 「이하 이 항에서 같다」는 「**전환사채등을 발행한 법인**」이라는
 *    **용어 정의**에 붙으므로, 그 용어가 등장하는 **1호 나·다목 + 2호 나·다목**에만 걸린다.
 *    1호가·2호가(특수관계인으로부터 취득)·2호라·3호(양도)에는 **미적용**이다.
 *    (§39①은 괄호가 「배정」이라는 **행위**에 붙어 항 전체에 걸렸다 — 구조가 다르다.)
 *
 * ⭐⭐ **목은 계산 규칙이 아니라 해당성(분류) 규칙**이다. 「상증령」§30①1이 「제1호 **각 목**」을,
 *    §30①2가 「제2호 **가목부터 다목까지**」를 각각 **한 산식**으로 묶는다.
 *    ⇒ 목 선택 도입만으로는 **세액이 1원도 바뀌지 않는다**(CB-PO-5가 고정).
 *
 * ⚠️ 2호 anchor는 `listedMarketAvg`를 **주지 않는다** — `applyListedPerShareBound`가 `avg <= 0`에서
 *    이론주가를 그대로 반환하므로 「상증령」§30⑤1 Min 단서 효과가 0이 되어, 공모 제외 효과만
 *    분리 관측된다(계획서 §5).
 */
import { describe, it, expect } from "vitest";
import { calcConvertibleBondGift } from "@/lib/tax-engine/gift-deemed/convertible-bond";
import type { ConvertibleBondInput } from "@/lib/tax-engine/gift-deemed/types";

/** 1호 인수·취득 기준 픽스처 — 시가 10억 − 취득 6억 = 400,000,000 (기준금액 MIN(3억,1억)=1억 초과) */
function acq(over: Partial<ConvertibleBondInput> = {}): ConvertibleBondInput {
  return {
    caseType: "acquisition",
    bondMarketValue: 1_000_000_000,
    acquisitionPrice: 600_000_000,
    ...over,
  };
}

/**
 * 2호 주식전환 기준 픽스처 — 교부주식가액 = (20,000×100,000 + 10,000×50,000) ÷ 150,000 = 16,666
 * (16,666 − 10,000) × 50,000 = 333,300,000 (기준 1억 초과)
 */
function conv(over: Partial<ConvertibleBondInput> = {}): ConvertibleBondInput {
  return {
    caseType: "conversion",
    bondMarketValue: 0,
    preConvPrice: 20_000,
    preConvShares: 100_000,
    conversionPrice: 10_000,
    increasedShares: 50_000,
    ...over,
  };
}

const LISTED_PO = { isListed: true, issuanceMethod: "public_offering" } as const;

describe("§40①1호 — 공모 발행 적용제외", () => {
  it("CB-PO-1 ⭐: 나목 + 상장 + 공모발행 → **과세 없음**", () => {
    expect(calcConvertibleBondGift(acq({ clause: "major_excess" })).deemedGiftValue).toBe(400_000_000);

    const r = calcConvertibleBondGift(acq({ clause: "major_excess", ...LISTED_PO }));
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("모집방법");
    expect(r.exclusionReason).toContain("§40①");
  });

  it("CB-PO-2: 나목 + 상장 + **간주모집**(자시령 §11③) → 제외 취소되어 과세", () => {
    const r = calcConvertibleBondGift(
      acq({ clause: "major_excess", isListed: true, issuanceMethod: "deemed_public_offering" }),
    );
    expect(r.deemedGiftValue).toBe(400_000_000); // normal과 같은 값
    expect(r.applied).toBe(true);
    // 세액은 같아도 「공모였으나 간주모집이라 과세」를 남긴다(감사 추적성)
    expect(JSON.stringify(r.breakdown)).toContain("간주모집");
  });

  it("CB-PO-3 ⭐: **가목**은 상장 + 공모발행이어도 **불변** (「4개 목뿐」)", () => {
    // 1호가목 = 「특수관계인으로부터 취득」 — 「발행한 법인」이 등장하지 않아 제외가 걸리지 않는다.
    const r = calcConvertibleBondGift(acq({ clause: "from_related", ...LISTED_PO }));
    expect(r.deemedGiftValue).toBe(400_000_000);
    expect(r.applied).toBe(true);
  });

  it("CB-PO-4 ⭐: 나목 + **비상장** + 공모발행 → 불변 (「주권상장법인으로서」 AND 조건)", () => {
    const r = calcConvertibleBondGift(
      acq({ clause: "major_excess", isListed: false, issuanceMethod: "public_offering" }),
    );
    expect(r.deemedGiftValue).toBe(400_000_000);
    expect(r.applied).toBe(true);
  });

  it("CB-PO-5 ⭐⭐: 가·나·다 **3목이 같은 입력에서 같은 값** (「상증령」§30①1 「각 목」)", () => {
    // 목은 해당성 규칙이지 계산 규칙이 아니다 — 목 선택 도입이 세액을 바꾸지 않음을 엔진이 확증한다.
    const values = (["from_related", "major_excess", "major_related_nonshareholder"] as const).map(
      (clause) => calcConvertibleBondGift(acq({ clause })).deemedGiftValue,
    );
    expect(values).toEqual([400_000_000, 400_000_000, 400_000_000]);
  });

  it("CB-PO-5b ⭐: **다목**도 상장 + 공모발행이면 제외된다", () => {
    const r = calcConvertibleBondGift(acq({ clause: "major_related_nonshareholder", ...LISTED_PO }));
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
});

describe("§40①2호 — 주식전환에도 나·다목만 걸린다", () => {
  it("CB-PO-6: 나목 + 상장 + 공모발행 → 333,300,000 → **0**", () => {
    expect(calcConvertibleBondGift(conv({ clause: "major_excess" })).deemedGiftValue).toBe(333_300_000);

    const r = calcConvertibleBondGift(conv({ clause: "major_excess", ...LISTED_PO }));
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });

  it("CB-PO-6b ⭐: 2호 **가목**은 불변 (§30⑤1 Min 단서 혼입 없음도 함께 고정)", () => {
    // listedMarketAvg 미지정 ⇒ applyListedPerShareBound가 이론주가 반환 ⇒ Min 단서 효과 0
    const r = calcConvertibleBondGift(conv({ clause: "from_related", ...LISTED_PO }));
    expect(r.deemedGiftValue).toBe(333_300_000);
  });
});

describe("게이트가 걸리지 않는 경로 — 3방향 차단", () => {
  it("CB-PO-7 ⭐: **라목**(conversion_reverse)은 발행방법 필드를 넣어도 불변", () => {
    // 2호라목 = 「교부받은 주식의 가액이 전환가액등보다 낮게 됨으로써…」 — 「발행한 법인」 미등장.
    const base: ConvertibleBondInput = {
      caseType: "conversion_reverse",
      bondMarketValue: 0,
      preConvPrice: 10_000,
      preConvShares: 100_000,
      conversionPrice: 30_000,
      increasedShares: 50_000,
      relatedPreRatio: { numer: 50, denom: 100 },
    };
    const before = calcConvertibleBondGift(base).deemedGiftValue;
    expect(before).toBeGreaterThan(0); // 전제 고정
    expect(calcConvertibleBondGift({ ...base, clause: "major_excess", ...LISTED_PO }).deemedGiftValue).toBe(
      before,
    );
  });

  it("CB-PO-8 ⭐: **3호 양도**도 불변", () => {
    // 3호 = 「특수관계인에게 양도」 — 「발행한 법인」 미등장.
    const base: ConvertibleBondInput = {
      caseType: "transfer",
      bondMarketValue: 1_000_000_000,
      transferPrice: 1_400_000_000,
    };
    expect(calcConvertibleBondGift(base).deemedGiftValue).toBe(400_000_000);
    expect(calcConvertibleBondGift({ ...base, clause: "major_excess", ...LISTED_PO }).deemedGiftValue).toBe(
      400_000_000,
    );
  });

  it("CB-PO-9 ⭐: `clause`·`issuanceMethod` **미지정**은 기존 동작 그대로 (순수 additive)", () => {
    expect(calcConvertibleBondGift(acq()).deemedGiftValue).toBe(400_000_000);
    expect(calcConvertibleBondGift(conv()).deemedGiftValue).toBe(333_300_000);
    // 상장만 켜고 발행방법 미지정 → 제외되지 않는다
    expect(calcConvertibleBondGift(acq({ clause: "major_excess", isListed: true })).deemedGiftValue).toBe(
      400_000_000,
    );
  });
});

describe("CB-PO-10 회귀 — 증여세 연계 플래그 보존", () => {
  it("제외 결과도 호별 aggregationExcluded·연대납부 면제를 유지한다", () => {
    // §40 전 경로가 withGiftFlags를 통과한다 — 제외 결과만 래퍼를 빠뜨리면 플래그가 침묵 소실된다.
    const r1 = calcConvertibleBondGift(acq({ clause: "major_excess", ...LISTED_PO }));
    expect(r1.aggregationExcluded).toBe(false); // §40①1호 = 일반 합산
    expect(r1.donorJointLiabilityExempt).toBe(true); // §4의2⑥ = §40 전체
    expect(r1.thresholdEcho).toEqual({ gain: 0 });

    const r2 = calcConvertibleBondGift(conv({ clause: "major_excess", ...LISTED_PO }));
    expect(r2.aggregationExcluded).toBe(true); // §40①2호 = 합산배제
    expect(r2.donorJointLiabilityExempt).toBe(true);
  });
});

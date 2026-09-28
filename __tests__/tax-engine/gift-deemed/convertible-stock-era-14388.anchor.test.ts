/**
 * anchor: §39①3호 전환주식 — 「상증법」 법률 제14388호(2016.12.20) 부칙 §5② 시기 게이트 (#25)
 *
 * 부칙 원문(개정본 MST 188353, DRF target=law 실독 2026-09-28):
 *   「② 제39조제1항제3호의 개정규정은 이 법 시행 이후 **신주를 발행하는 경우**부터 적용한다.」
 *   시행일 = 2017.1.1.(부칙 §1 본문).
 * ⇒ 기준일은 **전환일(증여일)이 아니라 전환주식 발행일**이다. 2017-01-01 전에 발행된 전환주식은
 *    전환이 그 뒤에 일어나도 §39①3호가 걸리지 않는다.
 *
 * 두 번째 축 — 상증령 대통령령 제27835호(2017.2.7.) 부칙 §2 「이 영 시행 이후 … 증여받는 분부터」.
 *   증여일(§29①2호 전환한 날)과 계산방법(§29②6호)이 이 영으로 신설됐다(MST 191562 실독).
 *   발행이 2017년이어도 전환이 2017-02-07 전이면 산식 규정이 없다.
 * 두 구간 모두 **계산하지 않고 차단**한다(eraBlocked — §45의3 선례). 현행 산식 금액은 그 구간에서
 * 법적 의미가 없으므로 「제외 전 산출 이익」으로도 남기지 않는다.
 *
 * 픽스처는 [CS-1]과 같다 — 전환 33,330,000 − 발행 20,000,000 = 13,330,000.
 */
import { describe, it, expect } from "vitest";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import type { ConvertibleStockInput } from "@/lib/tax-engine/gift-deemed/types";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

function input(issuedOn: string | undefined, over: Partial<ConvertibleStockInput["atConversion"]> = {}): ConvertibleStockInput {
  return {
    atConversion: {
      preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 50_000, forfeitedShares: 10_000, giftDate: utc("2025-03-15"), ...over,
    },
    atIssuance: {
      preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 7_000,
      issuedShares: 50_000, forfeitedShares: 10_000,
      giftDate: issuedOn ? utc(issuedOn) : undefined,
    },
  };
}

describe("[CSE] §39①3호 행위시법 — 법률 부칙 §5②(발행일) · 시행령 부칙 §2(전환일)", () => {
  it("[CSE-1] 🔴 발행 2016-12-31 · 전환 2025 → 차단(법률 부칙 §5②) — 계산하지 않는다", () => {
    const r = calcConvertibleStockGift(input("2016-12-31"));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.eraBlocked).toBe(true);
    expect(r.exclusionReason).toContain("법률 제14388호 부칙 §5②");
    expect(r.breakdown).toHaveLength(0);
    expect(r.thresholdEcho).toBeUndefined();
  });

  it("[CSE-2] 긍정 짝(경계) — 발행 2017-01-01 · 전환 2025 → 적용 13,330,000", () => {
    const r = calcConvertibleStockGift(input("2017-01-01"));
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(13_330_000);
    expect(r.exclusionReason).toBeUndefined();
    expect(r.eraBlocked).toBeUndefined();
  });

  it("[CSE-3] 날짜 미입력(leaf 호출) → 종전 동작(계산) 유지 — UI 경로는 ⑧이 필수화한다", () => {
    const r = calcConvertibleStockGift(input(undefined, { giftDate: undefined }));
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[CSE-4] 🔴 발행 2017-01-01 · 전환 2017-02-06 → 차단(시행령 부칙 §2 — 산식 신설 전)", () => {
    const r = calcConvertibleStockGift(input("2017-01-01", { giftDate: utc("2017-02-06") }));
    expect(r.applied).toBe(false);
    expect(r.eraBlocked).toBe(true);
    expect(r.exclusionReason).toContain("대통령령 제27835호 부칙 §2");
    expect(r.breakdown).toHaveLength(0);
  });

  it("[CSE-5] 긍정 짝(경계) — 전환 2017-02-07이면 적용 13,330,000", () => {
    const r = calcConvertibleStockGift(input("2017-01-01", { giftDate: utc("2017-02-07") }));
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[CSE-6] 두 축이 겹치면 법률 사유가 먼저 — 조문 자체가 걸리지 않는다", () => {
    const r = calcConvertibleStockGift(input("2016-06-01", { giftDate: utc("2017-01-15") }));
    expect(r.exclusionReason).toContain("법률 제14388호");
    expect(r.exclusionReason).not.toContain("27835");
  });

  it("[CSE-7] 영리법인 수증자여도 시기 사유가 우선한다", () => {
    const r = calcConvertibleStockGift(input("2016-12-31", { doneeIsForProfitCorp: true }));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("부칙");
    expect(r.exclusionReason).not.toContain("영리법인");
  });

  it("[CSE-8] router 경유 — §4의2③ 게이트가 시기 사유를 덮지 않는다", () => {
    const r = calcDeemedGift({ type: "convertible_stock", ...input("2016-12-31"), doneeIncomeOrCorporateTaxed: true });
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("부칙");
  });
});

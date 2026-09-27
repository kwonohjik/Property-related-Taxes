/**
 * 「상증법」§2 9호·§4의2①·③ — 수증자가 **영리법인**이면 증여세 납세의무자가 아니다.
 * §39 밖 **단일 수증자 13종**에 같은 규칙을 공통 게이트 한 곳으로 적용한다(7-12).
 *
 * 원문(현행 MST 276123):
 *   §2 9호 「"수증자"란 증여재산을 받은 거주자(… **비영리법인**을 포함한다) 또는 비거주자(…
 *          **비영리법인**을 포함한다)를 말한다.」 — 영리법인은 정의에 없다.
 *   §4의2② 「제45조의2에 따라 재산을 증여한 것으로 보는 경우(**명의자가 영리법인인 경우를
 *          포함한다**)에는 실제소유자가 … 증여세를 납부할 의무가 있다.」 — 명의신탁은 예외.
 *
 * 🔑 긍정 짝이 셋이다 — 토글 OFF(무변화) · §45의2(② 예외) · 명부형 4종(행별 축 미착수).
 *    어느 하나가 빠지면 「모든 유형에서 켜면 0」이라는 과잉 구현이 초록으로 통과한다.
 *
 * ⚠️ 금액은 0으로 만들지 않는다 — 결론 행의 **정의어만** 바꾼다(§31① 「증여재산가액」은
 *    과세대상 가액에 한정된 정의라 제외되면 그 이름이 성립하지 않는다). §39는 그 금액을
 *    「법인세법 시행령」§89⑥ 준용 익금이라 적지만, 그 준용은 §39·§29②에 한정이라
 *    공통 라벨에 그 주장을 싣지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { commonForProfitDoneeGateApplies } from "@/lib/tax-engine/gift-deemed/taxpayer-gate";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import type { DeemedGiftType } from "@/lib/tax-engine/gift-deemed/types";
import { FOR_PROFIT_DONEE_APPLIED as APPLIED } from "./for-profit-donee-applied.fixture";


const GATED = Object.keys(APPLIED) as DeemedGiftType[];

/** 과세대상 가액의 정의어 — 제외되면 어느 행도 이 이름을 가질 수 없다 */
const DEFINED_TERM = /증여재산가액|증여추정가액/;
const withCorp = (i: DeemedGiftInput) => ({ ...i, doneeIsForProfitCorp: true }) as DeemedGiftInput;

describe("§4의2①·③ 공통 게이트 — 단일 수증자 13종", () => {
  it("[FPD-0] 모집단: 공통 게이트가 켜지는 유형은 정확히 이 13종이다", () => {
    const ALL: DeemedGiftType[] = [
      ...GATED, "merger", "capital_decrease", "contribution", "excess_dividend",
      "nominee_trust", "related_corp", "specific_corp",
      "capital_increase", "capital_increase_allocation", "convertible_stock",
    ];
    expect(ALL).toHaveLength(23);
    expect(ALL.filter((t) => commonForProfitDoneeGateApplies(t)).sort()).toEqual([...GATED].sort());
  });

  it.each(GATED)("[FPD-1] %s — 영리법인 수증자면 과세 제외, 금액은 결론 행에 보존", (type) => {
    const base = calcDeemedGift(APPLIED[type]);
    expect(base.applied).toBe(true); // 전제: 과세되는 픽스처
    const r = calcDeemedGift(withCorp(APPLIED[type]));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("영리법인 수증자");
    expect(r.breakdown.some((b) => DEFINED_TERM.test(b.label))).toBe(false);
    const kept = r.breakdown.filter((b) => b.label.includes("제외 전"));
    expect(kept.some((b) => b.amount === base.deemedGiftValue)).toBe(true);
  });

  it.each(GATED)("[FPD-2] 긍정 짝: %s — 토글 OFF면 종전 결과 그대로", (type) => {
    const base = calcDeemedGift(APPLIED[type]);
    const off = calcDeemedGift({ ...APPLIED[type], doneeIsForProfitCorp: false } as DeemedGiftInput);
    expect(off.applied).toBe(base.applied);
    expect(off.deemedGiftValue).toBe(base.deemedGiftValue);
  });

  // 🔴 뮤테이션 CM8(「미입력을 영리법인으로」)이 살아남아 생긴 단언이다. 종전 긍정 짝은 명시적
  //    `false`만 넣어, **키는 있는데 값이 undefined**인 형태를 아무도 보지 않았다. 프로덕션 경로
  //    (API → JSON → Zod)에선 그 형태가 사라지지만 엔진 직접 호출에선 도달하고, 무엇보다
  //    `ForProfitDoneeAxis` 주석이 「미입력은 영리법인 아님」을 규칙으로 적어 두었다.
  it.each(GATED)("[FPD-8] 긍정 짝: %s — 미입력(undefined)은 영리법인이 아니다", (type) => {
    const base = calcDeemedGift(APPLIED[type]);
    const r = calcDeemedGift({ ...APPLIED[type], doneeIsForProfitCorp: undefined } as DeemedGiftInput);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
  });

  it("[FPD-3] 긍정 짝: §45의2 명의신탁 — ②가 실제소유자에게 납세의무를 지워 게이트 밖이다", () => {
    expect(commonForProfitDoneeGateApplies("nominee_trust")).toBe(false);
  });

  it.each(["merger", "capital_decrease", "contribution", "excess_dividend"] as DeemedGiftType[])(
    "[FPD-4] 긍정 짝: %s — 명부형이라 계산 단위 토글 하나로 판정하지 않는다",
    (type) => expect(commonForProfitDoneeGateApplies(type)).toBe(false),
  );

  it("[FPD-5] 요건 불성립으로 이미 미적용이면 엔진 자신의 사유를 덮지 않는다", () => {
    const below = { type: "org_change", subType: "value_change", baseValue: 1_000_000_000, preValue: 1_000_000_000, postValue: 1_010_000_000 } as DeemedGiftInput;
    const base = calcDeemedGift(below);
    expect(base.applied).toBe(false);
    const r = calcDeemedGift(withCorp(below));
    expect(r.exclusionReason).toBe(base.exclusionReason);
  });

  it("[FPD-6] ⑥ 표지는 제외돼도 남는다 — §35는 true, §34는 false (다른 축이다)", () => {
    expect(calcDeemedGift(withCorp(APPLIED.bargain_transfer)).donorJointLiabilityExempt).toBe(true);
    expect(calcDeemedGift(withCorp(APPLIED.insurance)).donorJointLiabilityExempt).toBe(false);
  });

  it("[FPD-7] §39는 자체 경로가 있어 공통 게이트가 겹치지 않는다", () => {
    expect(commonForProfitDoneeGateApplies("capital_increase")).toBe(false);
    expect(commonForProfitDoneeGateApplies("convertible_stock")).toBe(false);
    expect(commonForProfitDoneeGateApplies("capital_increase_allocation")).toBe(false);
  });
});

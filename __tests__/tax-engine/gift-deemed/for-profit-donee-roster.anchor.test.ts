/**
 * 「상증법」§2 9호·§4의2①·③ — 명부형 3종의 **행별** 축(7-13).
 * 수증자 행이 영리법인이면 그 행만 과세에서 빠진다. 같은 명부의 다른 수증자와,
 * 같은 사람이 **증여자로서** 갖는 몫은 그대로다.
 *
 * 수증자 행이 무엇인지는 유형마다 다르다:
 *   §38   합병 매트릭스   — `shareholders.overvalued`(과대평가=이익측). undervalued는 증여자.
 *   §39의2 감자 멀티      — 저가면 잔존주주, **고가면 감자주주**가 수증자다(엔진이 저가/고가를
 *                           자동 판정 — 같은 배열에서 역할이 뒤바뀐다).
 *   §39의3 현물출자 명부  — **고가만** parties가 수증자. 저가 parties는 증여자다
 *                           (저가의 수증자는 현물출자자 1인 — 명부 밖).
 *
 * 🔑 긍정 짝 — 증여자 행에 붙은 표지는 **무효**여야 한다. 그렇지 않으면 「명부의 아무 행이나
 *    영리법인이면 뺀다」는 과잉 구현이 초록으로 통과한다.
 * ⚠️ §41의2 초과배당은 이 축에 없다 — 엔진이 특수관계인 행을 **합산**해 행별 결과가 없다.
 */
import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/gift-deemed-input-types";
import { mergerInput, cdInput, cdHighInput, conInput } from "./for-profit-donee-roster.fixture";

const REASON = /영리법인 수증자/;
const DEFINED_TERM = /증여재산가액/;
const run = (i: unknown) => calcDeemedGift(i as DeemedGiftInput);

describe("§38 합병 매트릭스 — 과대평가(이익측) 주주 행", () => {
  it("[RFP-M0] 전제: 표지 없으면 갑 400,000,000 + 병 600,000,000 = 1,000,000,000", () => {
    const r = run(mergerInput());
    expect(r.deemedGiftValue).toBe(1_000_000_000);
    expect(r.mergerMatrix!.recipients.every((x) => x.applied)).toBe(true);
  });

  it("[RFP-M1] 갑이 영리법인 → 갑만 제외, 병 600,000,000은 그대로", () => {
    const r = run(mergerInput(["gap"]));
    const gap = r.mergerMatrix!.recipients.find((x) => x.id === "gap")!;
    const byung = r.mergerMatrix!.recipients.find((x) => x.id === "byung")!;
    expect(gap.applied).toBe(false);
    expect(gap.excludedReason).toMatch(REASON);
    expect(gap.netGain).toBe(400_000_000); // 이익 자체는 보존
    expect(byung.applied).toBe(true);
    expect(byung.netGain).toBe(600_000_000);
    expect(r.deemedGiftValue).toBe(600_000_000);
    expect(r.mergerMatrix!.totalDeemedGift).toBe(600_000_000);
    expect(r.applied).toBe(true);
  });

  it("[RFP-M2] 제외된 행은 정의어(증여재산가액)를 달지 않고, 금액은 「제외 전」으로 남는다", () => {
    const r = run(mergerInput(["gap"]));
    const rows = r.breakdown.filter((b) => b.label.startsWith("갑"));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).not.toMatch(DEFINED_TERM);
    expect(rows[0].label).toContain("제외 전");
    expect(rows[0].amount).toBe(400_000_000);
  });

  it("[RFP-M3] 전원 영리법인 → 과세 없음, 사유는 영리법인(기준금액 미만이 아니다)", () => {
    const r = run(mergerInput(["gap", "byung"]));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toMatch(REASON);
    expect(r.exclusionReason).not.toContain("기준금액");
  });

  it("[RFP-M4] 긍정 짝: 증여자(과소평가법인) 행의 표지는 무효 — 결과 불변", () => {
    const base = run(mergerInput());
    const r = run(mergerInput([], ["gap", "eul"]));
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(r.mergerMatrix!.allocation).toEqual(base.mergerMatrix!.allocation);
  });

  it("[RFP-M5] 긍정 짝: 갑이 수증자로서 빠져도 증여자로서의 몫(병 ← 갑 300,000,000)은 그대로", () => {
    const r = run(mergerInput(["gap"]));
    expect(r.mergerMatrix!.allocation["byung"]["gap"]).toBe(300_000_000);
  });
});

const donee = (r: ReturnType<typeof run>, name: string) => r.capitalDecreaseMulti!.donees.find((d) => d.name === name)!;

describe("§39의2 감자 멀티 — 수증자 행 (저가=잔존주주 · 고가=감자주주)", () => {
  it("[RFP-D0] 전제: 표지 없으면 병·정 둘 다 과세", () => {
    const r = run(cdInput());
    expect(donee(r, "병").isTaxable).toBe(true);
    expect(donee(r, "정").isTaxable).toBe(true);
    expect(r.deemedGiftValue).toBe(donee(r, "병").total + donee(r, "정").total);
  });

  it("[RFP-D1] 병이 영리법인 → 병만 제외, 정은 그대로", () => {
    const base = run(cdInput());
    const r = run(cdInput(["병"]));
    expect(donee(r, "병").isTaxable).toBe(false);
    expect(donee(r, "병").nonTaxableReason).toMatch(REASON);
    expect(donee(r, "병").total).toBe(0);
    expect(donee(r, "병").potentialAmount).toBeGreaterThan(0); // 이익 자체는 참고 산출액으로 보존
    expect(donee(r, "정").total).toBe(donee(base, "정").total);
    expect(r.deemedGiftValue).toBe(donee(base, "정").total);
  });

  it("[RFP-D2] 전원 영리법인 → 과세 없음, 사유는 영리법인", () => {
    const r = run(cdInput(["병", "정"]));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toMatch(REASON);
  });

  it("[RFP-D3] 긍정 짝: 감자주주(증여자) 갑·을의 표지는 무효 — 결과 불변", () => {
    const base = run(cdInput());
    const r = run(cdInput(["갑", "을"]));
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(r.capitalDecreaseMulti!.donees).toEqual(base.capitalDecreaseMulti!.donees);
  });

  it("[RFP-D5] 고가소각이면 수증자는 **감자주주** — 병이 영리법인이면 병만 제외(정 60,000,000 그대로)", () => {
    const base = run(cdHighInput());
    expect(base.capitalDecreaseMulti!.caseType).toBe("high"); // 전제
    expect(donee(base, "병").isTaxable).toBe(true);
    const r = run(cdHighInput(["병"]));
    expect(donee(r, "병").isTaxable).toBe(false);
    expect(donee(r, "병").nonTaxableReason).toMatch(REASON);
    expect(donee(r, "정").total).toBe(60_000_000);
    expect(r.deemedGiftValue).toBe(60_000_000);
  });

  it("[RFP-D6] 긍정 짝: 고가소각의 잔존주주(증여자) 갑·을 표지는 무효 — 결과 불변", () => {
    const base = run(cdHighInput());
    const r = run(cdHighInput(["갑", "을"]));
    expect(r.capitalDecreaseMulti!.donees).toEqual(base.capitalDecreaseMulti!.donees);
  });

  it("[RFP-D4] 과세요건 미충족이 먼저다 — 소액주주(비특수관계)는 표지가 있어도 사유가 「비특수관계」", () => {
    const r = run(cdInput(["소액주주"]));
    expect(donee(r, "소액주주").nonTaxableReason).toBe("비특수관계");
  });
});

const party = (r: ReturnType<typeof run>, name: string) => r.contributionBreakdown!.find((p) => p.party === name)!;

describe("§39의3 현물출자 — 고가 명부(수증자) 행", () => {
  it("[RFP-C0] 전제: 표지 없으면 을 5,000,000 + 정 2,500,000", () => {
    const r = run(conInput("high"));
    expect(party(r, "을").value).toBe(5_000_000);
    expect(party(r, "정").value).toBe(2_500_000);
    expect(r.deemedGiftValue).toBe(7_500_000);
  });

  it("[RFP-C1] 을이 영리법인 → 을만 제외, 정 2,500,000은 그대로", () => {
    const r = run(conInput("high", ["을"]));
    expect(party(r, "을").value).toBe(0);
    expect(party(r, "을").excludedReason).toMatch(REASON);
    expect(party(r, "정").value).toBe(2_500_000);
    expect(party(r, "정").excludedReason).toBeUndefined();
    expect(r.deemedGiftValue).toBe(2_500_000);
    expect(r.thresholdEcho?.gain).toBe(2_500_000);
  });

  it("[RFP-C2] 제외된 행은 정의어 없이 「제외 전」 금액을 남긴다", () => {
    const r = run(conInput("high", ["을"]));
    const rows = r.breakdown.filter((b) => b.label.includes("을"));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toContain("제외 전");
    expect(rows[0].label).not.toMatch(DEFINED_TERM);
    expect(rows[0].amount).toBe(5_000_000);
  });

  it("[RFP-C3] 전원 영리법인 → 과세 없음, 사유는 영리법인", () => {
    const r = run(conInput("high", ["을", "정"]));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toMatch(REASON);
    expect(r.exclusionReason).not.toContain("기준금액");
  });

  it("[RFP-C4] 긍정 짝: 저가 명부는 **증여자** 명부 — 표지는 무효, 결과 불변", () => {
    const base = run(conInput("low"));
    const r = run(conInput("low", ["을", "정"]));
    expect(base.applied).toBe(true); // 전제: 과세되는 픽스처
    expect(r.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(r.contributionBreakdown).toEqual(base.contributionBreakdown);
  });
});

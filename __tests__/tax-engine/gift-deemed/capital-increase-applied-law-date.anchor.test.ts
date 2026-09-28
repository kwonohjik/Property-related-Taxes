/**
 * anchor: §39 3경로 적용 법령 기준일(#37·#94) + cap-table 간주모집 시기 게이트(#5 형제 경로)
 *
 * ① `appliedLawDate` — §39①은 증여일을 「주식대금 납입일 등 **대통령령으로 정하는 날**」로 전부 위임하고
 *    「상증령」§29①이 갈래를 정한다(A-11 법령 렌즈 정정). 엔진은 §29①에 따라 입력된 증여일을 echo한다.
 *    전환주식은 전환한 날(§29①2호) = 전환 leg의 날짜다.
 * ② `eraNotice` — §39·§29는 **2017.2.7. 이후 개정되지 않았다**(applicable_law 2017.01.02·2017.02.08
 *    「현행과 동일」 실측). 그 전 증여일에만 「현행 산식으로 계산 — 당시 조문 확인」을 고지한다.
 * ③ cap-table은 증여일이 ④·⑫·엔진 어디에도 없어 §29③ 시기 게이트(2016.2.5. 전 간주모집은 제외 유지 —
 *    단건 경로 #5)가 걸리지 않았다. 행에서 「간주모집」을 고를 수 있으므로 도달 가능하다.
 */
import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const single = (giftDate?: string, over: Record<string, unknown> = {}) =>
  calcCapitalIncreaseGift({
    preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
    issuedShares: 50_000, forfeitedShares: 10_000,
    giftDate: giftDate ? utc(giftDate) : undefined, ...over,
  });

describe("[AL] 단건 §39 — 적용 법령 기준일", () => {
  it("[AL-1] 🔴 증여일을 기준일로 echo — 2017.2.7. 이후면 시점 고지 없음", () => {
    const r = single("2025-03-15");
    expect(r.appliedLawDate).toBe("2025-03-15");
    expect(r.eraNotice).toBeUndefined();
  });

  it("[AL-2] 🔴 2017-02-06 → 현행 산식 계산 고지", () => {
    const r = single("2017-02-06");
    expect(r.appliedLawDate).toBe("2017-02-06");
    expect(r.eraNotice).toContain("2017.2.7.");
    expect(r.eraNotice).toContain("현행");
  });

  it("[AL-3] 긍정 짝(경계) — 2017-02-07은 고지 없음", () => {
    expect(single("2017-02-07").eraNotice).toBeUndefined();
  });

  it("[AL-4] 증여일 미입력(leaf) → 기준일 없음", () => {
    const r = single(undefined);
    expect(r.appliedLawDate).toBeUndefined();
    expect(r.eraNotice).toBeUndefined();
  });

  it("[AL-5] 🔴 배제 경로(영리법인 수증자)도 기준일을 남긴다", () => {
    const r = single("2025-03-15", { doneeIsForProfitCorp: true });
    expect(r.applied).toBe(false);
    expect(r.appliedLawDate).toBe("2025-03-15");
  });
});

describe("[AL-CS] 전환주식 — 기준일 = 전환한 날(§29①2호)", () => {
  const cs = (conv: string, issue: string) =>
    calcConvertibleStockGift({
      atConversion: { preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000, issuedShares: 50_000, forfeitedShares: 10_000, giftDate: utc(conv) },
      atIssuance: { preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 7_000, issuedShares: 50_000, forfeitedShares: 10_000, giftDate: utc(issue) },
    });

  it("[AL-6] 🔴 전환 leg의 날짜를 쓴다(발행일 아님)", () => {
    const r = cs("2025-03-15", "2020-06-01");
    expect(r.appliedLawDate).toBe("2025-03-15");
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[AL-7] 🔴 행위시법 차단 경로에도 기준일을 남긴다", () => {
    const r = cs("2025-03-15", "2016-12-31");
    expect(r.eraBlocked).toBe(true);
    expect(r.appliedLawDate).toBe("2025-03-15");
  });
});

/** A 전량 실권(60,000) · B가 재배정 60,000 인수 · 이론 ㉯ 15,000 → B 이익 300,000,000 */
const SH = (method?: "public_offering" | "deemed_public_offering"): CapShareholder[] => [
  { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
  { id: "B", name: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 100_000, reallocatedShares: 60_000, relatedTo: ["A"], ...(method ? { allocationMethod: method } : {}) },
];
const cap = (giftDate: string | undefined, method?: "public_offering" | "deemed_public_offering") =>
  calcCapitalIncreaseAllocation({
    direction: "low", preIssuePrice: 20_000, newSharePrice: 10_000, isListed: true,
    shareholders: SH(method), giftDate: giftDate ? utc(giftDate) : undefined,
  });
const bTotal = (r: ReturnType<typeof cap>) => r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total;

describe("[AL-CT] cap-table — 기준일 echo + §29③ 간주모집 시기 게이트", () => {
  it("[AL-CT1] 🔴 증여일을 기준일로 echo", () => {
    expect(cap("2025-03-15").appliedLawDate).toBe("2025-03-15");
    expect(cap("2016-06-01").eraNotice).toContain("2017.2.7.");
  });

  it("[AL-CT2] 🔴 2016-02-04 간주모집 → 「상증령」§29③ 신설 전이라 제외 유지 = 0", () => {
    const r = cap("2016-02-04", "deemed_public_offering");
    expect(bTotal(r)).toBe(0);
    expect(JSON.stringify(r.splits)).toContain("§39① 적용 제외");
  });

  it("[AL-CT3] 긍정 짝(경계) — 2016-02-05 간주모집은 제외 취소 = 과세 300,000,000", () => {
    expect(bTotal(cap("2016-02-05", "deemed_public_offering"))).toBe(300_000_000);
  });

  it("[AL-CT4] 증여일 미입력(leaf) → 종전 동작(제외 취소 = 과세)", () => {
    expect(bTotal(cap(undefined, "deemed_public_offering"))).toBe(300_000_000);
  });
});

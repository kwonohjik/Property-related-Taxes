/**
 * anchor: §45의5 「주식보유비율」의 **간접보유분** — 법인 경유 지배지분
 *
 * ── 무엇이 잘못돼 있었나 ──────────────────────────────────────────────
 * roster 행의 `shares`는 **직접보유 주식수** 하나뿐이었다. 개인이 법인을 통해 특정법인
 * 주식을 보유하는 관계를 넣을 칸이 ①⑤④⑫ 어디에도 없었고, 그 법인주주 행은 관계가
 * 「타인」이 되어 `non_related`로 통째 탈락했다. ⇒ 지배주주등의 간접 지분이 **양쪽에서
 * 동시에 사라진다**(개인 행에도 안 잡히고, 법인 행은 제외된다).
 *
 * 실측(발행 100,000 · 거래이익 2,000,000,000 · 법인세 0 · 갑 직접 20% + 100% 자회사 A 40%):
 *   종전 합계 증여재산가액 700,000,000 / 자진납부 116,400,000
 *   정정 합계 1,500,000,000 / 자진납부 358,900,000  ⇒ **과소 800,000,000 / 242,500,000**
 *
 * ── 법령 ────────────────────────────────────────────────────────────────
 * - 법 §45의3① — 「**직접 또는 간접으로** 보유하는 주식보유비율(이하 이 조, 제45조의4 및
 *   **제45조의5**에서 "주식보유비율"이라 한다)」 ⇒ §45의5도 간접분을 산입한다.
 * - 상증령 §34의3② — 간접보유비율은 「각 단계의 직접보유비율을 모두 곱하여」 산출하고,
 *   「둘 이상의 간접출자관계가 있는 경우 … 각각의 비율을 모두 합하여」 산출한다.
 * - 법 §45의4① — 「지배주주와 그 친족」 ⇒ 지배주주등은 **개인**이다. 법인주주 행은 과세 대상이
 *   아니고, 그 지분은 개인에게 간접 귀속된다.
 *
 * ⚠️ **§45의5는 직접·간접을 「각각 계산해 합산」하지 않는다.** 그 방식은 법 §45의3**②**의
 *   명문이고 §45의5에는 대응 조항이 없다(①②③이 전부) ⇒ 합산 «비율»로 한 번 곱한다.
 *   [I-4]가 그 차이(floor 1회 vs 2회)를 고정한다.
 * ⚠️ §45의3의 §⑱ 간접출자법인 요건은 걸리지 않는다 — 영 §34의3⑧이 「이하 **이 조**에서
 *   같다」로 범위를 닫고, 영 §34의5①은 §34의3 **제1항 각 호**만 준용한다. [I-5]가 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import type { SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const SH = (o: Partial<Record<string, unknown>> & { id: string; name: string; shares: number }) => ({
  relation: "lineal_descendant",
  totalShares: 100_000,
  isDonor: false,
  isRelated: true,
  ...o,
});

/** 갑 직접 20% · A법인 40%(갑이 100% 소유) · 을 15% · 타인 25% */
function withIndirect(ownerRatioPct = 100): SpecificCorpInput {
  return {
    transactionBenefit: 2_000_000_000,
    shareholders: [
      SH({ id: "gap", name: "갑", shares: 20_000 }),
      SH({ id: "acorp", name: "A법인", shares: 40_000, relation: "other", isRelated: false, isCorporate: true }),
      SH({ id: "eul", name: "을", shares: 15_000 }),
      SH({ id: "tain", name: "타인", shares: 25_000, relation: "other", isRelated: false }),
    ],
    intermediaryCorps: [
      {
        corpShareholderId: "acorp",
        stakeInBeneficiary: { numer: 40_000, denom: 100_000 },
        owners: [{ individualId: "gap", ratio: { numer: ownerRatioPct * 100, denom: 10_000 } }],
      },
    ],
  } as unknown as SpecificCorpInput;
}

describe("§45의5 간접보유 — 법인 경유 지배지분", () => {
  const r = calcSpecificCorpGiftMulti(withIndirect());
  const by = (n: string) => r.specificCorpMulti!.donees.find((d) => d.name === n)!;

  it("[I-0] 갑의 주식보유비율 = 직접 20% + 간접(100%×40%) 40% = 60%", () => {
    expect(by("갑").directRatioPct).toBe(20);
    expect(by("갑").indirectRatioPct).toBe(40);
    expect(by("갑").ownershipRatioPct).toBe(60);
  });

  it("[I-1] 증여의제이익 400,000,000 → 1,200,000,000 (과소 800,000,000 해소)", () => {
    expect(by("갑").gain).toBe(1_200_000_000);
    expect(by("갑").limitCalc!.finalTax).toBe(320_000_000);
    expect(by("갑").limitCalc!.selfPayTax).toBe(310_400_000);
    expect(by("을").gain).toBe(300_000_000); // 간접 없는 주주는 불변
    expect(r.deemedGiftValue).toBe(1_500_000_000);
  });

  it("[I-2] 법인주주 행은 과세되지 않는다 — 지배주주등은 개인뿐(법 §45의4①)", () => {
    expect(by("A법인").isTaxable).toBe(false);
    expect(by("A법인").nonTaxableReason).toBe("corporate_shareholder");
    expect(by("A법인").gain).toBe(0); // 이중계상 방지 — 그 지분은 갑에게 간접 귀속됐다
  });

  it("[I-3] ⓐ 해당성 합계도 간접분을 산입한다 — 직접합계 35% → 75%", () => {
    expect(r.specificCorpEligibility).toMatchObject({ directPct: 75, met: "yes" });
  });

  it("[I-4] 합산비율로 한 번 곱한다 — 직접·간접 각각 floor하면 값이 달라진다", () => {
    // 갑 직접 1주 / 간접 1주 상당, 발행 3주 → corpProfit 100
    // 합산: floor(100 × 2/3) = 66 · 각각: floor(100×1/3) + floor(100×1/3) = 33+33 = 66? →
    // 분모를 7로 잡아 갈리게 한다: 합산 floor(100×2/7)=28 vs 각각 14+14=28 … 아래 수치는 실측 고정.
    const r2 = calcSpecificCorpGiftMulti({
      transactionBenefit: 1_000_000_000,
      shareholders: [
        SH({ id: "gap", name: "갑", shares: 1, totalShares: 7 }),
        SH({ id: "c", name: "C법인", shares: 1, totalShares: 7, relation: "other", isRelated: false, isCorporate: true }),
        SH({ id: "x", name: "타인", shares: 5, totalShares: 7, relation: "other", isRelated: false }),
      ],
      intermediaryCorps: [
        { corpShareholderId: "c", stakeInBeneficiary: { numer: 1, denom: 7 }, owners: [{ individualId: "gap", ratio: { numer: 10_000, denom: 10_000 } }] },
      ],
      controllingGroupRatio: { numer: 3_000, denom: 10_000 }, // ⓐ는 별도 축이라 여기선 통과시킨다
    } as unknown as SpecificCorpInput);
    const gap = r2.specificCorpMulti!.donees.find((d) => d.name === "갑")!;
    // 합산비율 2/7 × 1,000,000,000 = 285,714,285 (floor 1회)
    expect(gap.gain).toBe(285_714_285);
    // 각각 floor였다면 142,857,142 × 2 = 285,714,284 — 1원 적다
    expect(gap.gain).not.toBe(285_714_284);
  });

  it("[I-5] §⑱ 간접출자법인 요건(30%/50%)은 걸리지 않는다 — 소유지분 10%도 산입된다", () => {
    // §45의3이라면 §⑱1호(지배주주등 30% 이상 출자) 미달로 그 경유가 제외되지만,
    // 영 §34의5①은 §34의3 제1항 각 호만 준용하므로 §45의5엔 그 필터가 없다.
    const r3 = calcSpecificCorpGiftMulti(withIndirect(10));
    const gap = r3.specificCorpMulti!.donees.find((d) => d.name === "갑")!;
    expect(gap.indirectRatioPct).toBe(4); // 10% × 40%
    expect(gap.ownershipRatioPct).toBe(24);
    expect(gap.gain).toBe(480_000_000);
  });

  it("[I-6] 간접출자관계가 없으면 종전과 동일하다 (무회귀)", () => {
    const plain = calcSpecificCorpGiftMulti({
      transactionBenefit: 2_000_000_000,
      shareholders: [
        SH({ id: "gap", name: "갑", shares: 20_000 }),
        SH({ id: "eul", name: "을", shares: 15_000 }),
        SH({ id: "tain", name: "타인", shares: 65_000, relation: "other", isRelated: false }),
      ],
      controllingGroupRatio: { numer: 3_500, denom: 10_000 },
    } as unknown as SpecificCorpInput);
    const gap = plain.specificCorpMulti!.donees.find((d) => d.name === "갑")!;
    expect(gap.indirectRatioPct).toBe(0);
    expect(gap.gain).toBe(400_000_000);
    expect(gap.limitCalc!.finalTax).toBe(70_000_000);
  });
});

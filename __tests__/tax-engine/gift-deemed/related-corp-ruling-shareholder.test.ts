/**
 * 상증령 §34의3① 지배주주 판정 — 1호/2호 분기 (W14 · RC-1-g).
 *
 * 조문은 **최고 직접보유자가 개인인지 법인인지**로 갈린다:
 *   1호 「… 최대주주등 중에서 그 법인에 대한 **직접보유비율이 가장 높은 자가 개인**인 경우에는
 *        **그 개인**」
 *   2호 「… 가장 높은 자가 **법인**인 경우에는 그 법인에 대한 직접보유비율과 간접보유비율을
 *        모두 합하여 계산한 비율이 가장 높은 개인」
 *
 * 종전 코드는 2호의 알고리즘(직접+간접 최대)을 **무조건** 적용했다.
 *
 * ⚠️ 세액 영향은 0이다 — 이 값은 표시 전용이고, 세액 경로인 `rulingGroupIds`는 relation으로
 *    정해진다. 그래도 화면이 법과 다른 사람을 「지배주주」로 지목하는 것은 표시층 모순이다.
 * ⚠️ 모집단은 「해당 법인의 **최대주주등**」(법 §19② 그룹)이다 — 지배주주와의 관계가 `other`인
 *    개인도 포함될 수 있으므로 relation으로 걸러서는 안 된다([RS-3]).
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });

const base = {
  enterpriseSize: "small" as const,
  totalSales: 100_000_000_000,
  preTaxAdjOperatingIncome: 10_000_000_000,
  taxableIncome: 10_000_000_000,
  corporateTaxNet: 2_000_000_000,
  salesPartners: [
    { id: "D", name: "D", salesAmount: 80_000_000_000, isRelated: true },
    { id: "E", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
  ],
};

describe("§34의3①1호 — 최고 직접보유자가 개인이면 그 개인이다", () => {
  it("[RS-0] 갑 직접 40% / 을 직접 20% + 간접 30%(합 50%) → 지배주주는 «갑»", () => {
    // 종전 엔진은 합계가 큰 «을»을 지목했다. 1호는 **직접**보유비율만 본다.
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(40), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(20), isCorporate: false },
        { id: "B", name: "B법인", relation: "other", directRatio: R(30), isCorporate: true },
        { id: "x", name: "소액", relation: "other", directRatio: R(10), isCorporate: false },
      ],
      intermediaryCorps: [
        { corpShareholderId: "B", stakeInBeneficiary: R(30), owners: [{ individualId: "eul", ratio: R(100) }] },
      ],
    };
    expect(calcRelatedCorpGift(inp).rulingShareholder).toBe("갑");
  });
});

describe("§34의3①2호 — 최고 직접보유자가 법인이면 직접+간접 합계 최대 개인이다", () => {
  it("[RS-1] B법인 직접 50%(최고) → 합계가 가장 큰 «을»", () => {
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(10), isCorporate: false },
        { id: "B", name: "B법인", relation: "other", directRatio: R(50), isCorporate: true },
        { id: "x", name: "소액", relation: "other", directRatio: R(20), isCorporate: false },
      ],
      intermediaryCorps: [
        { corpShareholderId: "B", stakeInBeneficiary: R(50), owners: [{ individualId: "eul", ratio: R(80) }] },
      ],
    };
    // 을 = 직접 10% + 간접 40% = 50% > 갑 20%
    expect(calcRelatedCorpGift(inp).rulingShareholder).toBe("을");
  });

  it("[RS-2] 1호와 2호가 «다른 사람»을 지목한다 — 분기가 실제로 결과를 가른다", () => {
    const shared = {
      ...base,
      intermediaryCorps: [
        { corpShareholderId: "B", stakeInBeneficiary: R(30), owners: [{ individualId: "eul", ratio: R(100) }] },
      ],
    };
    // 갑 직접 40% > B법인 30% → 1호 ⇒ 갑
    const clause1 = calcRelatedCorpGift({
      ...shared,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(40), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(20), isCorporate: false },
        { id: "B", name: "B법인", relation: "other", directRatio: R(30), isCorporate: true },
        { id: "x", name: "소액", relation: "other", directRatio: R(10), isCorporate: false },
      ],
    });
    // B법인 45% > 갑 25% → 2호 ⇒ 합계 최대 개인(을 = 20 + 13.5 = 33.5% > 갑 25%)
    const clause2 = calcRelatedCorpGift({
      ...shared,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(25), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(20), isCorporate: false },
        { id: "B", name: "B법인", relation: "other", directRatio: R(45), isCorporate: true },
        { id: "x", name: "소액", relation: "other", directRatio: R(10), isCorporate: false },
      ],
    });
    expect(clause1.rulingShareholder).toBe("갑");
    expect(clause2.rulingShareholder).toBe("을");
  });

  it("[RS-3] relation이 `other`인 개인도 지배주주가 될 수 있다 — 모집단은 「최대주주등」이다", () => {
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(15), isCorporate: false },
        { id: "z", name: "무관개인", relation: "other", directRatio: R(65), isCorporate: false },
      ],
      intermediaryCorps: [],
    };
    expect(calcRelatedCorpGift(inp).rulingShareholder).toBe("무관개인");
  });
});

describe("동점은 임의로 고르지 않는다", () => {
  it("[RS-4] 최고 직접보유자가 둘이면 「판정 불가」를 표시한다 (상증칙 §10의7 순서 축 부재)", () => {
    // 조문은 「경영에 관한 사실상의 영향력이 더 큰 자로서 **재정경제부령으로 정하는 자**」로
    // 넘긴다. 그 축이 없으므로 조용히 1순위를 고르면 근거 없는 단정이 된다.
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(40), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(40), isCorporate: false },
        { id: "x", name: "소액", relation: "other", directRatio: R(20), isCorporate: false },
      ],
      intermediaryCorps: [],
    };
    const r = calcRelatedCorpGift(inp).rulingShareholder;
    expect(r).toContain("판정 불가");
    expect(r).toContain("§10의7");
  });

  it("[RS-5] 긍정 짝 — 동점이 아니면 그대로 지목한다", () => {
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(41), isCorporate: false },
        { id: "eul", name: "을", relation: "relative", directRatio: R(40), isCorporate: false },
        { id: "x", name: "소액", relation: "other", directRatio: R(19), isCorporate: false },
      ],
      intermediaryCorps: [],
    };
    expect(calcRelatedCorpGift(inp).rulingShareholder).toBe("갑");
  });
});

describe("RC-5-d — 과세요건 충족인데 이익 0이면 «왜 0인지»가 화면에 남는다", () => {
  it("[D-7] 수증자가 없으면(한계보유비율 이하) 사유가 채워진다", () => {
    // 종전에는 이 분기에 `exclusionReason`이 없어, `!applied && exclusionReason` 배너도
    // `applied` 전용 CTA도 **둘 다 사라졌다** — 설명하는 문구가 한 줄도 없었다.
    const inp: RelatedCorpInput = {
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(5), isCorporate: false },
        { id: "x", name: "기타", relation: "other", directRatio: R(95), isCorporate: false },
      ],
      intermediaryCorps: [],
    };
    const r = calcRelatedCorpGift(inp);
    expect(r.taxRequirementMet).toBe(true); // 요건은 충족이다
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("한계보유비율");
    expect(r.exclusionReason).toContain("§34의3⑧⑨");
  });

  it("[D-8] 긍정 짝 — 이익이 있으면 사유를 만들지 않는다", () => {
    const r = calcRelatedCorpGift({
      ...base,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(60), isCorporate: false },
        { id: "x", name: "기타", relation: "other", directRatio: R(40), isCorporate: false },
      ],
      intermediaryCorps: [],
    });
    expect(r.applied).toBe(true);
    expect(r.exclusionReason).toBeUndefined();
  });
});

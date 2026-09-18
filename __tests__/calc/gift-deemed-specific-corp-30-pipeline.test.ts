/**
 * anchor: §45의5① ⓐ 특정법인 요건 — ④API변환 · ⑧validate · ⑫Zod 관통
 *
 * 엔진 leaf를 직접 부르는 anchor는 ⑫Zod를 건너뛴다(feedback_leaf_anchor_skips_zod_layer).
 * `controllingGroupRatio`를 ⑫에 등록하지 않으면 z.object가 **조용히 stripping**해
 * 엔진에 도달하지 않는다 — 그 경로를 여기서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

const ROSTER: DeemedFormState = {
  ...INITIAL_DEEMED,
  type: "specific_corp",
  giftDate: "2026-03-02",
  scMode: "roster",
  scCorporateTaxMode: "direct",
  scCounterparty: "ruling_shareholder", // §45의5① 거래상대방 — ⑧이 필수로 막는다(W4)
  scTransactionBenefit: "2000000000",
  scCorporateTax: "0",
  scTotalShares: "100000",
  scShareholders: [
    { id: "1", name: "갑", relation: "lineal_descendant", shares: "29000", isDonor: false },
    { id: "2", name: "타인", relation: "other", shares: "71000", isDonor: false },
  ],
} as unknown as DeemedFormState;

const SINGLE = {
  ...ROSTER,
  scMode: "single",
  scRatioPct: "20",
  scShareholders: [],
} as unknown as DeemedFormState;

/** ④ → JSON 직렬화(⑬ body) → ⑫ Zod → 엔진. 실제 요청 경로와 같은 순서다. */
function throughPipeline(form: DeemedFormState) {
  const input = buildDeemedGiftInput(form);
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(input)));
  if (!parsed.success) throw new Error(`⑫ Zod 거부: ${parsed.error.issues[0]?.message}`);
  return {
    reachedEngine: "controllingGroupRatio" in (parsed.data as Record<string, unknown>),
    result: calcDeemedGift(parsed.data as never),
  };
}

describe("§45의5① ⓐ — ④⑫ 관통 (roster)", () => {
  it("[PL-0] 미입력은 ④가 필드를 «보내지 않는다» — 0을 보내면 single의 판정 보류가 미충족으로 뒤집힌다", () => {
    const { reachedEngine, result } = throughPipeline(ROSTER);
    expect(reachedEngine).toBe(false);
    expect(result.deemedGiftValue).toBe(0); // roster는 미신고=간접 0%로 판정
    expect(result.specificCorpEligibility!.met).toBe("no");
  });

  it("[PL-1] 35% 입력이 ⑫를 통과해 엔진에 도달한다 — 580,000,000 복원", () => {
    const { reachedEngine, result } = throughPipeline({ ...ROSTER, scGroupRatioPct: "35" });
    expect(reachedEngine).toBe(true);
    expect(result.specificCorpEligibility!.met).toBe("yes");
    expect(result.deemedGiftValue).toBe(580_000_000);
  });

  it("[PL-2] 소수 입력(29.5%)도 분수(2950/10000)로 보존된다", () => {
    const { result } = throughPipeline({ ...ROSTER, scGroupRatioPct: "29.5" });
    expect(result.specificCorpEligibility).toMatchObject({ declaredPct: 29.5, met: "no" });
  });
});

describe("§45의5① ⓐ — single은 미입력 시 판정을 보류한다", () => {
  it("[PL-3] single 20% 미입력 → unknown, 400,000,000 유지 (ⓑ 승수 불변)", () => {
    const { result } = throughPipeline(SINGLE);
    expect(result.specificCorpEligibility!.met).toBe("unknown");
    expect(result.deemedGiftValue).toBe(400_000_000);
  });

  it("[PL-4] single + 그룹 25% → 차단 / 35% → 유지", () => {
    expect(throughPipeline({ ...SINGLE, scGroupRatioPct: "25" }).result.deemedGiftValue).toBe(0);
    expect(throughPipeline({ ...SINGLE, scGroupRatioPct: "35" }).result.deemedGiftValue).toBe(400_000_000);
  });
});

/** 갑 직접 20% · A법인 40%(갑 100% 소유) · 을 15% · 타인 25% */
const WITH_CORP: DeemedFormState = {
  ...ROSTER,
  scTotalShares: "100000",
  scShareholders: [
    { id: "gap", name: "갑", relation: "lineal_descendant", shares: "20000", isDonor: false, isCorporate: false },
    { id: "acorp", name: "A법인", relation: "other", shares: "40000", isDonor: false, isCorporate: true },
    { id: "eul", name: "을", relation: "lineal_descendant", shares: "15000", isDonor: false, isCorporate: false },
    { id: "tain", name: "타인", relation: "other", shares: "25000", isDonor: false, isCorporate: false },
  ],
  scIntermediaryCorps: [
    { id: "im1", corpShareholderId: "acorp", owners: [{ individualId: "gap", ratioPctStr: "100" }] },
  ],
} as unknown as DeemedFormState;

describe("간접출자관계 — ④⑫ 관통", () => {
  it("[PL-6] 경유 법인의 특정법인 지분은 그 «행»의 주식수에서 나온다 (중복 입력 없음)", () => {
    const input = buildDeemedGiftInput(WITH_CORP) as unknown as {
      intermediaryCorps: { stakeInBeneficiary: { numer: number; denom: number } }[];
    };
    // UI는 법인의 특정법인 지분을 따로 받지 않는다 — ④가 roster 행에서 채운다(RC-L 회피)
    expect(input.intermediaryCorps[0].stakeInBeneficiary).toEqual({ numer: 40_000, denom: 100_000 });
  });

  it("[PL-7] ⑫를 통과해 엔진에 도달한다 — 갑 1,200,000,000 / 합계 1,500,000,000", () => {
    const { reachedEngine, result } = throughPipeline(WITH_CORP);
    expect(reachedEngine).toBe(false); // controllingGroupRatio는 미입력
    const donees = result.specificCorpMulti!.donees;
    expect(donees.find((d) => d.name === "갑")!.gain).toBe(1_200_000_000);
    expect(donees.find((d) => d.name === "A법인")!.nonTaxableReason).toBe("corporate_shareholder");
    expect(result.deemedGiftValue).toBe(1_500_000_000);
  });

  it("[PL-8] 법인주주는 relation과 무관하게 지배주주등에서 빠진다 (④ isRelated)", () => {
    const asRelative = {
      ...WITH_CORP,
      scShareholders: WITH_CORP.scShareholders!.map((sh) =>
        sh.id === "acorp" ? { ...sh, relation: "lineal_descendant" as const } : sh,
      ),
    } as unknown as DeemedFormState;
    const input = buildDeemedGiftInput(asRelative) as unknown as {
      shareholders: { id: string; isRelated: boolean }[];
    };
    expect(input.shareholders.find((sh) => sh.id === "acorp")!.isRelated).toBe(false);
  });
});

describe("§45의5① 거래상대방·거래유형 — ④⑧⑫ 관통", () => {
  it("[PL-10] ⑫가 counterparty·transactionType을 통과시킨다 (미등록이면 조용히 stripping된다)", () => {
    const { result } = throughPipeline({ ...ROSTER, scCounterparty: "other" } as DeemedFormState);
    expect(result.specificCorpTransaction!.counterpartyMet).toBe("no");
    expect(result.deemedGiftValue).toBe(0);

    const low = throughPipeline({
      ...ROSTER,
      scTransactionType: "low_price",
      scMarketValue: "1000000000",
      scConsideration: "800000000",
    } as DeemedFormState);
    // 유형이 ⑫에서 잘리면 1호로 떨어져 거래이익 2,000,000,000이 그대로 산다
    expect(low.result.specificCorpTransaction!.transactionType).toBe("low_price");
    expect(low.result.deemedGiftValue).toBe(0); // 차액 20% & 3억 미만
  });

  it("[PL-11] ④는 미선택을 «보내지 않는다» — 'other'로 지어내면 정상 계산이 0원이 된다", () => {
    const input = buildDeemedGiftInput({ ...ROSTER, scCounterparty: "" } as DeemedFormState) as unknown as
      Record<string, unknown>;
    expect(input.counterparty).toBeUndefined();
    expect("counterparty" in input).toBe(true); // 키는 있고 값이 undefined — JSON에서 사라진다
    // ⓐ(29% 미달)와 섞이지 않게 그룹비율 35%를 신고해 ⓐ를 통과시킨 뒤 상대방 축만 본다
    const { result } = throughPipeline({
      ...ROSTER,
      scCounterparty: "",
      scGroupRatioPct: "35",
    } as DeemedFormState);
    expect(result.specificCorpTransaction!.counterpartyMet).toBe("unknown");
    expect(result.deemedGiftValue).toBe(580_000_000); // 판정 보류 = 값 유지(조용히 0원으로 막지 않는다)
  });

  it("[PL-12] ④는 2·3호일 때만 시가·대가를, 4호일 때만 해산 플래그를 보낸다", () => {
    const low = buildDeemedGiftInput({
      ...ROSTER,
      scTransactionType: "low_price",
      scMarketValue: "1000000000",
      scConsideration: "800000000",
      scIsDissolvingNoResidual: true,
    } as DeemedFormState) as unknown as Record<string, unknown>;
    expect(low.marketValue).toBe(1_000_000_000);
    expect(low.consideration).toBe(800_000_000);
    expect(low.isDissolvingWithoutResidual).toBeUndefined(); // 4호 전용 축이 새면 2호가 조용히 죽는다

    const debt = buildDeemedGiftInput({
      ...ROSTER,
      scTransactionType: "debt_relief",
      scMarketValue: "1000000000",
      scIsDissolvingNoResidual: true,
    } as DeemedFormState) as unknown as Record<string, unknown>;
    expect(debt.isDissolvingWithoutResidual).toBe(true);
    expect(debt.marketValue).toBeUndefined();
  });
});

describe("⑧ validate — 비율 범위", () => {
  it("[PL-5] 0 초과 100 이하를 벗어나면 차단하고, 미입력·정상값은 통과시킨다", () => {
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "150" })).toContain("0 초과 100 이하");
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "0" })).toContain("0 초과 100 이하");
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "" })).toBeNull();
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "35" })).toBeNull();
  });

  it("[PL-13] 거래상대방 미선택과 2·3호 시가·대가 미입력을 차단한다 (§45의5① · 영 §34의5⑧)", () => {
    expect(validateDeemedInput({ ...ROSTER, scCounterparty: "" } as DeemedFormState)).toContain(
      "거래상대방을 선택하세요",
    );
    const low = { ...ROSTER, scTransactionType: "low_price" } as DeemedFormState;
    expect(validateDeemedInput(low)).toContain("시가를 입력하세요");
    expect(validateDeemedInput({ ...low, scMarketValue: "1000000000" })).toContain("대가를 입력하세요");
    expect(
      validateDeemedInput({ ...low, scMarketValue: "1000000000", scConsideration: "800000000" }),
    ).toBeNull();
    // 2·3호는 거래이익 칸을 쓰지 않으므로 비어 있어도 통과해야 한다
    expect(
      validateDeemedInput({
        ...low,
        scTransactionBenefit: "",
        scMarketValue: "1000000000",
        scConsideration: "800000000",
      }),
    ).toBeNull();
  });

  it("[PL-9] 간접출자관계의 고아 참조를 차단한다 (§45의3의 RC-H 결함을 물려받지 않는다)", () => {
    expect(validateDeemedInput(WITH_CORP)).toBeNull();

    const orphanCorp = { ...WITH_CORP, scIntermediaryCorps: [{ id: "im1", corpShareholderId: "gone", owners: [{ individualId: "gap", ratioPctStr: "100" }] }] } as unknown as DeemedFormState;
    expect(validateDeemedInput(orphanCorp)).toContain("주주 명단에 없습니다");

    const notCorp = { ...WITH_CORP, scIntermediaryCorps: [{ id: "im1", corpShareholderId: "gap", owners: [{ individualId: "eul", ratioPctStr: "100" }] }] } as unknown as DeemedFormState;
    expect(validateDeemedInput(notCorp)).toContain("「법인」으로 표시");

    const orphanOwner = { ...WITH_CORP, scIntermediaryCorps: [{ id: "im1", corpShareholderId: "acorp", owners: [{ individualId: "gone", ratioPctStr: "100" }] }] } as unknown as DeemedFormState;
    expect(validateDeemedInput(orphanOwner)).toContain("주주 명단에 없습니다");

    const badPct = { ...WITH_CORP, scIntermediaryCorps: [{ id: "im1", corpShareholderId: "acorp", owners: [{ individualId: "gap", ratioPctStr: "150" }] }] } as unknown as DeemedFormState;
    expect(validateDeemedInput(badPct)).toContain("0 초과 100 이하");

    const noOwner = { ...WITH_CORP, scIntermediaryCorps: [{ id: "im1", corpShareholderId: "acorp", owners: [] }] } as unknown as DeemedFormState;
    expect(validateDeemedInput(noOwner)).toContain("개인 소유주를 추가하세요");
  });
});

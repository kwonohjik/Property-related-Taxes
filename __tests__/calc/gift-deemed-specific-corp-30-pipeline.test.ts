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

describe("⑧ validate — 비율 범위", () => {
  it("[PL-5] 0 초과 100 이하를 벗어나면 차단하고, 미입력·정상값은 통과시킨다", () => {
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "150" })).toContain("0 초과 100 이하");
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "0" })).toContain("0 초과 100 이하");
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "" })).toBeNull();
    expect(validateDeemedInput({ ...ROSTER, scGroupRatioPct: "35" })).toBeNull();
  });
});

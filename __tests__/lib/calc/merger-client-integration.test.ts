import { describe, it, expect } from "vitest";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/shared";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";

/** 폼 → API 변환(④) → Zod(⑫) → 엔진(⑬) 전 경로 통합 — 침묵 strip 차단. */
describe("합병 클라이언트 통합 — 폼→Zod→엔진", () => {
  it("Phase A 사례1: auto 단순평균액 → 병 466,620,000", () => {
    const form = {
      ...INITIAL_DEEMED,
      type: "merger" as const,
      mrgCaseType: "stock" as const,
      mrgMergedPriceMode: "auto" as const,
      mrgOvervaluedPrice: "30000",
      mrgPreShares: "100000",
      mrgExchangedShares: "100000",
      mrgUnderSharePrice: "40000",
      mrgUnderPreShares: "200000",
      mrgPostMergerTotalShares: "300000",
      mrgMajorShares: "70000",
    };
    const input = buildDeemedGiftInput(form);
    expect(deemedGiftInputSchema.safeParse(input).success).toBe(true); // Zod 통과 (침묵 strip 0)
    const r = calcDeemedGift(input);
    expect(r.thresholdEcho?.computedMergedPrice).toBe(36_666);
    expect(r.deemedGiftValue).toBe(466_620_000);
  });

  it("Phase B 사례2: 주주 매트릭스 → 갑 순 400,000,000·병 600,000,000", () => {
    const form = {
      ...INITIAL_DEEMED,
      type: "merger" as const,
      mrgCaseType: "stock" as const,
      mrgUseShareholders: true,
      mrgOvervaluedPrice: "10000",
      mrgUnderSharePrice: "50000",
      mrgPostMergerTotalShares: "300000",
      mrgExchangeNumer: "1",
      mrgExchangeDenom: "2",
      mrgOverShareholders: [
        { name: "갑", shares: "140000" },
        { name: "병", shares: "60000" },
      ],
      mrgUnderShareholders: [
        { name: "갑", shares: "100000" },
        { name: "을", shares: "60000" },
        { name: "소액", shares: "40000" },
      ],
    };
    const input = buildDeemedGiftInput(form);
    expect(deemedGiftInputSchema.safeParse(input).success).toBe(true);
    const r = calcDeemedGift(input);
    const m = r.mergerMatrix!;
    expect(m.recipients.find((x) => x.id === "갑")!.netGain).toBe(400_000_000);
    expect(m.recipients.find((x) => x.id === "병")!.netGain).toBe(600_000_000);
    expect(m.allocation["갑"]["을"]).toBe(240_000_000);
    expect(m.allocation["병"]["갑"]).toBe(300_000_000);
    expect(r.deemedGiftValue).toBe(1_000_000_000); // 400M + 600M
  });

  it("Phase C 분할합병 순자산비율 → 과대평가 15,000 → 350,000,000", () => {
    const form = {
      ...INITIAL_DEEMED,
      type: "merger" as const,
      mrgCaseType: "stock" as const,
      mrgIsSplitMerger: true,
      mrgSplitMode: "net_asset_ratio" as const,
      mrgSplitPrePrice: "50000",
      mrgSplitBusinessNetAsset: "3000000000",
      mrgSplitCompanyNetAsset: "10000000000",
      mrgMergedPrice: "20000",
      mrgPreShares: "100000",
      mrgExchangedShares: "100000",
      mrgMajorShares: "70000",
    };
    const input = buildDeemedGiftInput(form);
    expect(deemedGiftInputSchema.safeParse(input).success).toBe(true);
    const r = calcDeemedGift(input);
    expect(r.deemedGiftValue).toBe(350_000_000);
  });
});

/**
 * 명부형 3종(§38·§39의2·§39의3) 영리법인 수증자 행별 축 픽스처 (7-13).
 * 엔진·Zod anchor가 **같은 입력**을 쓴다 — 층마다 입력이 다르면 「엔진은 되는데 Zod가 strip」을
 * 서로 다른 픽스처가 가린다.
 */
import type { CapitalDecreaseShareholder, ContributionParty } from "@/lib/tax-engine/gift-deemed/types";

// ── §38 합병 매트릭스 (교재 사례2 — merger-supplement.anchor와 같은 수치) ──
export const mergerInput = (flagOver: string[] = [], flagUnder: string[] = []) => ({
  type: "merger",
  caseType: "stock", mergedPriceMode: "auto",
  overvaluedSharePrice: 10_000, underSharePrice: 50_000,
  preMergerShares: 200_000, exchangedShares: 100_000, postMergerTotalShares: 300_000,
  underPreShares: 200_000, majorShares: 0,
  shareholders: {
    overvalued: [
      { id: "gap", name: "갑", shares: 140_000 },
      { id: "byung", name: "병", shares: 60_000 },
    ].map((s) => (flagOver.includes(s.id) ? { ...s, isForProfitCorp: true } : s)),
    undervalued: [
      { id: "gap", name: "갑", shares: 100_000 },
      { id: "eul", name: "을", shares: 60_000 },
      { id: "small", name: "소액", shares: 40_000 },
    ].map((s) => (flagUnder.includes(s.id) ? { ...s, isForProfitCorp: true } : s)),
    exchangeRatio: { numer: 1, denom: 2 },
  },
});

// ── §39의2 감자 멀티 (교재 사례1 + 잔존 특수관계 주주 정을 추가해 수증자 2명) ──
export const cdRows = (): CapitalDecreaseShareholder[] => [
  { id: "s1", name: "갑", preShares: 100_000, redeemedShares: 100_000, redemptionPricePerShare: 10_000, relationGroup: "family_A" },
  { id: "s2", name: "을", preShares: 30_000, redeemedShares: 30_000, redemptionPricePerShare: 10_000, relationGroup: "family_A" },
  { id: "s3", name: "병", preShares: 60_000, redeemedShares: 0, relationGroup: "family_A" },
  { id: "s5", name: "정", preShares: 40_000, redeemedShares: 0, relationGroup: "family_A" },
  { id: "s4", name: "소액주주", preShares: 10_000, redeemedShares: 0, relationGroup: "other" },
];
export const cdInput = (flag: string[] = []) => ({
  type: "capital_decrease",
  sharePrice: 30_000,
  preTotalShares: 240_000,
  shareholders: cdRows().map((s) => (flag.includes(s.name) ? { ...s, isForProfitCorp: true } : s)),
});

// ── §39의3 현물출자 명부 (교재 사례3 고가를 수증자 2명으로 확장) ──
export const conInput = (caseType: "low" | "high", flag: string[] = []) => ({
  type: "contribution",
  caseType,
  preContribPrice: caseType === "high" ? 1_000 : 7_500,
  preContribShares: 20_000,
  newSharePrice: caseType === "high" ? 2_000 : 2_500,
  contributedShares: 20_000,
  allocatedShares: 20_000,
  // relation — ⑧ 3-E가 요구하는 행 관계(2026-09-30 ⑫ 필수화 #31). 엔진 가액에는 닿지 않는다(echo)
  parties: ([
    { name: "을", preShares: 10_000, relation: "lineal_descendant" },
    { name: "정", preShares: 5_000, relation: "lineal_descendant" },
  ] as ContributionParty[]).map((p) => (flag.includes(p.name!) ? { ...p, isForProfitCorp: true } : p)),
});

// ── §39의2 감자 멀티 **고가소각** (교재 사례2 — capital-decrease-multi-anchor M2와 같은 수치) ──
// 고가면 수증자·증여자가 **뒤바뀐다** — 수증자=감자주주(병·정), 증여자=잔존주주(갑·을).
export const cdHighInput = (flag: string[] = []) => ({
  type: "capital_decrease",
  sharePrice: 6_000,
  faceValue: 10_000,
  preTotalShares: 200_000,
  shareholders: ([
    { id: "s1", name: "갑", preShares: 80_000, redeemedShares: 0, relationGroup: "family_B" },
    { id: "s2", name: "을", preShares: 40_000, redeemedShares: 0, relationGroup: "family_B" },
    { id: "s3", name: "병", preShares: 60_000, redeemedShares: 60_000, redemptionPricePerShare: 9_000, relationGroup: "family_B" },
    { id: "s4", name: "정", preShares: 20_000, redeemedShares: 20_000, redemptionPricePerShare: 9_000, relationGroup: "family_B" },
  ] as CapitalDecreaseShareholder[]).map((s) => (flag.includes(s.name) ? { ...s, isForProfitCorp: true } : s)),
});

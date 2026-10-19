/**
 * 엔진 직접 — 자산 단위 공동주택 단서 2호 게이트(`inheritance-acquisition-helpers.ts` · leaf `apart-nts-price.ts`)
 *
 * route anchor(`transfer.route.apart-nts-price.anchor.test.ts`)는 ⑫가 먼저 막는 조합을 엔진까지 보내지 못한다.
 * 엔진은 ⑫ 없이 불릴 수 있으므로(직접 호출·다른 진입점) 게이트 자체를 여기서 잠근다 — 「모름 = 불성립」·엄격 <·닫힌 게이트에서 환산 미산출.
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md §3.3
 */
import { describe, it, expect } from "vitest";
import { runInheritedAcquisitionStep } from "@/lib/tax-engine/inheritance-acquisition-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** ② = 3억 × (500,000 × 200 + 5천만) / (1,000,000 × 200 + 6천만) = 173,076,923 · ① 1억 */
const SEC164 = 173_076_923;

function input(ia: Partial<InheritanceAcquisitionInput>): TransferTaxInput {
  return {
    transferDate: d("2026-06-30"),
    transferPrice: 1_200_000_000,
    inheritedAcquisition: {
      inheritanceDate: d("2000-03-01"),
      assetKind: "house_apart",
      reportedValue: 100_000_000,
      reportedMethod: "supplementary",
      ...ia,
    },
    inheritedHouseValuation: {
      inheritanceDate: d("2000-03-01"),
      transferDate: d("2026-06-30"),
      landArea: 200,
      landPricePerSqmAtTransfer: 3_000_000,
      landPricePerSqmAtFirstDisclosure: 1_000_000,
      landPricePerSqmAtInheritance: 500_000,
      housePriceAtTransfer: 0,
      housePriceAtFirstDisclosure: 300_000_000,
      buildingStdPriceAtFirstDisclosure: 60_000_000,
      buildingStdPriceAtInheritance: 50_000_000,
    },
  } as unknown as TransferTaxInput;
}
const run = (ia: Partial<InheritanceAcquisitionInput>) => {
  const i = input(ia);
  return runInheritedAcquisitionStep(i, i, undefined)!;
};

describe("공동주택 게이트 — 엔진 직접", () => {
  it("대조: 단독·다가구는 답과 무관하게 ② 비교", () => {
    expect(run({ assetKind: "house_individual" }).result.acquisitionPrice).toBe(SEC164);
  });
  it("답 없음(모름 = 불성립) → ① · 환산 미산출 — 기관·날짜가 함께 와도 같다", () => {
    for (const extra of [{}, { apartFirstPriceAgency: "nts" as const, apartFirstPriceDate: d("2001-01-01") }]) {
      const r = run(extra);
      expect(r.result.acquisitionPrice).toBe(100_000_000);
      expect(r.houseValuationResult).toBeUndefined();
    }
  });
  it("있었음 + ② 입력 동봉 → ① · 환산 미산출(결과에 쓰이지 않는 환산 카드를 만들지 않는다)", () => {
    const r = run({ apartNtsPriceExisted: true, apartFirstPriceAgency: "nts", apartFirstPriceDate: d("2001-01-01") });
    expect(r.result.acquisitionPrice).toBe(100_000_000);
    expect(r.houseValuationResult).toBeUndefined();
  });
  it("없었음 + 첫 가격 = 기준일 → 닫힘(「고시되기 전」 엄격 <) · 다음 날 → ②", () => {
    expect(run({ apartNtsPriceExisted: false, apartFirstPriceAgency: "nts", apartFirstPriceDate: d("2000-03-01") }).result.acquisitionPrice).toBe(100_000_000);
    const open = run({ apartNtsPriceExisted: false, apartFirstPriceAgency: "nts", apartFirstPriceDate: d("2000-03-02") });
    expect(open.result.acquisitionPrice).toBe(SEC164);
    expect(open.houseValuationResult?.apartFirstPriceAgency).toBe("nts");
  });
  it("없었음 + 날짜 없음 → 닫힘", () => {
    expect(run({ apartNtsPriceExisted: false, apartFirstPriceAgency: "molit" }).result.acquisitionPrice).toBe(100_000_000);
  });
});

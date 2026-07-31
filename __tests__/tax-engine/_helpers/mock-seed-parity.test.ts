/**
 * mock ↔ seed 값 일치 게이트 (계획서 §9.5 V-2 / D-4).
 *
 * 테스트 mock이 프로덕션 seed와 다르면 **테스트가 실제 동작을 대표하지 못한다.**
 * 실제로 그 일이 두 번 있었다:
 *   - `regulatedAreaDeadlineYears` mock 1년 vs seed 2년 → 중과 배제 기한 드리프트(F-2)를 가림
 *   - `lowPriceThreshold.non_capital` mock 1억 vs seed 3억(개정) → 테스트가 구법을 고정
 *
 * 여기서 **세액을 좌우하는 규칙 값만** 고정한다. 표시용 라벨(`condition`)이나 엔진이 읽지 않는
 * 필드(`exclusions` — 장특 배제는 코드 하드코딩, 읽는 코드 0곳)는 대상이 아니다.
 *
 * mock에만 있고 seed에 없어야 하는 것도 있다 — `surcharge_suspended: false` override는
 * "중과 실제 적용" 시나리오를 만들기 위한 **의도적** 차이다(주석으로 명시돼 있다).
 */
import { describe, it, expect } from "vitest";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { makeMockRates, makeMockRatesWithHouseEngine } from "./mock-rates";
import type { TaxRateKey } from "@/lib/tax-engine/types";

function seedSpecial(subCategory: string): Record<string, unknown> {
  const row = transferTaxSeeds.find(
    (s) => s.category === "special" && s.sub_category === subCategory,
  );
  return row!.special_rules as unknown as Record<string, unknown>;
}

function mockSpecial(map: ReturnType<typeof makeMockRates>, key: string): Record<string, unknown> {
  const rec = map.get(key as TaxRateKey) as unknown as { specialRules?: Record<string, unknown> };
  return rec.specialRules!;
}

describe("mock ↔ seed 규칙 값 일치", () => {
  it("one_house_exemption — 비과세·일시적 2주택 기한 전체", () => {
    for (const map of [makeMockRates(), makeMockRatesWithHouseEngine()]) {
      expect(mockSpecial(map, "transfer:special:one_house_exemption")).toEqual(
        seedSpecial("one_house_exemption"),
      );
    }
  });

  it("house_count_exclusion — 주택 수 산정 배제 규칙 전체", () => {
    expect(
      mockSpecial(makeMockRatesWithHouseEngine(), "transfer:special:house_count_exclusion"),
    ).toEqual(seedSpecial("house_count_exclusion"));
  });
});

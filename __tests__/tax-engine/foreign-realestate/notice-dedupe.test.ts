/**
 * 확인 필요 이중 발행 가드(U3) — 같은 취지를 `confirmationNeeded` 코드와 `warnings` 문구로 함께 내면
 * 결과 화면에 near-duplicate «확인 필요» 카드가 두 장 뜬다. 코드가 있는 취지는 코드로만 낸다.
 *
 * 코드 표(`CODE_TOPIC`)는 `satisfies Record<코드, RegExp>`라 엔진이 코드를 추가하면 여기서 컴파일이 멈춘다 —
 * 새 코드의 주제어를 정해야 이중 발행 검사가 그 코드까지 닿는다.
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import type { ForeignRealEstateConfirmationCode, ForeignRealEstateForeignTaxInput } from "@/lib/tax-engine/foreign-realestate";
import { aAsset, bAsset, ftax, k1Input, ratesAt } from "./_fixtures";

const rates = ratesAt("2026-07-10");

const CODE_TOPIC = {
  FOREIGN_TAX_CREDIT_FX_DATE_NOT_STATUTORY: /환산 기준일|납부일/,
  UNSUPPORTED_SITUATIONS_NOT_EVALUATED: /상속|증여|환차익|장기할부|시가로/,
} as const satisfies Record<ForeignRealEstateConfirmationCode, RegExp>;

const t = (assetId: string, krw: number) => ftax(assetId, krw / 1_000, "2026-07-20", 1_000);
const credit = (items: ForeignRealEstateForeignTaxInput["items"]): ForeignRealEstateForeignTaxInput => ({ method: "credit", items });

const SCENARIOS: { name: string; run: () => ReturnType<typeof calc> }[] = [
  { name: "K-1 단건", run: () => calc(k1Input(), rates) },
  { name: "다건", run: () => calc(k1Input({ assets: [aAsset(), bAsset()] }), rates) },
  { name: "세액공제 한도 미달", run: () => calc(k1Input({ assets: [aAsset(), bAsset()], foreignTax: credit([t("a", 40_000_000)]) }), rates) },
  { name: "세액공제 한도 초과", run: () => calc(k1Input({ assets: [aAsset(), bAsset()], foreignTax: credit([t("a", 200_000_000)]) }), rates) },
  {
    name: "필요경비 산입",
    run: () => calc(k1Input({ assets: [aAsset(), bAsset()], foreignTax: { method: "expense", items: [t("a", 10_000_000)] } }), rates),
  },
  { name: "거주 5년 미만(납세의무 없음)", run: () => calc(k1Input({ domesticResidenceYears: 3 }), rates) },
];

describe("코드로 낸 취지를 warnings 문구로 다시 내지 않는다", () => {
  for (const s of SCENARIOS) {
    it(s.name, () => {
      const r = s.run();
      for (const code of r.confirmationNeeded) {
        for (const w of r.warnings) expect(w, `${code} ↔ warnings`).not.toMatch(CODE_TOPIC[code]);
      }
    });
  }

  it("지방소득세 조례 가감·가중(§103의3④⑨)은 완결 — 코드도 warnings 문구도 없다", () => {
    const r = calc(k1Input(), rates);
    expect(r.confirmationNeeded as string[]).not.toContain("LOCAL_TAX_WEIGHTING_NOT_EVALUATED");
    expect(r.warnings).toEqual([]);
  });

  it("한도 초과 문구는 코드가 없는 별개의 취지(이월 없음)라 남는다", () => {
    const r = SCENARIOS[3].run();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("이월 규정이 없어");
  });
});

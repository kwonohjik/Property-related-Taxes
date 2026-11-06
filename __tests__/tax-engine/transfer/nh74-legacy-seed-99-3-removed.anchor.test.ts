/**
 * NH-74(Q-18) — 세율 시드 `new_housing_matrix`의 레거시 조항 라벨 「§99의3 ②」(code `99-3-2`)·「§99의3 ⑩」(code `99-3-10`) 제거.
 *
 * 두 라벨은 조특법에 없는 항이다(§99의3의 ②는 신축주택 5년 후 안분·주택수 제외 항이고, 「2013.4.1.~12.31. 전국 미분양 60%」·
 * 「2015 전국 미분양 100%」라는 내용의 항이 아니다). 그런데 직접 API(`newHousingDetails`)를 부르면 이 시드가 그 감면을 계산했다.
 * 해당 시기 정본은 `transfer-reductions/`(§98의3~§98의8·§99의2) 소득차감형·하이브리드 경로다.
 *
 * 실측(세율표 = 로컬 fallback 시드, 전국·84㎡·미분양확인서 있음, `newHousingDetails`만 입력):
 *
 * | 시료 | 제거 전 감면 → 총부담 | 제거 후 |
 * |---|---|---|
 * | 2013.6.1. 취득 · 2016.6.1. 양도(취득가 5억 · 차익 7억) | 142,080,000 → 132,608,000 | 0 → 260,480,000 |
 * | 2015.6.1. 취득 · 2018.6.1. 양도(취득가 8억 · 차익 7억) | 239,910,000 → 47,982,000 | 0 → 263,901,000 |
 * | 짝 — 2012.10.15. 취득 · 2015.10.15. 양도(`98-7` — 시드에 남는 조항) | 변동 없음 | 변동 없음 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { transferTaxSeeds } from "@/lib/tax-engine/data/transfer-rate-seed";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00`);

function run(acq: string, td: string, price: number, gain: number) {
  const rates = loadFallbackTransferRates(D(td));
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: price + gain,
      acquisitionPrice: price,
      acquisitionDate: D(acq),
      transferDate: D(td),
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      isOneHousehold: false,
      newHousingDetails: {
        acquisitionDate: D(acq), transferDate: D(td), region: "nationwide", acquisitionPrice: price,
        exclusiveAreaSquareMeters: 84, isFirstSale: false, hasUnsoldCertificate: true, totalCapitalGain: gain, calculatedTax: 0,
      },
    }),
    rates,
  );
}

describe("NH-74 시드에서 레거시 라벨 제거", () => {
  const matrix = transferTaxSeeds.find((s) => s.sub_category === "new_housing_matrix");
  const articles: readonly { code: string; article: string }[] =
    (matrix?.deduction_rules as unknown as { articles?: { code: string; article: string }[] } | null)?.articles ?? [];

  it("A1 `new_housing_matrix` 시드에 99-3-2·99-3-10 코드와 「§99의3 ②」「§99의3 ⑩」 라벨이 없다", () => {
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.map((a) => a.code)).not.toContain("99-3-2");
    expect(articles.map((a) => a.code)).not.toContain("99-3-10");
    expect(articles.map((a) => a.article)).not.toContain("§99의3 ②");
    expect(articles.map((a) => a.article)).not.toContain("§99의3 ⑩");
  });

  it("A2 정본 조항(98-7·99-main 등)은 그대로 남는다", () => {
    expect(articles.map((a) => a.code)).toEqual(expect.arrayContaining(["99-main", "99-3-main", "98-7", "99-2-metro"]));
  });
});

describe("NH-74 직접 API — 법에 없는 감면이 더 이상 계산되지 않는다", () => {
  it("B1 2013.6.1. 취득 미분양: 감면 0 · 총부담 260,480,000 (제거 전 감면 142,080,000 · 132,608,000)", () => {
    const r = run("2013-06-01", "2016-06-01", 500_000_000, 700_000_000);
    expect(r.reductionAmount).toBe(0);
    expect(r.totalTax).toBe(260_480_000);
    expect(r.newHousingReductionDetail?.matchedArticleCode).toBeUndefined();
  });

  it("B2 2015.6.1. 취득 미분양: 감면 0 · 총부담 263,901,000 (제거 전 감면 239,910,000 · 47,982,000)", () => {
    const r = run("2015-06-01", "2018-06-01", 800_000_000, 700_000_000);
    expect(r.reductionAmount).toBe(0);
    expect(r.totalTax).toBe(263_901_000);
  });

  it("B3 짝 — 시드에 남는 98-7(2012.9.24.~12.31. 6억 이하·85㎡ 이하 미분양)은 여전히 매칭된다", () => {
    const r = run("2012-10-15", "2015-10-15", 500_000_000, 700_000_000);
    expect(r.newHousingReductionDetail?.matchedArticleCode).toBe("98-7");
    expect(r.reductionAmount).toBeGreaterThan(0);
  });
});

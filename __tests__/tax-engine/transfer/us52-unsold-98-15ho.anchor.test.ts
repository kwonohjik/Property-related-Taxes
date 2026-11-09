/**
 * anchor: §98(조특령 §98②·⑥) 감면주택을 영 §167의10①15호·§167의3①13호에 드는 것으로 본다 — 리뷰 US-52 · 사용자 결정 Q-16 (a), 2026-11-08
 *
 * 종전에는 §98만 15호·13호 확인 목록(`SPECIAL_ACT_15HO_VERIFIED_ARTICLES`) 밖에 두어 §98의2~§98의7(같은 사실에서 15호 배제)과 결론이 갈렸다
 * (§98 단독 2주택 중과 vs 나머지는 배제). 결정에 따라 §98도 목록에 넣고, 직접 해석이 없다는 점을 결과에 「확인 필요」로 고지한다
 * (목록 소속은 {@link SPECIAL_ACT_15HO_VERIFIED_ARTICLES}, 고지 대상은 {@link SPECIAL_ACT_15HO_INTERPRETATION_PENDING_ARTICLES}).
 *
 * 값은 mock 세율 기준(강남 양도 2주택, 양도일 2026-07-01). 세액 변화: 중과(양도 주택 2주택) → 15호 배제.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  SPECIAL_ACT_15HO_VERIFIED_ARTICLES,
  SPECIAL_ACT_15HO_INTERPRETATION_PENDING_ARTICLES,
  special15HoPendingNotice,
} from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { makeMockRatesWithHouseEngine, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRatesWithHouseEngine();
const D = (s: string) => new Date(s);

const decl = (article: string, acq: string) =>
  [{ article, houseId: "h2", houseAcquisitionDate: D(acq), houseContractDate: D(acq), requirementsConfirmed: true }];

const run = (she: unknown[]) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 1_500_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2014-03-01"),
      transferDate: D("2026-07-01"),
      householdHousingCount: 2,
      isOneHousehold: true,
      isRegulatedArea: true,
      residencePeriodMonths: 60,
      specialHouseExclusions: she,
    } as unknown as Partial<TransferTaxInput>),
    rates,
  );

describe("US-52 목록 소속 · 고지 대상", () => {
  it("S-1: §98은 15호·13호 확인 목록에 든다 (Q-16 a) · 고지 대상은 §98뿐이다", () => {
    expect(SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has("unsold_98")).toBe(true);
    expect([...SPECIAL_ACT_15HO_INTERPRETATION_PENDING_ARTICLES]).toEqual(["unsold_98"]);
    for (const a of SPECIAL_ACT_15HO_INTERPRETATION_PENDING_ARTICLES) expect(SPECIAL_ACT_15HO_VERIFIED_ARTICLES.has(a)).toBe(true);
  });

  it("S-2: 고지 문구 — 적격 §98 항목이 있을 때만 나온다 (부적격·다른 조문은 없다)", () => {
    const e = (article: string, eligible: boolean) => ({ article, articleLabel: article === "unsold_98" ? "조특법 §98 미분양 국민주택" : "조특법 §98의2", eligible });
    const detail = (entries: unknown[]) => ({ entries, excludedCount: 0 }) as never;
    expect(special15HoPendingNotice(detail([e("unsold_98", true)]))).toContain("확인 필요");
    expect(special15HoPendingNotice(detail([e("unsold_98", true)]))).toContain("§167의10①15호·§167의3①13호");
    expect(special15HoPendingNotice(detail([e("unsold_98", false)]))).toBeUndefined();
    expect(special15HoPendingNotice(detail([e("unsold_98_2", true)]))).toBeUndefined();
    expect(special15HoPendingNotice(undefined)).toBeUndefined();
  });
});

describe("US-52 엔진 — §98 단독 2주택이 §98의2~§98의7과 같은 결론이다", () => {
  const none = run([]);
  const r98 = run(decl("unsold_98", "1996-06-01"));
  const r982 = run(decl("unsold_98_2", "2009-06-01"));

  it("E-1: 🔁 §98 감면주택 보유 → 15호 배제 14,124,000 (종전 2주택 중과 104,071,000, −89,947,000) · §98의2와 같은 세액 · 선언 없는 대조는 중과 640,761,000", () => {
    expect(none.totalTax).toBe(640_761_000);
    expect(none.surchargeType).toBe("multi_house_2");
    expect(r98.totalTax).toBe(14_124_000);
    expect(r982.totalTax).toBe(14_124_000);
    expect(r98.surchargeType).toBeUndefined();
  });

  it("E-2: 결과 경고에 「확인 필요」 고지가 붙는다 (§98의2에는 붙지 않는다) — 세액 불변", () => {
    const pending = (r: typeof r98) => r.warnings?.some((w) => w.startsWith("확인 필요") && w.includes("조세특례제한법 시행령 §98②·⑥")) ?? false;
    expect(pending(r98)).toBe(true);
    expect(pending(r982)).toBe(false);
    expect(pending(none)).toBe(false);
  });
});

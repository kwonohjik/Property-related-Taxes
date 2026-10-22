/**
 * anchor — 다주택 중과 판정 메뉴 P3c: 양도 예정 주택 상세 설명문 `buildSurchargeNarrative` (계획서 §4.5 · F-7).
 *
 * - 단계 배열은 교재 순서이고, 엔진이 가지 않은 ④⑤는 싣지 않는다. 판정이 끝난 단계에 `decisive`.
 * - `headline.warnings`는 전건 `checks`로 간다(코드 없음 경고만 ①의 쉬운 문구로 대신한다).
 * - 문장에 내부 id를 넣지 않는다 — 주택별 서술은 `houseNotes`.
 */
import { describe, it, expect } from "vitest";
import { buildSurchargeNarrative, decisionStageOf } from "@/lib/tax-engine/multi-house-surcharge-narrative";
import { REGION_CODE_MISSING_WARNING } from "@/lib/tax-engine/multi-house-surcharge";
import { runMultiHouseSurchargeStep } from "@/lib/tax-engine/transfer-tax-judgment-steps";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { SURCHARGE_TRANSITION } from "@/lib/tax-engine/legal-codes";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

const TD = new Date("2026-09-18"); // 한시 유예(가목) 종료 뒤
const GANGNAM = "1168010100";
const SEOCHO = "1165010100";
const GANGNEUNG = "5115010100";
const ASAN = "4420010100"; // 비조정 · 가액기준
const house = (id: string, regionCode: string | undefined, over: Record<string, unknown> = {}) => ({
  id, acquisitionDate: new Date("2015-01-01"), officialPrice: 500_000_000, region: "capital", regionCode,
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...over,
});
function input(houses: object[], over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const transferDate = (over.transferDate as Date | undefined) ?? TD;
  return baseTransferInput({
    transferDate, acquisitionDate: new Date("2015-01-01"), isOneHousehold: true, isRegulatedArea: true,
    householdHousingCount: houses.length, residencePeriodMonths: 0,
    houses: houses as TransferTaxInput["houses"], sellingHouseId: "selling", ...over,
  } as Partial<TransferTaxInput>);
}
function narrate(i: TransferTaxInput) {
  const rates = parseRatesFromMap(loadFallbackTransferRates(i.transferDate));
  const hce = resolveHceGeneralHouseAcquisitionDate(i);
  const headline = runMultiHouseSurchargeStep(i, rates, [], { excluded: false } as never, hce)!;
  return { headline, n: buildSurchargeNarrative(i, rates, headline, hce)! };
}
const ids = (n: ReturnType<typeof narrate>["n"]) => n.steps.map((s) => s.id);
const decisiveOf = (n: ReturnType<typeof narrate>["n"]) => n.steps.filter((s) => s.decisive).map((s) => s.id);
const step = (n: ReturnType<typeof narrate>["n"], id: string) => n.steps.find((s) => s.id === id)!;
const allText = (n: ReturnType<typeof narrate>["n"]) => n.steps.flatMap((s) => [s.verdict, ...s.sentences]).join("\n");

describe("MH-P7 단계 배열 — 판정이 끝난 단계에서 멈춘다", () => {
  it("[NR-1] 비조정 → ①에서 끝 · ④⑤ 없음 · 결론 중과 없음", () => {
    const { n } = narrate(input([house("selling", GANGNEUNG), house("h2", GANGNAM)]));
    expect(n.stage).toBe("not_regulated");
    expect(ids(n)).toEqual(["regulated", "criteria", "count", "conclusion"]);
    expect(decisiveOf(n)).toEqual(["regulated"]);
    expect(step(n, "regulated").verdict).toBe("조정대상지역 아님");
    expect(step(n, "conclusion").verdict).toBe("중과 없음");
  });

  it("[NR-2] 양도 주택 자체가 지방 저가(1호) → ②에서 끝 · 기준시가·한도 숫자 · 코드 없음 확인 필요(내부 필드명 없이)", () => {
    const { n, headline } = narrate(
      input([house("selling", undefined, { region: "non_capital", officialPrice: 200_000_000 }), house("h2", GANGNAM), house("h3", SEOCHO)]),
    );
    expect(n.stage).toBe("self_low_price");
    expect(decisiveOf(n)).toEqual(["criteria"]);
    expect(step(n, "criteria").verdict).toBe("가액기준 — 기준시가 이하");
    expect(step(n, "criteria").sentences.join(" ")).toContain("기준시가(200,000,000)가 한도(300,000,000) 이하");
    // 엔진 경고(내부 필드명)는 ①의 확인 필요로 대신한다 — 구별력: 엔진은 실제로 그 경고를 냈다
    expect(headline.warnings).toContain(REGION_CODE_MISSING_WARNING);
    expect(n.checks).not.toContain(REGION_CODE_MISSING_WARNING);
    expect(n.checks.some((c) => c.includes("주소(법정동코드)가 입력되지 않아"))).toBe(true);
  });

  it("[NR-3] 1주택 → ③에서 끝", () => {
    const { n } = narrate(input([house("selling", GANGNAM)]));
    expect(n.stage).toBe("one_house_or_less");
    expect(decisiveOf(n)).toEqual(["count"]);
    expect(ids(n)).not.toContain("exclusion");
  });

  it("[NR-4] 2주택 중과(유예 종료 뒤) → ⑥에서 끝 · 배제 「해당 없음」도 서술 · 유예 미해당 서술 · +20%p", () => {
    const { n } = narrate(input([house("selling", GANGNAM), house("h2", SEOCHO)]));
    expect(n.stage).toBe("surcharged");
    expect(ids(n)).toEqual(["regulated", "criteria", "count", "exclusion", "suspension", "conclusion"]);
    expect(decisiveOf(n)).toEqual(["conclusion"]);
    expect(step(n, "exclusion").sentences).toContain("검토한 중과 배제 사유 중 해당하는 것이 없습니다.");
    expect(step(n, "suspension").verdict).toBe("해당 없음");
    expect(step(n, "conclusion").verdict).toBe("2주택 중과(기본세율 +20%p)");
  });

  it("[NR-5] 3주택 중과 → +30%p", () => {
    const { n } = narrate(input([house("selling", GANGNAM), house("h2", SEOCHO), house("h3", GANGNAM)]));
    expect(step(n, "conclusion").verdict).toBe("3주택 이상 중과(기본세율 +30%p)");
  });

  it("[NR-6] 배제(문화유산) → ④에서 끝 · 엔진 detail을 그대로 · ⑤ 없음", () => {
    const { n, headline } = narrate(input([house("selling", GANGNAM, { isCulturalHeritage: true }), house("h2", SEOCHO)]));
    expect(n.stage).toBe("excluded");
    expect(decisiveOf(n)).toEqual(["exclusion"]);
    expect(ids(n)).not.toContain("suspension");
    expect(step(n, "exclusion").sentences[0]).toBe(`${headline.exclusionReasons[0].detail}.`);
    expect(step(n, "exclusion").verdict).toBe("배제");
  });

  it("[NR-7] 3주택 유일한 일반주택(10호) → ④에서 끝 · 다른 주택별 사유는 houseNotes", () => {
    const { n } = narrate(
      input([house("selling", GANGNAM), house("h2", SEOCHO, { isCulturalHeritage: true }), house("h3", GANGNAM, { isCulturalHeritage: true })]),
    );
    expect(n.stage).toBe("only_one_remaining");
    expect(decisiveOf(n)).toEqual(["exclusion"]);
    expect(step(n, "exclusion").houseNotes.map((h) => h.houseId).sort()).toEqual(["h2", "h3"]);
  });

  it("[NR-8] 한시 유예(가목) → ⑤에서 끝 · 가목 근거", () => {
    const { n } = narrate(input([house("selling", GANGNAM), house("h2", SEOCHO)], { transferDate: new Date("2024-03-01") }));
    expect(n.stage).toBe("suspended");
    expect(decisiveOf(n)).toEqual(["suspension"]);
    expect(step(n, "suspension").basis).toEqual([SURCHARGE_TRANSITION.BASIS_A]);
    expect(step(n, "conclusion").verdict).toBe("중과 없음");
  });

  it("[NR-9] 위기 취득(2009.3.16.~2012.12.31.) → 중과 대상이지만 세율 가산 없음", () => {
    const { n, headline } = narrate(
      input([house("selling", GANGNAM, { acquisitionDate: new Date("2010-06-01") }), house("h2", SEOCHO)], {
        acquisitionDate: new Date("2010-06-01"),
      }),
    );
    expect(headline.rateSurchargeStatutoryExcluded).toBe(true);
    expect(step(n, "conclusion").verdict).toBe("2주택 중과 대상 — 세율 가산 없음");
    expect(step(n, "suspension").verdict).toBe("취득 시기 특례 — 세율 가산 없음");
  });

  it("[NR-10] 단계 판별은 decisionStageOf와 같다", () => {
    const { n, headline } = narrate(input([house("selling", GANGNAM), house("h2", SEOCHO)]));
    expect(n.stage).toBe(decisionStageOf(headline));
  });
});

describe("F-7 판정하지 못한 사실 — warnings 전건", () => {
  it("[NC-1] 3호 부득이 사유 주택의 취득 당시 기준시가 없음 → 그 경고가 checks에 · ④에 안내 문장", () => {
    const { n, headline } = narrate(input([house("selling", GANGNAM), house("h2", SEOCHO, { isUnavoidableReason: true })]));
    expect(headline.warnings.length).toBeGreaterThan(0); // 구별력
    for (const w of headline.warnings) expect(n.checks).toContain(w);
    expect(step(n, "exclusion").sentences).toContain("판정에 쓰지 못한 사실은 「확인 필요」에 적었습니다.");
  });

  it("[NC-2] 주택 수 산입 제외 주택은 houseNotes(id)로 · 문장에는 내부 id가 없다", () => {
    const { n } = narrate(
      input([house("selling", GANGNAM), house("h2", SEOCHO), house("h3", ASAN, { region: "non_capital", officialPrice: 200_000_000 })]),
    );
    expect(step(n, "count").houseNotes.map((h) => h.houseId)).toEqual(["h3"]);
    expect(allText(n)).not.toMatch(/\b(selling|h2|h3)\b/);
  });
});

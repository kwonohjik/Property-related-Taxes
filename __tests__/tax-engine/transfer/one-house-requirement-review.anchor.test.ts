/**
 * 1세대1주택 판정 — **판정 기준일(조회일)** 필터 · **비과세 요건 순차 검토** echo 앵커
 *
 * 계획서 `docs/00-pm/one-house-judgment-temp-two-house-review.plan.md` §8.
 *
 * ## 🔴 제보 (2026-09-29)
 *
 * 종전주택 2018-07-06 취득(취득 당시 조정대상지역 · 거주 26개월) · 신규주택 2023-07-01 취득 ·
 * 양도 예정 2026-10-22 · 24억. 처분기한 2026-07-01이 **조회일 2026-09-29에 이미 지났는데**
 * 결과 화면이 「2026-07-01까지 양도해야 비과세」를 안내했다 — 이룰 수 없는 조건이다.
 *
 * ## 🔑 날짜는 정확값으로 고정한다 (`feedback_range_assertion_misses_spec_violation`)
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type {
  OneHouseJudgeInput,
  OneHouseRequirementCheck,
} from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import {
  applyRentalHousingVerdict,
  type OneHouseRentalHousingVerdict,
} from "@/lib/tax-engine/one-house/rental-housing-verdict";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const iso = (d: Date | string) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);
const PRESALE_START = D("2021-01-01");

const judge = (over: Partial<TransferTaxInput>, judgmentBaseDate?: string) =>
  checkExemption(
    baseTransferInput(over) as OneHouseJudgeInput,
    rules,
    PRESALE_START,
    judgmentBaseDate ? { judgmentBaseDate: D(judgmentBaseDate) } : undefined,
  );

const facts = (c: OneHouseRequirementCheck | undefined) =>
  Object.fromEntries((c?.facts ?? []).map((f) => [f.label, f.value]));
const itemOf = (r: ReturnType<typeof judge>, id: string) =>
  r.requirementReview?.items.find((i) => i.id === id);

/** 제보 입력 그대로. */
const REPORTED: Partial<TransferTaxInput> = {
  acquisitionDate: D("2018-07-06"),
  transferDate: D("2026-10-22"),
  transferPrice: 2_400_000_000,
  householdHousingCount: 2,
  wasRegulatedAtAcquisition: true,
  residencePeriodMonths: 26,
  temporaryTwoHouse: {
    previousAcquisitionDate: D("2018-07-06"),
    newAcquisitionDate: D("2023-07-01"),
  } as TransferTaxInput["temporaryTwoHouse"],
};

describe("판정 기준일 — 이룰 수 없는 「이 날까지 양도」 기한은 내지 않는다", () => {
  it("[R-1] 제보 — 기준일 2026-09-29에 기한 2026-07-01은 이미 지났다 ⇒ pending 없음 · 과세", () => {
    const r = judge(REPORTED, "2026-09-29");
    expect(r.isExempt).toBe(false);
    expect(r.isPartialExempt).toBe(false);
    expect(r.pending).toEqual([]);
  });

  it("[R-2] 긍정 짝 — 기준일 2026-05-01이면 기한이 남아 안내한다(방향 transfer_by)", () => {
    const r = judge(REPORTED, "2026-05-01");
    expect(r.pending.map((p) => [p.id, iso(p.deadline), p.kind])).toEqual([
      ["155-1-disposal-deadline", "2026-07-01", "transfer_by"],
    ]);
  });

  it("[R-3] 경계 — 기준일 = 기한 당일이면 남긴다(당일까지 양도 가능)", () => {
    expect(judge(REPORTED, "2026-07-01").pending.map((p) => p.id)).toEqual(["155-1-disposal-deadline"]);
  });

  it("[R-4] 경계 — 기준일 = 기한 + 1일이면 뺀다", () => {
    expect(judge(REPORTED, "2026-07-02").pending).toEqual([]);
  });

  it("[R-5] transfer_after(보유 2년 충족일)는 기준일이 지나도 남는다 — 지나면 오히려 충족된다", () => {
    const r = judge(
      {
        acquisitionDate: D("2023-06-01"),
        transferDate: D("2024-06-01"),
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: 0,
      },
      "2026-09-29",
    );
    expect(r.pending.map((p) => [p.id, iso(p.deadline), p.kind])).toEqual([
      ["154-1-holding-years", "2025-05-31", "transfer_after"],
    ]);
  });

  it("[R-6] 기준일 미제공(계산기 경로) — 종전 동작 그대로 기한을 낸다", () => {
    expect(judge(REPORTED).pending.map((p) => p.id)).toEqual(["155-1-disposal-deadline"]);
  });

  it("[R-16] 고가주택이면 기한 안내 문구가 「부분 비과세」다 (Q-3)", () => {
    const [p] = judge(REPORTED, "2026-05-01").pending;
    expect(p.description).toContain("부분 비과세");
    expect(p.description).not.toMatch(/양도해야 비과세$/);
  });

  it("[R-16b] 짝 — 12억 이하면 「비과세」 그대로", () => {
    const [p] = judge({ ...REPORTED, transferPrice: 1_000_000_000 }, "2026-05-01").pending;
    expect(p.description).toMatch(/비과세$/);
    expect(p.description).not.toContain("부분 비과세");
  });
});

describe("요건 순차 검토 — §155① 일시적 2주택", () => {
  it("[R-1r] 제보 — ① 1년 충족 · ② 처분기한 미충족 · ③ 보유 충족 · ④ 거주 충족 · 고가 초과", () => {
    const r = judge(REPORTED, "2026-09-29");
    expect(r.requirementReview?.scheme).toBe("155-1-temporary-two-house");
    expect(r.requirementReview?.items.map((i) => [i.id, i.status])).toEqual([
      ["one-year", "met"],
      ["disposal-deadline", "unmet"],
      ["holding", "met"],
      ["residence", "met"],
      ["high-value", "partial"],
    ]);
    expect(facts(itemOf(r, "one-year"))).toEqual({
      "종전주택 취득일": "2018-07-06",
      "1년 경과일": "2019-07-07",
      "신규주택 취득일": "2023-07-01",
    });
    expect(facts(itemOf(r, "disposal-deadline"))).toEqual({
      "신규주택 취득일": "2023-07-01",
      처분기한: "2026-07-01",
      "양도(예정)일": "2026-10-22",
    });
    // V-3 — calculateHoldingPeriod(2018-07-06 → 2026-10-22) 실측값
    expect(facts(itemOf(r, "holding"))).toEqual({ "보유 기산일": "2018-07-06", 보유기간: "8년 3개월" });
    expect(facts(itemOf(r, "residence"))).toEqual({ "취득 당시 조정대상지역": "해당", 거주기간: "26개월" });
    // 이룰 수 없는 기한임을 요건 행이 직접 말한다
    expect(itemOf(r, "disposal-deadline")?.note).toContain("2026-09-29");
  });

  it("[R-2r] 기한이 남았으면 ② 행이 「기한까지 양도하면 충족」을 말한다", () => {
    expect(itemOf(judge(REPORTED, "2026-05-01"), "disposal-deadline")?.note).toContain("2026-07-01");
  });

  it("[R-7] ① 미충족(신규 취득이 1년 안) — 나머지 요건도 끝까지 검토한다", () => {
    const r = judge({
      ...REPORTED,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2018-07-06"),
        newAcquisitionDate: D("2019-07-06"),
      } as TransferTaxInput["temporaryTwoHouse"],
      transferDate: D("2020-06-01"),
    });
    expect(r.requirementReview?.items.map((i) => [i.id, i.status])).toEqual([
      ["one-year", "unmet"],
      ["disposal-deadline", "met"],
      ["holding", "unmet"],
      // 거주 26개월(제보 입력 그대로) — 보유는 못 채웠어도 거주는 충족이다. 행은 서로 독립이다.
      ["residence", "met"],
      ["high-value", "partial"],
    ]);
  });

  it("[R-8] 취득 당시 비조정 — 거주는 「해당 없음」(충족과 구별)", () => {
    const r = judge({ ...REPORTED, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0 }, "2026-09-29");
    expect(itemOf(r, "residence")?.status).toBe("not_required");
  });

  it("[R-10] §155⑱ 처분기한 예외 — ② 충족으로 보고 사유를 밝힌다 → 부분 비과세", () => {
    const r = judge({
      ...REPORTED,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2018-07-06"),
        newAcquisitionDate: D("2023-07-01"),
        disposalDelayReason: "auction",
      } as TransferTaxInput["temporaryTwoHouse"],
    }, "2026-09-29");
    expect(r.isPartialExempt).toBe(true);
    expect(itemOf(r, "disposal-deadline")?.status).toBe("waived");
  });

  it("[R-17] 요건을 모두 갖춰 일시적 2주택으로 비과세면 검토도 전부 통과", () => {
    const r = judge({ ...REPORTED, transferDate: D("2026-06-30"), transferPrice: 1_000_000_000 }, "2026-05-01");
    expect(r.isExempt).toBe(true);
    expect(r.requirementReview?.items.map((i) => i.status)).toEqual(["met", "met", "met", "met", "met"]);
  });
});

describe("요건 순차 검토 — 1주택 단독 양도 (Q-2)", () => {
  const ONE: Partial<TransferTaxInput> = {
    acquisitionDate: D("2018-07-06"),
    transferDate: D("2026-10-22"),
    transferPrice: 1_000_000_000,
    householdHousingCount: 1,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 24,
  };

  it("[R-12] 조정지역 취득 · 거주 24개월 · 10억 ⇒ 전 요건 충족 · 비과세", () => {
    const r = judge(ONE, "2026-09-29");
    expect(r.isExempt).toBe(true);
    expect(r.requirementReview?.scheme).toBe("154-1-one-house");
    expect(r.requirementReview?.items.map((i) => [i.id, i.status])).toEqual([
      ["one-house", "met"],
      ["holding", "met"],
      ["residence", "met"],
      ["high-value", "met"],
    ]);
  });

  /**
   * 고가주택 행 제목은 **판정 결과를 따라간다** — 종전 고정 제목 「… 이하(고가주택이 아님)」가
   * 24억 사례에서 「초과분 과세」 배지 옆에 그려졌다(2026-09-29 제보). 경계(= 12억)는 이하 쪽이다.
   */
  it("[R-12b] 고가주택 행 제목 — 12억 이하·초과·경계", () => {
    const hv = (price: number) => itemOf(judge({ ...ONE, transferPrice: price }, "2026-09-29"), "high-value");
    expect(hv(1_000_000_000)?.label).toBe("양도가액 12억원 이하 — 고가주택 아님");
    expect(hv(1_200_000_000)?.label).toBe("양도가액 12억원 이하 — 고가주택 아님");
    expect(hv(1_200_000_001)?.label).toBe("고가주택(양도가액 12억원 초과) — 12억원 초과분 과세");
    expect(hv(2_400_000_000)?.status).toBe("partial");
    expect(hv(2_400_000_000)?.label).toBe("고가주택(양도가액 12억원 초과) — 12억원 초과분 과세");
  });

  it("[R-13] 거주 23개월 ⇒ 거주 미충족 · 과세", () => {
    const r = judge({ ...ONE, residencePeriodMonths: 23 }, "2026-09-29");
    expect(r.isExempt || r.isPartialExempt).toBe(false);
    expect(itemOf(r, "residence")?.status).toBe("unmet");
  });

  it("[R-14] 2017-08-02 취득(경과규정) ⇒ 거주 「해당 없음」", () => {
    const r = judge({ ...ONE, acquisitionDate: D("2017-08-02"), residencePeriodMonths: 0 }, "2026-09-29");
    expect(r.isExempt).toBe(true);
    expect(itemOf(r, "residence")?.status).toBe("not_required");
  });

  it("[R-15] 24억 ⇒ 고가 행 partial · 부분 비과세", () => {
    const r = judge({ ...ONE, transferPrice: 2_400_000_000 }, "2026-09-29");
    expect(r.isPartialExempt).toBe(true);
    expect(itemOf(r, "high-value")?.status).toBe("partial");
  });

  /**
   * 🔄 2026-09-29 — 종전 시료는 「혼인 합가 선언 2주택」이었다. 합가가 검토 범위에 들어오면서
   *    (`one-house-merge-composition.anchor.test.ts` MC-R) 범위 밖 특례의 대표를 §155⑦ 농어촌주택으로
   *    바꿨다 — 「범위 밖이면 싣지 않는다」는 형제 안전망은 그대로 남긴다.
   */
  it("[R-18] 범위 밖 특례(§155⑦ 농어촌주택 선언)로 2주택이면 검토를 싣지 않는다", () => {
    const r = judge({
      ...ONE,
      householdHousingCount: 2,
      ruralHouse: {
        kind: "inherited",
        isOutsideCapitalEupMyeon: true,
        decedentResidenceYears: 6,
      } as TransferTaxInput["ruralHouse"],
    }, "2026-09-29");
    expect(r.requirementReview).toBeUndefined();
  });
});

/**
 * 🔴 드리프트 가드 — 요건 행은 **판정을 다시 하지 않는다**. 정본 판정과 행의 결론이 어긋나면
 *    화면이 「과세」 배지 아래에 「모든 요건 충족」을 그린다. 행렬 전수로 동치를 강제한다.
 */
describe("요건 검토 결론 ⇔ 정본 판정 (행렬 전수)", () => {
  const PASS = new Set(["met", "waived", "not_required", "partial"]);
  const prevs = ["2016-05-01", "2018-07-06", "2022-01-10"];
  const news = ["2018-12-01", "2023-07-01"];
  const transfers = ["2019-03-01", "2024-01-15", "2026-06-30", "2026-10-22"];
  const regulated = [true, false];
  const residences = [0, 23, 26];
  const prices = [1_000_000_000, 2_400_000_000];
  const cases: Array<[string, Partial<TransferTaxInput>]> = [];
  for (const count of [1, 2])
    for (const prev of prevs)
      for (const nw of news)
        for (const t of transfers)
          for (const reg of regulated)
            for (const res of residences)
              for (const price of prices) {
                if (D(t) <= D(prev) || (count === 2 && (D(nw) <= D(prev) || D(t) <= D(nw)))) continue;
                cases.push([
                  `${count}채 ${prev}/${nw}/${t} 조정${reg} 거주${res} ${price}`,
                  {
                    acquisitionDate: D(prev),
                    transferDate: D(t),
                    transferPrice: price,
                    householdHousingCount: count,
                    wasRegulatedAtAcquisition: reg,
                    residencePeriodMonths: res,
                    ...(count === 2
                      ? {
                          temporaryTwoHouse: {
                            previousAcquisitionDate: D(prev),
                            newAcquisitionDate: D(nw),
                          } as TransferTaxInput["temporaryTwoHouse"],
                        }
                      : {}),
                  },
                ]);
              }

  it(`행렬 ${"≥"}100건 — 전 행 통과 ⇔ 비과세·부분 비과세, 고가 행 partial ⇔ 부분 비과세`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(100);
    for (const [name, over] of cases) {
      const r = judge(over, "2026-09-29");
      const review = r.requirementReview;
      expect(review, name).toBeDefined();
      const allPass = review!.items.every((i) => PASS.has(i.status));
      expect(allPass, name).toBe(r.isExempt || r.isPartialExempt);
      if (allPass) {
        expect(itemOf(r, "high-value")?.status === "partial", name).toBe(r.isPartialExempt);
      }
    }
  });
});

/**
 * §155⑳ 장기임대주택 특례 **불충족**은 route가 코어 판정을 사후에 과세로 뒤집는다
 * (`applyRentalHousingVerdict`). 그때 코어 기준 「전 요건 충족」 행이 남으면 과세 배지 아래에
 * 모순된 카드가 그려진다 — 비과세 사유(`appliedExceptions`)와 함께 지워야 한다.
 */
describe("§155⑳ 불충족 덮어쓰기 — 요건 검토도 함께 지운다", () => {
  const ONE_EXEMPT: Partial<TransferTaxInput> = {
    acquisitionDate: D("2018-07-06"),
    transferDate: D("2026-10-22"),
    transferPrice: 1_000_000_000,
    householdHousingCount: 1,
    residencePeriodMonths: 24,
  };

  it("[R-19] passed=false면 requirementReview가 사라진다", () => {
    const core = judge(ONE_EXEMPT, "2026-09-29");
    expect(core.requirementReview).toBeDefined();
    const after = applyRentalHousingVerdict(core, { passed: false } as OneHouseRentalHousingVerdict);
    expect(after.isExempt).toBe(false);
    expect(after.requirementReview).toBeUndefined();
  });

  it("[R-19b] 짝 — passed=true면 그대로 둔다", () => {
    const core = judge(ONE_EXEMPT, "2026-09-29");
    const after = applyRentalHousingVerdict(core, { passed: true } as OneHouseRentalHousingVerdict);
    expect(after.requirementReview).toEqual(core.requirementReview);
  });
});

/**
 * anchor — §154⑤ 단서(2021.1.1.~2022.5.9. 양도) 처분 이력 미답 (1세대1주택 리뷰 결정 #36 · S02-3)
 *
 * 종전: 이력을 답하지 않으면 「재기산 없음」처럼 계산해 비과세 + 판정 보류 고지만 냈다(모르는 사실을 유리하게 적용).
 * 이후(모름 = 혜택 불성립):
 *   · 순수 1주택(양도일 현재 주택·입주권·분양권을 통틀어 이 주택 1채, 주택 수 제외·§155⑳ 선언 없음) → 재기산된 것으로 보아
 *     보유 2년 불성립 = 과세. 확인 필요 고지는 「없음」이라고 답하면 결론이 달라질 때만(§154① 단서 1~3호 면제 세대는 고지 없음).
 *   · 그 밖의 세대 유형(주택 수 제외·§155⑳·입주권/분양권 보유) → 종전 결론(비과세) 유지 + 「해석 미확인」 고지.
 * 모든 부정형 단언에 긍정 짝을 둔다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import {
  isPlainSingleHouseHousehold,
  resolveFinalOneHouseRestart,
} from "@/lib/tax-engine/one-house/final-house-restart";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const RULES = rates.get("transfer:special:one_house_exemption")!.specialRules as unknown as OneHouseSpecialRulesData;
const d = (s: string) => new Date(s);
const ID = "154-5-final-one-house-restart-unverified";

/** 2015-03-01 취득 · 비조정 · 5억 1주택 — 재기산이 없으면 비과세 */
const house = (transferDate: string, over: Partial<TransferTaxInput> = {}) =>
  baseTransferInput({ acquisitionDate: d("2015-03-01"), transferDate: d(transferDate), ...over } as Partial<TransferTaxInput>);
const NONE = { hadOtherHouseDisposal: false, disposals: [] };
const judge = (i: TransferTaxInput) => judgeOneHouseExemptionFromInput(i as OneHouseJudgeInput, RULES);
const notice = (i: TransferTaxInput) => judge(i).undetermined.find((u) => u.id === ID);
const tax = (i: TransferTaxInput) => calculateTransferTax(i, rates);

describe("#36 순수 1주택 — 이력 미답 = 재기산 가정 = 과세", () => {
  it("[S36-1] ★ 미답 → 과세 + 확인 필요 고지(「없음」 안내) / 「없음」 → 비과세 · 고지 없음", () => {
    const unanswered = house("2022-03-01");
    const r = tax(unanswered);
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    const n = notice(unanswered);
    expect(n).toBeDefined();
    expect(n!.reason).toContain("재기산된 것으로 보고");
    expect(n!.reason).toContain("「없음」을 선택하세요(확인 필요)");
    expect((r.warnings ?? []).join("\n")).toContain(n!.reason);

    const none = house("2022-03-01", { finalOneHouseRestart: NONE });
    expect(tax(none).isExempt).toBe(true);
    expect(tax(none).totalTax).toBe(0);
    expect(notice(none)).toBeUndefined();
  });

  it("[S36-2] 요건 검토표의 보유기간 행이 「충족하지 않음」과 이유를 밝힌다(기산일·연수는 그대로)", () => {
    const holding = judge(house("2022-03-01")).requirementReview?.items.find((it) => it.id === "holding");
    expect(holding?.status).toBe("unmet");
    expect(holding?.note).toContain("재기산된 것으로 보고");
    expect(holding?.facts.find((f) => f.label === "보유 기산일")?.value).toBe("2015-03-01");
    const none = judge(house("2022-03-01", { finalOneHouseRestart: NONE })).requirementReview?.items.find((it) => it.id === "holding");
    expect(none?.status).toBe("met");
  });

  it("[S36-3] 「이 날까지 보유하면 비과세」 pending을 내지 않는다(재기산 가정이라 틀린 날짜)", () => {
    expect(judge(house("2022-03-01")).pending.map((p) => p.id)).not.toContain("154-1-holding-years");
  });

  it("[S36-4] 구간 경계 — 2020-12-31·2022-05-10 양도는 구간 밖이라 미답이어도 비과세 · 고지 없음 / 2021-01-01·2022-05-09는 과세", () => {
    for (const t of ["2020-12-31", "2022-05-10"]) {
      expect(tax(house(t)).isExempt).toBe(true);
      expect(notice(house(t))).toBeUndefined();
    }
    for (const t of ["2021-01-01", "2022-05-09"]) {
      expect(tax(house(t)).isExempt).toBe(false);
      expect(notice(house(t))).toBeDefined();
    }
  });

  it("[S36-5] ★ §154① 단서 1~3호(해외이주 2호 나목) 면제 세대 — 비과세 그대로 · 결론을 가르지 않는 재기산 고지는 없앤다", () => {
    const i = house("2022-03-01", {
      oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: d("2021-10-01"), departureOnlyHouse: true },
    });
    expect(tax(i).isExempt).toBe(true);
    expect(notice(i)).toBeUndefined();
  });

  it("[S36-6] 이력이 없어도 결론이 같은 경우(보유 2년 미달로 이미 과세)엔 고지하지 않는다", () => {
    const i = baseTransferInput({ acquisitionDate: d("2020-06-01"), transferDate: d("2021-11-10") });
    expect(tax(i).isExempt).toBe(false);
    expect(notice(i)).toBeUndefined();
  });

  it("[S36-7] 긍정 짝 — 「있음」(재기산)은 종전대로 과세 + 재기산 echo", () => {
    const i = house("2022-03-01", {
      finalOneHouseRestart: { hadOtherHouseDisposal: true, disposals: [{ kind: "transfer", date: d("2021-06-01"), temporaryTwoHouseSpecial: false }] },
    });
    expect(tax(i).isExempt).toBe(false);
    expect(judge(i).finalOneHouseRestart?.applied).toBe(true);
    expect(notice(i)).toBeUndefined();
  });
});

describe("#36 그 밖의 세대 유형 — 종전 결론 유지 + 해석 미확인 고지", () => {
  const WORDING = "이 세대 유형에 단서가 걸리는지 해석이 확인되지 않아";

  it("[S36-8] ★ 주택 수 제외 세대(knownHouseExclusionCount>0) — 미답이어도 비과세 유지 · 「칸에 입력하세요」 없이 해석 미확인 고지", () => {
    const i = house("2022-03-01", { knownHouseExclusionCount: 1 });
    expect(resolveFinalOneHouseRestart(i).status).toBe("undetermined");
    expect(judge(i).isExempt).toBe(true);
    const n = notice(i);
    expect(n).toBeDefined();
    expect(n!.reason).toContain(WORDING);
    expect(n!.reason).toContain("확인 필요");
    expect(n!.reason).not.toContain("「없음」을 선택하세요");
    expect(n!.reason).not.toContain("칸에");
  });

  it("[S36-9] 명부에 다른 주택 행·입주권/분양권·§155⑳ 선언이 있어도 같은 유형(종전 결론 유지)", () => {
    const rows = [{ id: "a" }, { id: "b" }] as never;
    expect(resolveFinalOneHouseRestart(house("2022-03-01", { houses: rows })).status).toBe("undetermined");
    expect(resolveFinalOneHouseRestart(house("2022-03-01", { presaleRights: [{ id: "p" }] as never })).status).toBe("undetermined");
    expect(
      resolveFinalOneHouseRestart(house("2022-03-01", { rentalHousingException: { applyException: true } as never })).status,
    ).toBe("undetermined");
  });

  it("[S36-10] 이 유형도 단서 1~3호 면제면 고지하지 않고, 과세로 이미 정해졌으면 고지하지 않는다", () => {
    const waived = house("2022-03-01", {
      knownHouseExclusionCount: 1,
      oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: d("2021-10-01"), departureOnlyHouse: true },
    });
    expect(notice(waived)).toBeUndefined();
    const taxed = baseTransferInput({ acquisitionDate: d("2020-06-01"), transferDate: d("2021-11-10"), knownHouseExclusionCount: 1 });
    expect(notice(taxed)).toBeUndefined();
  });

  it("[S36-11] 이 유형이 이력을 「있음」으로 답하면 종전대로 재기산 과세(결정 #36은 미답 처리만 바꾼다)", () => {
    const i = house("2022-03-01", {
      knownHouseExclusionCount: 1,
      finalOneHouseRestart: { hadOtherHouseDisposal: true, disposals: [{ kind: "transfer", date: d("2021-06-01"), temporaryTwoHouseSpecial: false }] },
    });
    expect(judge(i).isExempt).toBe(false);
  });
});

describe("#36 순수 1주택 술어 (판정 메뉴·계산기·부담부증여가 공유)", () => {
  const base = { transferDate: d("2022-03-01"), acquisitionDate: d("2015-03-01"), householdHousingCount: 1 };
  it("[S36-12] 주택 수 1 · 명부 ≤1행 · 권리 0 · 제외 0 · §155⑳ 없음만 참 / 주택 수 미제공(겸용 등)은 거짓", () => {
    expect(isPlainSingleHouseHousehold(base as never)).toBe(true);
    expect(isPlainSingleHouseHousehold({ ...base, houses: [{ id: "selling" }] } as never)).toBe(true);
    expect(isPlainSingleHouseHousehold({ ...base, householdHousingCount: undefined } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, householdHousingCount: 2 } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, houses: [{ id: "a" }, { id: "b" }] } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, presaleRights: [{ id: "p" }] } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, knownHouseExclusionCount: 1 } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, rentalHousingException: { applyException: true } } as never)).toBe(false);
    expect(isPlainSingleHouseHousehold({ ...base, rentalHousingException: { applyException: false } } as never)).toBe(true);
  });
});

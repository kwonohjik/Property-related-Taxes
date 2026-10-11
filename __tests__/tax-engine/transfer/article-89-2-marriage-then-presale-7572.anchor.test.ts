/**
 * anchor (결정 #7 하위 1 나) — 혼인으로 2주택이 된 뒤 **분양권을 취득**하고 혼인 전 보유하던 주택을 양도하는 경우
 * (서면-2021-부동산-7572, 부동산납세과-1014, 2022.4.21.): 영 §155⑤ + §156의3②.
 *
 * 회신 요지(국세청 상세 페이지 원문): 1주택(A)·1주택(B) 소유자가 혼인해 1세대 2주택이 된 상태에서 종전주택(A, B 중 나중에 취득한 주택)을
 * 취득한 날부터 1년 이상 지난 후 분양권을 취득하고, 분양권 취득일부터 3년 이내·혼인일부터 5년(현행 10년) 이내에 혼인 전 보유하던
 * 주택을 양도하면 1세대1주택. 합가 전 보유 구성 선언(§156의2⑨ 구성)과 무관하게 **명부 날짜**로 판정한다.
 * 모든 부정 단언에 한 요건만 바꾼 긍정 짝(±1일 경계 포함)을 둔다.
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);

/** 양도 주택 A 2019-03-15 · 배우자 쪽 B 2020-09-15 · 혼인 2021-05-15 · 분양권 2022-03-15(B 취득 후 1년 6개월) · 양도 2022-09-15 */
function base(over: Partial<TransferTaxInput> = {}, right: Partial<PresaleRight> = {}, other: Partial<ReturnType<typeof makeHouseInfo>> = {}) {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    sellingHouseId: "A",
    acquisitionDate: D("2019-03-15"),
    transferDate: D("2022-09-15"),
    houses: [
      makeHouseInfo("A", { acquisitionDate: D("2019-03-15") }),
      makeHouseInfo("B", { acquisitionDate: D("2020-09-15"), mergeOrigin: "counterpart_side", ...other }),
    ],
    marriageMerge: { marriageDate: D("2021-05-15") },
    isFirstTransferredInMerge: true,
    presaleRights: [{ id: "C", type: "presale_right", acquisitionDate: D("2022-03-15"), region: "non_capital", ...right }],
    ...over,
  } as Partial<TransferTaxInput>);
}
const verdict = (i: TransferTaxInput) => resolveArticle89Clause2(i, D("2021-01-01"));

describe("7572 — 성립", () => {
  it("★ 구성 선언이 없어도(공란) 명부 날짜로 §156의3② 성립 — viaArticle §155⑤", () => {
    const v = verdict(base());
    expect(v.status).toBe("exception_met");
    expect(v.exception).toBe("소득세법 시행령 §156의3 ②");
    expect(v.viaArticle).toBe("소득세법 시행령 §155⑤");
  });
  it("「어느 것에도 해당하지 않는다」(none)를 골라도 성립한다(종전 함정: 과세)", () => {
    expect(verdict(base({ mergedHouseholdFirstHouse: { kind: "none" } })).status).toBe("exception_met");
  });
  it("나중에 취득한 주택은 양도 주택이어도 된다 — A가 B보다 늦게 취득한 경우 1년 기산은 A", () => {
    // A 2020-12-01 취득(혼인 전) · B 2019-03-15 · 분양권 2022-03-15 → A 취득 후 1년 3개월
    const v = verdict(
      base(
        { acquisitionDate: D("2020-12-01"), houses: [makeHouseInfo("A", { acquisitionDate: D("2020-12-01") }), makeHouseInfo("B", { acquisitionDate: D("2019-03-15"), mergeOrigin: "counterpart_side" })] },
      ),
    );
    expect(v.status).toBe("exception_met");
  });
});

describe("7572 — 요건별 음성 짝 (경계 ±1일)", () => {
  it("1년 경계 — 분양권을 나중 주택(2020-09-15) 취득 1년 뒤(2021-09-16)에 취득하면 성립 / 2021-09-15(응당일)면 1년 미경과", () => {
    // 혼인 2021-05-15 이후 취득이어야 하므로 모두 혼인 후다. 초일불산입 — 응당일 당일 취득은 「1년이 지난 후」가 아니다.
    expect(verdict(base({}, { acquisitionDate: D("2021-09-16") })).status).toBe("exception_met");
    expect(verdict(base({}, { acquisitionDate: D("2021-09-15") })).status).not.toBe("exception_met");
  });
  it("3년 경계 — 분양권 취득일 2022-03-15 + 3년 = 2025-03-15(토) → 민법 §161로 월요일 2025-03-17까지 성립 / 2025-03-18이면 불성립", () => {
    expect(verdict(base({ transferDate: D("2025-03-14") })).status).toBe("exception_met");
    expect(verdict(base({ transferDate: D("2025-03-17") })).status).toBe("exception_met");
    expect(verdict(base({ transferDate: D("2025-03-18") })).status).not.toBe("exception_met");
  });
  it("혼인 후 취득 경계 — 분양권을 혼인일(2021-05-15) 당일 이전에 취득했으면 이 경로가 아니다 / 혼인 다음 날 취득이면 대상", () => {
    expect(verdict(base({}, { acquisitionDate: D("2021-05-15") })).status).not.toBe("exception_met");
    // 혼인 다음날 취득은 나중 주택(2020-09-15) + 1년 미경과라 1년 요건으로 탈락 — 경로 자체(혼인 후 취득)는 통과한다.
    expect(verdict(base({}, { acquisitionDate: D("2021-05-16") })).status).not.toBe("exception_met");
  });
  it("혼인 후 N년 — 양도일 2024-11-11까지는 5년(혼인 2021-05-15 → 2026-05-15 기한이라 둘 다 성립)", () => {
    // 혼인 2016-05-14 · 5년 기한 2021-05-14: 양도일에 따라 5년/10년 연혁이 갈린다 (양도일 기준).
    const old = (transferDate: string) =>
      verdict(
        base({
          transferDate: D(transferDate),
          marriageMerge: { marriageDate: D("2016-05-14") },
          acquisitionDate: D("2013-03-15"),
          houses: [makeHouseInfo("A", { acquisitionDate: D("2013-03-15") }), makeHouseInfo("B", { acquisitionDate: D("2014-09-15"), mergeOrigin: "counterpart_side" })],
        }, { acquisitionDate: D("2024-03-15") }),
      );
    // 양도 2026-05-15는 혼인 후 10년 1일 → 불성립 / 2026-05-14는 10년 이내 → 성립 (분양권 2024-03-15 + 3년 이내)
    expect(old("2026-05-14").status).toBe("exception_met");
    expect(old("2026-05-15").status).not.toBe("exception_met");
  });
  it("「먼저 양도」가 아니면 / 혼인일 전 양도면 성립하지 않는다", () => {
    expect(verdict(base({ isFirstTransferredInMerge: false })).status).not.toBe("exception_met");
    expect(verdict(base({ transferDate: D("2021-05-14") })).status).not.toBe("exception_met");
  });
  it("양도 주택이 혼인 후 취득이면(혼인 전 보유 주택이 아니다) 성립하지 않는다", () => {
    expect(verdict(base({ acquisitionDate: D("2021-05-16"), houses: [makeHouseInfo("A", { acquisitionDate: D("2021-05-16") }), makeHouseInfo("B", { acquisitionDate: D("2020-09-15"), mergeOrigin: "counterpart_side" })] })).status).not.toBe("exception_met");
  });
});

describe("7572 — 명부 구성 음성 짝", () => {
  it("다른 주택이 양도자 쪽(각자 1주택이 아니다) / 쪽을 모름(mergeOrigin 미입력)이면 성립하지 않는다", () => {
    expect(verdict(base({}, {}, { mergeOrigin: "seller_side" })).status).not.toBe("exception_met");
    expect(verdict(base({}, {}, { mergeOrigin: undefined })).status).not.toBe("exception_met");
  });
  it("다른 주택이 혼인 후 취득이면(혼인으로 2주택이 된 것이 아니다) 성립하지 않는다", () => {
    expect(verdict(base({}, {}, { acquisitionDate: D("2021-06-01") })).status).not.toBe("exception_met");
  });
  it("명부가 없으면(나중 취득 주택을 가릴 수 없다) 성립하지 않는다 — 불리하게 단정하지 않고 구성 선언 축이 판정", () => {
    const v = verdict(base({ houses: undefined }));
    expect(v.status).not.toBe("exception_met");
  });
  it("범위 한정 — 입주권 / 상속 분양권 / 동거봉양 합가 동시 입력 / 권리 2개는 이 경로가 아니다", () => {
    expect(verdict(base({}, { type: "redevelopment_right" })).status).not.toBe("exception_met");
    expect(verdict(base({}, { isInherited: true })).status).not.toBe("exception_met");
    expect(verdict(base({ parentalCareMerge: { mergeDate: D("2021-01-01") } })).status).not.toBe("exception_met");
    expect(
      verdict(
        base({
          presaleRights: [
            { id: "C", type: "presale_right", acquisitionDate: D("2022-03-15"), region: "non_capital" },
            { id: "C2", type: "presale_right", acquisitionDate: D("2022-04-15"), region: "non_capital" },
          ] as never,
        }),
      ).status,
    ).not.toBe("exception_met");
  });
});

describe("결정 #7 — 구성 미선택은 불성립 + 확인 필요 (7572 경로가 서지 않을 때)", () => {
  it("1년 미경과 시료 — 공란이면 excluded + 미선언 조문 표기, 「주택 1채만」을 고르면 종전처럼 ⑨2호 충족(해석 미확정 별건)", () => {
    const early = base({}, { acquisitionDate: D("2021-06-15") });
    const blank = verdict(early);
    expect(blank.status).toBe("excluded");
    expect(blank.undeclaredMergeArticles).toEqual(["소득세법 시행령 §156의2 ⑨"]);
    const declared = verdict({ ...early, mergedHouseholdFirstHouse: { kind: "house_only" } });
    expect(declared.status).toBe("exception_met");
    expect(declared.exception).toContain("§156의2 ⑨2호");
  });
  it("「해당 없음」(none)은 사실의 선언이라 미선언 표기가 붙지 않는다", () => {
    const none = verdict({ ...base({}, { acquisitionDate: D("2021-06-15") }), mergedHouseholdFirstHouse: { kind: "none" } });
    expect(none.status).toBe("excluded");
    expect(none.undeclaredMergeArticles).toBeUndefined();
  });
});

/**
 * #42-2 합침 — 상속 행의 「피상속인과 같은 세대였는가」 한 칸(별도세대·동일세대·모름)이 §155② 단서와 조특법 §71의2①에 함께 쓰인다.
 *
 * 종전에는 같은 사실을 두 곳에서 받았다 — 상속 정보의 boolean 토글(`decedentSameHouseholdAtInheritance`, 미답 = 별도세대로 읽혀 특례 적용)과
 * §71의2 블록의 3상태(`popDeclDonorHousehold`). 합친 뒤 미답·모름은 두 규정 모두 불성립 + 확인 필요다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-* | leaf | true=동일세대 · 별도세대는 「직접 골랐다」 표시(`decedentHouseholdSeparate`)가 있을 때만 · 표시 없는 false·미답은 모름과 같이 읽는다 · patch가 모순 없이 쓴다 |
 * | P-* | ④ | 상속 행은 `popDeclDonorHousehold`를 이 칸에서 옮긴다(낡은 값 무시) · 증여 행은 종전 칸 · 모름·미답은 `decedentHouseholdUnconfirmed` |
 * | J-* | 판정 메뉴 route | §155②: 별도세대 비과세 · 동일세대 과세 · 모름·미답 과세 + 확인 필요 사유 |
 * | C-* | 계산기 route | ④ body → ⑫ → ⑭ → 엔진 — 같은 칸이 §71의2①(인구감소 안분 과세)과 §155② 주택 수 제외에 도달한다 |
 * | M-* | 저장값 복원 | 종전 true는 동일세대로 승계, 표시 없는 false(2026-07-19~10-11 팩토리 기본값과 구별 불가)는 미답 = 모름 — 복원(계산기·판정 메뉴)은 행을 그대로 통과시킨다 |
 * | G-* | 엔진 게이트 | `passesHouseholdGate` — 답이 있으면 그 답이 우선, 미확인 표시는 답이 없을 때만 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import {
  decedentHouseholdAnswer,
  decedentHouseholdOf,
  decedentHouseholdPatch,
} from "@/lib/calc/decedent-household";
import { buildOtherHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import {
  passesHouseholdGate,
  isHouseholdUnconfirmed,
  resolveInheritedHouseExclusion,
  buildInheritedExclusionSteps,
} from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { makeHouseInfo } from "../tax-engine/_helpers/mock-rates";
import { ruralInheritedSameHouseholdIssue } from "@/lib/calc/one-house-row-facts";
import { houseRowFactIssues } from "@/lib/calc/house-row-fact-issues";
import { observeCase, makeHouse, type RulingCase } from "./one-house-rulings/harness";
import { mergePersistedWizard, migratePersistedTransferForm, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { normalizeOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";

describe("L leaf — 한 칸의 3상태", () => {
  it("L-1 동일세대(true)·별도세대(표시 + false)는 답이고, boolean false만 있는 낡은 저장분·아무것도 없는 행은 미답", () => {
    expect(decedentHouseholdAnswer({ decedentSameHouseholdAtInheritance: true })).toBe("same");
    expect(decedentHouseholdAnswer({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true })).toBe("separate");
    // 🔴 표시 없는 false — 2026-07-19~10-11 「+ 주택 추가」 팩토리가 미리 넣은 기본값과 구별되지 않아 답이 아니다(#42-2 리뷰)
    expect(decedentHouseholdAnswer({ decedentSameHouseholdAtInheritance: false })).toBeUndefined();
    expect(decedentHouseholdOf({ decedentSameHouseholdAtInheritance: false })).toBe("unknown");
    expect(decedentHouseholdAnswer({})).toBeUndefined();
  });

  it("L-2 모름 표시는 boolean이 비어 있을 때만 모름 · 미답도 읽는 값은 모름 (모름 = 불성립)", () => {
    expect(decedentHouseholdAnswer({ decedentHouseholdUnknown: true })).toBe("unknown");
    expect(decedentHouseholdOf({})).toBe("unknown");
    expect(decedentHouseholdOf({ decedentHouseholdUnknown: true })).toBe("unknown");
    // 답이 있으면 그 답이 우선 — 낡은 모름 표시가 남아도 답을 가리지 않는다
    expect(decedentHouseholdOf({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, decedentHouseholdUnknown: true })).toBe("separate");
    expect(decedentHouseholdOf({ decedentSameHouseholdAtInheritance: true, decedentHouseholdUnknown: true })).toBe("same");
    // 표시 없는 낡은 false는 답이 아니라서 사용자가 명시한 모름을 가리지 못한다
    expect(decedentHouseholdOf({ decedentSameHouseholdAtInheritance: false, decedentHouseholdUnknown: true })).toBe("unknown");
  });

  it("L-3 patch — 값마다 boolean·모름 표시를 함께 쓰고, 동거봉양·재상속 예외는 동일세대일 때만 남긴다", () => {
    const house = { parentalCareMergeInheritedHouse: true, reInheritedFromSeparateHousehold: true };
    expect(decedentHouseholdPatch("same", house)).toEqual({
      decedentSameHouseholdAtInheritance: true,
      decedentHouseholdUnknown: undefined,
      decedentHouseholdSeparate: undefined,
      parentalCareMergeInheritedHouse: true,
      reInheritedFromSeparateHousehold: true,
    });
    for (const v of ["separate", "unknown"] as const) {
      const p = decedentHouseholdPatch(v, house);
      expect(p.parentalCareMergeInheritedHouse, v).toBeUndefined();
      expect(p.reInheritedFromSeparateHousehold, v).toBeUndefined();
      // 키가 patch에 **존재**해야 한다 — 병합 시 낡은 값이 남지 않는다(키 없음 = 보존)
      expect(Object.keys(p), v).toEqual(
        expect.arrayContaining(["decedentSameHouseholdAtInheritance", "decedentHouseholdUnknown", "decedentHouseholdSeparate", "parentalCareMergeInheritedHouse", "reInheritedFromSeparateHousehold"]),
      );
    }
    expect(decedentHouseholdPatch("separate", house)).toMatchObject({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, decedentHouseholdUnknown: undefined });
    expect(decedentHouseholdPatch("unknown", house)).toMatchObject({ decedentSameHouseholdAtInheritance: undefined, decedentHouseholdUnknown: true, decedentHouseholdSeparate: undefined });
  });

  it("L-4 patch를 거친 행은 어느 순서로 바꿔도 모순되지 않는다", () => {
    let h = makeHouse("x", { isInherited: true });
    for (const v of ["unknown", "same", "separate", "unknown", "separate", "same"] as const) {
      h = { ...h, ...decedentHouseholdPatch(v, h) };
      expect(decedentHouseholdAnswer(h), v).toBe(v);
      // 모름 표시와 boolean이 함께 서지 않는다 — 한쪽을 고르면 다른 쪽은 지워진다
      expect(h.decedentHouseholdUnknown === true, v).toBe(v === "unknown");
      expect(h.decedentSameHouseholdAtInheritance === undefined, v).toBe(v === "unknown");
      expect(h.decedentHouseholdSeparate === true, v).toBe(v === "separate");
    }
  });
});

describe("G 엔진 게이트", () => {
  it("G-1 미확인 표시는 답이 없을 때만 불성립 — 답이 있으면 그 답이 우선", () => {
    expect(passesHouseholdGate({ decedentHouseholdUnconfirmed: true })).toBe(false);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: false, decedentHouseholdUnconfirmed: true })).toBe(true);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: true, decedentHouseholdUnconfirmed: true })).toBe(false);
    expect(passesHouseholdGate({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true, decedentHouseholdUnconfirmed: true })).toBe(true);
  });

  it("G-2 키가 없는 직접 입력(구 API 호출)은 종전대로 별도세대로 읽는다 — 미답을 모름으로 바꾸는 것은 ④다", () => {
    expect(passesHouseholdGate({})).toBe(true);
    expect(isHouseholdUnconfirmed({})).toBe(false);
    expect(isHouseholdUnconfirmed({ decedentHouseholdUnconfirmed: true })).toBe(true);
  });
});

describe("G-3 엔진 집계·산식 step — 모름은 「동일세대」와 다른 사유로 센다", () => {
  const D = (d: string) => new Date(d);
  const sell = makeHouseInfo("selling", { acquisitionDate: D("2010-01-01") });
  const inh = (over = {}) =>
    makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2020-01-01"), acquisitionDate: D("2020-01-01"), ...over });
  const run = (over: Record<string, unknown>) => {
    const r = resolveInheritedHouseExclusion([sell, inh(over)], "selling", undefined);
    return { r, steps: buildInheritedExclusionSteps(r, 2).map((s) => s.label) };
  };

  it("G-3a 모름·미확인 → 제외 0 · 미확인 1채 · 동일세대 0채 + 확인 필요 step", () => {
    const { r, steps } = run({ decedentHouseholdUnconfirmed: true });
    expect(r).toMatchObject({ excludedCount: 0, householdUnconfirmedCount: 1, sameHouseholdDisqualifiedCount: 0 });
    expect(steps.some((l) => l.includes("피상속인 세대 미확인") && l.includes("확인 필요"))).toBe(true);
    expect(steps.some((l) => l.includes("동일세대 상속주택"))).toBe(false);
  });

  it("G-3b 동일세대 → 동일세대 1채 · 미확인 0채 · 종전 step / 별도세대 → 제외 1", () => {
    const same = run({ decedentSameHouseholdAtInheritance: true });
    expect(same.r).toMatchObject({ excludedCount: 0, householdUnconfirmedCount: 0, sameHouseholdDisqualifiedCount: 1 });
    expect(same.steps.some((l) => l.includes("동일세대 상속주택"))).toBe(true);
    expect(same.steps.some((l) => l.includes("피상속인 세대 미확인"))).toBe(false);
    const sep = run({ decedentSameHouseholdAtInheritance: false });
    expect(sep.r).toMatchObject({ excludedCount: 1, householdUnconfirmedCount: 0, sameHouseholdDisqualifiedCount: 0 });
  });

  it("G-3c 키가 없는 직접 입력은 종전대로 제외 1 — 미답을 모름으로 바꾸는 것은 ④다", () => {
    expect(run({}).r).toMatchObject({ excludedCount: 1, householdUnconfirmedCount: 0 });
  });
});

describe("P ④ payload", () => {
  const inheritedRow = (over = {}) =>
    makeHouse("p", { isInherited: true, inheritedDate: "2020-01-01", acquisitionDate: "2020-01-01", ...over });
  const payloadOf = (row: ReturnType<typeof makeHouse>) => buildOtherHousesPayload([row])[0] as Record<string, unknown>;

  it("P-1 별도세대·동일세대는 boolean으로, 미확인 표시는 싣지 않는다 · 인구감소 세대 답도 같은 값", () => {
    const sep = payloadOf(inheritedRow({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }));
    expect(sep).toMatchObject({ decedentSameHouseholdAtInheritance: false, popDeclDonorHousehold: "separate" });
    expect(sep.decedentHouseholdUnconfirmed).toBeUndefined();
    const same = payloadOf(inheritedRow({ decedentSameHouseholdAtInheritance: true }));
    expect(same).toMatchObject({ decedentSameHouseholdAtInheritance: true, popDeclDonorHousehold: "same" });
    expect(same.decedentHouseholdUnconfirmed).toBeUndefined();
  });

  it("P-2 모름·미답은 미확인 표시 + 인구감소 세대 답 모름 — 두 규정이 같은 답을 읽는다", () => {
    for (const over of [{ decedentHouseholdUnknown: true }, {}]) {
      const p = payloadOf(inheritedRow(over));
      expect(p, JSON.stringify(over)).toMatchObject({ decedentHouseholdUnconfirmed: true, popDeclDonorHousehold: "unknown" });
      expect(p.decedentSameHouseholdAtInheritance).toBeUndefined();
    }
  });

  it("P-3 상속 행의 낡은 증여자 세대 답(popDeclDonorHousehold)은 무시한다 — 질문이 하나라 이 칸이 정본이다", () => {
    const p = payloadOf(inheritedRow({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, popDeclDonorHousehold: "same" }));
    expect(p.popDeclDonorHousehold).toBe("separate");
  });

  it("P-4 증여 행은 종전 칸 그대로 · 상속도 증여도 아니면 싣지 않는다 · 상속 아닌 행은 미확인 표시가 없다", () => {
    const gift = payloadOf(makeHouse("g", { popDeclAcquiredByGift: "yes", popDeclDonorHousehold: "separate" }));
    expect(gift.popDeclDonorHousehold).toBe("separate");
    expect(gift.decedentHouseholdUnconfirmed).toBeUndefined();
    const giftUnanswered = payloadOf(makeHouse("g", { popDeclAcquiredByGift: "yes" }));
    expect(giftUnanswered.popDeclDonorHousehold).toBeUndefined();
    const plain = payloadOf(makeHouse("n", { popDeclDonorHousehold: "separate", decedentHouseholdUnknown: true }));
    expect(plain.popDeclDonorHousehold).toBeUndefined();
    expect(plain.decedentHouseholdUnconfirmed).toBeUndefined();
  });

  it("P-5 동거봉양·재상속 예외는 동일세대일 때만 싣는다(종전 규약 유지)", () => {
    const same = payloadOf(inheritedRow({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedHouse: true, reInheritedFromSeparateHousehold: true }));
    expect(same).toMatchObject({ parentalCareMergeInheritedHouse: true, reInheritedFromSeparateHousehold: true });
    const unknown = payloadOf(inheritedRow({ decedentHouseholdUnknown: true, parentalCareMergeInheritedHouse: true, reInheritedFromSeparateHousehold: true }));
    expect(unknown.parentalCareMergeInheritedHouse).toBeUndefined();
    expect(unknown.reInheritedFromSeparateHousehold).toBeUndefined();
  });
});

describe("R ⑧ 농어촌 상속주택 — 모름도 답이 아니다", () => {
  const rural = (over = {}) => ({ oneHouseRuralHouse: true as const, ruralHouseKind: "inherited" as const, ...over });
  it("R-1 별도세대·동일세대면 통과 · 모름·미답이면 막는다", () => {
    expect(ruralInheritedSameHouseholdIssue(rural({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }))).toBeNull();
    expect(ruralInheritedSameHouseholdIssue(rural({ decedentSameHouseholdAtInheritance: true }))).toBeNull();
    expect(ruralInheritedSameHouseholdIssue(rural({ decedentHouseholdUnknown: true }))).not.toBeNull();
    expect(ruralInheritedSameHouseholdIssue(rural())).not.toBeNull();
  });
  it("R-2 모름은 판정 메뉴·계산기 공통 목록에서도 같은 필드 오류로 나온다", () => {
    const issues = houseRowFactIssues(makeHouse("r", { isInherited: true, oneHouseRuralHouse: true, ruralHouseKind: "inherited", decedentHouseholdUnknown: true }), undefined);
    expect(issues.map((i) => i.field)).toContain("decedentSameHouseholdAtInheritance");
  });
});

describe("J 판정 메뉴 — E004 짝(상속주택 A' + 일반주택 B 보유 · C 취득 후 B 양도)", () => {
  const base = (inh: Record<string, unknown>): RulingCase => ({
    id: "T42-2",
    docNo: "-",
    docDate: "-",
    basis: "era",
    today: "2016-06-16",
    summary: "",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2016-06-15",
      contractTotalPrice: "500000000",
      asset: { assetKind: "housing", acquisitionDate: "2002-08-12" },
      houses: [
        {
          id: "inh",
          region: "capital",
          acquisitionDate: "2009-02-02",
          isInherited: true,
          inheritedDate: "2009-02-02",
          isCoInherited: false,
          acquisitionOrigin: "general",
          ...inh,
        },
        { id: "c", region: "capital", acquisitionDate: "2015-12-21", acquisitionOrigin: "general" },
      ],
    },
  });

  it("J-1 별도세대 → 상속주택이 주택 수에서 빠져 비과세 (종전 false/미답과 같은 결과)", async () => {
    const o = await observeCase(base({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }));
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses.map((x) => x.houseId)).toContain("inh");
  });

  it("J-2 동일세대(동거봉양 아님) → 과세 + 「동일세대」 사유 (종전 true와 같은 결과)", async () => {
    const o = await observeCase(base({ decedentSameHouseholdAtInheritance: true }));
    expect(o.isExempt).toBe(false);
    const reasons = (o.unmetReasons["155-2-inherited-house"] ?? []).join(" ");
    expect(reasons).toContain("동일세대였습니다");
    expect(reasons).not.toContain("모르거나 답하지");
  });

  it("J-3 모름·미답 → 과세 + 「모르거나 답하지 않았습니다」 확인 필요 사유 — 종전엔 미답이 별도세대로 읽혀 비과세였다", async () => {
    for (const over of [{ decedentHouseholdUnknown: true }, {}]) {
      const o = await observeCase(base(over));
      expect(o.status, JSON.stringify(over)).toBe(200);
      expect(o.isExempt, JSON.stringify(over)).toBe(false);
      expect(o.unmetExceptions, JSON.stringify(over)).toContain("155-2-inherited-house");
      const reasons = (o.unmetReasons["155-2-inherited-house"] ?? []).join(" ");
      expect(reasons, JSON.stringify(over)).toContain("모르거나 답하지 않았습니다");
      expect(reasons, JSON.stringify(over)).not.toContain("동일세대였습니다");
      expect(o.excludedHouses.map((x) => x.houseId)).not.toContain("inh");
    }
  });

  it("J-4 모름이 §155③ 양론(동일세대 공동상속 소수지분) 카드를 만들지 않는다 — 같은 세대라는 사실이 아니라 확인 필요다", async () => {
    const co = { isCoInherited: true, isLargestCoInheritedShareholder: false };
    const same = await observeCase(base({ ...co, decedentSameHouseholdAtInheritance: true }));
    expect(same.contested.map((c) => c.id)).toContain("155-3-same-household-co-inherited-minority");
    const unknown = await observeCase(base({ ...co, decedentHouseholdUnknown: true }));
    expect(unknown.contested.map((c) => c.id)).not.toContain("155-3-same-household-co-inherited-minority");
  });
});

describe("D 판정 메뉴 — 한 답이 §155②와 §71의2①에 함께 쓰인다 (노원 보유 세대 + 상속받은 평창 인구감소지역주택)", () => {
  /**
   * 순위 부적격 선언으로 §155②의 문을 닫아 §71의2①만 남긴다 — 그래야 이 칸이 §71의2에 쓰이는 것을 따로 볼 수 있다
   * (별도세대 상속이면 §155②가 이미 평창 행을 빼 주므로 §71의2는 보이지 않는다).
   */
  const inheritedPyeongchang = (over: Record<string, unknown>): RulingCase => ({
    id: "T42-2-D",
    docNo: "-",
    docDate: "-",
    basis: "current",
    today: "2026-11-02",
    summary: "",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2026-11-01",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2023-06-01", regionCode: "1135010500" },
      houses: [
        {
          id: "p",
          region: "non_capital",
          regionCode: "5176025021",
          acquisitionDate: "2024-03-01",
          isInherited: true,
          inheritedDate: "2024-03-01",
          isCoInherited: false,
          isRankingDisqualifiedInheritedHouse: true,
          acquisitionOfficialPrice: "200000000",
          popDeclSoleAtAcquisition: "yes",
          acquisitionOrigin: "general",
          ...over,
        },
      ],
    },
  });

  it("D-1 별도세대 → §71의2①이 평창 행을 빼 비과세 (이 칸 하나로 — 증여자 세대 칸은 상속 행에 없다)", async () => {
    const o = await observeCase(inheritedPyeongchang({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses).toEqual([expect.objectContaining({ houseId: "p", legalBasis: "조특법 §71의2①" })]);
  });

  it("D-2 같은 세대 → 과세 + 해석이 별도세대만 다룬다는 고지 · 모름·미답 → 과세 + 확인 필요", async () => {
    for (const [label, over] of [
      ["same", { decedentSameHouseholdAtInheritance: true }],
      ["unknown", { decedentHouseholdUnknown: true }],
      ["unanswered", {}],
    ] as const) {
      const o = await observeCase(inheritedPyeongchang(over));
      expect(o.isExempt, label).toBe(false);
      expect(o.undetermined, label).toContain("71-2-pop-decline-unconfirmed");
    }
  });

  it("D-3 낡은 증여자 세대 답(popDeclDonorHousehold)이 남아 있어도 상속 행은 이 칸만 본다", async () => {
    const stale = await observeCase(inheritedPyeongchang({ decedentSameHouseholdAtInheritance: true, popDeclDonorHousehold: "separate" }));
    expect(stale.isExempt).toBe(false);
    const stale2 = await observeCase(inheritedPyeongchang({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, popDeclDonorHousehold: "same" }));
    expect(stale2.isExempt).toBe(true);
  });
});

describe("M 저장값 복원 — 종전 true만 답으로 승계하고, 표시 없는 false는 미답으로 읽는다 (#42-2 리뷰)", () => {
  /**
   * 🔴 종전 저장분의 `false`는 사용자가 고른 별도세대가 아니다 — 「+ 주택 추가」 팩토리가 2026-07-19~10-11(6356561f9 → 642eef8b7)에
   * 새 행마다 `false`를 미리 넣었고, 토글 OFF 표시도 같은 `false`라서 구별할 표지가 없다. 별도세대는 3택 라디오가 함께 쓰는
   * `decedentHouseholdSeparate` 표시가 있을 때만 답이다. 종전 `true`는 토글을 켠 답이라 그대로 동일세대다.
   */
  const legacyRows = [
    { id: "t", isInherited: true, decedentSameHouseholdAtInheritance: true },
    { id: "f", isInherited: true, decedentSameHouseholdAtInheritance: false },
    { id: "u", isInherited: true },
    { id: "k", isInherited: true, decedentHouseholdUnknown: true },
    { id: "s", isInherited: true, decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true },
  ];
  const readAll = (rows: { id: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.id, decedentHouseholdAnswer(r as never)]));
  const EXPECT_ANSWERS = { t: "same", f: undefined, u: undefined, k: "unknown", s: "separate" };

  it("M-1 종전 저장분 — true → 동일세대 · 표시 없는 false → 답 없음(모름과 같이 읽는다) · 표시가 붙은 false → 별도세대", () => {
    expect(readAll(legacyRows)).toEqual(EXPECT_ANSWERS);
    expect(legacyRows.map((r) => decedentHouseholdOf(r as never))).toEqual(["same", "unknown", "unknown", "unknown", "separate"]);
  });

  it("M-2 판정 메뉴 복원(normalize) — 행을 그대로 통과시킨다(옛 false를 지우지도, 표시를 만들어 붙이지도 않는다)", () => {
    const restored = normalizeOneHouseJudgmentForm({ houses: JSON.parse(JSON.stringify(legacyRows)) });
    expect(restored.houses).toEqual(legacyRows);
    expect(readAll(restored.houses)).toEqual(EXPECT_ANSWERS);
  });

  it("M-3 계산기 복원(sessionStorage merge · 이력 폼 이전) — 같다", () => {
    const raw = JSON.parse(JSON.stringify({ ...createDefaultTransferFormData(), houses: legacyRows }));
    expect(migratePersistedTransferForm(raw).houses).toEqual(legacyRows);
    const merged = mergePersistedWizard({ formData: raw }, { formData: createDefaultTransferFormData() } as never);
    const houses = (merged as { formData: { houses: typeof legacyRows } }).formData.houses;
    expect(houses).toEqual(legacyRows);
    expect(readAll(houses)).toEqual(EXPECT_ANSWERS);
  });

  it("M-4 복원한 행의 ④ 결과 — 종전 true·직접 고른 별도세대만 답으로 나가고, 표시 없는 false는 미답과 같이 모름으로 나간다", () => {
    const payload = buildOtherHousesPayload(
      legacyRows.map((r) => makeHouse(r.id, { ...r, inheritedDate: "2020-01-01", acquisitionDate: "2020-01-01" })),
    ) as Record<string, unknown>[];
    const by = Object.fromEntries(payload.map((p) => [p.id as string, p]));
    expect(by.t).toMatchObject({ decedentSameHouseholdAtInheritance: true, popDeclDonorHousehold: "same" });
    expect(by.t.decedentHouseholdUnconfirmed).toBeUndefined();
    expect(by.s).toMatchObject({ decedentSameHouseholdAtInheritance: false, popDeclDonorHousehold: "separate" });
    expect(by.s.decedentHouseholdUnconfirmed).toBeUndefined();
    // 표시 없는 false — 엔진에 별도세대(false)로 닿지 않고 미확인으로 나간다 (§155②와 §71의2① 모두)
    for (const id of ["f", "u", "k"]) {
      expect(by[id], id).toMatchObject({ decedentHouseholdUnconfirmed: true, popDeclDonorHousehold: "unknown" });
      expect(by[id].decedentSameHouseholdAtInheritance, id).toBeUndefined();
    }
  });

  it("M-5 판정 메뉴 route — 표시 없는 낡은 false 행은 §155② 특례를 적용하지 않고 확인 필요로 알린다 (표시가 있으면 적용)", async () => {
    const mk = (over: Record<string, unknown>): RulingCase => ({
      id: "T42-2-M5",
      docNo: "-",
      docDate: "-",
      basis: "era",
      today: "2016-06-16",
      summary: "",
      bucket: "match",
      form: {
        isOneHousehold: true,
        transferDate: "2016-06-15",
        contractTotalPrice: "500000000",
        asset: { assetKind: "housing", acquisitionDate: "2002-08-12" },
        houses: [
          { id: "inh", region: "capital", acquisitionDate: "2009-02-02", isInherited: true, inheritedDate: "2009-02-02", isCoInherited: false, acquisitionOrigin: "general", ...over },
          { id: "c", region: "capital", acquisitionDate: "2015-12-21", acquisitionOrigin: "general" },
        ],
      },
    });
    const legacy = await observeCase(mk({ decedentSameHouseholdAtInheritance: false }));
    expect(legacy.isExempt).toBe(false);
    expect(legacy.excludedHouses.map((x) => x.houseId)).not.toContain("inh");
    expect((legacy.unmetReasons["155-2-inherited-house"] ?? []).join(" ")).toContain("모르거나 답하지 않았습니다");
    const chosen = await observeCase(mk({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true }));
    expect(chosen.isExempt).toBe(true);
    expect(chosen.excludedHouses.map((x) => x.houseId)).toContain("inh");
  });
});

describe("C 계산기 — ④ body → ⑫ Zod → ⑭ route → 엔진 (상속받은 평창 인구감소지역주택, 순위 부적격 선언으로 §155②를 닫아 §71의2①만 본다)", () => {
  const calc = async (inh: Record<string, unknown>) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2027-06-01";
    f.isOneHousehold = true;
    f.contractTotalPrice = "2000000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.residencePeriodMonths = "60";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-15",
      actualSalePrice: "2000000000",
      fixedAcquisitionPrice: "1500000000",
      addressJibun: "x",
      regionCode: "1168010100",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "60",
    });
    f.houses = [
      {
        id: "p",
        region: "non_capital",
        regionCode: "5176025021",
        acquisitionDate: "2024-03-01",
        officialPrice: "400000000",
        acquisitionOfficialPrice: "400000000",
        isInherited: true,
        inheritedDate: "2024-03-01",
        isRankingDisqualifiedInheritedHouse: true,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
        popDeclSoleAtAcquisition: "yes",
        ...inh,
      } as never,
    ];
    let body: Record<string, unknown> = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 본다 */
    } finally {
      globalThis.fetch = realFetch;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data: { result: { totalTax: number; isPartialExempt: boolean; warnings: string[] } } };
    return { body: body as { houses: Record<string, unknown>[] }, status: res.status, r: json.data.result };
  };

  it("C-1 별도세대 → body에 false·인구감소 세대 separate로 실리고 §71의2①로 안분 과세 (14,124,000)", async () => {
    const { body, status, r } = await calc({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true });
    expect(status).toBe(200);
    expect(body.houses.find((h) => h.id === "p")).toMatchObject({ decedentSameHouseholdAtInheritance: false, popDeclDonorHousehold: "separate" });
    expect(r).toMatchObject({ totalTax: 14_124_000, isPartialExempt: true });
  });

  it("C-2 동일세대 → 같은 값(14,124,000이 아님) — §71의2①을 적용하지 않고 전액 과세 + 경고 (299,816,000)", async () => {
    const { body, r } = await calc({ decedentSameHouseholdAtInheritance: true });
    expect(body.houses.find((h) => h.id === "p")).toMatchObject({ decedentSameHouseholdAtInheritance: true, popDeclDonorHousehold: "same" });
    expect(r).toMatchObject({ totalTax: 299_816_000, isPartialExempt: false });
    expect(r.warnings.join(" ")).toContain("조특법 §71의2①");
  });

  it("C-4 표시 없는 낡은 false(종전 팩토리 기본값) → body에 미확인으로 실리고 전액 과세 — 별도세대로 읽히지 않는다 (299,816,000)", async () => {
    const { body, r } = await calc({ decedentSameHouseholdAtInheritance: false });
    const row = body.houses.find((h) => h.id === "p")!;
    expect(row).toMatchObject({ decedentHouseholdUnconfirmed: true, popDeclDonorHousehold: "unknown" });
    expect(row.decedentSameHouseholdAtInheritance).toBeUndefined();
    expect(r).toMatchObject({ totalTax: 299_816_000, isPartialExempt: false });
  });

  it("C-3 모름·미답 → body에 미확인으로 실리고 같은 전액 과세 + 확인 필요 경고 · ⑫가 새 키를 지우지 않는다", async () => {
    for (const over of [{ decedentHouseholdUnknown: true }, {}]) {
      const { body, status, r } = await calc(over);
      expect(status, JSON.stringify(over)).toBe(200);
      expect(body.houses.find((h) => h.id === "p"), JSON.stringify(over)).toMatchObject({ decedentHouseholdUnconfirmed: true, popDeclDonorHousehold: "unknown" });
      expect(r, JSON.stringify(over)).toMatchObject({ totalTax: 299_816_000, isPartialExempt: false });
      expect(r.warnings.join(" "), JSON.stringify(over)).toContain("조특법 §71의2①");
    }
  });
});

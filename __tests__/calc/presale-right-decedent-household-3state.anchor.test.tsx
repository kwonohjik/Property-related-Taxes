/**
 * @vitest-environment jsdom
 *
 * 입주권·분양권 상속 행의 「피상속인과 같은 세대였습니까」 한 칸(별도세대·동일세대·모름) — 주택 행(#42-2 합침)과 같은 규약.
 *
 * 종전 토글은 미답과 「동일세대 아님」을 구별하지 못해 **답하지 않아도 별도세대로 읽혔다** — 상속 권리 특례(§156의2⑥·§156의3④ 단서)가
 * 적용되고 분양권은 상속개시일 기준으로 셌다. 모름·미답은 불성립 + 확인 필요다(2026-10-04 원칙 1).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | leaf | 권리 행 patch가 boolean·모름·별도세대 표시를 모순 없이 쓰고 동거봉양 예외는 동일세대에서만 산다 |
 * | P-1 | ④ | 동일세대=true · 별도세대=false · 모름·미답·표시 없는 낡은 false=키 없음+확인 표시 · 상속 해제 행은 싣지 않는다 |
 * | P-2 | ④→⑫→⑭ | 확인 표시가 Zod·route를 지나 엔진 입력에 닿는다 |
 * | E-1 | §89② ⑥ 단서 | 모름 → 상속 권리 불성립(일반 권리) + 확인 필요 · 별도세대 → 성립 · 동일세대 → 분양권 정의일 이전이면 대상 아님 |
 * | E-2 | 입주권 | 모름이면 입주권도 불성립 + trace에 종류가 남는다 |
 * | E-3 | 정의일 고지 | 별도세대 문구·모름 문구가 가려 붙고 모름을 별도세대라고 단정하지 않는다 |
 * | E-4 | §104⑦ | 중과 경고도 같은 문구를 쓴다 |
 * | W-1 | ⑤ | 3택 라디오 · 미답이면 아무것도 선택 안 됨 · 동거봉양 칩은 동일세대에서만 · 낡은 false는 답으로 인정 안 함 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  decedentHouseholdAnswer,
  decedentHouseholdOf,
  decedentHouseholdRightPatch,
} from "@/lib/calc/decedent-household";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// 스키마 모듈 순환 초기화 순서 — 진입 모듈을 먼저 불러야 sub의 shape가 정의된다.
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import {
  INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE,
  INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE,
  inheritedPresaleRightHouseholdNotices,
} from "@/lib/tax-engine/presale-right-definition-date";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { qualifyInheritedRight, type Article89Clause2Trace } from "@/lib/tax-engine/transfer-tax-89-2-inherited-right";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import {
  INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID,
  inheritedPresaleRightSeparateHouseholdUndetermined,
} from "@/lib/tax-engine/one-house/pending";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { defaultRules, makeHouse, makeInput, mockRegulatedHistory, suspensionNone } from "../tax-engine/_helpers/multi-house-mock";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const START = D("2021-01-01");

const entry = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
  id: "b",
  type: "presale_right",
  acquisitionDate: "2021-02-10",
  region: "capital",
  isInherited: true,
  decedentAcquisitionDate: "2019-06-15",
  ...over,
});

const SAME = { decedentSameHouseholdAtInheritance: true } as const;
const SEPARATE = { decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true } as const;
const UNKNOWN = { decedentHouseholdUnknown: true } as const;
const LEGACY_FALSE = { decedentSameHouseholdAtInheritance: false } as const;

describe("L-1 leaf — 권리 행에도 같은 3상태", () => {
  it("patch가 세 표시를 모순 없이 쓴다", () => {
    expect(decedentHouseholdRightPatch("same", {})).toMatchObject({ decedentSameHouseholdAtInheritance: true, decedentHouseholdUnknown: undefined, decedentHouseholdSeparate: undefined });
    expect(decedentHouseholdRightPatch("separate", {})).toMatchObject({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, decedentHouseholdUnknown: undefined });
    expect(decedentHouseholdRightPatch("unknown", {})).toMatchObject({ decedentSameHouseholdAtInheritance: undefined, decedentHouseholdUnknown: true, decedentHouseholdSeparate: undefined });
  });

  it("동거봉양 예외는 동일세대로 고를 때만 산다", () => {
    const r = { parentalCareMergeInheritedRight: true };
    expect(decedentHouseholdRightPatch("same", r).parentalCareMergeInheritedRight).toBe(true);
    expect(decedentHouseholdRightPatch("separate", r).parentalCareMergeInheritedRight).toBeUndefined();
    expect(decedentHouseholdRightPatch("unknown", r).parentalCareMergeInheritedRight).toBeUndefined();
  });

  it("답 읽기 — 표시 없는 낡은 false는 답이 아니고 미답은 모름이다", () => {
    expect(decedentHouseholdAnswer(entry(SAME))).toBe("same");
    expect(decedentHouseholdAnswer(entry(SEPARATE))).toBe("separate");
    expect(decedentHouseholdAnswer(entry(UNKNOWN))).toBe("unknown");
    expect(decedentHouseholdAnswer(entry(LEGACY_FALSE))).toBeUndefined();
    expect(decedentHouseholdOf(entry(LEGACY_FALSE))).toBe("unknown");
    expect(decedentHouseholdOf(entry())).toBe("unknown");
  });
});

describe("P-1 ④ payload", () => {
  const payload = (e: PresaleRightEntry) => buildPresaleRightsPayload("housing", [e])![0];

  it("동일세대 → true · 별도세대 → false · 확인 표시 없음", () => {
    expect(payload(entry(SAME))).toMatchObject({ decedentSameHouseholdAtInheritance: true });
    expect(payload(entry(SAME)).decedentHouseholdUnconfirmed).toBeUndefined();
    expect(payload(entry(SEPARATE))).toMatchObject({ decedentSameHouseholdAtInheritance: false });
    expect(payload(entry(SEPARATE)).decedentHouseholdUnconfirmed).toBeUndefined();
  });

  it("🔴 모름·미답·표시 없는 낡은 false → 키 없음 + 확인 표시(별도세대로 읽히지 않는다)", () => {
    for (const over of [UNKNOWN, {}, LEGACY_FALSE]) {
      const p = payload(entry(over));
      expect(p.decedentSameHouseholdAtInheritance, JSON.stringify(over)).toBeUndefined();
      expect(p.decedentHouseholdUnconfirmed, JSON.stringify(over)).toBe(true);
    }
  });

  it("상속을 해제한 행에 남은 답은 싣지 않는다", () => {
    const p = payload(entry({ isInherited: false, ...SAME }));
    expect(p.decedentSameHouseholdAtInheritance).toBeUndefined();
    expect(p.decedentHouseholdUnconfirmed).toBeUndefined();
  });
});

describe("P-2 ④→⑫→⑭ — 확인 표시가 엔진 입력에 닿는다", () => {
  const through = (e: PresaleRightEntry) => {
    const parsed = buildPresaleRightsPayload("housing", [e])!.map((p) => presaleRightSchema.parse(p));
    return mapPresaleRightsToEngine(parsed, undefined)![0];
  };

  it("모름이면 decedentHouseholdUnconfirmed=true, 별도세대면 false 답만 남는다", () => {
    const unk = through(entry(UNKNOWN));
    expect(unk.decedentHouseholdUnconfirmed).toBe(true);
    expect(unk.decedentSameHouseholdAtInheritance).toBeUndefined();
    const sep = through(entry(SEPARATE));
    expect(sep.decedentHouseholdUnconfirmed).toBeUndefined();
    expect(sep.decedentSameHouseholdAtInheritance).toBe(false);
  });
});

/** A 2015-03-15 취득 · 양도 2024-04-15(상속개시 후 3년 초과) — 분양권을 산입하면 §156의3② 기한을 넘긴다. */
const e067 = (r: PresaleRight) =>
  baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    acquisitionDate: D("2015-03-15"),
    transferDate: D("2024-04-15"),
    presaleRights: [r],
  });

/** 상속개시 2021-02-10 · 피상속인 취득 2019-06-15 — 요건을 모두 갖춘 상속 분양권(세대만 가른다). */
const right = (over: Partial<PresaleRight> = {}): PresaleRight => ({
  id: "b",
  type: "presale_right",
  acquisitionDate: D("2021-02-10"),
  region: "capital",
  isInherited: true,
  decedentAcquisitionDate: D("2019-06-15"),
  decedentOwnedHouseAtDeath: false,
  decedentOwnedOtherRightTypeAtDeath: false,
  ...over,
});
const sepRight = (o: Partial<PresaleRight> = {}) => right({ decedentSameHouseholdAtInheritance: false, ...o });
const unkRight = (o: Partial<PresaleRight> = {}) => right({ decedentHouseholdUnconfirmed: true, ...o });
const baseRules = () => parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;

describe("E-1 §89② ⑥ 단서 — 모름은 혜택 불성립 + 확인 필요", () => {
  it("★ 별도세대 → 비과세(상속 권리 성립) · 모름 → 배제 + 확인 필요 · 동일세대 → 정의일 이전이라 대상 아님", () => {
    const sep = resolveArticle89Clause2(e067(sepRight()), START);
    expect(sep.status).toBe("exception_met");
    const unk = resolveArticle89Clause2(e067(unkRight()), START);
    expect(unk.status).toBe("excluded");
    expect((unk.confirmNotes ?? []).join(" ")).toMatch(/같은 세대였는지 모르거나 답하지 않아/);
    expect((unk.confirmNotes ?? []).join(" ")).toContain("④ 단서");
    expect(resolveArticle89Clause2(e067(right({ decedentSameHouseholdAtInheritance: true })), START).status).toBe("not_applicable");
  });

  it("판정 — 별도세대는 비과세, 모름은 과세 + 확인 필요(별도세대 문구가 아니라 모름 문구)", () => {
    const run = (r: PresaleRight) => checkExemption(e067(r) as OneHouseJudgeInput, baseRules(), START);
    expect(run(sepRight()).isExempt).toBe(true);
    const unk = run(unkRight());
    expect(unk.isExempt).toBe(false);
    const reasons = (unk.undetermined ?? []).map((u) => u.reason).join(" ");
    expect(reasons).toContain(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE);
    expect(reasons).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
  });

  it("다른 불성립 사유(피상속인 주택 보유)가 먼저면 세대 확인 필요를 덧붙이지 않는다", () => {
    const r = unkRight({ decedentOwnedHouseAtDeath: true });
    const res = resolveArticle89Clause2(e067(r), START);
    expect((res.confirmNotes ?? []).join(" ")).not.toMatch(/같은 세대였는지 모르거나/);
  });
});

describe("E-2 입주권도 같다", () => {
  const redev = (o: Partial<PresaleRight> = {}): PresaleRight => ({
    id: "r",
    type: "redevelopment_right",
    acquisitionDate: D("2021-02-10"),
    inheritedDate: D("2021-02-10"),
    region: "capital",
    isInherited: true,
    decedentOwnedHouseAtDeath: false,
    decedentOwnedOtherRightTypeAtDeath: false,
    ...o,
  });
  const qualify = (r: PresaleRight) => {
    const trace: Article89Clause2Trace = {};
    const v = qualifyInheritedRight(r, e067(r) as never, false, trace);
    return { v, trace };
  };

  it("별도세대는 성립 · 모름은 불성립 + trace에 입주권 종류 · 동일세대는 동거봉양 예외 없으면 불성립(trace 없음)", () => {
    expect(qualify(redev({ decedentSameHouseholdAtInheritance: false })).v).toBe("qualified");
    const unk = qualify(redev({ decedentHouseholdUnconfirmed: true }));
    expect(unk.v).toBe("disqualified");
    expect(unk.trace.householdUnconfirmed).toEqual(["redevelopment_right"]);
    const same = qualify(redev({ decedentSameHouseholdAtInheritance: true }));
    expect(same.v).toBe("disqualified");
    expect(same.trace.householdUnconfirmed).toBeUndefined();
  });

  it("동일세대 + 동거봉양 합가 예외는 성립", () => {
    expect(qualify(redev({ decedentSameHouseholdAtInheritance: true, parentalCareMergeInheritedRight: true })).v).toBe("qualified");
  });
});

describe("E-3 정의일 고지 문구 — 모름을 별도세대로 단정하지 않는다", () => {
  const sepR = sepRight();
  const unkR = unkRight();

  it("별도세대 행 → 별도세대 문구만 · 모름 행 → 모름 문구만 · 둘 다 → 둘 다", () => {
    expect(inheritedPresaleRightHouseholdNotices([sepR], START)).toEqual([INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE]);
    expect(inheritedPresaleRightHouseholdNotices([unkR], START)).toEqual([INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE]);
    expect(inheritedPresaleRightHouseholdNotices([sepR, unkR], START)).toEqual([
      INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE,
      INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE,
    ]);
  });

  it("답이 있으면 답이 우선이다 — 별도세대로 답한 행에 확인 표시가 겹쳐도 별도세대 문구", () => {
    expect(inheritedPresaleRightHouseholdNotices([sepRight({ decedentHouseholdUnconfirmed: true })], START)).toEqual([
      INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE,
    ]);
  });

  it("판정 보류는 한 id에 두 문구를 함께 싣는다(별도세대 행 + 모름 행)", () => {
    const input = { presaleRights: [sepRight({ id: "s" }), unkRight({ id: "u" })] } as unknown as OneHouseJudgeInput;
    const [u] = inheritedPresaleRightSeparateHouseholdUndetermined(input, { status: "excluded" } as never, true, START);
    expect(u.id).toBe(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID);
    expect(u.reason).toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
    expect(u.reason).toContain(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE);
  });

  it("동일세대 · 피상속인 취득일이 정의일 이후 · 상속개시일이 정의일 전이면 고지 없음", () => {
    expect(inheritedPresaleRightHouseholdNotices([right({ decedentSameHouseholdAtInheritance: true })], START)).toEqual([]);
    expect(inheritedPresaleRightHouseholdNotices([unkR].map((r) => ({ ...r, decedentAcquisitionDate: D("2021-01-01") })), START)).toEqual([]);
    expect(inheritedPresaleRightHouseholdNotices([unkR].map((r) => ({ ...r, acquisitionDate: D("2020-12-31") })), START)).toEqual([]);
  });

  it("모름 문구는 별도세대라고 말하지 않는다", () => {
    expect(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE).not.toContain("별도세대인 피상속인");
    expect(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE).toContain("모르거나 답하지 않았습니다");
  });
});

describe("E-4 §104⑦ — 중과 경고도 같은 문구", () => {
  const run = (r: PresaleRight) =>
    determineMultiHouseSurcharge(makeInput([makeHouse("self", { regionCode: "11680" })], { presaleRights: [r] }), defaultRules, mockRegulatedHistory, suspensionNone, true);

  it("별도세대 → 주택 수 2 + 별도세대 문구 · 모름 → 주택 수 2 + 모름 문구(별도세대 문구 없음) · 동일세대 → 1 + 경고 없음", () => {
    const sep = run(sepRight());
    expect(sep.effectiveHouseCount).toBe(2);
    expect(sep.warnings).toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
    const unk = run(unkRight());
    expect(unk.effectiveHouseCount).toBe(2);
    expect(unk.warnings).toContain(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE);
    expect(unk.warnings).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
    const same = run(right({ decedentSameHouseholdAtInheritance: true }));
    expect(same.effectiveHouseCount).toBe(1);
    expect(same.warnings).not.toContain(INHERITED_PRESALE_RIGHT_HOUSEHOLD_UNKNOWN_NOTICE);
  });
});

describe("W-1 ⑤ 위젯", () => {
  const show = (r: PresaleRightEntry, onChange = vi.fn()) => {
    render(<PresaleRightsSection rights={[r]} onChange={onChange} primaryKind="housing" />);
    return onChange;
  };
  const radio = (v: string) => screen.getByTestId(`presale-decedent-household-${v}-0`) as HTMLInputElement;
  const PARENTAL = /동거봉양 합가 전부터 보유하던 분양권/;

  it("3택이 열리고 미답이면 아무것도 선택돼 있지 않다 · 질문 문구는 한 번", () => {
    show(entry());
    for (const v of ["separate", "same", "unknown"]) expect(radio(v).checked, v).toBe(false);
    expect(screen.queryAllByText(/상속개시 당시 피상속인과 같은 세대였습니까/)).toHaveLength(1);
    expect(screen.queryByRole("switch", { name: /상속개시 당시 피상속인과 동일세대/ })).toBeNull();
  });

  it("답이 라디오에 그대로 보인다", () => {
    show(entry(SEPARATE));
    expect(radio("separate").checked).toBe(true);
    cleanup();
    show(entry(UNKNOWN));
    expect(radio("unknown").checked).toBe(true);
    cleanup();
    show(entry(SAME));
    expect(radio("same").checked).toBe(true);
  });

  it("선택 → 행에 patch가 쓰인다(별도세대=false+표시 · 모름=표시 · 동일세대=true)", () => {
    const onChange = show(entry());
    fireEvent.click(radio("separate"));
    const next = onChange.mock.calls.at(-1)![0][0] as PresaleRightEntry;
    expect(next).toMatchObject({ decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true });
  });

  it("동거봉양 칩은 동일세대일 때만 보인다", () => {
    show(entry(SAME));
    expect(screen.queryAllByText(PARENTAL).length).toBeGreaterThan(0);
    cleanup();
    show(entry(SEPARATE));
    expect(screen.queryAllByText(PARENTAL)).toHaveLength(0);
    cleanup();
    show(entry(UNKNOWN));
    expect(screen.queryAllByText(PARENTAL)).toHaveLength(0);
  });

  it("🔴 표시 없는 낡은 false는 아무것도 선택하지 않고 이유를 밝힌다", () => {
    show(entry(LEGACY_FALSE));
    for (const v of ["separate", "same", "unknown"]) expect(radio(v).checked, v).toBe(false);
    expect(screen.getByTestId("presale-decedent-household-legacy-note-0")).toBeTruthy();
  });

  it("상속이 아닌 행에는 칸이 없다", () => {
    show(entry({ isInherited: false }));
    expect(screen.queryByTestId("presale-decedent-household-block-0")).toBeNull();
  });
});

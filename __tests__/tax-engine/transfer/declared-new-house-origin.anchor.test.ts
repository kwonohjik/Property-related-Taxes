/**
 * §155① 일시적 2주택 — 신규 주택 **직접 선언 경로**의 취득 경위 질문 (결정 #43-3).
 *
 * 명부 행이 없는 직접 선언 폴백(`temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)은 경위를 묻지 못해 `not_collected`로 갔다.
 * 질문을 추가해, 답이 들어오면 명부 경로와 **같은 정본**(`judgeNewHouseOrigin`·`evaluateTemporaryTwoHouseTiming`)이 판정한다.
 *
 * | # | 검증 | 기대 |
 * |---|---|---|
 * | U-* | leaf(`declared-new-house-origin.ts`) | 미답 = not_collected · 유효 취득일 · ⑧ 규칙 = 명부 행 규칙 · patch |
 * | R-* | resolver 폴백 | 경위·날짜가 도출에 실린다 · 인자를 생략하면 종전(not_collected) |
 * | V-* | ⑧ 검증 | 미답은 막지 않는다 · 앞뒤가 안 맞는 답은 막는다 · 섹션이 없으면 막지 않는다 |
 * | C-* | 계산기 route(④⑫⑭ → 엔진) | 불변(미답 = 옛 이력 = 종전) · 방향별 시료 · 명부 경로와 패리티 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  declaredNewHouseEffectiveAcquisitionDate,
  declaredNewHouseOriginIssue,
  declaredNewHouseOriginOf,
  declaredNewHouseOriginPatch,
} from "@/lib/calc/declared-new-house-origin";
import { newHouseOriginIssue } from "@/lib/calc/new-house-origin-scope";
import { resolveTemporaryTwoHouse } from "@/lib/calc/household-house-count";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";

describe("U leaf — declared-new-house-origin", () => {
  it("U-1 미답(빈 값·키 없음)은 not_collected — 옛 이력과 같다", () => {
    expect(declaredNewHouseOriginOf({})).toEqual({ kind: "not_collected" });
    expect(declaredNewHouseOriginOf({ newHouseOriginKind: "" })).toEqual({ kind: "not_collected" });
    // 경위 없이 날짜만 남은 상태도 미답이다(경위가 날짜의 의미를 정한다)
    expect(declaredNewHouseOriginOf({ newHouseOriginKind: "", newHouseRightAcquisitionDate: "2021-09-01" })).toEqual({ kind: "not_collected" });
  });
  it("U-2 답은 경위·날짜를 그대로 싣고 빈 날짜는 키를 만들지 않는다", () => {
    expect(declaredNewHouseOriginOf({ newHouseOriginKind: "general" })).toEqual({ kind: "general" });
    expect(declaredNewHouseOriginOf({ newHouseOriginKind: "unknown" })).toEqual({ kind: "unknown" });
    expect(
      declaredNewHouseOriginOf({
        newHouseOriginKind: "successor_right",
        newHouseRightAcquisitionDate: "2008-06-01",
        newHouseRightApprovalDate: "2007-01-01",
      }),
    ).toEqual({ kind: "successor_right", rightAcquisitionDate: "2008-06-01", rightApprovalDate: "2007-01-01" });
    expect(declaredNewHouseOriginOf({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "" })).toEqual({ kind: "presale" });
  });
  it("U-3 유효 취득일 — 기존주택의 연장(원조합원 기존주택·자가 재건축)만 권리 취득일로 바뀐다", () => {
    const eff = (kind: string, date?: string) =>
      declaredNewHouseEffectiveAcquisitionDate("2024-09-15", { newHouseOriginKind: kind as never, newHouseRightAcquisitionDate: date });
    expect(eff("self_rebuild", "2022-01-10")).toBe("2022-01-10");
    expect(eff("original_member_house", "2005-01-10")).toBe("2005-01-10");
    expect(eff("self_rebuild")).toBe("2024-09-15"); // 날짜를 모르면 완공일 그대로(엔진이 불성립 + 확인 필요)
    for (const k of ["general", "presale", "successor_right", "original_member_non_house", "unknown", ""]) {
      expect(eff(k, "2021-09-01")).toBe("2024-09-15");
    }
  });
  it("U-4 ⑧ 규칙은 명부 행 규칙(newHouseOriginIssue)과 같다 — 미답만 다르다(막지 않는다)", () => {
    expect(declaredNewHouseOriginIssue({}, "2025-09-15")).toBeNull();
    expect(declaredNewHouseOriginIssue({ newHouseOriginKind: "general" }, "2025-09-15")).toBeNull();
    expect(declaredNewHouseOriginIssue({ newHouseOriginKind: "unknown" }, "2025-09-15")).toBeNull();
    const cases: Array<[Parameters<typeof declaredNewHouseOriginIssue>[0], string]> = [
      [{ newHouseOriginKind: "presale" }, "2025-09-15"], // 권리 취득일 누락
      [{ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2025-09-16" }, "2025-09-15"], // 완공일보다 늦음
      [{ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2025-09-15" }, "2025-09-15"], // 같은 날 허용
      [{ newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2005-06-01", newHouseRightApprovalDate: "2005-06-02" }, "2008-09-30"],
    ];
    for (const [f, newAcq] of cases) {
      const declared = declaredNewHouseOriginIssue(f, newAcq);
      const row = newHouseOriginIssue(
        {
          id: "declared",
          acquisitionDate: newAcq,
          acquisitionOrigin: f.newHouseOriginKind as never,
          rightAcquisitionDate: f.newHouseRightAcquisitionDate,
          rightApprovalDate: f.newHouseRightApprovalDate,
        },
        "declared",
      );
      expect(declared?.message ?? null).toBe(row?.message ?? null);
    }
    expect(declaredNewHouseOriginIssue({ newHouseOriginKind: "presale" }, "2025-09-15")?.field).toBe("newHouseOriginKind");
  });
  it("U-5 공용 블록의 행 patch → 세 필드 patch — 경위를 바꾸면 날짜 둘이 빈 값으로 간다", () => {
    expect(declaredNewHouseOriginPatch({ acquisitionOrigin: "presale", rightAcquisitionDate: undefined, rightApprovalDate: undefined })).toEqual({
      newHouseOriginKind: "presale",
      newHouseRightAcquisitionDate: "",
      newHouseRightApprovalDate: "",
    });
    expect(declaredNewHouseOriginPatch({ rightAcquisitionDate: "2021-09-01" })).toEqual({ newHouseRightAcquisitionDate: "2021-09-01" });
    expect(declaredNewHouseOriginPatch({ rightApprovalDate: "2007-01-01" })).toEqual({ newHouseRightApprovalDate: "2007-01-01" });
  });
});

const resolverArgs = {
  primaryKind: "housing",
  primaryAcquisitionDate: "2023-03-15",
  houses: [] as never[],
  transferDate: "2025-06-15",
  legacyPrecedence: false,
  declaredSpecial: true,
  declaredNewHouseDate: "2024-06-15",
  mergeContext: undefined,
  excludedHouseIds: new Set<string>(),
  rentalResidenceHouseIds: new Set<string>(),
};

describe("R resolver 폴백", () => {
  it("R-1 인자를 생략하면 종전(not_collected) — 성립 여부만 보는 호출부", () => {
    expect(resolveTemporaryTwoHouse(resolverArgs)).toMatchObject({
      source: "declared",
      newAcquisitionDate: "2024-06-15",
      newHouseOrigin: { kind: "not_collected" },
    });
  });
  it("R-2 답이 있으면 경위·권리 취득일이 도출에 실린다 (날짜는 그대로)", () => {
    const d = resolveTemporaryTwoHouse({
      ...resolverArgs,
      declaredNewHouseOrigin: { kind: "presale", rightAcquisitionDate: "2021-09-01" },
    });
    expect(d).toMatchObject({
      source: "declared",
      newAcquisitionDate: "2024-06-15",
      newHouseOrigin: { kind: "presale", rightAcquisitionDate: "2021-09-01" },
    });
  });
  it("R-3 기존주택의 연장은 신규 주택 취득일이 기존주택 취득일로 바뀐다 (명부 경로와 같다)", () => {
    const d = resolveTemporaryTwoHouse({
      ...resolverArgs,
      declaredNewHouseOrigin: { kind: "self_rebuild", rightAcquisitionDate: "2022-01-10" },
    });
    expect(d).toMatchObject({ newAcquisitionDate: "2022-01-10", newHouseOrigin: { kind: "self_rebuild" } });
  });
  it("R-4 선언(토글·날짜)이 없으면 경위가 있어도 도출하지 않는다 — 경위는 도출 성립 여부를 바꾸지 않는다", () => {
    const origin = { kind: "presale", rightAcquisitionDate: "2021-09-01" } as const;
    expect(resolveTemporaryTwoHouse({ ...resolverArgs, declaredSpecial: false, declaredNewHouseOrigin: origin })).toBeUndefined();
    expect(resolveTemporaryTwoHouse({ ...resolverArgs, declaredNewHouseDate: undefined, declaredNewHouseOrigin: origin })).toBeUndefined();
  });
});

// ─── 계산기 route · ④ · ⑧ ───────────────────────────────────────────────────────
type Form = ReturnType<typeof createDefaultTransferFormData>;

/** 종전주택 `prev` 취득 · 양도 `transfer`. 직접 선언은 명부 행 없이 신규 주택 취득일만 선언한다. */
function buildForm(opts: { prev: string; transfer: string; declaredNew?: string; roster?: Record<string, unknown>[]; over?: Record<string, unknown> }): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = opts.transfer;
  f.isOneHousehold = true;
  f.contractTotalPrice = "800000000";
  f.householdNoPresaleRightsConfirmed = true;
  f.householdHousingCount = "2";
  f.residencePeriodMonths = "0";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: opts.prev,
    actualSalePrice: "800000000",
    fixedAcquisitionPrice: "300000000",
    addressJibun: "테스트 주소 1",
    regionCode: "4377037000",
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
  });
  if (opts.roster) {
    f.householdNoOtherHousesConfirmed = true;
    f.houses = opts.roster.map((h) => ({
      region: "non_capital",
      regionCode: "4377037000",
      officialPrice: "100000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...h,
    })) as never;
  } else {
    f.householdNoOtherHousesConfirmed = false;
    f.temporaryTwoHouseSpecial = true;
    f.newHouseAcquisitionDate = opts.declaredNew ?? "";
  }
  Object.assign(f, opts.over ?? {});
  return f;
}

type Run = { body: Record<string, unknown>; status: number; isExempt?: boolean; totalTax?: number; warnings: string[] };
async function run(f: Form): Promise<Run> {
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
  const json = (await res.json()) as { data?: { result: { isExempt: boolean; totalTax: number; warnings: string[] } } };
  return { body, status: res.status, isExempt: json.data?.result.isExempt, totalTax: json.data?.result.totalTax, warnings: json.data?.result.warnings ?? [] };
}
const origin = (r: Run) => (r.body.temporaryTwoHouse as { newHouseOrigin?: unknown } | undefined)?.newHouseOrigin;

/** 순차 시료 — 종전주택 2023-03-15 · 신규 주택 완공 2024-06-15 · 양도 2025-06-15 (신규 취득 후 1년 · 종전 보유 2년 이상) */
const SEQ = { prev: "2023-03-15", transfer: "2025-06-15", declaredNew: "2024-06-15" };
const set = (over: Record<string, unknown>) => buildForm({ ...SEQ, over });
const rosterRow = (o: Record<string, unknown>) => buildForm({ prev: SEQ.prev, transfer: SEQ.transfer, roster: [{ id: "n", acquisitionDate: SEQ.declaredNew, ...o }] });

describe("C 계산기 route — 직접 선언 경로", () => {
  it("C-1 불변 — 미답 = 옛 이력(키 없음) = 종전: not_collected를 싣고 결과가 같다", async () => {
    const unanswered = await run(set({}));
    const legacyForm = set({});
    for (const k of ["newHouseOriginKind", "newHouseRightAcquisitionDate", "newHouseRightApprovalDate"]) delete (legacyForm as unknown as Record<string, unknown>)[k];
    const legacy = await run(legacyForm);
    expect(unanswered.status).toBe(200);
    expect(origin(unanswered)).toEqual({ kind: "not_collected" });
    expect(origin(legacy)).toEqual({ kind: "not_collected" });
    expect(legacy).toEqual(unanswered);
    // 종전과 같이 §155①으로 비과세 + 확인 필요
    expect(unanswered.isExempt).toBe(true);
    expect(unanswered.warnings.join(" ")).toContain("답하지 않았거나 이 경로에서 묻지 못했습니다");
  });

  it("C-2 일반 취득 답은 결론을 바꾸지 않고 확인 필요만 걷는다", async () => {
    const un = await run(set({}));
    const general = await run(set({ newHouseOriginKind: "general" }));
    expect(origin(general)).toEqual({ kind: "general" });
    expect({ isExempt: general.isExempt, totalTax: general.totalTax }).toEqual({ isExempt: un.isExempt, totalTax: un.totalTax });
    expect(general.warnings.join(" ")).not.toContain("답하지 않았거나 이 경로에서 묻지 못했습니다");
  });

  it("C-3 순차 분양권 — 권리 2021-09-01이 종전주택 2023-03-15보다 앞선다 → 불성립 (비과세 → 과세)", async () => {
    const seq = await run(set({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2021-09-01" }));
    expect(origin(seq)).toEqual({ kind: "presale", rightAcquisitionDate: "2021-09-01" });
    // 확정 불성립 사유(순차 사례)는 비과세 판정 메뉴의 미충족 사유로 보이고 계산기 경고에는 없다 — 결론과 세액이 방향을 보인다.
    expect(seq.isExempt).toBe(false);
    expect(seq.totalTax).toBeGreaterThan(0);
    const general = await run(set({ newHouseOriginKind: "general" }));
    expect({ isExempt: general.isExempt, totalTax: general.totalTax }).toEqual({ isExempt: true, totalTax: 0 });
  });

  it("C-4 같은 날·모름 — 불성립 + 확인 필요", async () => {
    const sameDay = await run(set({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2023-03-15" }));
    expect(sameDay.isExempt).toBe(false);
    expect(sameDay.warnings.join(" ")).toContain("같은 날");
    const unknown = await run(set({ newHouseOriginKind: "unknown" }));
    expect(origin(unknown)).toEqual({ kind: "unknown" });
    expect(unknown.isExempt).toBe(false);
  });

  it("C-5 승계 입주권 — 권리 취득 후 3년 경계(§156의2③) · 2006.1.1. 전 승계는 현행", async () => {
    // 종전주택 2023-03-15 보유 중 입주권 2024-06-17 승계(종전 취득 후 1년 경과) → 입주권 취득일부터 3년 이내(2027-06-17 목요일) 양도
    //   (3년 말일이 휴일이면 다음 날까지라 말일이 평일인 날짜로 잡았다 — 민법 §161)
    const at = (transfer: string) =>
      run(buildForm({ ...SEQ, declaredNew: "2025-01-15", transfer, over: { newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2024-06-17" } }));
    expect((await at("2027-06-17")).isExempt).toBe(true);
    const after = await at("2027-06-18");
    expect(after.isExempt).toBe(false);
    expect(after.warnings.join(" ")).toContain("3년 경과 예외");
  });

  it("C-6 명부 경로와 패리티 — 같은 경위·같은 날짜는 같은 결론·같은 세액", async () => {
    const answers: Array<{ name: string; kind: string; date?: string }> = [
      { name: "일반", kind: "general" },
      { name: "순차 분양권", kind: "presale", date: "2021-09-01" },
      { name: "같은 날 분양권", kind: "presale", date: "2023-03-15" },
      { name: "분양권 2021 전", kind: "presale", date: "2020-06-01" },
      { name: "모름", kind: "unknown" },
      { name: "원조합원(기존주택) — 기존주택이 종전주택보다 앞선다", kind: "original_member_house", date: "2010-01-10" },
    ];
    for (const a of answers) {
      const declared = await run(set({ newHouseOriginKind: a.kind, ...(a.date ? { newHouseRightAcquisitionDate: a.date } : {}) }));
      const roster = await run(rosterRow({ acquisitionOrigin: a.kind, ...(a.date ? { rightAcquisitionDate: a.date } : {}) }));
      expect(declared.status, a.name).toBe(200);
      expect(roster.status, a.name).toBe(200);
      expect({ isExempt: declared.isExempt, totalTax: declared.totalTax }, a.name).toEqual({ isExempt: roster.isExempt, totalTax: roster.totalTax });
    }
  });
});

describe("V ⑧ 검증 — 직접 선언 경로", () => {
  const issues = (over: Record<string, unknown>, form = set(over)) => collectStepIssues(1, form).filter((i) => i.field === "newHouseOriginKind");
  it("V-1 미답은 막지 않는다 · 일반·모름도 막지 않는다", () => {
    expect(issues({})).toHaveLength(0);
    expect(issues({ newHouseOriginKind: "general" })).toHaveLength(0);
    expect(issues({ newHouseOriginKind: "unknown" })).toHaveLength(0);
  });
  it("V-2 권리 유래 경위인데 권리 취득일이 없거나 완공일보다 늦으면 막는다 (입력칸 data-field로 이동)", () => {
    const missing = issues({ newHouseOriginKind: "presale" });
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toContain("권리 취득일");
    const late = issues({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2024-06-16" });
    expect(late[0].message).toContain("늦을 수 없");
    expect(issues({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2024-06-15" })).toHaveLength(0);
  });
  it("V-3 직접 선언이 아니면(명부 도출) 막지 않는다 — 칸이 없는 화면에서 막지 않는다", () => {
    const f = buildForm({ prev: SEQ.prev, transfer: SEQ.transfer, roster: [{ id: "n", acquisitionDate: SEQ.declaredNew, acquisitionOrigin: "general" }], over: { newHouseOriginKind: "presale" } });
    expect(issues({}, f)).toHaveLength(0);
  });
  it("V-4 주택 수 1(섹션이 없다)이면 막지 않는다", () => {
    expect(issues({ newHouseOriginKind: "presale", householdHousingCount: "1" })).toHaveLength(0);
  });
});

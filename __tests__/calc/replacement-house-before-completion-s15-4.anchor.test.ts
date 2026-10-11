/**
 * S15-4 anchor — 「소득세법 시행령」 §156의2⑤3호 「관리처분계획등에 따라 취득하는 주택이 **완성되기 전** 또는 완성된 후 N년 이내에 대체주택을
 * 양도할 것」: 완성 전 양도는 **준공일 없이** 선언할 수 있어야 한다(R-3 `before_completion` 갈래와 같은 구조).
 *
 * 법령(원문 확인 — taxlaw.nts.go.kr 사전-2024-법규재산-0614 · 서면-2024-법규재산-3166에 인용된 §156의2⑤ 본문 · 대통령령 제33267호 부칙 제8조): 앞부분(완성 전 양도)에는 완성일과 비교할
 * 요건이 없고, 2호(완성 후 세대전원 이사·1년 거주)는 §156의2⑬ 사후관리 대상인 장래 요건(`willResideNewHouse` 자기선언)이다.
 *
 * 형제 축: 준공일이 있는 갈래(완성 후 양도)는 종전대로 준공일이 필수다(양성 짝).
 */
import { describe, it, expect } from "vitest";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildReplacementHousePayload } from "@/lib/calc/transfer-tax-api-helpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import "@/lib/api/transfer-tax-schema";
import { replacementHouseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { meetsReplacementHouse } from "@/lib/tax-engine/one-house/replacement-house";

/** 평가셋 G123 사실 — 대체주택 2011-11-16 취득 · 인가 2011-09-07 · 거주 97개월 · 입주권 1개 · 2019-12-23 양도(신축주택은 아직 준공 전) */
const G123 = {
  isOneHousehold: true, transferDate: "2019-12-23", contractTotalPrice: "800000000",
  asset: { assetKind: "housing", acquisitionDate: "2011-11-16" },
  presaleRights: [
    { id: "A", type: "redevelopment_right", acquisitionDate: "2000-08-02", region: "capital", managementDisposalApprovalDate: "2016-10-13", memberOrigin: "original_house" },
  ],
  replacementHouseSpecial: true, replBusinessApprovalDate: "2011-09-07",
  replResidenceMonths: "97", replWillResideNewHouse: true,
};
const run = (extra: Record<string, unknown>) => observeRaw(mkCase("2019-12-24", { ...G123, ...extra }));
const errs = (r: Awaited<ReturnType<typeof observeRaw>>) => r.issues.filter((x) => x.startsWith("error"));
const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.appliedExceptions ?? []).map((e: { id: string }) => e.id);

describe("S15-4 판정 메뉴 — 완성 전 양도 갈래", () => {
  it("완성 전 양도 + 준공일 빈칸 → ⑧ 오류 없음 · 비과세(156-2-5 적용)", async () => {
    const r = await run({ replSoldBeforeCompletion: true, replCompletionDate: "" });
    expect(errs(r)).toEqual([]);
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain("156-2-5-replacement-house");
  });
  it("양성 짝 — 완성 후 양도 갈래는 준공일이 여전히 필수(⑧ 오류)", async () => {
    const r = await run({ replSoldBeforeCompletion: false, replCompletionDate: "" });
    expect(errs(r).some((e) => e.includes("replCompletionDate"))).toBe(true);
  });
  it("양성 짝 — 완성 후 양도 갈래에 준공일이 있으면 종전과 같이 비과세", async () => {
    const r = await run({ replCompletionDate: "2018-01-01" });
    expect(errs(r)).toEqual([]);
    expect(r.j.isExempt).toBe(true);
  });
  it("갈래 선택은 다른 요건을 면제하지 않는다 — 대체주택 거주 6개월이면 불성립", async () => {
    const r = await run({ replSoldBeforeCompletion: true, replResidenceMonths: "6" });
    expect(r.j.isExempt).toBe(false);
    expect(ids(r)).not.toContain("156-2-5-replacement-house");
  });
  it("갈래 선택은 신축주택 거주 자기선언도 면제하지 않는다(⑧ 오류)", async () => {
    const r = await run({ replSoldBeforeCompletion: true, replWillResideNewHouse: false });
    expect(errs(r).some((e) => e.includes("replWillResideNewHouse"))).toBe(true);
  });
});

describe("S15-4 ④ 페이로드", () => {
  const f = (over: Record<string, unknown>) =>
    Object.assign(createDefaultTransferFormData(), {
      replacementHouseSpecial: true, replBusinessApprovalDate: "2011-09-07", replResidenceMonths: "97", replWillResideNewHouse: true, ...over,
    });
  it("완성 전 갈래는 준공일을 싣지 않고(남은 stale 값 포함) soldBeforeCompletion만 싣는다", () => {
    expect(buildReplacementHousePayload(f({ replSoldBeforeCompletion: true, replCompletionDate: "2020-01-01" }))).toEqual({
      replacementHouse: { businessApprovalDate: "2011-09-07", soldBeforeCompletion: true, replacementResidenceMonths: 97, willResideNewHouse: true },
    });
  });
  it("완성 후 갈래는 준공일을 싣고 soldBeforeCompletion 키는 만들지 않는다", () => {
    expect(buildReplacementHousePayload(f({ replCompletionDate: "2018-01-01" }))).toEqual({
      replacementHouse: { businessApprovalDate: "2011-09-07", completionDate: "2018-01-01", replacementResidenceMonths: 97, willResideNewHouse: true },
    });
  });
  it("완성 후 갈래인데 준공일이 비면 선언이 아니라 입력 중 — 싣지 않는다", () => {
    expect(buildReplacementHousePayload(f({}))).toEqual({});
  });
  it("옛 record(필드 없음)는 완성 후 갈래로 읽는다", () => {
    const old = f({ replCompletionDate: "2018-01-01" }) as unknown as Record<string, unknown>;
    delete old.replSoldBeforeCompletion;
    expect(buildReplacementHousePayload(old as never)).toHaveProperty("replacementHouse.completionDate", "2018-01-01");
  });
});

describe("S15-4 ⑫ Zod", () => {
  const base = { businessApprovalDate: "2011-09-07", replacementResidenceMonths: 97, willResideNewHouse: true };
  it("준공일 또는 완성 전 선언 중 하나는 있어야 한다", () => {
    expect(replacementHouseSchema.safeParse({ ...base, completionDate: "2018-01-01" }).success).toBe(true);
    expect(replacementHouseSchema.safeParse({ ...base, soldBeforeCompletion: true }).success).toBe(true);
    expect(replacementHouseSchema.safeParse(base).success).toBe(false);
    expect(replacementHouseSchema.safeParse({ ...base, soldBeforeCompletion: false }).success).toBe(false);
  });
});

describe("S15-4 엔진 술어 — 단일 소스(E-5 · §89② 예외 공용)", () => {
  const D = (s: string) => new Date(s);
  const input = (rh: Record<string, unknown>) =>
    ({
      acquisitionDate: D("2011-11-16"),
      transferDate: D("2019-12-23"),
      replacementHouse: { businessApprovalDate: D("2011-09-07"), replacementResidenceMonths: 97, willResideNewHouse: true, ...rh },
    }) as never;
  it("완성 전 양도 선언이면 완성일 없이 양도 시기 요건 충족", () => {
    expect(meetsReplacementHouse(input({ soldBeforeCompletion: true }))).toBe(true);
  });
  it("완성일도 완성 전 선언도 없으면 불성립(지어내지 않는다)", () => {
    expect(meetsReplacementHouse(input({}))).toBe(false);
  });
  it("완성일이 있으면 종전 판정 — 양도일이 완성일 앞이면 충족 · 완성 후 기한(2년)을 넘기면 불성립", () => {
    expect(meetsReplacementHouse(input({ completionDate: D("2021-03-31") }))).toBe(true);
    expect(meetsReplacementHouse(input({ completionDate: D("2016-01-01") }))).toBe(false);
  });
});

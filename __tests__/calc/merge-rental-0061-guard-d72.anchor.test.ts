/**
 * D-72 anchor (2026-11 리뷰 · 사용자 결정 Q-22 (b)) — 기준-2024-법규재산-0061 합가 상대 쪽 임대 경로의 3중첩 가드.
 *
 * 시료: E0061(동거봉양 2023-06-28 · 양도 2023-09-18 · 상대 쪽 임대 1채 · 「예」)에서 상대 쪽 명부 행 x를 2012-05-01 취득 농어촌주택
 *   (조특법 §99의4 선언)으로 바꾸고, 양도 주택의 취득 경위만 바꾼다.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | G-1 | 가드가 §99의4 제외를 3중첩으로 셈 | 2005 매매(VI) — 판정 메뉴·계산기 모두 비과세(종전 과세 124,366,000) — ⑳ 세대 구성 규칙(3686·0198)과 같다 |
 * | G-2 | 고지 문형이 근거와 어긋남 | 동일세대 상속(I) — 근거 「1세대1주택 비과세」이면 고지에 「§155④를 적용했습니다」가 없다 · 판정 메뉴와 계산기가 같은 문장 |
 * | G-3 | 동치 | 같은 세대 보유 시작일(2005)이면 상속(I)·매매(VI)가 같은 결론·같은 고지 |
 * | C-1 | 대조 | 별도세대 상속(II)·§99의4 선언 없음(III)은 §155④ 적용 문형 그대로 |
 *
 * 감면주택 선언(§98의8)은 계속 막는다 — `parental-merge-rental-155-20.anchor.test.tsx` MR-21 「3중첩」.
 * 가드 날짜 정렬(STEP 0.9와 같은 일반주택 취득일)은 §99의4를 가드에서 빼면 이 시료에서 결론을 가르지 않는다 — 상속 제외 후보 집합에만 남는다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import fs from "node:fs";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildJudgmentEngineInput } from "@/app/api/calc/one-house-exemption/judgment-request";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const E = JSON.parse(fs.readFileSync("__tests__/calc/one-house-rulings/cases/E0061.json", "utf8"));
const E0061 = (Array.isArray(E) ? E[0] : E) as RulingCase;
const RURAL = {
  type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "100000000", isRegisteredHanok: false,
  adjacentArea994: "no", meetsLocationRequirement: true, ruralLandAreaSqm994: "330", ruralHouseType994: "other", ruralHouseAreaSqm994: "99",
};
type Shape = { inh: "same" | "sep" | "none"; rural?: boolean };
const sample = (o: Shape): RulingCase => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 평가셋 폼을 깊이 복제해 칸만 바꾼다
  const c: any = JSON.parse(JSON.stringify(E0061));
  const a = c.form.asset;
  if (o.inh === "none") a.acquisitionDate = "2005-03-01";
  else {
    Object.assign(a, { acquisitionDate: "2018-09-01", acquisitionCause: "inheritance", decedentAcquisitionDate: "2005-03-01" });
    a.decedentSameHouseholdBeforeInheritance = o.inh === "same";
    if (o.inh === "same") a.decedentCohabitationHoldingStartDate = "2005-03-01";
  }
  c.form.houses = [{
    id: "x", region: "non_capital", acquisitionDate: "2012-05-01", mergeOrigin: "counterpart_side", officialPrice: "100000000",
    ...(o.rural === false ? {} : { countExclusion: { kind: "reduction", reduction: { ...RURAL } } }),
  }];
  return c;
};
const menu = async (o: Shape) => {
  const r = await observeCase(sample(o));
  expect(r.validationErrors).toEqual([]);
  expect(r.status).toBe(200);
  return r;
};
const calc = (o: Shape) => {
  const body = buildOneHouseExemptionApiBody(buildCaseForm(sample(o)));
  const { engineInput } = buildJudgmentEngineInput(propertySchema.parse(body) as never);
  const r = calculateTransferTax({ ...engineInput, acquisitionPrice: 300_000_000 }, makeMockRates());
  return { ...r, notice: (r.warnings ?? []).find((w) => w.includes("기준-2024-법규재산-0061")) };
};
/** 판정 메뉴 확인 사항의 문장 — 공용 하네스는 id만 돌려준다. */
const carveoutReason = async (o: Shape) => {
  const r = await menu(o);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${E0061.today}T03:00:00Z`));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(sample(o)))),
      }),
    );
    const und = ((await res.json()).data.judgment.undetermined ?? []) as { id: string; reason: string }[];
    return { r, reason: und.find((u) => u.id === "155-20-merge-rental-carveout")?.reason };
  } finally {
    vi.useRealTimers();
  }
};
const APPLIED_MERGE = "§155④를 적용했습니다";

describe("D-72 0061 합가 상대 쪽 임대 — 3중첩 가드에서 조특법 §99의4 제외를 세지 않는다(Q-22 b)", () => {
  it("[G-1] 2005 매매(VI) · 상대 쪽 §99의4 → 판정 메뉴 비과세 · 계산기 비과세(세액 0)", async () => {
    const m = await menu({ inh: "none" });
    expect(m.isExempt).toBe(true);
    expect(m.undetermined).toContain("155-20-merge-rental-carveout");
    expect(m.excludedHouses.map((x) => x.legalBasis)).toEqual(["조특법 §99의4 (농어촌주택)", "소득세법 시행령 §155⑳"]);
    const c = calc({ inh: "none" });
    expect(c.isExempt).toBe(true);
    expect(c.totalTax).toBe(0);
  });

  it("[G-2] 동일세대 상속(I) — 근거가 1세대1주택이면 고지에 「§155④ 적용」이 없고, 판정 메뉴·계산기가 같은 문장", async () => {
    const { r, reason } = await carveoutReason({ inh: "same" });
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions).toEqual([]);
    expect(reason).toBeDefined();
    expect(reason).not.toContain(APPLIED_MERGE);
    expect(reason).toContain("합가 의제 없이 1세대1주택으로 판정했습니다");
    const c = calc({ inh: "same" });
    expect(c.exemptReason).toBe("1세대1주택 비과세");
    expect(c.notice).toBe(reason);
  });

  it("[G-3] 동치 — 세대 보유 시작일이 같으면 상속(I)·매매(VI)가 같은 결론·같은 고지", async () => {
    const i = await carveoutReason({ inh: "same" });
    const vi = await carveoutReason({ inh: "none" });
    expect(vi.r.isExempt).toBe(i.r.isExempt);
    expect(vi.reason).toBe(i.reason);
    expect(calc({ inh: "none" }).notice).toBe(calc({ inh: "same" }).notice);
  });

  it.each([
    ["II 별도세대 상속 · §99의4", { inh: "sep" } as Shape],
    ["III 동일세대 상속 · §99의4 선언 없음", { inh: "same", rural: false } as Shape],
  ])("[C-1] 대조 %s → §155④ 적용 · 고지 「§155④를 적용했습니다」", async (_l, o) => {
    const { r, reason } = await carveoutReason(o);
    expect(r.isExempt).toBe(true);
    expect(r.appliedExceptions).toContain("155-4-parental-care-merge");
    expect(reason).toContain(APPLIED_MERGE);
    expect(calc(o).notice).toBe(reason);
  });
});

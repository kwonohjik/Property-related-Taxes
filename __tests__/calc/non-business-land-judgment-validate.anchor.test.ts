/**
 * ⑧ 비사업용 토지 판정 메뉴 검증(`validateNblJudgmentForm`) anchor — A-3 · 규칙 재사용 · 문구 동치.
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §5.2 · §6 A-3 · 「사용자 결정 2차」 Q-1 (c).
 * 불변식: ⑧ 통과 ⇒ 메뉴 route 200(⑫′ 거울). 반대(⑧ 차단인데 API 통과 — 면적 0 · 소재지 없음 등)는 허용된다 — 계산기도 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "./_helpers/redev-one-house-route";
import { CARRYOVER_BASE, CARRYOVER_GRID, MENU_GRID, landForm, postMenu } from "./_helpers/nbl-judgment-menu";
import { validateNblJudgmentForm } from "@/lib/calc/non-business-land-judgment-validate";
import { buildNblJudgmentApiBody } from "@/lib/calc/non-business-land-judgment-api";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const issuesOf = (asset: Partial<AssetForm>, form: Parameters<typeof landForm>[1] = {}) => validateNblJudgmentForm(landForm(asset, form));
const carryover = (over: object, form: Parameters<typeof landForm>[1] = { transferDate: "2023-12-01" }) =>
  landForm({ ...CARRYOVER_BASE, carryover: { ...(CARRYOVER_BASE.carryover as object), ...over } as never } as Partial<AssetForm>, form);
/** 계산기 ⑧ 문구에서 `자산 N: ` 접두를 뗀 본문 */
const calcMessages = (form: ReturnType<typeof landForm>) => allIssues(form).map((i) => i.message.replace(/^[^:]*: /, ""));

describe("A-3 — ⑧ 통과 격자는 메뉴 route 200 (⑧ 통과 ⇒ ⑫′ 통과)", () => {
  it.each([...MENU_GRID, ...CARRYOVER_GRID].map((r) => [r.id, r.scenario, r] as const))("%s — %s", async (_id, _s, row) => {
    const form = landForm(row.asset, row.form);
    expect(validateNblJudgmentForm(form), "격자 행은 ⑧을 통과해야 한다").toEqual([]);
    const body = buildNblJudgmentApiBody(form.assets[0], form.transferDate);
    expect(body).toBeDefined();
    const res = await postMenu(body);
    expect(res.status, JSON.stringify(res.json).slice(0, 300)).toBe(200);
  });
});

describe("기본 규칙 — 소재지·취득일·양도일", () => {
  it("소재지가 없으면 차단 · 문구는 계산기 ⑧과 같다", () => {
    const form = landForm({ addressJibun: "", addressRoad: "" });
    const issues = validateNblJudgmentForm(form);
    expect(issues).toEqual([{ field: "addressJibun", message: "토지: 소재지를 입력하세요. 계산 이력에서 물건을 구분하는 기준입니다." }]);
    expect(calcMessages(form)).toContain("소재지를 입력하세요. 계산 이력에서 물건을 구분하는 기준입니다.");
  });

  it("도로명 주소만 있어도 통과", () => {
    expect(validateNblJudgmentForm(landForm({ addressJibun: "", addressRoad: "서울 강남구 테헤란로 1" }))).toEqual([]);
  });

  it("양도일이 없으면 차단(다른 규칙은 양도일 없이는 의미가 없어 건너뛴다)", () => {
    expect(validateNblJudgmentForm(landForm({}, { transferDate: "" }))).toEqual([{ field: "transferDate", message: "양도일을 입력하세요." }]);
  });

  it("취득일이 없으면 차단", () => {
    expect(issuesOf({ acquisitionDate: "" })).toEqual([{ field: "acquisitionDate", message: "토지: 취득일을 입력하세요." }]);
  });

  it("취득일 ≥ 양도일 → 계산기 ⑧과 같은 규칙(`getAssetDateOrderIssue`) · 메뉴 API도 400", async () => {
    const asset = { acquisitionDate: "2024-06-01" } as Partial<AssetForm>;
    const issues = issuesOf(asset);
    expect(issues.map((i) => i.message)).toEqual(["토지: 취득일은 양도일보다 이전이어야 합니다."]);
    expect(issues[0].field).toBe("acquisitionDate");
    const body = buildNblJudgmentApiBody(landForm(asset).assets[0], "2024-06-01");
    expect((await postMenu(body)).status).toBe(400);
  });
});

describe("상속 — `inheritedDecedentDateError` (계산기 ⑧ 마지막 관문과 같은 함수) · 메뉴 API도 400", () => {
  const inherit = { acquisitionCause: "inheritance", acquisitionDate: "2020-01-01", nblLandType: "forest", nblZoneType: "management" } as Partial<AssetForm>;

  it("피상속인 취득일이 없으면 차단 · API도 400", async () => {
    const form = landForm({ ...inherit, decedentAcquisitionDate: "" });
    expect(validateNblJudgmentForm(form)).toEqual([{ field: "decedentAcquisitionDate", message: "토지: 피상속인 취득일을 입력하세요." }]);
    expect((await postMenu(buildNblJudgmentApiBody(form.assets[0], form.transferDate))).status).toBe(400);
  });

  it("피상속인 취득일 ≥ 상속개시일 → 차단 · API도 400", async () => {
    const form = landForm({ ...inherit, decedentAcquisitionDate: "2020-01-01" });
    const issues = validateNblJudgmentForm(form);
    expect(issues).toEqual([{ field: "decedentAcquisitionDate", message: "토지: 피상속인 취득일은 상속개시일보다 이전이어야 합니다." }]);
    expect((await postMenu(buildNblJudgmentApiBody(form.assets[0], form.transferDate))).status).toBe(400);
  });
});

describe("이월과세 — `validateCarryoverEventHead` 재사용 (증여 당시 평가액은 묻지 않는다)", () => {
  it("세액 입력(증여 당시 평가액·증여자 취득가액)이 비어도 ⑧ 통과 — 메뉴는 세액을 계산하지 않는다", () => {
    expect(validateNblJudgmentForm(carryover({ giftDateValuation: "", donorAcquisitionPrice: "", useEstimatedAcquisition: false }))).toEqual([]);
  });

  it("증여자 취득일 없음 → 차단 (계산기와 같은 문구)", () => {
    const form = carryover({ donorAcquisitionDate: "" });
    expect(validateNblJudgmentForm(form)).toEqual([{ field: "carryover.donorAcquisitionDate", message: "토지: 증여자 취득일을 입력하세요." }]);
    expect(calcMessages(form)).toContain("증여자 취득일을 입력하세요.");
  });

  it("증여 등기접수일 없음 → 차단", () => {
    const form = carryover({ giftRegistryDate: "" });
    expect(validateNblJudgmentForm(form)).toEqual([{ field: "carryover.giftRegistryDate", message: "토지: 증여 등기접수일을 입력하세요." }]);
    expect(calcMessages(form)).toContain("증여 등기접수일을 입력하세요.");
  });

  it.each([
    ["증여자 취득일 ≥ 증여 등기접수일", { donorAcquisitionDate: "2022-06-01" }, "carryover.donorAcquisitionDate", "증여자 취득일은 증여 등기접수일보다 이전이어야 합니다."],
    ["증여 등기접수일 ≥ 양도일", { giftRegistryDate: "2023-12-01" }, "carryover.giftRegistryDate", "증여 등기접수일은 양도일보다 이전이어야 합니다."],
  ] as const)("%s → 차단 · API도 400", async (_n, over, field, text) => {
    const form = carryover(over);
    expect(validateNblJudgmentForm(form)).toEqual([{ field, message: `토지: ${text}` }]);
    const body = buildNblJudgmentApiBody(form.assets[0], form.transferDate);
    if (body) expect((await postMenu(body)).status).toBe(400);
  });

  it("관계 「그 외」는 이월과세가 아니다 → 차단(계산기 ⑧ 문구 그대로)", () => {
    const issues = validateNblJudgmentForm(carryover({ donorRelation: "other" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("acquisitionCause");
    expect(issues[0].message).toContain("이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다");
  });

  it("증여자 사망을 선언했는데 관계가 없으면 차단", () => {
    const issues = validateNblJudgmentForm(carryover({ donorDeceased: true, donorRelation: "" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("carryover.donorRelation");
  });
});

describe("NBL 정밀판정 전체 — `validateNblDetailedJudgment` 재사용 (field 키 보존)", () => {
  it("지목 미선택(무조건 의제 불성립) → nblLandType", () => {
    expect(issuesOf({ nblLandType: "" })).toEqual([expect.objectContaining({ field: "nblLandType" })]);
  });

  it("면적 0 → acquisitionArea (⑧ 차단 · API는 통과해도 된다 — 허용 방향)", () => {
    expect(issuesOf({ acquisitionArea: "0" })).toEqual([expect.objectContaining({ field: "acquisitionArea" })]);
  });

  it("부득이한 사유 행 미완 → nblGracePeriods.N.* (UI가 단계에 귀속할 field 키)", () => {
    const issues = issuesOf({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "", endDate: "" }] } as Partial<AssetForm>);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("nblGracePeriods.0.anchorDate");
    expect(issues[0].message).toMatch(/^토지: /);
  });

  it("규칙마다 한 건씩 — 평면 errors[]에 모인다(첫 오류에서 멈추지 않는 독립 규칙)", () => {
    const issues = issuesOf({ addressJibun: "", addressRoad: "", nblLandType: "" });
    expect(issues.map((i) => i.field)).toEqual(["addressJibun", "nblLandType"]);
  });
});

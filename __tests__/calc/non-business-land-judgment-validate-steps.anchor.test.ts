/**
 * anchor U-3 (UI) — 비사업용 토지 판정 메뉴 ⑧ **단계 귀속**(계획서 `nbl-judgment-menu.ui.plan.md` §9.2 · UD-1~UD-4).
 * 엔진 쪽 ⑧ 격자(`non-business-land-judgment-validate.anchor.test.ts`)는 «⑧ 통과 ⇒ route 200»을 지킨다. 여기는 그 위의 단계 래퍼와 ① 전용 규칙을 지킨다.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { NBL_FIELD_JUMP_CASES } from "../../e2e/_helpers/validation-field-jump-cases-nbl";
import { allIssues } from "./_helpers/redev-one-house-route";
import { CARRYOVER_BASE, MENU_GRID, landForm } from "./_helpers/nbl-judgment-menu";
import {
  getStepErrorCount,
  nblStepOfField,
  validateAllSteps,
  validateNblJudgmentForm,
  validateStepByIndex,
  validateStepGrace,
  validateStepJudge,
  validateStepLand,
} from "@/lib/calc/non-business-land-judgment-validate";
import { forceNblFacts } from "@/lib/stores/nbl-judgment-form.types";
import { createInitialNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";
import { inheritedDecedentDateError } from "@/lib/calc/transfer-tax-validate-acquisition";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type FormLike = ReturnType<typeof landForm>;
const body = (m: string) => m.replace(/^[^:]*: /, "");
const calcBodies = (form: FormLike) => allIssues(form).map((i) => body(i.message));
const stepMsgs = (issues: { message: string }[]) => issues.map((i) => body(i.message));

describe("[V-1] 단계 귀속 — 계산기 NBL ⑧ 필드 점프 케이스 전수", () => {
  const GRACE = /^(nblUrbanIncorporationDate|nblDeemedTransferDate|nblGracePeriods\..+)$/;

  it("🔴 105건(계산기 E2E가 지키는 NBL 오류 전부)이 메뉴 ⑧에서도 같은 칸으로 나오고 ①/②/③ 중 정확히 하나로 귀속된다", () => {
    expect(NBL_FIELD_JUMP_CASES.length).toBeGreaterThan(100);
    const unmatched: string[] = [];
    for (const c of NBL_FIELD_JUMP_CASES) {
      const f = c.form() as unknown as { assets: AssetForm[]; transferDate: string; assetSplitMode?: never };
      const form = { assets: [forceNblFacts(f.assets[0])], transferDate: f.transferDate, assetSplitMode: f.assetSplitMode };
      // 계산기 문구는 「자산: …」, 메뉴는 「토지: …」 — 접두만 다르다
      const re = new RegExp(c.message.source.replace("^자산:", "^토지:"));
      const hit = validateNblJudgmentForm(form).find((i) => re.test(i.message));
      if (!hit) {
        unmatched.push(c.name ?? c.field);
        continue;
      }
      expect(hit.field, c.name ?? c.field).toBe(c.field);
      const expected = GRACE.test(c.field) ? 2 : c.field === "acquisitionArea" ? 0 : 1;
      expect(nblStepOfField(hit.field), `${c.name ?? c.field} → 단계`).toBe(expected);
      // 그 단계 함수가 실제로 그 오류를 돌려준다(다른 단계에는 없다)
      const steps = [validateStepLand(form as never), validateStepJudge(form as never), validateStepGrace(form as never)];
      steps.forEach((s, i) => expect(s.some((x) => x.message === hit.message), `${c.name ?? c.field}: 단계 ${i}`).toBe(i === expected));
    }
    expect(unmatched, "메뉴 ⑧이 재현하지 못한 계산기 NBL 오류").toEqual([]);
  });

  it("필드→단계 매핑: ①은 ①에 보이는 칸, ③은 편입일·의제일·유예 행, 그 밖(미지의 칸 포함)은 ②", () => {
    for (const f of ["transferDate", "addressJibun", "addressRoad", "acquisitionDate", "acquisitionArea", "decedentAcquisitionDate", "ownershipNumerator", "carryover.donorAcquisitionDate", "carryover.giftRegistryDate", "acquisitionCause", "assets"]) {
      expect(nblStepOfField(f), f).toBe(0);
    }
    for (const f of ["nblUrbanIncorporationDate", "nblDeemedTransferDate", "nblGracePeriods.0.anchorDate", "nblGracePeriods.3.endDate"]) {
      expect(nblStepOfField(f), f).toBe(2);
    }
    for (const f of ["nblLandType", "nblZoneType", "nblOtherStateEvents.0.date", "nblResidenceHistories.0.startDate", "unknownFutureField"]) {
      expect(nblStepOfField(f), f).toBe(1);
    }
  });
});

describe("[V-2] ① 규칙 표 — 빈 폼부터", () => {
  it("빈 폼: ①만 막힌다(양도일 · 소재지 · 취득일 · 면적) — ②③은 비어 있다", () => {
    const form = createInitialNblJudgmentForm();
    const land = stepMsgs(validateStepLand(form));
    expect(land).toEqual(
      expect.arrayContaining(["양도일을 입력하세요.", "소재지를 입력하세요. 계산 이력에서 물건을 구분하는 기준입니다.", "취득일을 입력하세요.", "비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요."]),
    );
    expect(validateStepJudge(form)).toEqual([]);
    expect(validateStepGrace(form)).toEqual([]);
    expect(validateStepByIndex(form, 3)).toEqual([]);
  });

  it("지목을 안 골라도 ①에서 면적을 막는다 — ② 규칙(지목 먼저)에 가리지 않는다", () => {
    const form = landForm({ nblLandType: "", acquisitionArea: "" });
    expect(stepMsgs(validateStepLand(form))).toContain("비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.");
    expect(stepMsgs(validateStepJudge(form))).toContain("비사업용 토지 정밀판정을 선택했습니다. 지목을 선택하세요.");
  });

  it("면적 문구는 계산기 ⑧과 같다", () => {
    const form = landForm({ acquisitionArea: "" });
    expect(calcBodies(form)).toContain("비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.");
    expect(stepMsgs(validateStepLand(form))).toContain("비사업용 토지 판정을 위해 토지 면적(㎡)을 입력하세요.");
  });

  it("UD-4 지분 < 100% + 「나머지 지분은 타인 소유」 선언 없음 → 차단 · 문구는 계산기 ⑧과 같다", () => {
    const form = landForm({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" });
    const msg = stepMsgs(validateStepLand(form)).find((m) => m.startsWith("지분 모드 자산"));
    expect(msg).toBeDefined();
    expect(calcBodies(form)).toContain(msg);
    const declared = landForm({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    expect(stepMsgs(validateStepLand(declared)).some((m) => m.startsWith("지분 모드 자산"))).toBe(false);
  });

  it("지분율 범위 오류(0 이하·100% 초과)는 계산기와 같은 문구", () => {
    for (const n of ["0", "150"]) {
      const form = landForm({ ownershipNumerator: n, ownershipDenominator: "100" });
      const m = stepMsgs(validateStepLand(form)).find((x) => x.startsWith("지분율"));
      expect(m, n).toBeDefined();
      expect(calcBodies(form), n).toContain(m);
    }
  });

  it("미래 취득일 — 계산기 ⑧과 같은 문구 · 이월과세는 증여 등기접수일", () => {
    const future = "2999-01-01";
    const form = landForm({ acquisitionDate: future }, { transferDate: "3000-01-01" });
    const m = stepMsgs(validateStepLand(form)).find((x) => x.includes("오늘 이후입니다"));
    expect(m).toBe(`취득일(${future})이 오늘 이후입니다. 미래 날짜는 입력할 수 없습니다.`);
    expect(calcBodies(form)).toContain(m);
    const co = landForm({ ...CARRYOVER_BASE, carryover: { ...(CARRYOVER_BASE.carryover as object), giftRegistryDate: future, donorAcquisitionDate: "2012-01-01" } as never } as Partial<AssetForm>, { transferDate: "3000-01-01" });
    expect(stepMsgs(validateStepLand(co)).some((x) => x.startsWith(`증여 등기접수일(${future})이 오늘 이후`))).toBe(true);
  });

  it("상속 — 피상속인 취득일 필수(UD-3) · 계산기 ⑧과 같은 문구", () => {
    const form = landForm({ acquisitionCause: "inheritance", acquisitionDate: "2022-03-01", decedentAcquisitionDate: "" });
    const m = stepMsgs(validateStepLand(form)).find((x) => x.includes("피상속인 취득일"));
    expect(m).toBe("피상속인 취득일을 입력하세요.");
    // 계산기 ⑧은 이 규칙을 취득가액 축의 마지막 관문에 둔다 — 같은 leaf(`inheritedDecedentDateError`)이므로 문구가 같다.
    expect(body(inheritedDecedentDateError(form.assets[0], "토지") ?? "")).toBe(m);
    expect(validateStepLand(form).every((i) => Object.keys(i).sort().join() === "field,message")).toBe(true);
  });

  it("이월과세 — 증여자 취득일·증여 등기접수일 필수, 취득일 칸은 요구하지 않는다", () => {
    const base = { ...CARRYOVER_BASE } as Partial<AssetForm>;
    const blank = landForm({ ...base, carryover: { ...(CARRYOVER_BASE.carryover as object), giftRegistryDate: "", donorAcquisitionDate: "" } as never } as Partial<AssetForm>, { transferDate: "2023-12-01" });
    const msgs = stepMsgs(validateStepLand(blank));
    expect(msgs).toContain("증여 등기접수일을 입력하세요.");
    expect(msgs.some((x) => x === "취득일을 입력하세요.")).toBe(false);
  });
});

describe("[V-3] 의제 성립 시 ③ 규칙이 막지 않는다 · 통과 폼은 ④ raw를 만든다", () => {
  it("2006.12.31. 이전 상속 의제(양도 2009-06-01) + 유예 행이 비어 있어도 ③이 막지 않는다(입력이 판정에 쓰이지 않는다) — 의제가 아니면 막는다", () => {
    const row = MENU_GRID.find((r) => r.id === "G13-inherit-pre2007")!;
    const emptyGrace = { nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "", endDate: "", secondaryDate: "", description: "" }] };
    const exempt = landForm({ ...row.asset, ...emptyGrace } as Partial<AssetForm>, { transferDate: "2009-06-01" });
    expect(validateStepGrace(exempt)).toEqual([]);
    // 같은 입력이라도 양도 2024-06-01이면 의제가 성립하지 않아 유예 행이 판정에 쓰이므로 ③이 막는다(대조군)
    const notExempt = landForm({ ...row.asset, ...emptyGrace } as Partial<AssetForm>, { transferDate: "2024-06-01" });
    expect(stepMsgs(validateStepGrace(notExempt)).some((m) => m.includes("유예기간 — 개시일"))).toBe(true);
  });

  it("MENU_GRID 전 행: 단계 오류 0건 · 합집합 = validateAllSteps · ④ raw 정의됨(3중)", () => {
    for (const row of MENU_GRID) {
      const form = landForm(row.asset, row.form);
      const all = validateAllSteps(form);
      expect(all, row.id).toEqual([]);
      for (const s of [0, 1, 2, 3]) expect(getStepErrorCount(form, s), `${row.id}/${s}`).toBe(0);
      expect(buildNonBusinessLandRaw(form.assets[0], form.transferDate), row.id).toBeDefined();
    }
  });

  it("단계 오류의 합(중복 문구 제거) = validateAllSteps", () => {
    const form = landForm({ nblLandType: "", acquisitionArea: "", addressJibun: "" });
    const sum = [0, 1, 2].flatMap((s) => validateStepByIndex(form, s));
    expect(sum.map((i) => i.message).sort()).toEqual(validateAllSteps(form).map((i) => i.message).sort());
    expect(getStepErrorCount(form, 0)).toBeGreaterThan(0);
  });
});

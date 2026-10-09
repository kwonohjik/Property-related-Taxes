/**
 * @vitest-environment jsdom
 *
 * 상속 분양권의 피상속인 취득일 — 법률 제17477호 부칙 제4조(§89② 본문 · §104⑦2호·4호는 2021.1.1. 이후 취득한
 * 분양권부터) · 기획재정부 재산세제과-1033(2023.9.4. — 동일세대원 배우자가 2021.1.1. 이후 상속받은 2020.12.31. 이전
 * 취득 분양권은 주택 수에 넣지 않고 §155① 적용). 별도세대 상속은 해석 미확보라 상속개시일로 판정 + 확인 필요
 * (사용자 결정 2026-10-09).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | leaf | 동일세대 상속 분양권만 피상속인 취득일 · 입주권·별도세대·미입력은 `acquisitionDate` |
 * | E-1 | §89② | 동일세대 + 2021 전 피상속인 취득 → 대상 아님 · 별도세대 → 대상(상속개시일) |
 * | E-2 | §104⑦ | 같은 leaf — 동일세대면 주택 수 미산입 · 별도세대면 산입 + 확인 필요 경고 |
 * | E-3 | 판정·계산기 | 별도세대 확인 필요는 §89② 배제로만 과세로 갈렸을 때 — 계산기 경고에도 같은 문장 |
 * | P-1 | ④⑫⑭ | 분양권·상속 행에서만 싣는다 · Zod·route가 Date로 넘긴다 |
 * | V-1 | ⑧ | 피상속인 취득일 > 상속개시일 → 오류 |
 * | W-1 | ⑤ | 상속 분양권 행에만 칸 · 날짜 칸 라벨이 「취득일(상속개시일)」 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE,
  inheritedPresaleRightSeparateHouseholdUnverified,
  presaleRightDefinitionAcquisitionDate,
} from "@/lib/tax-engine/presale-right-definition-date";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { isPresaleRightCounted } from "@/lib/tax-engine/multi-house-surcharge-count";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID } from "@/lib/tax-engine/one-house/pending";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// 스키마 모듈 순환 초기화 순서 — 진입 모듈을 먼저 불러야 sub의 shape가 정의된다.
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { inheritedPresaleRightFactErrors } from "@/lib/calc/inherited-presale-right-facts";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { PresaleRightsSection } from "@/components/calc/transfer/PresaleRightsSection";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import {
  defaultRules,
  makeHouse,
  makeInput,
  mockRegulatedHistory,
  suspensionNone,
} from "../_helpers/multi-house-mock";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const START = D("2021-01-01");

/** 상속개시 2021-02-10 · 피상속인 취득 2019-06-15 · 동일세대 — 재산세제과-1033의 사실관계(일자 가정). */
const right = (over: Partial<PresaleRight> = {}): PresaleRight => ({
  id: "b",
  type: "presale_right",
  acquisitionDate: D("2021-02-10"),
  region: "capital",
  isInherited: true,
  decedentSameHouseholdAtInheritance: true,
  decedentAcquisitionDate: D("2019-06-15"),
  ...over,
});

describe("L-1 leaf — 2021.1.1. 적용례의 기준일", () => {
  it("동일세대 상속 분양권만 피상속인 취득일, 그 밖은 행의 취득일(상속개시일)", () => {
    expect(presaleRightDefinitionAcquisitionDate(right())).toEqual(D("2019-06-15"));
    expect(presaleRightDefinitionAcquisitionDate(right({ decedentSameHouseholdAtInheritance: false }))).toEqual(D("2021-02-10"));
    expect(presaleRightDefinitionAcquisitionDate(right({ decedentAcquisitionDate: undefined }))).toEqual(D("2021-02-10"));
    expect(presaleRightDefinitionAcquisitionDate(right({ isInherited: false }))).toEqual(D("2021-02-10"));
    expect(presaleRightDefinitionAcquisitionDate(right({ type: "redevelopment_right" }))).toEqual(D("2021-02-10"));
  });

  it("별도세대 확인 필요 — 피상속인 취득일 2021 전 · 상속개시일 2021 이후일 때만", () => {
    const sep = (o: Partial<PresaleRight>) => inheritedPresaleRightSeparateHouseholdUnverified(right({ decedentSameHouseholdAtInheritance: false, ...o }), START);
    expect(sep({})).toBe(true);
    expect(sep({ decedentAcquisitionDate: D("2021-01-01") })).toBe(false);
    expect(sep({ acquisitionDate: D("2020-12-31") })).toBe(false);
    expect(sep({ decedentAcquisitionDate: undefined })).toBe(false);
    expect(inheritedPresaleRightSeparateHouseholdUnverified(right(), START)).toBe(false);
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

describe("E-1 §89② — 동일세대 상속은 피상속인 취득일로 본다", () => {
  it("동일세대 + 피상속인 2019 취득 → §89② 대상 아님(not_applicable) · 피상속인 취득일 미입력 → 대상(짝)", () => {
    expect(resolveArticle89Clause2(e067(right()), START).status).toBe("not_applicable");
    expect(resolveArticle89Clause2(e067(right({ decedentAcquisitionDate: undefined })), START).status).not.toBe("not_applicable");
  });

  it("별도세대는 상속개시일로 대상이다", () => {
    expect(resolveArticle89Clause2(e067(right({ decedentSameHouseholdAtInheritance: false })), START).status).not.toBe(
      "not_applicable",
    );
  });
});

describe("E-2 §104⑦ — 같은 leaf로 주택 수를 센다", () => {
  it("isPresaleRightCounted — 동일세대 피상속인 2019 취득은 미산입 · 별도세대는 산입", () => {
    expect(isPresaleRightCounted(right(), START)).toBe(false);
    expect(isPresaleRightCounted(right({ decedentSameHouseholdAtInheritance: false }), START)).toBe(true);
  });

  it("중과 판정 — 동일세대면 주택 수 1 · 별도세대면 2 + 확인 필요 경고(동일세대엔 없음)", () => {
    const run = (r: PresaleRight) =>
      determineMultiHouseSurcharge(
        makeInput([makeHouse("self", { regionCode: "11680" })], { presaleRights: [r] }),
        defaultRules,
        mockRegulatedHistory,
        suspensionNone,
        true,
      );
    const same = run(right());
    expect(same.effectiveHouseCount).toBe(1);
    expect(same.warnings).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
    const sep = run(right({ decedentSameHouseholdAtInheritance: false }));
    expect(sep.effectiveHouseCount).toBe(2);
    expect(sep.warnings).toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
  });
});

describe("E-3 판정 보류 — 별도세대 확인 필요는 결론을 가를 때만", () => {
  const ids = (r: PresaleRight) =>
    (checkExemption(e067(r) as OneHouseJudgeInput, baseRules(), START).undetermined ?? []).map((u) => u.id);

  it("별도세대 + §156의3④ 불성립(피상속인 주택 보유) → §89② 배제로 과세 → 확인 필요", () => {
    const r = right({ decedentSameHouseholdAtInheritance: false, decedentOwnedHouseAtDeath: true });
    expect(checkExemption(e067(r) as OneHouseJudgeInput, baseRules(), START).isExempt).toBe(false);
    expect(ids(r)).toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID);
  });

  it("동일세대(피상속인 2019 취득) → 비과세, 확인 필요 없음 · 별도세대라도 피상속인 2021 이후 취득이면 없음", () => {
    expect(checkExemption(e067(right()) as OneHouseJudgeInput, baseRules(), START).isExempt).toBe(true);
    expect(ids(right())).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID);
    expect(
      ids(right({ decedentSameHouseholdAtInheritance: false, decedentOwnedHouseAtDeath: true, decedentAcquisitionDate: D("2021-01-05") })),
    ).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID);
  });

  it("별도세대라도 §156의3④ 요건을 갖춰 비과세로 남으면(§89② 미결 — 확인 안내만) 이 확인 필요는 내지 않는다", () => {
    const r = right({ decedentSameHouseholdAtInheritance: false, decedentOwnedHouseAtDeath: false, decedentOwnedOtherRightTypeAtDeath: false });
    const j = checkExemption(e067(r) as OneHouseJudgeInput, baseRules(), START);
    expect(j.isExempt).toBe(true);
    expect((j.undetermined ?? []).map((u) => u.id)).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_ID);
  });

  it("계산기 — 같은 확인 필요를 경고로 낸다(동일세대엔 없음)", () => {
    const sep = right({ decedentSameHouseholdAtInheritance: false, decedentOwnedHouseAtDeath: true });
    const warn = (r: PresaleRight) =>
      calculateTransferTax({ ...e067(r), transferPrice: 600_000_000, acquisitionPrice: 300_000_000 }, makeMockRatesWithHouseEngine()).warnings ?? [];
    expect(warn(sep)).toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
    expect(warn(right())).not.toContain(INHERITED_PRESALE_RIGHT_SEPARATE_HOUSEHOLD_NOTICE);
  });
});

function baseRules() {
  return parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
}

const entry = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
  id: "b",
  type: "presale_right",
  acquisitionDate: "2021-02-10",
  region: "capital",
  isInherited: true,
  decedentSameHouseholdAtInheritance: true,
  decedentAcquisitionDate: "2019-06-15",
  ...over,
});

describe("P-1 ④⑫⑭", () => {
  it("④ 분양권·상속 행에서만 싣는다 — 입주권·상속 해제·빈 값은 키를 만들지 않는다", () => {
    const one = (o: Partial<PresaleRightEntry>) => buildPresaleRightsPayload("housing", [entry(o)])![0];
    expect(one({}).decedentAcquisitionDate).toBe("2019-06-15");
    expect(one({ type: "redevelopment_right" })).not.toHaveProperty("decedentAcquisitionDate");
    expect(one({ isInherited: false })).not.toHaveProperty("decedentAcquisitionDate");
    expect(one({ decedentAcquisitionDate: "" })).not.toHaveProperty("decedentAcquisitionDate");
  });

  it("⑫ Zod가 통과시키고 ⑭ route가 Date로 넘긴다", () => {
    const parsed = presaleRightSchema.parse(buildPresaleRightsPayload("housing", [entry()])![0]);
    expect(parsed.decedentAcquisitionDate).toBe("2019-06-15");
    const engine = mapPresaleRightsToEngine([parsed])![0];
    expect(engine.decedentAcquisitionDate).toEqual(D("2019-06-15"));
    expect(presaleRightSchema.safeParse({ ...parsed, decedentAcquisitionDate: "2019-13-01" }).success).toBe(false);
  });
});

describe("V-1 ⑧ 모순", () => {
  it("피상속인 취득일이 상속개시일보다 늦으면 오류 · 같거나 이르면 통과 · 입주권 행은 보지 않는다", () => {
    expect(inheritedPresaleRightFactErrors([entry({ decedentAcquisitionDate: "2021-03-01" })])).toEqual([
      expect.objectContaining({ field: "presaleRights.0.decedentAcquisitionDate" }),
    ]);
    expect(inheritedPresaleRightFactErrors([entry({ decedentAcquisitionDate: "2021-02-10" })])).toEqual([]);
    expect(inheritedPresaleRightFactErrors([entry()])).toEqual([]);
    expect(
      inheritedPresaleRightFactErrors([entry({ type: "redevelopment_right", decedentAcquisitionDate: "2021-03-01" })]),
    ).toEqual([]);
  });
});

describe("V-2 ⑧ 배선 — 계산기 1단계 · 판정 메뉴 2단계가 같은 검사를 부른다", () => {
  const MSG = "분양권·입주권 1: 피상속인이 분양권을 취득한 날은 상속개시일(취득일 칸) 이전이어야 합니다.";
  const house = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2015-03-15" } as AssetForm;
  const calc = (r: PresaleRightEntry) =>
    collectStepIssues(1, { transferDate: "2024-04-15", assets: [house], houses: [], presaleRights: [r] } as unknown as TransferFormData).map(
      (i) => i.message,
    );
  const judge = (r: PresaleRightEntry) =>
    validateStep2({
      ...createInitialOneHouseJudgmentForm(),
      assets: [house],
      transferDate: "2024-04-15",
      isOneHousehold: true,
      presaleRights: [r],
    } as unknown as OneHouseJudgmentFormData).map((e) => e.message);

  it("모순이면 두 경로 모두 오류 · 바른 날짜면 없음", () => {
    const bad = entry({ decedentAcquisitionDate: "2021-03-01" });
    expect(calc(bad)).toContain(MSG);
    expect(judge(bad)).toContain(MSG);
    expect(calc(entry())).not.toContain(MSG);
    expect(judge(entry())).not.toContain(MSG);
  });
});

describe("W-1 ⑤ 분양권 행", () => {
  const show = (r: PresaleRightEntry) =>
    render(<PresaleRightsSection rights={[r]} onChange={vi.fn()} primaryKind="housing" />);

  it("상속 분양권 행에 칸이 뜨고 날짜 칸 라벨이 「취득일(상속개시일)」", () => {
    show(entry());
    expect(screen.getByTestId("presale-decedent-acquisition-date-0")).toBeTruthy();
    expect(screen.getByText("취득일(상속개시일)")).toBeTruthy();
  });

  it("상속 입주권 행 · 상속이 아닌 분양권 행에는 칸이 없다", () => {
    show(entry({ type: "redevelopment_right", memberOrigin: "successor" }));
    expect(screen.queryByTestId("presale-decedent-acquisition-date-0")).toBeNull();
    cleanup();
    show(entry({ isInherited: false }));
    expect(screen.queryByTestId("presale-decedent-acquisition-date-0")).toBeNull();
    expect(screen.queryByText("취득일(상속개시일)")).toBeNull();
  });
});

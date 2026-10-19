// @vitest-environment jsdom
/**
 * 무조건 사업용 의제 상속 3종(「소득세법 시행령」 §168의14③1호·1의2호·4호 나목) — 취득원인·상속개시일 단일 소스 (2026-10-19)
 * 계획서: docs/00-pm/nbl-unconditional-inherit-cause.plan.md
 *
 * 1. 매퍼: ③1호·③4호 나목의 상속개시일 = 취득원인이 상속일 때의 취득일(옛 토글·상속일은 읽지 않음). ③1의2호 선언은 상속·증여·이월과세 증여만.
 * 2. 축 B 지분 고지: 첫 지분에 자동 성립한 상속 사유가 이 지분(상속 아님)에 빠지면 근거 조문으로 알린다.
 * 3. 화면: ③1호 토글·상속일 칸 없음, 상속 자산에만 자동 판정 안내, ③4호 토글은 가목(종중) 전용.
 * 세액 결과는 route anchor `__tests__/api/transfer.route.nbl-unconditional-inherit-cause.anchor.test.ts`가 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { buildUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { nblShareExemptionWithheldNotice } from "@/lib/tax-engine/non-business-land/sole-split-share-notice";
import { UnconditionalExemptionSection } from "@/components/calc/transfer/nbl/UnconditionalExemptionSection";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

afterEach(cleanup);

const pd = (s: string) => (s ? new Date(s) : undefined);
const OLD = { nblExemptInheritBefore2007: true, nblExemptInheritDate: "1999-01-01" };
const uncond = (cause: string, o: Record<string, unknown> = {}) =>
  buildUnconditionalExemption({ acquisitionCause: cause, acquisitionDate: "2000-01-01", ...OLD, ...o }, pd);

describe("매퍼 — 상속 사유는 취득원인·취득일에서", () => {
  it("상속: ③1호 표지·상속개시일 = 취득일(옛 상속일 1999는 무시) — 선언 없이 정의된다", () => {
    const u = uncond("inheritance")!;
    expect([u.isInheritedBefore2007, u.inheritanceDate]).toEqual([true, new Date("2000-01-01")]);
  });

  it.each(["purchase", "gift", "carryover_gift", "burdened_gift", "newConstruction", ""])("%s: 선언이 없으면 의제 입력 자체가 없다(옛 ③1호 값 무시)", (cause) => {
    expect(uncond(cause)).toBeUndefined();
  });

  it.each([
    ["inheritance", true], ["gift", true], ["carryover_gift", true],
    ["purchase", false], ["newConstruction", false], ["burdened_gift", false], ["", false],
  ] as const)("③1의2호 선언 · %s → %s", (cause, applies) => {
    const u = uncond(cause, { nblExemptAncestor8YearFarming: true })!;
    expect(u.isAncestor8YearFarming).toBe(applies);
    if (cause !== "inheritance") expect([u.isInheritedBefore2007, u.inheritanceDate]).toEqual([false, undefined]);
  });
});

describe("상속 자동 사유의 경계", () => {
  it("지목 미선택 + 상속(선언 없음) → 서버 매퍼는 판정에 들어가지 않는다(자동 사유는 지목이 있어야만 성립)", () => {
    const ctx = { acquisitionDate: new Date("2000-01-01"), transferDate: new Date("2009-06-01"), parseDate: pd, parseNumber: () => undefined };
    expect(mapAssetToNblInput({ nblUseDetailedJudgment: true, nblLandType: "", acquisitionCause: "inheritance", acquisitionDate: "2000-01-01" }, ctx)).toBeNull();
  });

  it("토글 배지는 상속 자동 사유를 빌리지 않는다: 도시지역 농지 상속 2022(③4호 나목 성립) + 종중 토글(날짜 없음) → 전체 성립 · 종중 배지 미충족", () => {
    const a = {
      ...makeDefaultAsset(1), nblLandType: "farmland", nblZoneType: "general_residential",
      acquisitionCause: "inheritance", acquisitionDate: "2022-01-01", nblExemptUrbanFarmlandJongjoong: true,
    } as AssetForm;
    const r = evaluateUnconditionalExemption(a, "2024-06-03");
    expect(r.isExempt).toBe(true);
    expect(r.perToggle.urbanFarmland?.qualifies).toBe(false);
  });
});

describe("축 B 지분 고지 — 첫 지분에 자동 성립한 상속 사유", () => {
  const det = (o: Record<string, unknown>) => o as unknown as NonBusinessLandInput;
  /** 첫 지분: 농지 · 농림지역 · 2000 상속 · 2009-06-01 양도 → ③1호 성립 */
  const first = (transferDate: string) => ({
    nonBusinessLandDetails: det({
      landType: "farmland", zoneType: "agriculture_forest", transferDate: new Date(transferDate),
      unconditionalExemption: { isInheritedBefore2007: true, inheritanceDate: new Date("2000-01-01") },
    }),
  });
  const bought = det({ unconditionalExemption: undefined });

  it("이 지분이 상속이 아니면 근거 조문으로 알린다(확인 필요 없음)", () => {
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: bought }, first("2009-06-01"))).toBe(
      "같은 토지를 지분별로 나눠 취득했고 이 지분의 취득원인·취득일이 첫 지분과 다릅니다 — 이 지분은 상속받은 지분이 아니어서 첫 지분에 적용된 " +
        "2006.12.31. 이전 상속 무조건 사업용 의제(소득세법 시행령 §168조의14 ③ 1호) 사유를 이 지분의 판정에는 적용하지 않았습니다.",
    );
  });

  it("알리지 않는 경우: 이 지분도 상속(날짜가 달라도) · 첫 지분에 사유가 성립하지 않음(2010 양도)", () => {
    const own = det({ unconditionalExemption: { isInheritedBefore2007: true, inheritanceDate: new Date("2008-01-01") } });
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: own }, first("2009-06-01"))).toBeUndefined();
    expect(nblShareExemptionWithheldNotice({ soleSplitAcquisition: true, nonBusinessLandDetails: bought }, first("2010-01-04"))).toBeUndefined();
  });
});

describe("화면 — ③1호 입력 없음 · 상속 자산 자동 판정 안내 · ③4호 종중 전용", () => {
  const show = (o: Partial<AssetForm>) => {
    const asset = { ...makeDefaultAsset(1), nblLandType: "farmland", nblZoneType: "agriculture_forest", ...o } as AssetForm;
    return render(
      <UnconditionalExemptionSection asset={asset} onAssetChange={() => {}} status={evaluateUnconditionalExemption(asset, "2009-06-01")} />,
    );
  };

  it("상속: 상속개시일과 두 호를 밝히고, 성립하면 배너가 ③1호를 든다", () => {
    const { container } = show({ acquisitionCause: "inheritance", acquisitionDate: "2000-01-01" });
    const n = screen.getByTestId("nbl-uncond-inherit-auto-notice").textContent!;
    expect(n).toContain("상속개시일(2000-01-01)로 자동 판정");
    expect(n).toContain("§168의14③1호");
    expect(n).toContain("③4호 나목");
    expect(container.textContent).toContain("엔진이 무조건 사업용으로 판정합니다 — 2006.12.31 이전 상속(2000-01-01)");
  });

  it("매매: 안내·배너 없음", () => {
    const { container } = show({ acquisitionCause: "purchase", acquisitionDate: "2000-01-01", ...OLD });
    expect(screen.queryByTestId("nbl-uncond-inherit-auto-notice")).toBeNull();
    expect(container.textContent).not.toContain("엔진이 무조건 사업용으로 판정합니다");
  });

  it("③1호 토글·상속일 칸이 없고, ③4호 토글은 종중 소유 전용", () => {
    const { container } = show({ acquisitionCause: "inheritance", acquisitionDate: "2000-01-01" });
    expect(container.textContent).not.toContain("2006.12.31. 이전 상속받은 토지");
    expect(screen.queryByText("상속일")).toBeNull();
    expect(container.textContent).not.toContain("도시지역 농지 종중·상속 5년 이내 양도 특례");
    expect(container.textContent).toContain("도시지역 농지 — 종중 소유 (2005.12.31. 이전 취득)");
  });

  it("③1의2호 매매 자산: 선언해도 배지 「요건 미충족」(취득원인 안내)", () => {
    const { container } = show({ acquisitionCause: "purchase", acquisitionDate: "2020-01-01", nblExemptAncestor8YearFarming: true });
    expect(container.textContent).toContain("요건 미충족");
    expect(container.textContent).toContain("취득원인이 상속·증여");
  });
});

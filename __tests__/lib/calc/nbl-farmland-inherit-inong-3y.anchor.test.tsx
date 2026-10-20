// @vitest-environment jsdom
/**
 * 농지 상속 3년·이농 3년(「소득세법 시행령」 §168의8③2호·3호) — 매퍼·화면 (2026-10-20)
 * 계획서: docs/00-pm/nbl-farmland-inherit-inong-3y.plan.md
 *
 * 1. 매퍼: 상속개시일은 지목이 농지이고 상속(수유자 제외)일 때만 `farmlandDeeming.inheritanceStartDate`로 싣는다.
 * 2. 화면: 농지 섹션의 상속 안내(수유자는 0324 직접 해석 안내) · 이농 카드는 두 조문을 함께 안내하고 이농일 앵커를 둔다.
 * 세액은 route anchor `__tests__/api/transfer.route.nbl-farmland-inherit-inong-3y.anchor.test.ts`가 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { FarmlandDetailSection } from "@/components/calc/transfer/nbl/FarmlandDetailSection";
import { UnconditionalExemptionSection } from "@/components/calc/transfer/nbl/UnconditionalExemptionSection";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const ACQ = new Date("2022-01-01");
const map = (land: string, cause: string, extra: Record<string, unknown> = {}) =>
  mapAssetToNblInput(
    { nblUseDetailedJudgment: true, nblLandType: land, nblZoneType: "agriculture_forest", acquisitionCause: cause, ...extra },
    { acquisitionDate: ACQ, transferDate: new Date("2024-06-03"), parseDate: (s) => (s ? new Date(s) : undefined), parseNumber: () => undefined },
  );

describe("매퍼 — 농지 상속개시일", () => {
  it("농지 · 상속: 상속개시일 = 취득일", () => {
    expect(map("farmland", "inheritance")!.farmlandDeeming?.inheritanceStartDate).toEqual(ACQ);
  });
  it.each(["purchase", "gift", "carryover_gift", "burdened_gift", ""])("농지 · %s: 없음", (cause) => {
    expect(map("farmland", cause)?.farmlandDeeming?.inheritanceStartDate).toBeUndefined();
  });
  it("농지 · 상속인이 아닌 수유자: 없음(기준-2019-법령해석재산-0324)", () => {
    expect(map("farmland", "inheritance", { nonHeirBequest: true })?.farmlandDeeming?.inheritanceStartDate).toBeUndefined();
  });
  it.each(["forest", "pasture", "other_land"])("%s · 상속: 농지 입력에는 싣지 않는다", (land) => {
    expect(map(land, "inheritance")?.farmlandDeeming?.inheritanceStartDate).toBeUndefined();
  });
});

describe("화면", () => {
  const asset = (o: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), ...o }) as AssetForm;

  it("농지 · 수유자: 상속 3년을 적용하지 않는다는 안내와 직접 해석", () => {
    render(<FarmlandDetailSection asset={asset({ acquisitionCause: "inheritance", acquisitionDate: "2022-01-01", nonHeirBequest: true })} onAssetChange={() => {}} />);
    const n = screen.getByTestId("nbl-inherit-3y-notice").textContent!;
    expect(n).toContain("상속인이 아닌 사람이 유증·사인증여로 받은 농지라 상속 3년 특례(소득세법 시행령 §168조의8 ③ 2호)를 적용하지 않습니다");
    expect(n).toContain("기준-2019-법령해석재산-0324");
    expect(n).not.toContain("확인이 필요");
  });

  it("이농 카드: 두 조문을 함께 안내하고 이농일 앵커를 둔다", () => {
    const a = asset({ nblExemptInong: true, nblExemptInongDate: "2021-01-01", nblLandType: "farmland" });
    const { container } = render(
      <UnconditionalExemptionSection asset={a} onAssetChange={() => {}} status={evaluateUnconditionalExemption(a, "2024-06-03")} />,
    );
    expect(container.textContent).toContain("이농 농지 — 8년 이상 농업경영 후 이농, 이농 당시부터 소유");
    expect(container.textContent).toContain("이농일부터 3년을 사업용 기간으로 셉니다(소득령 §168의8③3호)");
    expect(container.querySelector('[data-field="nblExemptInongDate"]')).not.toBeNull();
    expect(container.textContent).not.toContain("2006.12.31. 이전 이농 농지 (2009.12.31.까지 양도)");
  });
});

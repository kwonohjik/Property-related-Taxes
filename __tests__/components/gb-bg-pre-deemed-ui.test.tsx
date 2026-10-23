/**
 * PR-7b-2 ⑤ — 일반건물 × 부담부증여 × 1990.8.30. 전(의제취득일 전 포함) 상속·증여 토지·건물 안내 (계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` §6).
 *
 * G-3: ① 카드의 「취득시 토지 공시지가」 칸이 등급 환산값을 보인다(④·⑧과 같은 leaf `effectiveGbLandPriceAtAcq`). 종전에는 등급 카드 칸만 보이고 이 칸은 비었다.
 * G-4: 부담부증여는 §159가 취득가액을 정한다 — §163⑨ 「많은 금액」·§176조의2④ 「셋 중 큰 금액」 안내 대신 §159 쓰임을, 취득시 기준시가 칸에는 의제취득일 기준을 안내한다.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const GRADE = {
  pre1990Enabled: true,
  pre1990Grade_current: "218",
  pre1990Grade_prev: "218",
  pre1990Grade_atAcq: "200",
  pre1990PricePerSqm_1990: "1100000",
  pre1990GradeMode: "number",
};
const asset = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 8-8",
    assetKind: "general_building",
    acquisitionCause: "inheritance",
    gbBuildingAcquisitionCause: "inheritance",
    acquisitionDate: "1983-07-26",
    inheritanceStartDate: "1983-07-26",
    decedentAcquisitionDate: "1970-01-01",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    ...GRADE,
    transferType: "burdened_gift",
    bgDonorRelation: "lineal_descendant",
    bgMortgageDebtAmount: "500000000",
    ...over,
  }) as AssetForm;

function view(a: AssetForm) {
  const { container } = render(
    <AssetSectionAcquisition
      asset={a}
      onChange={() => {}}
      transferDate="2023-02-16"
      isNewConstruction={false}
      isPrimary
      splitMode={"none" as never}
      onFractionalToggle={() => {}}
      isFirst
      hasSiblings={false}
    />,
  );
  const text = container.textContent ?? "";
  const landInputs = [...container.querySelectorAll('[data-field="gbAcqLandPricePerSqm"] input')].map((e) => (e as HTMLInputElement).value);
  const note = container.querySelector('[data-testid="gb-bg-pre1990-land-note"]')?.textContent ?? null;
  const plainNote = container.querySelector('[data-testid="gb-pre-deemed-land-note"]');
  cleanup();
  return { text, landInputs, note, plainNote };
}

describe("PR-7b-2 일반건물 부담부증여 안내", () => {
  it("U-1 기준시가 평가 · 1983 상속 — §159 안내 · 셋 중 큰 금액·많은 금액 없음 · 두 칸 모두 등급 환산값 · 의제취득일 기준", () => {
    const v = view(asset({ bgValuationMode: "sangjeungbeop_standard" }));
    expect(v.note).toContain("이 금액 × 채무비율이 토지 취득가액");
    expect(v.note).toContain("의제취득일(1985.1.1.) 기준으로 입력");
    expect(v.plainNote).toBeNull();
    expect(v.text).not.toContain("셋 중 큰 금액");
    expect(v.text).not.toContain("많은 금액");
    expect(v.landInputs).toEqual(["458,432", "458,432"]);
    expect(v.text).toContain("의제취득일(1985.1.1.) 기준 토지 ㎡당 가액");
    expect(v.text).toContain("의제취득일(1985.1.1.) 기준 건물기준시가 총액. 이 금액 × 채무비율이 건물 취득가액");
  });

  it("U-2 시가 평가 · 환산 — 산정방식에 따른 쓰임 안내", () => {
    const v = view(asset({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted" }));
    expect(v.note).toContain("고른 취득가액 산정방식에 따라");
    expect(v.text).toContain("의제취득일(1985.1.1.) 기준 건물기준시가 총액. 건물 환산취득가액 산정에");
  });

  it("U-2b 시가 평가 · 담보 승(시가 4억 < 채무 5억) — 「기준시가로 평가하면」이 아니라 담보평가 안내 · 2023.2.28. 전 양도 시기 단서(리뷰 발견 3)", () => {
    const v = view(asset({ bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "400000000", bgAcquisitionMethod: "converted" }));
    expect(v.note).toContain("담보평가액(상증법 §66)이 시가보다 커서");
    expect(v.note).toContain("× 채무비율이 토지 취득가액");
    expect(v.note).toContain("2023.2.28. 전 양도는");
    expect(v.note).not.toContain("기준시가로 평가하면");
  });

  it("U-3 1988 상속(의제취득일 후) — 등급 환산값은 보이고 기준 시점은 취득일", () => {
    const v = view(asset({ bgValuationMode: "sangjeungbeop_standard", acquisitionDate: "1988-07-26", inheritanceStartDate: "1988-07-26" }));
    expect(v.note).not.toContain("의제취득일");
    expect(v.landInputs).toEqual(["458,432", "458,432"]);
    expect(v.text).toContain("취득일 기준 건물기준시가 총액");
    expect(v.text).not.toContain("의제취득일(1985.1.1.) 기준 건물기준시가");
  });

  it("U-4 회귀: 일반 양도는 종전 안내(셋 중 큰 금액) 그대로", () => {
    const v = view(asset({ transferType: "regular" }));
    expect(v.note).toBeNull();
    expect(v.plainNote).not.toBeNull();
    expect(v.text).toContain("셋 중 큰 금액");
  });

  it("U-5 경계: 일반 양도 1987 증여 · 환산 — ① 카드 칸은 직접 입력값만(④가 의제취득일 전이 아니면 직접 칸을 읽는다)", () => {
    const v = view(
      asset({
        transferType: "regular",
        acquisitionCause: "gift",
        gbBuildingAcquisitionCause: "gift",
        acquisitionDate: "1987-07-26",
        inheritanceStartDate: "",
        useEstimatedAcquisition: true,
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
      }),
    );
    expect(v.landInputs).toEqual(["458,432", ""]);
  });
});

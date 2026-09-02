// @vitest-environment jsdom
/**
 * anchor — 조특령 §66⑭ 결격 과세기간 입력의 **배관 라운드트립 + ⑧ 차단 + ⑤ 위젯** (E2-09)
 *
 * ⑫(Zod)는 TypeScript가 잡지 못한다 — `z.object`는 스키마에 없는 키를 **조용히 strip**한다.
 * 여기서는 그 결과가 「결격 과세기간이 통째로 무시되어 자경기간이 과대 인정」, 즉
 * **과소과세 방향의 눈에 띄지 않는 오류**다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

import "@/lib/api/transfer-tax-schema";
import { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-nbl";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { FarmlandDetailSection } from "@/components/calc/transfer/nbl/FarmlandDetailSection";

const TRANSFER = "2024-06-01";

function landAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "1,000,000,000",
    acquisitionArea: "1000",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    ...overrides,
  } as AssetForm;
}

describe("[E2-09] ⑫ Zod — 결격 과세기간이 strip되지 않는다", () => {
  it("파싱 결과에 원문이 그대로 남는다", () => {
    const parsed = nonBusinessLandRawSchema.parse({
      nblUseDetailedJudgment: true,
      nblLandType: "farmland",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1000",
      acquisitionDate: "2014-01-01",
      transferDate: "2024-06-01",
      nblDisqualifiedTaxPeriods: "2019, 2020",
    });
    expect(parsed.nblDisqualifiedTaxPeriods).toBe("2019, 2020");
  });
});

describe("[E2-09] ⑭ form-mapper — 문자열이 연도 배열로 엔진에 도달한다", () => {
  const parseNumber = (s: string) => {
    const n = Number(String(s).replace(/,/g, ""));
    return Number.isFinite(n) && String(s).trim() !== "" ? n : undefined;
  };
  const parseDate = (s: string) => (s ? new Date(s) : undefined);

  function build(raw: string | undefined) {
    return mapAssetToNblInput(
      {
        nblUseDetailedJudgment: true,
        nblLandType: "farmland",
        nblZoneType: "agriculture_forest",
        acquisitionArea: "1000",
        nblFarmingSelf: true,
        nblDisqualifiedTaxPeriods: raw,
      } as Record<string, unknown>,
      {
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        parseDate,
        parseNumber,
      },
    );
  }

  it("「2019, 2020」 → [2019, 2020]", () => {
    expect(build("2019, 2020")!.disqualifiedTaxPeriods).toEqual([2019, 2020]);
  });

  it("미입력이면 빈 배열 (엔진이 아무것도 빼지 않는다)", () => {
    expect(build("")!.disqualifiedTaxPeriods).toEqual([]);
    expect(build(undefined)!.disqualifiedTaxPeriods).toEqual([]);
  });
});

describe("[E2-09] ⑧ validate — 형식·범위를 계산 전에 차단한다", () => {
  it.each(["20", "2019년", "이천십구", "2019/2020"])("형식 오류 「%s」를 차단한다", (v) => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblDisqualifiedTaxPeriods: v }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("결격 과세기간");
  });

  it("취득연도 이전(2013)은 차단한다 — 자경 기간과 겹칠 수 없다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblDisqualifiedTaxPeriods: "2013" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("취득연도");
  });

  it("양도연도 이후(2025)는 차단한다", () => {
    const err = validateNblDetailedJudgment(
      landAsset({ nblDisqualifiedTaxPeriods: "2025" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toContain("양도연도");
  });

  it.each(["2014", "2019, 2020", "2024", ""])("정상값 「%s」은 통과한다", (v) => {
    expect(
      validateNblDetailedJudgment(landAsset({ nblDisqualifiedTaxPeriods: v }), "자산1", TRANSFER),
    ).toBeNull();
  });
});

describe("[E2-09] ⑤ UI — 입력 위젯과 근거 안내", () => {
  it("결격 과세기간 입력 칸이 렌더되고 onAssetChange로 배선된다", () => {
    const changes: Partial<AssetForm>[] = [];
    render(
      <FarmlandDetailSection
        asset={makeDefaultAsset(1)}
        onAssetChange={(p) => changes.push(p)}
      />,
    );
    const input = screen.getByTestId("nbl-disqualified-tax-periods");
    fireEvent.change(input, { target: { value: "2019, 2020" } });
    expect(changes).toContainEqual({ nblDisqualifiedTaxPeriods: "2019, 2020" });
  });

  it("1호·2호 기준과 과세기간 정의가 안내된다", () => {
    const { container } = render(
      <FarmlandDetailSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("§66⑭");
    expect(text).toContain("3,700만원");
    expect(text).toContain("§208⑤2호");
    expect(text).toContain("§5①");
  });

  it("§69 감면의 「결격 과세기간」 칸과 단위가 다르다는 사실을 밝힌다", () => {
    const { container } = render(
      <FarmlandDetailSection asset={makeDefaultAsset(1)} onAssetChange={() => {}} />,
    );
    expect(container.textContent).toContain("§69 자경농지 감면");
    expect(container.textContent).toContain("연수");
  });
});

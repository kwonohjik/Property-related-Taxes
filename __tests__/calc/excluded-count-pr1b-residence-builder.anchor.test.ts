/**
 * PR1b S12-5 앵커 — Step4 거주요건 안내 빌더(buildResidenceReqInput)는 ④가 싣는 사실을 같은 값으로 싣고,
 * Step4 판정(!meetsOneHouseResidenceRequirement — Step4.tsx residenceShortfall)이 route 결론과 일치한다.
 * 근거: 소득세법 시행령 §154① 괄호(지정 지구), 단서 2호나목(출국일 현재 1주택), §154⑧3호(동일세대 상속) — 엔진 결론이 정본.
 */
import { describe, it, expect } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { meetsOneHouseResidenceRequirement } from "@/lib/tax-engine/transfer-tax-exemption";
import { buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { ONE_HOUSE_RESIDENCE } from "@/lib/tax-engine/legal-codes/transfer";
import { runCalc } from "./_owned-at-transfer-pr1a-helpers";

function form(regionCode: string, acq: string, transfer: string, asset: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  const f = createDefaultTransferFormData();
  f.transferDate = transfer; f.isOneHousehold = true; f.contractTotalPrice = "900000000";
  f.householdNoPresaleRightsConfirmed = true; f.householdNoOtherHousesConfirmed = true; f.residencePeriodMonths = "0";
  Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq, actualSalePrice: "900000000", fixedAcquisitionPrice: "500000000", addressJibun: "테스트 주소 1", regionCode, residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0", ...asset });
  Object.assign(f, top);
  return f;
}
const inh = (start: string) => ({ acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationResidenceMonths: "0", publishedValueAtInheritance: "500000000", decedentAcquisitionDate: "2012-09-05", decedentCohabitationHoldingStartDate: start });

const CASES = {
  "A 화성 반송동 지구 밖 선언": form("4159710200", "2019-01-07", "2024-06-03", { regionInDesignatedDistrict: false }),
  "B 동일세대 상속 보유개시 2012-09-05": form("1138010100", "2020-01-10", "2022-06-15", inh("2012-09-05")),
  "C 해외이주 출국일 현재 1주택 예": form("1168010100", "2019-03-01", "2024-06-03", {}, { provisoReason: "overseas_migration", provisoDepartureDate: "2024-01-10", provisoDepartureOnlyHouse: "yes" }),
  "F252 마포 조정 중 보유개시·해제 후 상속": form("1144010100", "2023-03-01", "2025-06-02", inh("2018-01-01")),
  "[짝] A' 지구 안 선언": form("4159710200", "2019-01-07", "2024-06-03", { regionInDesignatedDistrict: true }),
  "[짝] B'' 동일세대 보유개시 2018-01-01(조정 중)": form("1138010100", "2020-01-10", "2022-06-15", inh("2018-01-01")),
  "[짝] C' 해외이주 출국일 현재 1주택 아니오": form("1168010100", "2019-03-01", "2024-06-03", {}, { provisoReason: "overseas_migration", provisoDepartureDate: "2024-01-10", provisoDepartureOnlyHouse: "no" }),
};

describe("S12-5 Step4 거주요건 안내 = 엔진 결론", () => {
  for (const [label, f] of Object.entries(CASES)) {
    it(`${label} — Step4 충족 여부가 route 비과세 여부와 같다`, async () => {
      const r = await runCalc(f);
      expect(r.issues).toEqual([]);
      const meets = meetsOneHouseResidenceRequirement(buildResidenceReqInput(f), ONE_HOUSE_RESIDENCE);
      expect(meets).toBe(r.isExempt);
    });
  }
  it("빌더가 ④ 본문과 같은 세 사실을 싣는다", async () => {
    const a = CASES["A 화성 반송동 지구 밖 선언"];
    expect((buildResidenceReqInput(a) as { regionInDesignatedDistrict?: boolean }).regionInDesignatedDistrict).toBe(false);
    const b = CASES["B 동일세대 상속 보유개시 2012-09-05"];
    expect((buildResidenceReqInput(b) as { decedentCohabitationHoldingStartDate?: unknown }).decedentCohabitationHoldingStartDate).toBeTruthy();
    const c = CASES["C 해외이주 출국일 현재 1주택 예"];
    expect(buildResidenceReqInput(c).oneHouseExemptionProviso).toMatchObject({ departureOnlyHouse: true });
  });
});

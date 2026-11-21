/**
 * PROBE (find-r3-regulated-at-acq-parity) — 취득 당시 조정대상지역 화면 ↔ 엔진 parity
 * A: 승계조합원 증여 승계 통산(마포) — 화면 기준일(준공일) vs 엔진(세대 보유 시작일·증여일 all)
 * B: 겸용주택 × 지구 한정 동(고양 삼송동) 지구 밖 선언
 */
import { describe, it, vi, beforeEach } from "vitest";
import { writeFileSync, appendFileSync } from "node:fs";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "../calc/_helpers/redev-one-house-route";
import {
  calcEffectiveWasRegulatedAtAcquisition,
  calcGiftHouseholdBasis,
  calcResidenceJudgmentDate,
  calcStoredRegulatedFlags,
  regulatedVerdictForAcquisition,
} from "@/lib/calc/effective-regulated-at-acquisition";

const OUT = "<session>/scratchpad/probes/find-r3-regulated-at-acq-parity/a.txt";
const log = (s: string) => appendFileSync(OUT, s + "\n");

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const MAPO = "1144010100";
type Over = Record<string, unknown>;
function succ(assetOver: Over, formOver: Over) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: "1000000000",
    assetOver: {
      acquisitionCause: "gift",
      acquisitionDate: "2020-01-01",
      donorAcquisitionDate: "2018-01-01",
      giftDonorRelation: "spouse",
      regionCode: MAPO,
      addressJibun: "서울특별시 마포구 공덕동 1",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "6",
      residencePeriods: [],
      redevApprovalDate: "2019-06-01",
      redevCompletionDate: "2023-06-01",
      redevPriorHouseResidenceMonths: "0",
      redevNewHouseResidenceMonths: "6",
      redevOriginalAssetType: "housing",
      redevIsSuccessorMember: "yes",
      redevSuccessorGiftSameHousehold: "yes",
      redevSuccessorGiftDonorHouseMember: "yes",
      redevSuccessorGiftHouseholdStartDate: "2018-01-01",
      fixedAcquisitionPrice: "500000000",
      redevSettlementDirection: "",
      redevSettlementAmount: "",
      ...assetOver,
    },
    formOver: { transferDate: "2025-07-01", filingDate: "2025-09-30", residencePeriodMonths: "6", ...formOver } as never,
  });
}

function screen(f: ReturnType<typeof succ>) {
  const a = f.assets[0];
  const date = calcResidenceJudgmentDate(a);
  const basis = calcGiftHouseholdBasis(a, { isPrimary: true });
  const v = regulatedVerdictForAcquisition({ regionCode: a.regionCode || f.regionCode || undefined, date, giftHouseholdBasis: basis });
  return {
    date,
    basis: basis ? "yes" : "none",
    step4Auto: v ? `${v.isRegulated}(${v.basis})` : "null",
    effective: calcEffectiveWasRegulatedAtAcquisition(a, calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition, f.regionCode, { isPrimary: true }),
    stored: calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const summary = (r: any) =>
  `status=${r.status} exempt=${r.result?.isExempt} tax=${r.result?.determinedTax} reason=${String(r.result?.exemptReason ?? "").slice(0, 160)} issues=${JSON.stringify(r.issues.map((i: { field?: string; message: string }) => i.field + ":" + i.message.slice(0, 60)))} bodyWas=${r.body.wasRegulatedAtAcquisition} bodyCode=${r.body.regionCode} warnRegulated=${JSON.stringify((r.result?.warnings ?? []).filter((w: string) => w.includes("조정")).map((w: string) => w.slice(0, 140)))}`;

describe("probe A successor gift", () => {
  it("grid", async () => {
    writeFileSync(OUT, "");
    const cells: [string, Over, Over][] = [
      ["A1 fwd start2018 gift2020 compl2023-06 (T,T | compl F) code", {}, {}],
      ["A1s same, address string only", { regionCode: "" }, {}],
      [
        "A2 rev start2023-02 gift2023-06 compl2025-11 (F,F | compl T) code",
        { donorAcquisitionDate: "2023-02-01", redevSuccessorGiftHouseholdStartDate: "2023-02-01", redevApprovalDate: "2023-03-01", acquisitionDate: "2023-06-01", redevCompletionDate: "2025-11-01", redevNewHouseResidenceMonths: "0", residencePeriodMonthsAsset: "0" },
        { transferDate: "2026-03-02", filingDate: "2026-05-31", residencePeriodMonths: "0" },
      ],
      [
        "A2s same, address string only",
        { regionCode: "", donorAcquisitionDate: "2023-02-01", redevSuccessorGiftHouseholdStartDate: "2023-02-01", redevApprovalDate: "2023-03-01", acquisitionDate: "2023-06-01", redevCompletionDate: "2025-11-01", redevNewHouseResidenceMonths: "0", residencePeriodMonthsAsset: "0" },
        { transferDate: "2026-03-02", filingDate: "2026-05-31", residencePeriodMonths: "0" },
      ],
      ["A3 control: same-household NO (no consolidation) code", { redevSuccessorGiftSameHousehold: "no", redevSuccessorGiftDonorHouseMember: "", redevSuccessorGiftHouseholdStartDate: "" }, {}],
    ];
    for (const [name, ao, fo] of cells) {
      const f = succ(ao, fo);
      const s = screen(f);
      const r = await runCalc(f);
      log(`${name}\n  screen: ${JSON.stringify(s)}\n  engine: ${summary(r)}`);
    }
  });
});

const SAMSONG = "4128111100";
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
function mixedForm(mixed: boolean, inDistrict: boolean | undefined, acq = "2020-01-10", code = SAMSONG) {
  return redevAptForm({
    kind: "housing",
    price: "1000000000",
    assetOver: {
      ...(mixed ? MIXED : {}),
      regionCode: code,
      addressJibun: "경기도 고양시 덕양구 삼송동 1",
      regionInDesignatedDistrict: inDistrict,
      fixedAcquisitionPrice: "600000000",
      acquisitionCause: "purchase",
      acquisitionDate: acq,
      ...(mixed ? { buildingAcquisitionDate: acq, landAcquisitionDate: acq } : {}),
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "0",
      residencePeriods: [],
    },
    formOver: { transferDate: "2024-06-03", filingDate: "2024-08-31", residencePeriodMonths: "0" } as never,
  });
}
describe("probe B2 mixed-use control 제주", () => {
  it("ctl", async () => {
    for (const mixed of [false, true]) {
      const f = mixedForm(mixed, undefined, "2020-01-10", "5011010100");
      const r = await runCalc(f);
      const res = r.result ?? {};
      log(`B2 control jeju mixed=${mixed} status=${r.status} exempt=${res.housingPart?.isExempt ?? res.isExempt} tax=${res.total?.totalPayable ?? res.totalTax} issues=${r.issues.length}`);
    }
  });
});
describe("probe B mixed-use district", () => {
  it("grid", async () => {
    for (const mixed of [false, true]) {
      for (const d of [false, true, undefined]) {
        const f = mixedForm(mixed, d);
        const s = calcEffectiveWasRegulatedAtAcquisition(f.assets[0], false, f.regionCode, { isPrimary: true });
        const r = await runCalc(f);
        const res = r.result ?? {};
        if (mixed && d === false) log("  mixed warnings/steps: " + JSON.stringify([...(res.warnings ?? []), ...(res.housingPart?.warnings ?? [])].filter((w: string) => /조정|거주/.test(w)).map((w: string) => w.slice(0, 200))) + " hp.reason=" + JSON.stringify(res.housingPart?.exemptReason) + " keys=" + Object.keys(res).join(","));
        log(
          `B mixed=${mixed} inDistrict=${d} screenEffective=${s} | status=${r.status} exempt=${res.housingPart?.isExempt ?? res.isExempt} tax=${res.total?.totalPayable ?? res.totalTax} bodyInDistrict=${r.body.regionInDesignatedDistrict} issues=${JSON.stringify(r.issues.map((i: { field?: string; message: string }) => i.field + ":" + i.message.slice(0, 50)))} reasons=${JSON.stringify((res.housingPart?.exemptReason ?? res.exemptReason ?? "").slice(0, 200))} err=${r.status !== 200 ? JSON.stringify(r.json).slice(0, 300) : ""}`,
        );
      }
    }
  });
});

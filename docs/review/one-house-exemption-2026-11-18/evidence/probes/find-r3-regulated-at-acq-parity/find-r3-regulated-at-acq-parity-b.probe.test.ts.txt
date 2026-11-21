/**
 * PROBE (find-r3-regulated-at-acq-parity) — C: §154⑩ 표준 경로(⑳ B · 0호) × 완공APT(승계·토지 출자)
 * ⑤ 카드(`rentalResidenceRequirementStatus` — 취득일 = 입주권 취득일·토지 취득일) ↔ 엔진(번역 취득일 = 준공일)
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
import { rentalResidenceRequirementStatus } from "@/lib/calc/rental-residence-requirement-status";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { calcRentalResidenceFacts } from "@/lib/calc/rental-residence-form-facts";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";

const OUT = "<session>/scratchpad/probes/find-r3-regulated-at-acq-parity/b.txt";
const log = (s: string) => appendFileSync(OUT, s + "\n");

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const RENTAL = {
  ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
  applyException: true,
  scenario: "B" as const,
  rentalUnits: [],
  wasRegisteredRentalOrChildcare: true,
  priorResidenceTransferDate: "2021-01-10",
  standardPriceAtAcquisitionForPhrp: "150,000,000",
  standardPriceAtPriorTransfer: "250,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
  phrp154_10Answer: "yes",
};

type Over = Record<string, unknown>;
function f(kindOver: Over, region: string, assetOver: Over = {}) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: "1000000000",
    assetOver: {
      regionCode: region,
      addressJibun: region ? "" : "제주특별자치도 제주시 테스트동 1",
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2020-07-01", moveOutDate: "2023-01-01" }],
      rentalHousingException: RENTAL,
      ...kindOver,
      ...assetOver,
    },
    formOver: { transferDate: "2024-06-03", filingDate: "2024-08-31", residencePeriodMonths: "30" } as never,
  });
}

const SUCC = {
  acquisitionCause: "purchase",
  acquisitionDate: "2018-03-01",
  redevApprovalDate: "2017-06-01",
  redevCompletionDate: "2020-06-01",
  redevIsSuccessorMember: "yes",
  redevOriginalAssetType: "housing",
  redevNewHouseResidenceMonths: "30",
  redevPriorHouseResidenceMonths: "0",
  fixedAcquisitionPrice: "500000000",
  redevSettlementDirection: "",
  redevSettlementAmount: "",
};
const LAND = {
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-01",
  redevApprovalDate: "2016-06-01",
  redevCompletionDate: "2020-06-01",
  redevIsSuccessorMember: "no",
  redevOriginalAssetType: "land",
  redevNewHouseResidenceMonths: "30",
};

describe("probe C ⑳ §154⑩ card vs engine for completion APT", () => {
  it("grid", async () => {
    writeFileSync(OUT, "");
    const cells: [string, Over, string][] = [
      ["C1 successor, 제주(code)", SUCC, "5011010100"],
      ["C2 successor, 마포 (completion 2020 regulated)", SUCC, "1144010100"],
      ["C3 land-contributed, 제주", LAND, "5011010100"],
      ["C4 control housing purchase 2018-03-01 제주", { acquisitionCause: "purchase" }, "5011010100"],
    ];
    for (const [name, k, region] of cells) {
      const form = name.startsWith("C4")
        ? redevAptForm({
            kind: "housing",
            price: "1000000000",
            assetOver: {
              regionCode: region,
              acquisitionDate: "2018-03-01",
              residenceInputMode: "interval",
              residencePeriods: [{ moveInDate: "2020-07-01", moveOutDate: "2023-01-01" }],
              rentalHousingException: RENTAL,
            },
            formOver: { transferDate: "2024-06-03", filingDate: "2024-08-31", residencePeriodMonths: "30" } as never,
          })
        : f(k, region);
      const a = form.assets[0];
      let facts: Record<string, unknown> = {};
      try {
        facts = calcRentalResidenceFacts(form, a, 0) as never;
      } catch (e) {
        facts = { err: String(e) };
      }
      const st = rentalResidenceRequirementStatus(a.rentalHousingException, a, 0, form.transferDate, facts as never);
      const r = await runCalc(form);
      const res = r.result ?? {};
      log(
        `${name}\n  card: acqDate=${primaryAcquisitionDateOf(a)} preRegime154_10=${st.preRegime154_10} axis=${st.residenceAxis} waiver=${st.residenceWaiver} residenceMet=${st.residenceMet} holdingMet=${st.holdingMet} holding=${JSON.stringify(st.holding)} facts=${JSON.stringify(facts)}\n  engine: status=${r.status} exempt=${res.isExempt} tax=${res.determinedTax} rhDetail=${JSON.stringify(res.rentalHousingExceptionDetail ?? res.rentalHousingException ?? null)?.slice(0, 600)} issues=${JSON.stringify(r.issues.map((i) => i.field + ":" + i.message.slice(0, 70)))} warnings=${JSON.stringify((res.warnings ?? []).filter((w: string) => /거주|154⑩|155⑳/.test(w)).map((w: string) => w.slice(0, 200)))} err=${r.status !== 200 ? JSON.stringify(r.json).slice(0, 400) : ""}`,
      );
    }
  });
});

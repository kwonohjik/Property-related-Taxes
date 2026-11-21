import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const OUT =
  "<session>/scratchpad/probes/v2-r2-era-undetermined-untested-r2-era-notice-relevance-contract-test-value";
it("calc warnings for ⑯ merged id", () => {
  const input = baseTransferInput({
    acquisitionDate: new Date("2019-01-01"),
    transferDate: new Date("2026-08-03"),
    householdHousingCount: 2,
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2019-01-01"),
      newAcquisitionDate: new Date("2022-03-02"),
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "1217000000",
      newHouseSigunguCode: "1213000000",
    } as never,
  });
  const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules!;
  const j = checkExemption(input as unknown as OneHouseJudgeInput, rules, new Date("2021-01-01"));
  const r = calculateTransferTax(input, makeMockRates());
  const out = {
    judgeUnd: j.undetermined.map((u) => u.id),
    calcIsExempt: (r as unknown as { isExempt?: boolean }).isExempt,
    calcTax: r.calculatedTax,
    warningsMentioningMerged: (r.warnings ?? []).filter((w) => w.includes("통합특별시")),
    warningCount: (r.warnings ?? []).length,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/calcwarn.json`, JSON.stringify(out, null, 2));
});

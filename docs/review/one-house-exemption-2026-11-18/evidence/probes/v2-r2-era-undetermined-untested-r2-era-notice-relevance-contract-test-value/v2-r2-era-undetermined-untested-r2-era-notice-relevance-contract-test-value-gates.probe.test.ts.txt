import { it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const OUT =
  "<session>/scratchpad/probes/v2-r2-era-undetermined-untested-r2-era-notice-relevance-contract-test-value";
const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules as OneHouseSpecialRulesData;
const run = (o: Partial<TransferTaxInput> & Record<string, unknown>) => {
  const r = checkExemption(baseTransferInput(o as Partial<TransferTaxInput>) as unknown as OneHouseJudgeInput, rules, new Date("2021-01-01"));
  return { isExempt: r.isExempt, isPartial: r.isPartialExempt, reason: (r as unknown as {reason?: string}).reason, und: r.undetermined.map((u) => u.id), unmet: (r.unmetExceptions ?? []).map((u) => [u.id, (u as unknown as {reasons?: string[]}).reasons]), review: (r.requirementReview as unknown as {rows?: {label:string; met?: unknown}[]})?.rows?.map((x)=>x.label+":"+String(x.met)) };
};

const NAJU = "1217000000";
const YEOSU = "1213000000";

it("probe", () => {
  const res: Record<string, unknown> = {};
  // ③ ⑯ 통합특별시 — 결론 가르는 셀(거주요건 없음) vs 거주요건 미달 셀(취득 당시 조정 · 거주 0)
  const merged = (wasReg: boolean) => ({
    acquisitionDate: new Date("2019-01-01"),
    transferDate: new Date("2026-08-03"),
    householdHousingCount: 2,
    wasRegulatedAtAcquisition: wasReg,
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    temporaryTwoHouse: {
      previousAcquisitionDate: new Date("2019-01-01"),
      newAcquisitionDate: new Date("2022-03-02"),
      publicInstitutionRelocation: true,
      relocatedSigunguCode: NAJU,
      newHouseSigunguCode: YEOSU,
    },
  });
  res["merged decides (비조정)"] = run(merged(false));
  res["merged invariant (취득시 조정·거주0)"] = run(merged(true));
  // 반사실: 통합특별시 전체로 읽어 지역 요건 충족(코드 제거 = 지역 판정 없음)
  const m2 = merged(true);
  res["merged invariant cf(region met)"] = run({ ...m2, temporaryTwoHouse: { ...m2.temporaryTwoHouse, relocatedSigunguCode: undefined, newHouseSigunguCode: undefined } });

  // ④ 재상속 — 결론 가르는 셀(거주 충분) vs 거주요건 미달 셀
  const reinherit = (wasReg: boolean, re = true) => ({
    acquisitionDate: new Date(wasReg ? "2018-03-15" : "2016-03-15"),
    transferDate: new Date("2026-06-15"),
    householdHousingCount: re ? 1 : 2, // route가 상속 제외 뒤 센 값(제외 안 되면 2)
    wasRegulatedAtAcquisition: wasReg,
    residencePeriodMonths: 0,
    sellingHouseId: "S",
    houses: [
      { id: "A", isInherited: true, isCoInherited: false, inheritedDate: new Date("2020-05-15"), acquisitionDate: new Date("1982-06-15"), region: "capital", officialPrice: 300_000_000, decedentSameHouseholdAtInheritance: true, ...(re ? { reInheritedFromSeparateHousehold: true } : {}) },
    ],
  });
  res["reinherit decides (비조정)"] = run(reinherit(false));
  res["reinherit cf(not reinherited, 비조정)"] = run(reinherit(false, false));
  res["reinherit invariant (조정·거주0)"] = run(reinherit(true));
  res["reinherit invariant cf(not reinherited)"] = run(reinherit(true, false));

  // ④ 2010 전 동거봉양 — 보유 미달 셀
  const pre2010 = (acq: string, care = true) => ({
    acquisitionDate: new Date(acq),
    transferDate: new Date("2009-12-01"),
    householdHousingCount: care ? 1 : 2, // route가 상속 제외 뒤 센 값
    residencePeriodMonths: 60,
    sellingHouseId: "S",
    houses: [
      { id: "A", isInherited: true, isCoInherited: false, inheritedDate: new Date("2008-05-15"), acquisitionDate: new Date("1982-06-15"), region: "capital", officialPrice: 300_000_000, decedentSameHouseholdAtInheritance: true, ...(care ? { parentalCareMergeInheritedHouse: true } : {}) },
    ],
  });
  res["pre2010 decides (보유 충족)"] = run(pre2010("2004-01-01"));
  res["pre2010 cf(no care, 보유 충족)"] = run(pre2010("2004-01-01", false));
  res["pre2010 invariant (보유 1년)"] = run(pre2010("2008-12-01"));
  res["pre2010 invariant cf(no care)"] = run(pre2010("2008-12-01", false));

  // 의도된 예외: 4호 고지는 1주택이면 보유 미달이어도 낸다(rental4hoUndeterminedNotice 「시간이 해소한다」)
  const oneHouse = (acq: string) => ({
    acquisitionDate: new Date(acq),
    transferDate: new Date("2026-06-01"),
    householdHousingCount: 1,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
  });
  res["1주택 조정 거주0 보유5년"] = run(oneHouse("2021-01-01"));
  res["1주택 조정 거주0 보유1년"] = run(oneHouse("2025-05-01"));

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/gates.json`, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
});

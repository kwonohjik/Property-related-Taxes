/**
 * anchor: 취득세 주택 수 — 공동상속 조합원입주권·주택분양권·오피스텔의 소유자 판정 (계획서 I-6)
 *
 * 지방세법 시행령 §28의4⑤ (현행 MST 288831 — 2020.8.12. 신설 당시 ④, 대통령령 제30939호 MST 220923 동문):
 *  「상속으로 여러 사람이 공동으로 1개의 주택, 조합원입주권, 주택분양권 또는 오피스텔을 소유하는 경우
 *   지분이 가장 큰 상속인을 그 주택, 조합원입주권, 주택분양권 또는 오피스텔의 소유자로 보고, 지분이 가장
 *   큰 상속인이 두 명 이상인 경우에는 그 중 다음 각 호의 순서에 따라 … 소유자를 판정한다.
 *   1. 그 주택 또는 오피스텔에 거주하는 사람  2. 나이가 가장 많은 사람」
 * ⇒ 입주권·분양권은 1호(거주)가 없다 — 동순위면 곧바로 2호(최연장자).
 *
 * 변경 전: `RightAsset`·`OfficeAsset`에 지분 칸이 없어 ④가 지분을 버렸다 — 소수지분 상속인도
 * 입주권·분양권·오피스텔을 1개로 셌다(2020.8.12. 이후 상속분 — 그 전 취득분은 법률 제17473호 부칙 제3조로 애초에 제외). 실측(폼 → 빌더 → Zod → 엔진, base b49826f8):
 *   비조정 · 보유 주택 1 + 상속 입주권(지분 30%, 최대 50%) + 취득 5억 → 3주택 8% 40,000,000
 */

import { describe, it, expect } from "vitest";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState, type OwnedHouseInfo } from "@/components/calc/acquisition/shared";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import { acquisitionTaxInputSchema } from "@/lib/validators/acquisition-input";
import { calcAcquisitionTax } from "@/lib/tax-engine/acquisition-tax";
import { calculateHouseCount } from "@/lib/tax-engine/house-count/index";
import { ACQUISITION } from "@/lib/tax-engine/legal-codes";
import type { RightAsset, OfficeAsset } from "@/lib/tax-engine/house-count/types";

function row(id: string, propertyType: string, over: Partial<OwnedHouseInfo> = {}): OwnedHouseInfo {
  return {
    ...createOwnedHouseInfo(id),
    propertyType,
    standardValue: "300000000",
    acquisitionDate: "2020-09-01",
    isMetropolitanRegion: true,
    ...over,
  };
}

const inherited = (over: Partial<OwnedHouseInfo> = {}): Partial<OwnedHouseInfo> => ({
  isInherited: true,
  inheritanceDate: "2020-09-01",
  shareInInheritance: "0.3",
  maxShareInInheritors: "0.5",
  ...over,
});

function baseForm(extra: OwnedHouseInfo): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500000000",
    standardValue: "500000000",
    isRegulatedArea: false,
    isMetropolitanRegion: true,
    houseCountAfter: "3",
    balancePaymentDate: "2026-06-01",
    ownedHouses: [row("A", "housing", { acquisitionDate: "2015-01-01" }), extra],
  };
}

function calcViaRoute(form: FormState) {
  const parsed = acquisitionTaxInputSchema.safeParse(buildAcquisitionTaxBody(form));
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("unreachable");
  return calcAcquisitionTax(parsed.data);
}

const reasons = (r: ReturnType<typeof calcViaRoute>) =>
  r.houseCountDetail?.excludedDetails.map((e) => `${e.assetId}:${e.reason}`) ?? [];

describe("[I6] 폼 → 빌더 → Zod → 엔진", () => {
  it("[I6-01] 🔴 상속 입주권 소수지분(30% < 50%) → 소유자 아님 → 2주택 1% 5,000,000 (종전 3주택 8% 40,000,000)", () => {
    const r = calcViaRoute(baseForm(row("R", "right", inherited())));
    expect(reasons(r)).toEqual(["R:joint_inheritance_not_owner"]);
    expect(r.houseCountDetail?.excludedDetails[0].legalBasis).toBe(ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE);
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[I6-02] 🔴 상속 분양권 소수지분 → 제외", () => {
    const r = calcViaRoute(baseForm(row("S", "subscription_right", inherited())));
    expect(reasons(r)).toEqual(["S:joint_inheritance_not_owner"]);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[I6-03] 🔴 상속 오피스텔 소수지분 → 제외", () => {
    const r = calcViaRoute(baseForm(row("O", "officetel", inherited())));
    expect(reasons(r)).toEqual(["O:joint_inheritance_not_owner"]);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("[I6-04] 긍정 짝 — 입주권 최대지분(50% = 50%, 단독) → 소유자 → 3주택 8%", () => {
    const r = calcViaRoute(baseForm(row("R", "right", inherited({ shareInInheritance: "0.5" }))));
    expect(reasons(r)).toEqual([]);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("[I6-05] 긍정 짝 — 상속 5년 미경과면 지분과 무관하게 ⑥3호로 제외(종전과 같음)", () => {
    const r = calcViaRoute(baseForm(row("R", "right", inherited({ inheritanceDate: "2022-01-01", acquisitionDate: "2022-01-01" }))));
    expect(reasons(r)).toEqual(["R:inheritance_under_5yr"]);
  });

  it("[I6-06] 입주권 행은 거주 칸을 보내지 않는다 — 켜져 있어도 ④가 버린다", () => {
    const body = buildAcquisitionTaxBody(
      baseForm(row("R", "right", inherited({ shareInInheritance: "0.5", tieInMaxShare: true, isResident: true, isOldest: false })))
    );
    const rights = (body.houseCountInput as { rights: RightAsset[] }).rights;
    expect(rights[0].tieInMaxShare).toBe(true);
    expect(rights[0].isOldestInheritor).toBe(false);
    expect("isResidentInInheritedHouse" in rights[0]).toBe(false);
  });
});

describe("[I6] 엔진 — 동순위(§28의4⑤ 후단)", () => {
  const base = { rightAcquisitionDate: "2020-09-01", inheritanceDate: "2020-09-01", shareInInheritance: 0.5, maxShareInInheritors: 0.5, tieInMaxShare: true };
  const hcRight = (over: Partial<RightAsset>) =>
    calculateHouseCount({
      houses: [],
      rights: [{ id: "R", type: "redevelopment_right", ...base, ...over }],
      offices: [],
      referenceDate: "2026-06-01",
    });
  const hcOffice = (over: Partial<OfficeAsset>) =>
    calculateHouseCount({
      houses: [],
      rights: [],
      offices: [{ id: "O", standardValue: 300_000_000, acquisitionDate: "2020-09-01", inheritanceDate: "2020-09-01", shareInInheritance: 0.5, maxShareInInheritors: 0.5, tieInMaxShare: true, ...over }],
      referenceDate: "2026-06-01",
    });

  it("[I6-07] 🔴 입주권 동순위 · 최연장자 아님 → 제외", () => {
    expect(hcRight({ isOldestInheritor: false }).effectiveCount).toBe(0);
  });
  it("[I6-08] 긍정 짝 — 입주권 동순위 · 최연장자 → 산입", () => {
    expect(hcRight({ isOldestInheritor: true }).effectiveCount).toBe(1);
  });
  it("[I6-09] 🔴 오피스텔 동순위 · 다른 상속인만 거주 → 제외", () => {
    expect(hcOffice({ isOtherTiedHeirResident: true, isOldestInheritor: true }).effectiveCount).toBe(0);
  });
  it("[I6-10] 긍정 짝 — 오피스텔 동순위 · 본인만 거주 → 산입(최연장자 아니어도)", () => {
    expect(hcOffice({ isResidentInInheritedHouse: true, isOldestInheritor: false }).effectiveCount).toBe(1);
  });
  it("[I6-11] 지분 칸이 없는 종전 기록 → 종전처럼 산입", () => {
    expect(hcRight({ shareInInheritance: undefined, maxShareInInheritors: undefined, tieInMaxShare: undefined }).effectiveCount).toBe(1);
  });
});

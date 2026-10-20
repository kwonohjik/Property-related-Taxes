// @vitest-environment jsdom
/**
 * 상속인이 아닌 사람(수유자)이 유증·사인증여로 받은 자산 — 토글·배선·술어 (2026-10-20)
 * 계획서: docs/00-pm/nbl-bequest-non-heir.plan.md
 *
 * 세액은 route anchor 두 벌이 고정한다:
 *  - 비사업용 토지 `__tests__/api/transfer.route.nbl-bequest-non-heir.anchor.test.ts`
 *  - 1주택 `__tests__/api/one-house.route.non-heir-bequest.anchor.test.ts`
 * 여기서는 그 밖의 갈래를 본다 — ③3호 나목 취득일 소급(부동산거래관리과-0994) · 축 B 지분 레코드 · 명부 ④ ·
 * 1주택 술어를 쓰는 §156의2⑤·⑦ 지점 · 화면 토글의 노출과 리셋 · 안내 문구.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { buildUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { buildFractionalShareNblRecord } from "@/lib/calc/non-business-land-request";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { isHeirInheritedHouse } from "@/lib/tax-engine/transfer-inheritance-exclusion";
import { replacementHouseHeldUnits } from "@/lib/tax-engine/one-house/replacement-house";
import { hasInheritedHouseOtherThanSelling } from "@/lib/tax-engine/transfer-tax-89-2-inherited-right";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { InheritanceWithin3YearsNotice } from "@/components/calc/transfer/nbl/shared/InheritanceWithin3YearsNotice";
import { UnconditionalExemptionSection } from "@/components/calc/transfer/nbl/UnconditionalExemptionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL } from "@/lib/tax-engine/legal-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

afterEach(cleanup);

const pd = (s: string) => (s ? new Date(s) : undefined);
const NON_HEIR_TOGGLE = /상속인이 아닌 사람이 유증·사인증여로 받음/;

describe("③3호 나목 취득일 소급 — 수유자는 피상속인 취득일로 소급하지 않는다(부동산거래관리과-0994)", () => {
  const inh = (o: Record<string, unknown> = {}) =>
    buildUnconditionalExemption(
      { acquisitionCause: "inheritance", acquisitionDate: "2008-01-01", decedentAcquisitionDate: "1981-01-01", transferCause: "public_expropriation", nblExemptPublicNoticeDate: "2010-01-01", ...o },
      pd,
    )!;

  it("매퍼: 상속인 = 피상속인 취득일 · 수유자 = undefined(양수인 취득일로 판정)", () => {
    expect(inh().expropriationAcquisitionDate).toEqual(new Date("1981-01-01"));
    expect(inh({ nonHeirBequest: true }).expropriationAcquisitionDate).toBeUndefined();
  });

  it("판정(P4): 2008 상속 · 피상속인 1981 취득 · 고시 2010 → 상속인 성립 · 수유자 불성립", () => {
    const asset = (o: Partial<AssetForm>) =>
      ({
        ...makeDefaultAsset(1), nblLandType: "farmland", nblZoneType: "agriculture_forest",
        acquisitionCause: "inheritance", acquisitionDate: "2008-01-01", decedentAcquisitionDate: "1981-01-01",
        transferCause: "public_expropriation", nblExemptPublicExpropriation: true, nblExemptPublicNoticeDate: "2010-01-01", ...o,
      }) as AssetForm;
    expect(evaluateUnconditionalExemption(asset({}), "2012-06-01").isExempt).toBe(true);
    expect(evaluateUnconditionalExemption(asset({ nonHeirBequest: true }), "2012-06-01").isExempt).toBe(false);
  });
});

describe("④ 배선", () => {
  it("축 B 지분 레코드: 수유자 여부는 지분 값을 쓴다(첫 카드 값을 빌리지 않는다)", () => {
    const primary = { ...makeDefaultAsset(1), acquisitionCause: "inheritance", acquisitionDate: "2015-01-01" } as AssetForm;
    const share = { ...makeDefaultAsset(2), acquisitionCause: "inheritance", acquisitionDate: "2020-01-01", nonHeirBequest: true } as AssetForm;
    expect(buildFractionalShareNblRecord(share, primary).nonHeirBequest).toBe(true);
    expect(buildFractionalShareNblRecord({ ...share, nonHeirBequest: undefined }, { ...primary, nonHeirBequest: true }).nonHeirBequest).toBeUndefined();
  });

  it("명부 행: 「상속받은 주택」인 행에만 싣는다(상속 표시를 끈 뒤 남은 값은 버린다)", () => {
    const primary = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-01" } as AssetForm;
    const row = (o: Partial<HouseEntry>) =>
      ({ id: "inh", region: "capital", acquisitionDate: "2019-06-01", officialPrice: "300000000", isInherited: true, inheritedDate: "2019-06-01",
        isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, ...o }) as HouseEntry;
    const pick = (o: Partial<HouseEntry>) =>
      (buildHousesPayload(primary, [row(o)], 0, undefined, "2023-06-01") as Array<Record<string, unknown>>).find((h) => h.id === "inh");
    expect(pick({ nonHeirBequest: true })?.nonHeirBequest).toBe(true);
    expect(pick({ nonHeirBequest: true, isInherited: false })?.nonHeirBequest).toBeUndefined();
    expect(pick({})?.nonHeirBequest).toBeUndefined();
  });
});

describe("1주택 술어 `isHeirInheritedHouse` — §156의2⑤·⑦ 지점도 같은 술어", () => {
  const h = (id: string, o: Partial<HouseInfo> = {}) =>
    ({ id, region: "capital", acquisitionDate: new Date("2015-01-01"), officialPrice: 0, isInherited: false, isLongTermRental: false, ...o }) as HouseInfo;
  const INH = { isInherited: true, inheritedDate: new Date("2015-01-01") };

  it("상속 표시 + 수유자 아님만 상속주택", () => {
    expect([isHeirInheritedHouse(h("a", INH)), isHeirInheritedHouse(h("a", { ...INH, nonHeirBequest: true })), isHeirInheritedHouse(h("a"))])
      .toEqual([true, false, false]);
  });

  it("§156의2⑤ 대체주택 세대 구성: 상속주택은 세지 않고 수유자 행은 센다", () => {
    const base = { acquisitionDate: new Date("2020-01-01"), transferDate: new Date("2024-01-01"), sellingHouseId: "rep" };
    expect(replacementHouseHeldUnits({ ...base, houses: [h("rep"), h("x", INH)] })).toBe(0);
    expect(replacementHouseHeldUnits({ ...base, houses: [h("rep"), h("x", { ...INH, nonHeirBequest: true })] })).toBe(1);
  });

  it("§156의2⑦1호·§156의3⑤1호 「상속받은 주택」 보유: 수유자 행만이면 없다", () => {
    const base = { acquisitionDate: new Date("2010-01-01"), transferDate: new Date("2024-01-01"), sellingHouseId: "s" };
    expect(hasInheritedHouseOtherThanSelling({ ...base, houses: [h("s"), h("x", INH)] } as never)).toBe(true);
    expect(hasInheritedHouseOtherThanSelling({ ...base, houses: [h("s"), h("x", { ...INH, nonHeirBequest: true })] } as never)).toBe(false);
  });
});

describe("화면 — 토글 노출·리셋·안내", () => {
  const inhAsset = (o: Partial<AssetForm>) =>
    ({ ...makeDefaultAsset(1), acquisitionCause: "inheritance", acquisitionDate: "2022-06-01", ...o }) as AssetForm;

  // 후속 묶음(`non-heir-bequest-followups.plan.md` §4-2)부터 §104②1호·§167의3①7호도 읽어 모든 자산 종류에 띄운다.
  it("상속 취득 블록: 자산 종류와 관계없이 토글 · 켜면 nonHeirBequest = true · 끄면 undefined", () => {
    const onChange = vi.fn();
    render(<CompanionAcqInheritanceBlock asset={inhAsset({ assetKind: "land" })} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: NON_HEIR_TOGGLE }));
    expect(onChange).toHaveBeenLastCalledWith({ nonHeirBequest: true });
    cleanup();
    render(<CompanionAcqInheritanceBlock asset={inhAsset({ assetKind: "land", nonHeirBequest: true })} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: NON_HEIR_TOGGLE }));
    expect(onChange).toHaveBeenLastCalledWith({ nonHeirBequest: undefined });
    cleanup();
    render(<CompanionAcqInheritanceBlock asset={inhAsset({ assetKind: "housing" })} onChange={() => {}} />);
    expect(screen.queryByRole("switch", { name: NON_HEIR_TOGGLE })).not.toBeNull();
  });

  const house = (o: Partial<HouseEntry>) =>
    ({ id: "h1", region: "capital", acquisitionDate: "2018-01-01", officialPrice: "300000000", isInherited: false,
      isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...o }) as HouseEntry;

  it("명부 행: 「상속주택」을 켰을 때만 토글 · 「상속주택」을 끄면 함께 지운다", () => {
    render(<HouseEntryEditor house={house({})} onUpdate={() => {}} />);
    expect(screen.queryByRole("switch", { name: NON_HEIR_TOGGLE })).toBeNull();
    cleanup();
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={house({ isInherited: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("switch", { name: NON_HEIR_TOGGLE }));
    expect(onUpdate).toHaveBeenLastCalledWith({ nonHeirBequest: true });
    cleanup();
    render(<HouseEntryEditor house={house({ isInherited: true, nonHeirBequest: true })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("switch", { name: /피상속인으로부터 상속받은 주택/ }));
    const patch = onUpdate.mock.calls.at(-1)![0];
    expect(patch.isInherited).toBe(false);
    expect("nonHeirBequest" in patch && patch.nonHeirBequest === undefined).toBe(true);
  });

  it("임야·목장 상속 3년 안내: 수유자면 적용하지 않음 + 확인 필요", () => {
    render(<InheritanceWithin3YearsNotice asset={inhAsset({ nonHeirBequest: true })} landLabel="임야" legalBasis={NBL.FOREST_INHERIT_3Y} />);
    expect(screen.getByTestId("nbl-inherit-3y-notice").textContent).toContain(
      `상속인이 아닌 사람이 유증·사인증여로 받은 임야라 상속 3년 특례(${NBL.FOREST_INHERIT_3Y})를 적용하지 않습니다.`,
    );
    expect(screen.getByTestId("nbl-inherit-3y-notice").textContent).toContain("확인이 필요합니다");
    cleanup();
    render(<InheritanceWithin3YearsNotice asset={inhAsset({})} landLabel="임야" legalBasis={NBL.FOREST_INHERIT_3Y} />);
    expect(screen.getByTestId("nbl-inherit-3y-notice").textContent).toContain("상속받은 임야입니다.");
  });

  it("무조건 의제 상속 안내: 수유자면 자동 판정 대신 미적용 문구", () => {
    const status = evaluateUnconditionalExemption(inhAsset({ nblLandType: "farmland", nblZoneType: "general_residential", nonHeirBequest: true }), "2024-06-03");
    render(<UnconditionalExemptionSection asset={inhAsset({ nonHeirBequest: true })} onAssetChange={() => {}} status={status} />);
    expect(screen.getByTestId("nbl-uncond-inherit-auto-notice").textContent).toContain("상속인이 아닌 사람이 유증·사인증여로 받은 토지라 상속 특례");
    expect(status.isExempt).toBe(false);
  });
});

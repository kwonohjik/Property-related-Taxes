/**
 * anchor — 의제취득일 전 «매수» 영 §176조의2④ 범위 밖 자산 안내 (PR-4 · Q-12 a)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §13
 *
 * 입력 카드·기존 안내가 뜨지 않는 매수 자산에 「비교를 반영하지 않습니다」를 밝힌다. 값·요청은 그대로다(비교 payload 없음).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { PreDeemedPurchaseOutOfScopeNotice } from "@/components/calc/transfer/PreDeemedPurchaseCard";
import {
  buildPreDeemedPurchasePayload,
  isPreDeemedPurchaseAsset,
  preDeemedPurchaseInputError,
  preDeemedPurchaseNotCompared,
  preDeemedPurchaseOutOfScopeKind,
} from "@/lib/calc/transfer-pre-deemed-purchase-form";

afterEach(cleanup);

const D = "1985-01-01";
const mk = (o: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), acquisitionCause: "purchase", transferType: "regular", assetKind: "land", acquisitionDate: D, ...o }) as AssetForm;
const donor = (date: string, cause: "purchase" | "inheritance" | "gift" = "purchase") => ({ ...CARRYOVER_DEFAULTS, donorAcquisitionDate: date, donorAcquisitionCause: cause });
const parcel = (o: Record<string, unknown>) => ({ acquisitionDate: "", useDayAfterReplotting: false, ...o }) as AssetForm["parcels"][number];

describe("범위 밖 — 안내 종류", () => {
  it.each<[string, Partial<AssetForm>, string]>([
    ["겸용주택", { assetKind: "housing", isMixedUseHouse: true }, "mixed_use"],
    ["겸용주택 분리 ON 토지만 의제일", { assetKind: "housing", isMixedUseHouse: true, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: D, acquisitionDate: "1990-01-01" }, "mixed_use"],
    ["부담부증여 토지", { transferType: "burdened_gift" }, "burdened_gift"],
    ["부담부증여 일반건물", { assetKind: "general_building", transferType: "burdened_gift", landAcquisitionDate: D, gbBuildingAcquisitionCause: "purchase" }, "burdened_gift"],
    ["일반건물 증축", { assetKind: "general_building", gbHasExtension: true, landAcquisitionDate: D, gbBuildingAcquisitionCause: "purchase" }, "extension"],
    ["일반건물 토지 매수 + 건물 신축", { assetKind: "general_building", landAcquisitionDate: D, acquisitionDate: "1990-01-01", hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "newConstruction" as never }, "part_cause"],
    ["일반건물 토지 상속 + 건물 매수", { assetKind: "general_building", acquisitionCause: "inheritance", landAcquisitionDate: "1980-01-01", acquisitionDate: D, hasSeperateLandAcquisitionDate: true, gbBuildingAcquisitionCause: "purchase" }, "part_cause"],
    ["소유자 분리", { assetKind: "housing", selfOwns: "land_only" }, "part_cause"],
    ["건물 매수 + 토지 상속 D1", { assetKind: "housing", hasSeperateLandAcquisitionDate: true, landCauseHost: "purchase", landAcquisitionCause: "inheritance", landAcquisitionDate: "1980-01-01" }, "part_cause"],
    ["소유자 분리 건물만", { assetKind: "building", selfOwns: "building_only" }, "part_cause"],
    ["분양권", { assetKind: "presale_right" }, "other"],
    ["상가 분리 ON 한 파트", { assetKind: "commercial_building", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: D, acquisitionDate: "1990-01-01" }, "other"],
  ])("%s", (_n, o, kind) => {
    const a = mk(o);
    expect(preDeemedPurchaseOutOfScopeKind(a)).toBe(kind);
    expect(isPreDeemedPurchaseAsset(a)).toBe(false);
    // 칸을 요구하지 않는다(막다른 길 금지) · 값은 그대로 — 비교 요청을 싣지 않는다
    expect(preDeemedPurchaseInputError(a, "자산")).toBeNull();
    expect(buildPreDeemedPurchasePayload({ ...a, preDeemedOriginalAcquisitionDate: "1984-06-01" }, () => undefined)).toEqual({});
    render(<PreDeemedPurchaseOutOfScopeNotice asset={a} />);
    expect(screen.getByTestId("pre-deemed-purchase-out-of-scope").getAttribute("data-kind")).toBe(kind);
    expect(screen.getByTestId("pre-deemed-purchase-out-of-scope").textContent).toContain("반영하지 않습니다");
  });

  it("다필지 — 1985 전 필지가 있을 때만 · 환지 익일 필지는 칸이 다르다", () => {
    const of = (parcels: AssetForm["parcels"]) => preDeemedPurchaseOutOfScopeKind(mk({ parcelMode: true, acquisitionDate: "", parcels }));
    expect(of([parcel({ acquisitionDate: "1990-01-01" }), parcel({ acquisitionDate: "1984-12-31" })])).toBe("parcels");
    expect(of([parcel({ acquisitionDate: D })])).toBeUndefined();
    expect(of([parcel({ acquisitionDate: "1984-01-01", useDayAfterReplotting: true })])).toBeUndefined();
    expect(of([])).toBeUndefined();
  });

  it("이월과세 — 증여자 매수 · 1985 전만(증여자 칸은 덮어쓰지 않는다)", () => {
    const of = (c: AssetForm["carryover"]) => preDeemedPurchaseOutOfScopeKind(mk({ acquisitionCause: "carryover_gift", acquisitionDate: "2015-01-01", carryover: c }));
    expect(of(donor("1984-06-01"))).toBe("carryover");
    expect(of(donor("1985-01-01"))).toBeUndefined();
    expect(of(donor("1984-06-01", "inheritance"))).toBeUndefined();
    expect(of(donor("1984-06-01", "gift"))).toBeUndefined();
  });

  it("이월과세 서브폼 — 건물·토지 파트는 받는 칸이 있을 때만(잔재 무시)", () => {
    const gb = (o: Partial<AssetForm>) => mk({ assetKind: "general_building", acquisitionDate: "2015-01-01", ...o });
    expect(preDeemedPurchaseOutOfScopeKind(gb({ gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: donor("1984-06-01") }))).toBe("carryover");
    expect(preDeemedPurchaseOutOfScopeKind(gb({ gbBuildingAcquisitionCause: "purchase", buildingCarryover: donor("1984-06-01") }))).toBeUndefined();
    const house = (o: Partial<AssetForm>) => mk({ assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2015-01-01", carryover: donor("1990-01-01"), landCarryover: donor("1984-06-01"), ...o });
    expect(preDeemedPurchaseOutOfScopeKind(house({ carryoverDonorSplit: true }))).toBe("carryover");
    expect(preDeemedPurchaseOutOfScopeKind(house({ carryoverDonorSplit: false }))).toBeUndefined();
    // 분리는 첫 자산 전용 — 함께 양도 자산은 토지 서브폼을 받지 않는다
    expect(preDeemedPurchaseOutOfScopeKind(house({ carryoverDonorSplit: true }), { isNonPrimary: true })).toBeUndefined();
    // 토지만 이월과세(A) + 건물 매수
    expect(preDeemedPurchaseOutOfScopeKind(mk({ assetKind: "housing", acquisitionDate: "1990-01-01", hasSeperateLandAcquisitionDate: true, landCauseHost: "purchase", landAcquisitionCause: "carryover_gift" as never, landAcquisitionDate: "2015-01-01", landCarryover: donor("1984-06-01") }))).toBe("carryover");
  });
});

describe("안내 없음", () => {
  it.each<[string, Partial<AssetForm>]>([
    ["입력 카드가 뜨는 토지", {}],
    ["입력 카드가 뜨는 주택 PHD", { assetKind: "housing", hasSeperateLandAcquisitionDate: true, usePreHousingDisclosure: true, landAcquisitionDate: D }],
    ["취득일이 1985 뒤", { acquisitionDate: "1985-01-02" }],
    ["겸용 부담부증여(⑧ MB-16)", { assetKind: "housing", isMixedUseHouse: true, transferType: "burdened_gift" }],
    ["상속", { acquisitionCause: "inheritance" }],
    ["증여", { acquisitionCause: "gift" }],
    ["신축", { acquisitionCause: "newConstruction" as never }],
    ["일반건물 상속", { assetKind: "general_building", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", landAcquisitionDate: D }],
    ["건물 상속 + 토지 매수 1990(건물 칸은 사실값)", { assetKind: "housing", acquisitionCause: "inheritance", hasSeperateLandAcquisitionDate: true, landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "1990-01-01" }],
    ["취득일 빈칸", { acquisitionDate: "" }],
    ["토지 상속 + 건물 매수 1990(토지 칸은 상속 파트)", { assetKind: "housing", acquisitionDate: "1990-01-01", hasSeperateLandAcquisitionDate: true, landCauseHost: "purchase", landAcquisitionCause: "inheritance", landAcquisitionDate: D }],
    ["분리 OFF의 토지 칸 잔재", { assetKind: "housing", acquisitionDate: "1990-01-01", hasSeperateLandAcquisitionDate: false, landAcquisitionDate: D }],
    ["일반건물 상속 · 건물 원인 빈 값", { assetKind: "general_building", acquisitionCause: "inheritance", gbBuildingAcquisitionCause: undefined, acquisitionDate: D }],
    ["토지 아닌 자산의 다필지 잔재", { assetKind: "commercial_building", parcelMode: true, parcels: [parcel({ acquisitionDate: "1984-01-01" })] , acquisitionDate: "1990-01-01" }],
  ])("%s", (_n, o) => {
    const a = mk(o);
    expect(preDeemedPurchaseOutOfScopeKind(a)).toBeUndefined();
    const { container } = render(<PreDeemedPurchaseOutOfScopeNotice asset={a} />);
    expect(container.textContent).toBe("");
  });

  it("기존 안내(일반건물 추계 · 두 파트 1985 전)와 겹치지 않는다", () => {
    const gbEst = mk({ assetKind: "general_building", landAcquisitionDate: D, gbBuildingAcquisitionCause: "purchase", useEstimatedAcquisition: true });
    expect(preDeemedPurchaseNotCompared(gbEst)).toBe(true);
    expect(preDeemedPurchaseOutOfScopeKind(gbEst)).toBeUndefined();
    const both = mk({ assetKind: "housing", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: D, usePreHousingDisclosure: false });
    expect(preDeemedPurchaseNotCompared(both)).toBe(true);
    expect(preDeemedPurchaseOutOfScopeKind(both)).toBeUndefined();
  });

  it("건물 상속 + 토지 매수 1985 전(D2) — 토지 매수 부분을 밝힌다", () => {
    const a = mk({ assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "1980-01-01", hasSeperateLandAcquisitionDate: true, landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: D });
    expect(preDeemedPurchaseOutOfScopeKind(a)).toBe("part_cause");
  });
});

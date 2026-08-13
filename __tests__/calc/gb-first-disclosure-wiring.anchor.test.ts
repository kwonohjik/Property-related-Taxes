/**
 * anchor ④⑧ — §99-164-10 최초공시의 **API 전송 게이트 · validate 게이트**.
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` §6.2·§7.5
 *
 * 고정 계약:
 *   FD-10  실거래가·증축 없음 + stale 플래그 → validate가 **통과**한다 (종전에는 차단)
 *   FD-11  **실거래가 + 증축** + stale 플래그 → payload에 `hasFirstDisclosure`가 **없다**
 *   FD-12  분리 ON + **파트만** 환산 → 토글이 유효하고 3필드가 **필수**가 된다
 *   FD-2'  단가 경로가 payload의 `firstDisclosureLandStdPrice`로 관통한다
 *   FD-3'  legacy 총액만 있어도 payload 값이 종전과 같다 (회귀 0)
 *
 * ## 🔴 이 파일이 유일한 방어다
 *
 * 착수 전 mutation 실측(2026-08-13): 종전 차단문
 * (`「환산주택가격 입력은 환산취득가 모드에서만 가능합니다」`)을 **통째로 삭제해도**
 * `__tests__/calc/` + `__tests__/components/` **330파일 3032건이 전부 통과**했다.
 * 즉 그 동작을 지키는 테스트가 하나도 없었다. 게이트를 「차단 → 무시」로 바꾸는 이번
 * 변경 이후의 동작도 마찬가지로 무방비가 되므로, 여기서 명시적으로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2024-03-01";

/** 최초공시 3필드가 모두 채워진 일반건물 — 게이트만 바꿔 가며 본다. */
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    gbZoneType: "residential",
    gbLandArea: "160",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "100",
    gbAcqLandPricePerSqm: "3,560,000",
    gbAcqBuildingValue: "36,696,000",
    gbTransferLandPricePerSqm: "4,200,000",
    gbTransferBuildingValue: "42,680,000",
    // §99-164-10 입력 — stale 시나리오에서도 값은 남아 있다(플래그만 잔존하는 게 아니다)
    gbHasFirstDisclosure: true,
    gbFirstDisclosureDate: "2005-04-30",
    gbFirstDisclosurePrice: "300,000,000",
    gbFirstDisclosureLandPricePerSqm: "2,000,000",
    gbFirstDisclosureBuildingStdPrice: "30,000,000",
    ...over,
  };
}

/** payload에서 최초공시 키만 뽑는다. */
function fdKeys(asset: AssetForm) {
  const p = buildGeneralBuildingValuation(asset, TRANSFER_DATE) as
    | Record<string, unknown>
    | undefined;
  return {
    hasFirstDisclosure: p?.hasFirstDisclosure,
    firstDisclosureLandStdPrice: p?.firstDisclosureLandStdPrice,
    firstDisclosurePrice: p?.firstDisclosurePrice,
  };
}

describe("FD-10 — 실거래가 모드에서 stale 플래그는 「무시」된다 (종전: 차단)", () => {
  const actual = gbAsset({
    useEstimatedAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    gbHasExtension: false,
  });

  it("validate가 통과한다 — 끄는 UI가 없는 채로 계산이 막히지 않는다", () => {
    // 종전: "환산주택가격 입력은 환산취득가 모드에서만 가능합니다."를 반환했다.
    // `?? ""` — 통과 시 null이라 toMatch가 타입 에러를 낸다(문자열 전용).
    const issue = validateGeneralBuildingAsset(actual, "자산 1", TRANSFER_DATE);
    expect(issue ?? "").not.toMatch(/환산취득가 모드에서만/);
  });

  it("3필드를 비워도 최초공시 때문에 차단되지 않는다", () => {
    const empty = gbAsset({
      useEstimatedAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      gbFirstDisclosurePrice: "",
      gbFirstDisclosureLandPricePerSqm: "",
      gbFirstDisclosureBuildingStdPrice: "",
    });
    const issue = validateGeneralBuildingAsset(empty, "자산 1", TRANSFER_DATE);
    expect(issue ?? "").not.toMatch(/최초공시/);
  });
});

describe("FD-11 — 실거래가 + 증축에서 stale 플래그가 payload에 실리지 않는다", () => {
  /**
   * 🔑 이 조합이 위험한 이유: payload 블록을 감싼 분기가 `anyEstimated || gbHasExtension`이라
   * **실가인데도 열린다**. 게이트가 `gbHasFirstDisclosure` 단독이면 엔진이
   * `applyConvertedHousingPriceOverride`를 적용해 실가 취득가액이 환산값으로 바뀐다.
   */
  const actualWithExtension = gbAsset({
    useEstimatedAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionArea: "50",
    // 증축분 기준시가 2필드 — 없으면 `buildExtensionInfo`가 throw해 payload를 못 만든다.
    gbAcquisitionExtensionBuildingStdPrice: "10,000,000",
    gbTransferExtensionBuildingStdPrice: "12,000,000",
  });

  it("hasFirstDisclosure가 payload에 없다", () => {
    expect(fdKeys(actualWithExtension).hasFirstDisclosure).toBeUndefined();
  });

  it("최초공시 금액 키도 함께 빠진다 (부분 전송 금지)", () => {
    const k = fdKeys(actualWithExtension);
    expect(k.firstDisclosurePrice).toBeUndefined();
    expect(k.firstDisclosureLandStdPrice).toBeUndefined();
  });
});

describe("FD-12 — 분리 ON + 파트만 환산에서 경로가 열린다", () => {
  /** 자산 전체 플래그는 false다 — 종전 술어라면 여기서 토글도 검증도 죽는다. */
  const partOnly = (over: Partial<AssetForm> = {}) =>
    gbAsset({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2009-03-01",
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
      // 건물 파트가 실가라 파트 취득가액이 필수다(§97①1호) — 없으면 그 검증이 **먼저** 걸려
      // 최초공시 검증에 도달하지 못한다.
      buildingAcquisitionPrice: "200,000,000",
      ...over,
    });

  it("payload에 hasFirstDisclosure가 실린다", () => {
    expect(fdKeys(partOnly()).hasFirstDisclosure).toBe(true);
  });

  it("3필드가 필수다 — 최초공시주택가격을 비우면 차단된다", () => {
    const issue = validateGeneralBuildingAsset(
      partOnly({ gbFirstDisclosurePrice: "" }),
      "자산 1",
      TRANSFER_DATE,
    );
    expect(issue).toMatch(/최초공시주택가격/);
  });

  it("토지 공시지가를 비우면 차단된다", () => {
    const issue = validateGeneralBuildingAsset(
      partOnly({ gbFirstDisclosureLandPricePerSqm: "", gbFirstDisclosureLandStdPrice: "" }),
      "자산 1",
      TRANSFER_DATE,
    );
    expect(issue).toMatch(/토지 공시지가/);
  });
});

describe("토지 총액 파생이 payload로 관통한다", () => {
  it("FD-2': 단가 × 면적이 payload 값이 된다", () => {
    // 2,000,000원/㎡ × 160㎡
    expect(fdKeys(gbAsset({ useEstimatedAcquisition: true })).firstDisclosureLandStdPrice).toBe(
      320_000_000,
    );
  });

  it("FD-3': legacy 총액만 있어도 같은 값이 실린다 (구형 자산 회귀 0)", () => {
    const legacy = gbAsset({
      useEstimatedAcquisition: true,
      gbFirstDisclosureLandPricePerSqm: "",
      gbFirstDisclosureLandStdPrice: "320,000,000",
    });
    expect(fdKeys(legacy).firstDisclosureLandStdPrice).toBe(320_000_000);
  });

  it("단가가 legacy 총액을 이긴다", () => {
    const both = gbAsset({
      useEstimatedAcquisition: true,
      gbFirstDisclosureLandStdPrice: "999,999,999",
    });
    expect(fdKeys(both).firstDisclosureLandStdPrice).toBe(320_000_000);
  });
});

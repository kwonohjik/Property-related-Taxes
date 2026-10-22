/**
 * anchor(⑤) — 계산기 자산 카드의 양도 주택 양도 당시 기준시가 칸(계획서 `calc-selling-house-std-price-value-region.plan.md` §5.2 · SP-4).
 *
 * 같은 사실(양도 당시 주택 공시가격)을 받는 칸은 **화면에 정확히 하나**여야 한다 — 새 칸(`calc-selling-std-price`)은 다른 칸
 * (환산 분모 · 분리 주택 축 A · 안분 키 · 의제 전 환산 분모 · §164⑦ 3시점)이 없을 때만 그린다. 실제 자산 카드를 모드마다 렌더해 센다
 * (접힌 섹션 본문도 `hidden`으로 마운트돼 있다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const JEONJU = "4511110100"; // 가액기준 · 2021-06-01 조정대상지역
const GANGNAM = "1168010100";
const base: AssetForm = {
  ...makeDefaultAsset(1),
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  regionCode: JEONJU,
  addressJibun: "전북 전주시 완산구 중앙동1가 1",
};
type Opt = { single?: boolean; mode?: "actual" | "apportioned"; date?: string; index?: number };

function mount(over: Partial<AssetForm>, opt: Opt = {}) {
  const a = { ...base, ...over } as AssetForm;
  const { container } = render(
    <CompanionAssetCard
      index={opt.index ?? 0}
      asset={a}
      primaryAsset={opt.index ? base : a}
      bundledSaleMode={opt.mode ?? "actual"}
      onChange={() => {}}
      transferDate={opt.date ?? "2021-06-01"}
      singleMode={opt.single ?? true}
      splitMode="none"
      onFractionalToggle={() => {}}
      hasSiblings={opt.single === false}
      contractTotalPrice="1000000000"
    />,
  );
  return {
    fields: container.querySelectorAll('[data-field="standardPriceAtTransfer"], [data-field="phdTransferHousingPrice"]').length,
    newField: container.querySelector('[data-testid="calc-selling-std-price"]'),
  };
}

const OWNER_SPLIT_EST = {
  acquisitionDate: "2018-03-02",
  landAcquisitionDate: "2018-03-02",
  hasSeperateLandAcquisitionDate: true,
  selfOwns: "building_only",
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
} as Partial<AssetForm>;

describe("SP-4 범위 안(가액기준·조정) — 같은 사실 칸은 정확히 하나", () => {
  const cases: [string, Partial<AssetForm>, Opt, boolean][] = [
    ["매매·실가", {}, {}, true],
    ["매매·감정", { isAppraisalAcquisition: true }, {}, true],
    ["매매·매매사례", { isSalesCaseAcquisition: true } as Partial<AssetForm>, {}, true],
    ["매매·환산 — 환산 분모 칸", { useEstimatedAcquisition: true }, {}, false],
    ["§164⑦ 3시점 — 그 카드의 양도시 개별주택가격", { useEstimatedAcquisition: true, usePreHousingDisclosure: true }, {}, false],
    ["토지·건물 취득일 다름 · 실가", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" } as Partial<AssetForm>, {}, true],
    ["소유자 분리 · 건물 환산 — 축 A 개별주택가격", OWNER_SPLIT_EST, {}, false],
    ["소유자 분리 · 건물 환산 + 자산 환산", { ...OWNER_SPLIT_EST, useEstimatedAcquisition: true }, {}, false],
    ["상속", { acquisitionCause: "inheritance", inheritanceDate: "2015-01-01" } as Partial<AssetForm>, {}, true],
    ["상속 · 의제취득일 전 — 환산 분모 칸", { acquisitionCause: "inheritance", acquisitionDate: "1980-01-01", inheritanceDate: "1980-01-01" } as Partial<AssetForm>, {}, false],
    ["증여", { acquisitionCause: "gift", giftDate: "2015-01-01" } as Partial<AssetForm>, {}, true],
    ["부담부증여(기준시가) — 안분 칸", { transferType: "burdened_gift" } as Partial<AssetForm>, {}, false],
    ["완공 재개발 아파트", { assetKind: "redevelopment_apt" }, {}, true],
    ["함께 양도 · 구분 기재", {}, { single: false, mode: "actual" }, true],
    ["함께 양도 · 기준시가 안분 — 안분 칸", {}, { single: false, mode: "apportioned" }, false],
  ];
  it.each(cases)("%s", (_l, over, opt, newShown) => {
    const r = mount(over, opt);
    expect([r.fields, !!r.newField]).toEqual([1, newShown]);
  });
});

describe("SP-4 범위 밖 — 새 칸 없음", () => {
  it.each<[string, Partial<AssetForm>, Opt]>([
    ["조정대상지역 해제 뒤 양도", {}, { date: "2023-06-01" }],
    ["2018-04-01 전 양도", { regionCode: GANGNAM }, { date: "2018-03-31" }],
    ["겸용주택(V-3)", { isMixedUseHouse: true } as Partial<AssetForm>, {}],
    ["부담부증여 시가 모드", { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market" } as Partial<AssetForm>, {}],
    ["입주권 양도", { assetKind: "right_to_move_in" }, {}],
    ["둘째 자산", {}, { single: false, index: 1 }],
  ])("%s", (_l, over, opt) => {
    expect(mount(over, opt).newField).toBeNull();
  });

  it("지역기준·조정 — 선택 입력으로 보이고 9호 안내를 단다 / 가액기준은 3억 안내", () => {
    const region = mount({ regionCode: GANGNAM, addressJibun: "서울 강남구 삼성동 1" }).newField!;
    expect(region.textContent).toContain("§167의10①9호");
    cleanup();
    expect(mount({}).newField!.textContent).toContain("§167의3①1호");
  });
});

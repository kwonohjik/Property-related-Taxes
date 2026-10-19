/**
 * 주택별 개별주택가격 최초공시일 — ⑤ 진입 카드·카드 안 날짜 칸·조회 기준일 · ⑥ 사이드바 (2026-10-19)
 *
 * 계획서: docs/00-pm/transfer-house-first-disclosure-per-house.plan.md §5.5 (Q-1 선택 날짜 칸 · Q-2 단독·다가구 명시만)
 * 날짜 칸은 **한 시점에 한 곳에만** 뜬다 — 기준일이 2005-04-30 이후이고 카드가 닫혀 있으면 진입 카드, 열려 있으면 카드 안.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { GiftHouseStdPriceSection } from "@/components/calc/transfer/GiftHouseStdPriceSection";
import { PostDeemedInputs } from "@/components/calc/transfer/inheritance/PostDeemedInputs";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-06-30";
const FD = "2006-04-28";
const DATE_FIELD = '[data-field="inhHouseValFirstDisclosureDate"]';
const entry = () => screen.queryByTestId("house-first-disclosure-entry");
const dateFields = () => document.querySelectorAll(DATE_FIELD);

const HOUSE164: Partial<AssetForm> = {
  inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "3,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "500,000",
  inhHouseValBuildingStdPriceAtFirst: "60,000,000", inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
};
function d1h(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02",
    landAcquisitionCause: "gift", landCauseHost: "purchase", landAcquisitionDate: "2005-05-12",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "350,000,000", fixedAcquisitionPrice: "450,000,000",
    actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200", transferArea: "200", landHouseExisted: "yes", inheritanceAssetKind: "house_individual",
    ...HOUSE164, ...over,
  } as AssetForm;
}
function d24(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2005-05-12", inheritanceStartDate: "2005-05-12", inheritanceDate: "2005-05-12",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    inheritanceAssetKind: "house_individual", acquisitionArea: "200", transferArea: "200",
    ...HOUSE164, inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
    ...over,
  } as AssetForm;
}
function gift(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "gift", acquisitionDate: "2005-05-12", inheritanceAssetKind: "house_individual",
    fixedAcquisitionPrice: "100,000,000", acquisitionArea: "200", ...HOUSE164, ...over,
  } as AssetForm;
}
function inh(over: Partial<AssetForm> = {}): AssetForm {
  return gift({ acquisitionCause: "inheritance", inheritanceStartDate: "2005-05-12", decedentAcquisitionDate: "1980-01-01", ...over } as Partial<AssetForm>);
}
const mountSplit = (a: AssetForm, onChange: (p: Partial<AssetForm>) => void = () => {}) =>
  render(<CompanionAcquisitionCauseSection asset={a} onChange={onChange} transferDate={TD} isNewConstruction={false} />);

describe("D1-H·D2-4 — 2005.4.30. 이후 받은 주택: 진입 카드 → 날짜·구분 → 카드가 열린다", () => {
  const paths: [string, (o?: Partial<AssetForm>) => AssetForm, string][] = [
    ["D1-H", d1h, "house-land-sec164-card"],
    ["D2-4", d24, "building-sec164-card"],
  ];
  for (const [name, mk, cardId] of paths) {
    it(`${name}: 기본값(2005-04-30) → 진입 카드만 · 날짜 칸 1개 · 카드 없음`, () => {
      mountSplit(mk());
      expect(entry()).not.toBeNull();
      expect(screen.queryByTestId(cardId)).toBeNull();
      expect(dateFields().length).toBe(1);
      expect(entry()!.querySelector('[data-field="inheritanceAssetKind"]')).toBeNull();
    });
    it(`${name}: 최초공시 ${FD} + 단독·다가구 → 카드가 열리고 진입 카드는 사라진다 · 날짜 칸은 카드 안 1개 · 조회 기준일 표기`, () => {
      mountSplit(mk({ inhHouseValFirstDisclosureDate: FD }));
      expect(entry()).toBeNull();
      const card = screen.getByTestId(cardId);
      expect(dateFields().length).toBe(1);
      expect(card.querySelector(DATE_FIELD)).not.toBeNull();
      expect(card.textContent).toContain(`최초 공시 시점 (${FD})`);
      expect(card.textContent).toContain("(2006.4.28. 이전)");
      // 최초 공시된 개별주택가격 조회 연도 = 그 날짜의 연도(공용 「4.29. 전이면 전년도」 기본값이면 2005가 된다)
      expect((card.querySelector("select") as HTMLSelectElement).value).toBe("2006");
    });
    it(`${name}: 최초공시 ${FD} + 구분 미선택 → 진입 카드에 구분(체크 없음)·안내 · 단독 클릭 → patch`, () => {
      const calls: Partial<AssetForm>[] = [];
      mountSplit(mk({ inhHouseValFirstDisclosureDate: FD, inheritanceAssetKind: "land" } as Partial<AssetForm>), (p) => calls.push(p));
      expect(screen.queryByTestId(cardId)).toBeNull();
      const kind = entry()!.querySelector('[data-field="inheritanceAssetKind"]') as HTMLElement;
      within(kind).getAllByRole("radio").forEach((r) => expect(r).not.toBeChecked());
      expect(screen.getByTestId("house-first-disclosure-kind-note").textContent).toContain("단독·다가구주택인지 골라야 합니다");
      fireEvent.click(within(kind).getByRole("radio", { name: /단독·다가구주택/ }));
      expect(calls.at(-1)).toMatchObject({ inheritanceAssetKind: "house_individual" });
    });
    it(`${name}: 최초공시일 = 기준일(당일) → 구분을 묻지 않는다(구간을 넓히지 않음)`, () => {
      mountSplit(mk({ inhHouseValFirstDisclosureDate: "2005-05-12", inheritanceAssetKind: "land" } as Partial<AssetForm>));
      expect(entry()!.querySelector('[data-field="inheritanceAssetKind"]')).toBeNull();
    });
  }

  it("D1-H 1995 수증(이미 열린 구간) → 진입 카드 없음 · 카드 안 날짜 칸 1개 · 바꾸면 inhHouseValFirstDisclosureDate patch", () => {
    const calls: Partial<AssetForm>[] = [];
    mountSplit(d1h({ landAcquisitionDate: "1995-05-01" }), (p) => calls.push(p));
    expect(entry()).toBeNull();
    expect(dateFields().length).toBe(1);
    const inputs = screen.getByTestId("house-first-disclosure-date").querySelectorAll("input");
    fireEvent.change(inputs[0], { target: { value: "2006" } });
    fireEvent.change(inputs[1], { target: { value: "4" } });
    fireEvent.change(inputs[2], { target: { value: "28" } });
    expect(calls.some((p) => p.inhHouseValFirstDisclosureDate === FD)).toBe(true);
  });

  it("D1-H 날짜로 연 카드에서 「있었는지」 미선택·없었음·모름이어도 날짜 칸이 카드 안에 남는다(막다른 화면 없음)", () => {
    for (const e of ["", "no", "unknown"]) {
      mountSplit(d1h({ inhHouseValFirstDisclosureDate: FD, landHouseExisted: e } as Partial<AssetForm>));
      expect(screen.getByTestId("house-land-sec164-card").querySelector(DATE_FIELD), e).not.toBeNull();
      expect(dateFields().length).toBe(1);
      cleanup();
    }
  });

  it("매매·신축 호스트가 아닌 D1(신축 호스트)에는 진입 카드가 없다(D1-H Q-2)", () => {
    mountSplit(d1h({ acquisitionCause: "newConstruction", landCauseHost: "newConstruction" } as Partial<AssetForm>));
    expect(entry()).toBeNull();
  });
});

describe("자산 단위 — 증여·상속 주택", () => {
  it("증여 2005-05-12 기본값 → 진입 카드 · 최초공시 + 단독 → 영 §164⑦ 섹션·주택 구분 선택기·날짜 칸 1개", () => {
    render(<GiftHouseStdPriceSection asset={gift()} onChange={() => {}} transferDate={TD} />);
    expect(entry()).not.toBeNull();
    expect(document.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
    cleanup();
    render(<GiftHouseStdPriceSection asset={gift({ inhHouseValFirstDisclosureDate: FD })} onChange={() => {}} transferDate={TD} />);
    expect(entry()).toBeNull();
    expect(document.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).not.toBeNull();
    expect(dateFields().length).toBe(1);
    expect(screen.getByText("주택 구분 (공시가격 조회용)")).toBeTruthy();
    expect(document.body.textContent).toContain("최초공시(2006.4.28.) 전 증여받은 주택");
  });
  it("증여 1995(이미 열린 구간) → 진입 카드·구분 선택기 없음 · 날짜 칸 1개", () => {
    render(<GiftHouseStdPriceSection asset={gift({ acquisitionDate: "1995-05-01" })} onChange={() => {}} transferDate={TD} />);
    expect(entry()).toBeNull();
    expect(screen.queryByText("주택 구분 (공시가격 조회용)")).toBeNull();
    expect(dateFields().length).toBe(1);
  });
  it("상속 2005-05-12 기본값 → 진입 카드 · 최초공시 + 단독 → §164⑦ 환산 섹션 · 안내가 그 주택의 날짜를 말한다", () => {
    render(<PostDeemedInputs asset={inh()} onChange={() => {}} transferDate={TD} />);
    expect(entry()).not.toBeNull();
    cleanup();
    render(<PostDeemedInputs asset={inh({ inhHouseValFirstDisclosureDate: FD })} onChange={() => {}} transferDate={TD} />);
    expect(entry()).toBeNull();
    expect(document.body.textContent).toContain("이 주택의 최초 공시 2006.4.28. 이전 상속");
    expect(dateFields().length).toBe(1);
  });
  it("상속 D2(건물 상속 + 토지 매매)에서는 자산 단위 쪽에 진입 카드·날짜 칸을 두지 않는다(분리 섹션이 가진다)", () => {
    render(<PostDeemedInputs asset={d24()} onChange={() => {}} transferDate={TD} />);
    expect(entry()).toBeNull();
    cleanup();
    render(<PostDeemedInputs asset={d24({ acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01" } as Partial<AssetForm>)} onChange={() => {}} transferDate={TD} />);
    expect(dateFields().length).toBe(0);
  });
});

describe("⑥ 사이드바 — 브리지가 구간 끝을 따라간다", () => {
  it("D1-H 05-12: 기본값이면 ① 단독 합계 · 최초공시 + 단독이면 ② 미완 시 pending", () => {
    expect(separateAcqPartsSum(d1h()).pending).toBe(false);
    expect(separateAcqPartsSum(d1h({ inhHouseValFirstDisclosureDate: FD, inhHouseValHousePriceAtFirst: "" })).pending).toBe(true);
  });
});

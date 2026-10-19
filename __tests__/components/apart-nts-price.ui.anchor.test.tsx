/**
 * 자산 단위 공동주택 — 「상속개시일·증여일 당시 국세청 고시 공동주택 기준시가가 있었는가」 ⑤ 화면 (2026-10-19)
 *
 * 계획서: docs/00-pm/transfer-163-9-apart-nts-price-question.plan.md §3.4 · Q-1~Q-3 A
 * - 질문은 주택 구분 바로 아래(로직 순서 = 구분 → 국세청 고시 여부 → (없었음) 기관·날짜 → §164⑥·⑦ 카드).
 * - 「모름」 선택지가 없다 · 기본 미선택.
 * - 있었음 → §164 카드를 렌더하지 않고 안내만. 없었음 → 기관·날짜 칸과 카드.
 * - ⑧ 이동 앵커(`data-field`)가 화면에 있다 — 검증 오류가 갈 곳이 없으면 막다른 화면이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GiftHouseStdPriceSection } from "@/components/calc/transfer/GiftHouseStdPriceSection";
import { PostDeemedInputs } from "@/components/calc/transfer/inheritance/PostDeemedInputs";
import { PreDeemedInputs } from "@/components/calc/transfer/inheritance/PreDeemedInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-06-30";
const HOUSE164: Partial<AssetForm> = {
  inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "3,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
  inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtInheritance: "500,000",
  inhHouseValBuildingStdPriceAtFirst: "60,000,000", inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
};
function inh(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2000-03-01", inheritanceStartDate: "2000-03-01",
    decedentAcquisitionDate: "1990-01-01", inheritanceAssetKind: "house_apart",
    publishedValueAtInheritance: "100,000,000", inheritanceValuationMethod: "supplementary",
    acquisitionArea: "200", ...HOUSE164, ...over,
  } as AssetForm;
}
function gift(over: Partial<AssetForm> = {}): AssetForm {
  return inh({ acquisitionCause: "gift", inheritanceStartDate: "", publishedValueAtInheritance: "", fixedAcquisitionPrice: "100,000,000", ...over } as Partial<AssetForm>);
}
const q = () => screen.queryByTestId("apart-nts-price-question");
const card = () => document.querySelector('[data-field="inhHouseValHousePriceAtFirst"]');
const anchor = (f: string) => document.querySelector(`[data-field="${f}"]`);

type Mount = (a: AssetForm, onChange?: (p: Partial<AssetForm>) => void) => void;
const screens: [string, Mount, (o?: Partial<AssetForm>) => AssetForm][] = [
  ["상속 의제취득일 이후(PostDeemedInputs)", (a, oc = () => {}) => render(<PostDeemedInputs asset={a} onChange={oc} transferDate={TD} />), inh],
  ["상속 의제취득일 전(PreDeemedInputs)", (a, oc = () => {}) => render(<PreDeemedInputs asset={a} onChange={oc} transferDate={TD} />),
    (o) => inh({ acquisitionDate: "1980-06-01", inheritanceStartDate: "1980-06-01", ...o } as Partial<AssetForm>)],
  ["증여(GiftHouseStdPriceSection)", (a, oc = () => {}) => render(<GiftHouseStdPriceSection asset={a} onChange={oc} transferDate={TD} />), gift],
];

describe("질문 — 세 화면 공통", () => {
  for (const [name, mount, mk] of screens) {
    it(`${name}: 미선택 → 질문·이동 앵커 · 「모름」 없음 · §164 카드 없음`, () => {
      mount(mk());
      expect(q()).not.toBeNull();
      expect(anchor("inhApartNtsPriceExisted")).not.toBeNull();
      expect(screen.getByTestId("apart-nts-existed-yes")).toBeTruthy();
      expect(screen.getByTestId("apart-nts-existed-no")).toBeTruthy();
      expect(document.body.textContent).not.toContain("모름");
      expect(card()).toBeNull();
      // 로직 순서 — 주택 구분 선택기가 질문보다 앞
      const picker = screen.getByText("주택 구분 (공시가격 조회용)");
      expect(picker.compareDocumentPosition(q()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it(`${name}: 있었음 → 안내 · §164 카드·기관·날짜 칸 없음`, () => {
      mount(mk({ inhApartNtsPriceExisted: "yes" }));
      expect(screen.getByTestId("apart-nts-existed-note")).toBeTruthy();
      expect(card()).toBeNull();
      expect(anchor("inhApartFirstPriceAgency")).toBeNull();
      expect(anchor("inhApartFirstPriceDate")).toBeNull();
    });
    it(`${name}: 없었음 → 기관·날짜 칸(앵커) · §164 카드 · 개별주택 날짜 칸은 없음`, () => {
      mount(mk({ inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "1992-01-01" }));
      expect(anchor("inhApartFirstPriceAgency")).not.toBeNull();
      expect(anchor("inhApartFirstPriceDate")).not.toBeNull();
      expect(card()).not.toBeNull();
      expect(anchor("inhHouseValFirstDisclosureDate")).toBeNull();
      expect(document.body.textContent).toContain("최초고시 시점 (1992-01-01)");
      expect(document.body.textContent).toContain("소령 §164⑥");
    });
    it(`${name}: 답을 고르면 inhApartNtsPriceExisted patch`, () => {
      const calls: Partial<AssetForm>[] = [];
      mount(mk(), (p) => calls.push(p));
      fireEvent.click(screen.getByTestId("apart-nts-existed-no"));
      expect(calls.some((p) => p.inhApartNtsPriceExisted === "no")).toBe(true);
    });
    it(`${name}: 단독·다가구는 질문 없이 종전 카드`, () => {
      mount(mk({ inheritanceAssetKind: "house_individual" }));
      expect(q()).toBeNull();
      expect(card()).not.toBeNull();
    });
  }
});

describe("의제취득일 전 — 있었음이면 의제취득일 기준시가 자동값이 없다(Q-3)", () => {
  it("없었음 → 자동 계산값 안내 · 있었음 → 직접 입력", () => {
    const pre = (o: Partial<AssetForm>) => inh({
      acquisitionDate: "1980-06-01", inheritanceStartDate: "1980-06-01", pre1990Enabled: true,
      pre1990GradeMode: "number", pre1990Grade_current: "150", pre1990Grade_prev: "140", pre1990Grade_atAcq: "130", pre1990PricePerSqm_1990: "500000",
      ...o,
    } as Partial<AssetForm>);
    render(<PreDeemedInputs asset={pre({ inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "1992-01-01" })} onChange={() => {}} transferDate={TD} />);
    expect(document.body.textContent).toContain("자동 계산값:");
    cleanup();
    render(<PreDeemedInputs asset={pre({ inhApartNtsPriceExisted: "yes" })} onChange={() => {}} transferDate={TD} />);
    expect(document.body.textContent).not.toContain("자동 계산값:");
  });
});

describe("2005.4.30. 이후 수증 공동주택 — 진입 카드(첫 가격 날짜)가 질문을 연다", () => {
  for (const [name, mount, mk] of screens.filter(([n]) => !n.includes("전("))) {
    it(`${name}: 날짜 없음 → 공동주택 진입 카드(단독 진입 카드 아님) · 수증일 뒤 날짜 → 질문 + 날짜 칸 유지`, () => {
      const late = (o: Partial<AssetForm> = {}) => mk({ acquisitionDate: "2005-05-12", inheritanceStartDate: "2005-05-12", ...o } as Partial<AssetForm>);
      mount(late());
      expect(screen.queryByTestId("apart-first-price-entry")).not.toBeNull();
      expect(screen.queryByTestId("house-first-disclosure-entry")).toBeNull();
      expect(q()).toBeNull();
      cleanup();
      mount(late({ inhApartFirstPriceDate: "2006-04-28" }));
      expect(screen.queryByTestId("apart-first-price-entry")).toBeNull();
      expect(q()).not.toBeNull();
      // 답 전에도 날짜 칸이 남아 되돌릴 수 있다
      expect(anchor("inhApartFirstPriceDate")).not.toBeNull();
    });
  }
});

/**
 * anchor — §164⑥·⑦ 산식 결과 이름 통일: 입력 화면·⑧ 메시지 (계획서 phd-appraisal-dead-end §9.3·§9.4·§9.5, 2026-10-24 사용자 지정)
 *
 * 이름은 둘뿐이다 — 개별(단독·다가구) «환산 개별주택가격» / 공동주택 «환산 공동주택가격». «추정»·서술형 조어 금지.
 * 주택 종류(`asset.phdHousingType`)를 아는 곳은 갈라 쓰고, 모르는 곳(hint 상수)은 둘 다 적는다.
 *
 *   I1 «계산해 채우기» 보조 카드(PhdConvertedPriceFill) — 제목·산식·버튼
 *   I2 PHD 입력 패널 assist 모드(PreHousingDisclosureSection) — 머리글·설명·부적격 안내
 *   I3 취득시 기준시가 칸 hint 상수 — 주택 종류를 모르는 곳은 둘 다
 *   I4 배율 초과 분리 카드(HousingExcessSplitCard) + ⑧ 메시지 — 카드와 ⑧ 문구가 같다
 *   I5 상속 3시점 입력(HouseValuationSection) — 산식 결과 미리보기 라벨·hint
 *   I6 겸용주택 결과 카드(PartialUsageChangeCard) — «역산한 취득시 개별주택가격» 조어 폐기
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PhdConvertedPriceFill } from "@/components/calc/transfer/PhdConvertedPriceFill";
import { PreHousingDisclosureSection } from "@/components/calc/transfer/PreHousingDisclosureSection";
import { HousingExcessSplitCard } from "@/components/calc/transfer/HousingExcessSplitCard";
import { HouseValuationSection } from "@/components/calc/transfer/inheritance/HouseValuationSection";
import { PartialUsageChangeCard } from "@/components/calc/results/mixed-use/MixedUseResultCardParts";
import { PRE_DISCLOSURE_STD_PRICE_HINT } from "@/components/calc/transfer/pre-disclosure-std-hint";
import { validateHousingExcessSplitInputs } from "@/lib/calc/transfer-tax-validate-housing-excess";
import { APARTMENT_ACQ_PRICE_AGENCY_NOTE, APARTMENT_ACQ_PRICE_SENTENCE } from "@/lib/calc/phd-housing-term";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const IND = "환산 개별주택가격";
const APT = "환산 공동주택가격";
const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");
const noop = () => {};

/** 종류별(개별 / 공동 / 필드 없음 = 옛 이력) 3경우 */
const KINDS = [
  ["개별", { phdHousingType: "individual" }, IND, APT],
  ["공동", { phdHousingType: "apartment" }, APT, IND],
  ["필드 없음(옛 이력)", { phdHousingType: undefined }, IND, APT],
] as const;

const SEVEN: Partial<AssetForm> = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdBuildingStdPriceAtFirst: "61000000",
  acquisitionArea: "100",
};
const housing = (over: Partial<AssetForm> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    addressJibun: "서울 테스트동 1",
    useEstimatedAcquisition: false,
    ...over,
  }) as AssetForm;

describe("I1 «계산해 채우기» 보조 카드", () => {
  it.each(KINDS)("%s — 제목·산식·버튼이 같은 이름, 반대 이름·«추정» 없음", (_n, kind, want, other) => {
    render(<PhdConvertedPriceFill asset={housing({ ...SEVEN, ...kind })} onAssetChange={noop} transferDate="2026-03-01" onFill={noop} />);
    const t = text();
    expect(screen.getByTestId("phd-fill-button").textContent).toBe(`${want} 계산해 채우기`);
    expect(screen.getByTestId("phd-fill-formula").textContent).toContain(`${want} = 최초 고시 주택가격`);
    expect(t).toContain(`${want} 계산 (소득세법 시행령 §164⑦)`);
    // 한 카드 안에서 반대 이름이 섞이지 않는다(assist 패널 머리글 포함)
    expect(t).not.toContain(other);
    expect(t).not.toContain("추정");
  });
  it("고시 가격 이름도 종류를 따른다 — 「…가격 최초 공시일 전이면」", () => {
    render(<PhdConvertedPriceFill asset={housing({ ...SEVEN, phdHousingType: "apartment" })} onAssetChange={noop} transferDate="2026-03-01" onFill={noop} />);
    expect(text()).toContain("취득일이 공동주택가격 최초 공시일 전이면");
    cleanup();
    render(<PhdConvertedPriceFill asset={housing({ ...SEVEN, phdHousingType: "individual" })} onAssetChange={noop} transferDate="2026-03-01" onFill={noop} />);
    expect(text()).toContain("취득일이 개별주택가격 최초 공시일 전이면");
  });
});

describe("I2 PHD 입력 패널 assist 모드", () => {
  it.each(KINDS)("%s — 머리글·설명이 같은 이름", (_n, kind, want, other) => {
    render(<PreHousingDisclosureSection mode="assist" asset={housing({ ...SEVEN, ...kind })} transferDate="2026-03-01" onChange={noop} />);
    const t = text();
    expect(t).toContain(`${want} 계산용 입력`);
    expect(t).toContain(`주택의 ${want}을 계산합니다`);
    expect(t).not.toContain(other);
    expect(t).not.toContain("추정");
  });
  it.each(KINDS)("%s — 부적격(취득일이 최초 고시일 이후) 안내도 같은 이름", (_n, kind, want, other) => {
    render(
      <PreHousingDisclosureSection mode="assist" asset={housing({ ...SEVEN, acquisitionDate: "2010-01-01", ...kind })} transferDate="2026-03-01" onChange={noop} />,
    );
    expect(text()).toContain(`${want}을 계산하지 않고`);
    expect(text()).not.toContain(other);
  });
  it("phd 모드(본 입력)의 머리글은 중립 표현 그대로 — 종류에 따라 바뀌지 않는다", () => {
    render(<PreHousingDisclosureSection asset={housing({ ...SEVEN, phdHousingType: "apartment" })} transferDate="2026-03-01" onChange={noop} />);
    expect(text()).toContain("주택공시가격 미공시 취득 (3-시점 환산)");
    expect(text()).not.toContain(IND);
    expect(text()).not.toContain("추정");
  });
});

describe("I3 취득시 기준시가 칸 hint (주택 종류를 모르는 곳)", () => {
  it("둘 다 적는다 — 기존 개별 문장은 그대로, 공동주택 문장이 이어진다", () => {
    expect(PRE_DISCLOSURE_STD_PRICE_HINT).toContain(`소득세법 시행령 §164⑦ 산식으로 계산한 ${IND}(부수토지 포함 총액)`);
    expect(PRE_DISCLOSURE_STD_PRICE_HINT).toContain(`공동주택은 공동주택가격 최초 공시일 전이면 ${APT}(부수토지 포함 총액)`);
    expect(PRE_DISCLOSURE_STD_PRICE_HINT).not.toContain("추정");
    expect(PRE_DISCLOSURE_STD_PRICE_HINT).not.toContain("취득 당시 공동주택");
  });
});

describe("I4 배율 초과 분리 카드 + ⑧ 메시지", () => {
  const BASE: Partial<AssetForm> = {
    useEstimatedAcquisition: false,
    usePreHousingDisclosure: false,
    buildingFootprintArea: "53",
    appurtenantLandZone: "metropolitan_residential",
    areaScenario: "same",
    acquisitionArea: "212",
    transferArea: "212",
  };
  const pre = (kind: Partial<AssetForm>) => housing({ ...BASE, acquisitionDate: "2000-03-01", ...kind });
  const post = (kind: Partial<AssetForm>) => housing({ ...BASE, acquisitionDate: "2012-01-02", ...kind });
  const TD = "2023-02-16";

  // 5칸 경로의 주택 종류는 `resolveHousingKind` 신호로 정한다(PHD 라디오 기본값 «individual»은 신호가 아니다).
  //   개별 = 주택 구분 픽커의 명시 선택 / 공동 = PHD 라디오 apartment / 신호 없음 = 두 이름을 함께 적는다.
  //   공동주택은 취득일로 단정하지 않는 조건 문장(`APARTMENT_ACQ_PRICE_SENTENCE`)으로 안내한다 — 아래 «공동주택 조건 문장» 블록이 따로 다룬다.
  const SIG = [["개별(주택 구분 명시)", { inheritanceAssetKind: "house_individual" }, IND, APT]] as const;
  const APT_SIGNALS = [
    ["PHD 라디오 apartment", { phdHousingType: "apartment" }],
    ["주택 구분 house_apart", { inheritanceAssetKind: "house_apart" }],
    ["동·호 둘 다", { addressDong: "101동", addressHo: "1204호" }],
  ] as const;
  const APT_LABEL = "취득시 공동주택가격 (부수토지 포함)";
  const BOTH_CONVERTED = `${IND}(공동주택은 ${APT})`;
  const BOTH_DISCLOSED = "개별주택가격(공동주택은 공동주택가격)";

  it.each(SIG)("%s — 2005-04-30 전 취득 5칸 카드: 라벨·hint가 같은 이름", (_n, kind, want, other) => {
    render(<HousingExcessSplitCard asset={pre(kind)} onChange={noop} transferDate={TD} />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(text()).toContain(`영 §164⑦ ${want} · 부수토지 포함`);
    expect(text()).toContain(`영 §164⑦ 산식으로 계산한 ${want}(최초 공시`);
    expect(text()).not.toContain(other);
    expect(text()).not.toContain("추정");
  });
  it.each(SIG)("%s — ⑧ 메시지도 카드와 같은 이름", (_n, kind, want, other) => {
    const msg = validateHousingExcessSplitInputs(pre(kind), "자산", TD) ?? "";
    expect(msg).toContain(`영 §164⑦ 산식으로 계산한 ${want}(부수토지 포함 총액)을 입력하세요`);
    expect(msg).not.toContain(other);
    expect(msg).not.toContain("추정");
  });
  it("신호 없음(PHD 라디오 기본값 «individual»·필드 없음·옛 이력) — 카드·⑧ 모두 두 이름을 함께 적는다", () => {
    for (const kind of [{ phdHousingType: "individual" }, { phdHousingType: undefined }] as const) {
      cleanup();
      render(<HousingExcessSplitCard asset={pre(kind)} onChange={noop} transferDate={TD} />);
      expect(text()).toContain(`영 §164⑦ ${BOTH_CONVERTED} · 부수토지 포함`);
      expect(text()).toContain(`취득시 ${BOTH_DISCLOSED} (영 §164⑦`);
      const msg = validateHousingExcessSplitInputs(pre(kind), "자산", TD) ?? "";
      expect(msg).toContain(`취득일이 ${BOTH_DISCLOSED} 최초 공시일(개별주택은 2005-04-30) 전이라`);
      expect(msg).toContain(`영 §164⑦ 산식으로 계산한 ${BOTH_CONVERTED}(부수토지 포함 총액)을 입력하세요`);
      expect(msg).not.toContain("추정");
    }
  });
  it("개별은 종전 문구 그대로 — 취득일 2003·2010 둘 다 (날짜 분기 유지)", () => {
    const ind = validateHousingExcessSplitInputs(pre({ inheritanceAssetKind: "house_individual" }), "자산", TD) ?? "";
    expect(ind).toContain("취득일이 개별주택가격 최초 공시일(2005-04-30) 전이라");
    const indPost = validateHousingExcessSplitInputs(post({ inheritanceAssetKind: "house_individual" }), "자산", TD) ?? "";
    expect(indPost).toContain("취득 당시 개별주택가격(부수토지 포함 총액)을 입력하세요");
  });
  it("개별 — 2005-04-30 이후 취득 일반 문구: 라벨의 고시 가격 이름만 종류를 따른다(환산 이름 없음)", () => {
    render(<HousingExcessSplitCard asset={post({ inheritanceAssetKind: "house_individual" })} onChange={noop} transferDate={TD} />);
    expect(text()).toContain("취득시 개별주택가격 (부수토지 포함)");
    expect(text()).not.toContain(IND);
    expect(text()).not.toContain(APT);
  });

  // ── 공동주택 조건 문장 — 취득일(2003·2010)로 단정하지 않는다. 카드 hint·⑧ 메시지가 같은 핵심 문장을 쓴다 ──
  describe.each(APT_SIGNALS)("공동주택 조건 문장 — %s", (_sn, signal) => {
    it.each([["2003 (2005-04-30 전)", pre], ["2010 (2005-04-30 후)", post]] as const)("취득일 %s: 카드 라벨·hint = 조건 문장", (_dn, make) => {
      render(<HousingExcessSplitCard asset={make(signal)} onChange={noop} transferDate={TD} />);
      const t = text();
      expect(t).toContain(APT_LABEL);
      expect(t).toContain(`${APARTMENT_ACQ_PRICE_SENTENCE} — ${APARTMENT_ACQ_PRICE_AGENCY_NOTE}. 토지분 : 건물분은 아래 ㎡당 공시지가 : 건물 기준시가 비율로 나눕니다.`);
      expect(t).toContain("§164⑥·⑦");
      // 날짜로 단정하는 종전 문구·라벨은 없다
      expect(t).not.toContain("최초 공시일");
      expect(t).not.toContain("공시가격이 없습니다");
      expect(t).not.toContain(`(영 §164⑦ ${APT} · 부수토지 포함)`);
      expect(t).not.toContain("개별주택가격");
      expect(t).not.toContain("추정");
    });
    it.each([["2003", pre], ["2010", post]] as const)("취득일 %s: ⑧ 메시지 = 머리말 + 같은 핵심 문장", (_dn, make) => {
      const msg = validateHousingExcessSplitInputs(make(signal), "자산", TD) ?? "";
      expect(msg).toContain(`한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지로 분리 과세하므로`);
      expect(msg.endsWith(` ${APARTMENT_ACQ_PRICE_SENTENCE}.`)).toBe(true);
      expect(msg).toContain("§164⑥·⑦");
      expect(msg).not.toContain("최초 공시일");
      expect(msg).not.toContain("2005-04-30");
      expect(msg).not.toContain("개별주택가격");
      expect(msg).not.toContain("추정");
    });
  });
  it("공동주택 조건 문장 — 날짜가 달라도 ⑧ 문구가 바이트 동일(2003 = 2010), ⑤ hint와 ⑧이 같은 핵심 문장을 공유", () => {
    const sig = { phdHousingType: "apartment" } as const;
    expect(validateHousingExcessSplitInputs(pre(sig), "자산", TD)).toBe(validateHousingExcessSplitInputs(post(sig), "자산", TD));
    render(<HousingExcessSplitCard asset={pre(sig)} onChange={noop} transferDate={TD} />);
    const a = text();
    expect(a).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
    expect(APARTMENT_ACQ_PRICE_SENTENCE).toContain("§164⑥·⑦");
    expect(APARTMENT_ACQ_PRICE_SENTENCE).toContain("국세청장이 고시한 기준시가 포함");
    expect(APARTMENT_ACQ_PRICE_SENTENCE).toContain(`${APT}(부수토지 포함 총액)`);
  });
  it("신호 없음 — 2005-04-30 이후 취득 일반 문구도 고시 가격 이름 두 개를 함께 적는다", () => {
    render(<HousingExcessSplitCard asset={post({})} onChange={noop} transferDate={TD} />);
    expect(text()).toContain(`취득시 ${BOTH_DISCLOSED} (부수토지 포함)`);
    expect(text()).not.toContain(IND);
  });

  // ── 격자: (PHD 라디오 apartment / individual / 없음) × (다른 공동주택 신호 있음 / 없음) — 카드·⑧이 같은 판정을 따른다 ──
  //   «다른 공동주택 신호» = 동·호를 둘 다 고른 세대(공동주택 세대 목록에서 선택). 우선순위: PHD 라디오 apartment > 주택 구분 명시 > 동·호.
  type Expect = "apt" | "both";
  const RADIOS = [
    ["라디오 apartment", { phdHousingType: "apartment" }],
    ["라디오 individual(기본값)", { phdHousingType: "individual" }],
    ["라디오 없음(옛 이력)", { phdHousingType: undefined }],
  ] as const;
  const OTHERS = [
    ["공동주택 신호 있음(동·호)", { addressDong: "101동", addressHo: "1204호" }],
    ["공동주택 신호 없음", {}],
  ] as const;
  const expectOf = (radio: string, other: string): Expect => (radio === "라디오 apartment" || other.includes("있음") ? "apt" : "both");
  describe.each(RADIOS)("%s", (radioName, radio) => {
    it.each(OTHERS)("× %s — 카드(전 취득)·카드(후 취득)·⑧이 한 판정", (otherName, other) => {
      const want = expectOf(radioName, otherName);
      const conv = want === "apt" ? APT : BOTH_CONVERTED;
      const disc = want === "apt" ? "공동주택가격" : BOTH_DISCLOSED;
      const asset = { ...radio, ...other };
      const msg = validateHousingExcessSplitInputs(pre(asset), "자산", TD) ?? "";
      const msgPost = validateHousingExcessSplitInputs(post(asset), "자산", TD) ?? "";
      if (want === "apt") {
        // 공동주택 — 취득일과 무관하게 같은 조건 문장
        render(<HousingExcessSplitCard asset={pre(asset)} onChange={noop} transferDate={TD} />);
        expect(text()).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
        cleanup();
        render(<HousingExcessSplitCard asset={post(asset)} onChange={noop} transferDate={TD} />);
        expect(text()).toContain(APT_LABEL);
        expect(text()).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
        expect(msg).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
        expect(msgPost).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
        expect(text() + msg).not.toContain("개별주택가격");
        return;
      }
      render(<HousingExcessSplitCard asset={pre(asset)} onChange={noop} transferDate={TD} />);
      expect(text()).toContain(`영 §164⑦ ${conv} · 부수토지 포함`);
      cleanup();
      render(<HousingExcessSplitCard asset={post(asset)} onChange={noop} transferDate={TD} />);
      expect(text()).toContain(`취득시 ${disc} (부수토지 포함)`);
      expect(msg).toContain(`영 §164⑦ 산식으로 계산한 ${conv}(부수토지 포함 총액)을 입력하세요`);
      expect(msgPost).toContain(`취득 당시 ${disc}(부수토지 포함 총액)을 입력하세요`);
    });
  });
  it("우선순위 — 주택 구분 «단독·다가구» 명시는 동·호보다 앞, PHD 라디오 apartment는 둘보다 앞", () => {
    const dongHo = { addressDong: "101동", addressHo: "1204호" };
    const msgInd = validateHousingExcessSplitInputs(pre({ ...dongHo, inheritanceAssetKind: "house_individual" }), "자산", TD) ?? "";
    expect(msgInd).toContain("취득일이 개별주택가격 최초 공시일(2005-04-30) 전이라");
    const msgApt = validateHousingExcessSplitInputs(
      pre({ ...dongHo, inheritanceAssetKind: "house_individual", phdHousingType: "apartment" }),
      "자산",
      TD,
    ) ?? "";
    expect(msgApt).toContain(APARTMENT_ACQ_PRICE_SENTENCE);
    expect(msgApt).not.toContain("개별주택가격");
  });
  it("동 또는 호 한쪽만 채워진 경우는 신호가 아니다(상속 경로의 주택 구분 파생과 같은 조건 — 둘 다 있어야 공동주택)", () => {
    const msg = validateHousingExcessSplitInputs(pre({ addressHo: "1204호" }), "자산", TD) ?? "";
    expect(msg).toContain(BOTH_DISCLOSED);
  });
  it("배율 초과 카드 5칸의 취득시 건물 기준시가 hint도 같은 이름을 따른다", () => {
    render(<HousingExcessSplitCard asset={post({ phdHousingType: "apartment" })} onChange={noop} transferDate={TD} />);
    expect(text()).toContain("공동주택가격(부수토지 포함)을 토지 기준시가 : 건물 기준시가 비율로 나누는 데 씁니다");
    expect(text()).not.toContain("개별주택가격");
  });
  it.each(KINDS)("%s — PHD 환산 안내 카드(입력칸 없음)의 제목·본문", (_n, kind, want) => {
    const disclosed = want === APT ? "공동주택가격" : "개별주택가격";
    render(
      <HousingExcessSplitCard
        asset={housing({ ...BASE, acquisitionDate: "2000-03-01", useEstimatedAcquisition: true, usePreHousingDisclosure: true, ...kind })}
        onChange={noop}
        transferDate={TD}
      />,
    );
    expect(screen.getByTestId("housing-excess-phd-card")).toBeTruthy();
    expect(text()).toContain(`${disclosed} 미공시 환산 값으로 분리`);
    expect(text()).toContain(`취득 당시 ${disclosed}이 공시되기 전이라`);
    expect(text()).not.toContain("추정");
  });
});

describe("I5 상속 3시점 입력", () => {
  const inh = (over: Partial<AssetForm> = {}) =>
    ({
      ...makeDefaultAsset(1),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing",
      acquisitionCause: "inheritance",
      acquisitionDate: "2000-03-01",
      inheritanceStartDate: "2000-03-01",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "100,000,000",
      inheritanceValuationMethod: "supplementary",
      acquisitionArea: "200",
      inhHouseValLandArea: "200",
      inhHouseValLandPricePerSqmAtTransfer: "3,000,000",
      inhHouseValLandPricePerSqmAtFirst: "1,000,000",
      inhHouseValHousePriceAtFirst: "300,000,000",
      inhHouseValLandPricePerSqmAtInheritance: "500,000",
      inhHouseValBuildingStdPriceAtFirst: "60,000,000",
      inhHouseValBuildingStdPriceAtInheritance: "50,000,000",
      ...over,
    }) as AssetForm;
  const cases = [
    ["개별", { inheritanceAssetKind: "house_individual" }, IND, "§164⑦", "개별주택가격", APT],
    ["공동·국토교통부 공시", { inheritanceAssetKind: "house_apart", inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "molit", inhApartFirstPriceDate: "2006-04-28" }, APT, "§164⑦", "공동주택가격", IND],
    ["공동·국세청 고시", { inheritanceAssetKind: "house_apart", inhApartNtsPriceExisted: "no", inhApartFirstPriceAgency: "nts", inhApartFirstPriceDate: "1992-01-01" }, APT, "§164⑥", "공동주택가격", IND],
  ] as const;
  it.each(cases)("%s — 산식 결과 미리보기 라벨·hint가 같은 이름", (_n, over, want, clause, disclosed, other) => {
    render(<HouseValuationSection asset={inh(over as Partial<AssetForm>)} transferDate="2026-06-30" onChange={noop} />);
    expect(text()).toContain(`${want} (${clause})`);
    expect(text()).toContain(`${want} 계산 시 최초공시 합계`);
    expect(text()).toContain(`${disclosed}과 별개입니다`);
    expect(text()).toContain(`${clause} ${want} 산식에 사용`);
    expect(text()).not.toContain(other);
    expect(text()).not.toContain("환산 가격");
    expect(text()).not.toContain("역산");
    expect(text()).not.toContain("추정");
  });
});

describe("I6 겸용주택 결과 카드 (Case A)", () => {
  it("«역산한 취득시 개별주택가격»·«취득시 개별주택가격 역산 산식» 폐기 → «환산 개별주택가격»", () => {
    render(
      <PartialUsageChangeCard
        puc={{ direction: "house_to_commercial", phdScopeBranch: "case_a_whole_building", acqResidentialArea: 100, acqCommercialArea: 50, isAreaCustomized: false } as never}
      />,
    );
    expect(text()).toContain(`${IND} 산식 — 건물 전체 기준 (시행령 §164⑦)`);
    expect(text()).toContain(`${IND} = 최초공시 개별주택가격 ×`);
    expect(text()).not.toContain("역산한 취득시 개별주택가격");
    expect(text()).not.toContain("취득시 개별주택가격 역산");
    expect(text()).not.toContain(APT);
    expect(text()).not.toContain("추정");
  });
});

/**
 * @vitest-environment jsdom
 *
 * #2055 후속 — 증여세 부담부증여 양도 경로의 「지정 지구 안인가」 선언.
 *
 * 증여 주택(또는 신규 주택) 소재 법정동이 그 날짜에 동 안 일부 지구만 조정대상지역이었으면, 코드로 확정하지 않고 사용자
 * 선언을 따른다. 양도세 계산기(`regulated-district-only.anchor.test.tsx`)와 같은 엔진 인자(`regionInDesignatedDistrict`·
 * `temporaryTwoHouse.newHouseInDesignatedDistrict`)를 같은 규약(코드가 있을 때만)으로 싣는다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | 주소 판정 leaf | 증여일·취득일 판정이 선언을 따른다 · 안 만진 「양도시 조정」 토글도 같은 값 |
 * | G-1 | ⑤⑧ 게이트 | §155①2호 판정 카드의 두 주택 조정 여부가 각 선언을 따른다 |
 * | B-1 | ④ | 증여 주택 선언은 코드와 함께만 · 신규 주택 선언은 신규 주택 코드와 함께만 |
 * | R-1 | 초기화 | 소재지 법정동이 바뀌면 답을 지운다(증여 주택 · 신규 주택) |
 * | W-1 | ⑤ | 지구 한정 동이면 질문이 뜨고 고른 답이 같은 칸으로 · 토글 설명이 그 답으로 판정 |
 * | E-1 | route | 지구 밖 선언이면 확인 필요 경고가 없고, 미선언이면 있다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import {
  giftBurdenedDistrictResetPatch,
  giftBurdenedEffectiveIsRegulatedArea,
  giftBurdenedRegulatedByAddress,
} from "@/lib/calc/gift-burdened-one-house";
import {
  giftBurdenedNewHouseAddressPatch,
  giftBurdenedTempTwoHouseRegulatedGate,
} from "@/lib/calc/gift-burdened-temp-two-house";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { HousingFieldSet } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftHousingFieldSet";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

afterEach(cleanup);

const DAEHWA = "4128710400"; // 고양시 일산서구 대화동 — 2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만
const DAEHWA_PNU = `${DAEHWA}100120000`;
const GANGNAM_PNU = "1168010100100120034";
const GIFT = "2020-03-02";

function item(over: Partial<BurdenedGiftTransferTaxInput> = {}, pnu: string | null = DAEHWA_PNU): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    ...(pnu ? { estateAddress: { jibun: "고양시 일산서구 대화동 1-2", pnu } } : {}),
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2020-01-10"),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      ...over,
    },
  } as EstateItem;
}
const form = (it: EstateItem): FormState =>
  ({ ...INITIAL_FORM, giftDate: GIFT, donor: "father", giftItems: [it] }) as FormState;

describe("L-1 주소 판정 leaf", () => {
  it("미선언=지정(모름=불리) · 지구 밖=미지정 · 지구 안=지정 — 증여일·취득일 모두", () => {
    expect(giftBurdenedRegulatedByAddress(DAEHWA, "2020-01-10", GIFT)).toEqual({ atAcquisition: true, atGift: true });
    expect(giftBurdenedRegulatedByAddress(DAEHWA, "2020-01-10", GIFT, false)).toEqual({ atAcquisition: false, atGift: false });
    expect(giftBurdenedRegulatedByAddress(DAEHWA, "2020-01-10", GIFT, true)).toEqual({ atAcquisition: true, atGift: true });
  });
  it("안 만진 「양도시 조정」 토글은 선언을 따르고, 만진 토글은 그대로", () => {
    expect(giftBurdenedEffectiveIsRegulatedArea({ regionInDesignatedDistrict: false }, DAEHWA, GIFT)).toBe(false);
    expect(giftBurdenedEffectiveIsRegulatedArea({}, DAEHWA, GIFT)).toBe(true);
    expect(giftBurdenedEffectiveIsRegulatedArea({ regionInDesignatedDistrict: false, isRegulatedArea: true }, DAEHWA, GIFT)).toBe(true);
  });
});

describe("G-1 §155①2호 게이트(⑤ 판정 카드 · ⑧ 공용)", () => {
  const gate = (prev?: boolean, next?: boolean) =>
    giftBurdenedTempTwoHouseRegulatedGate(
      {
        householdHousingCount: 2,
        regionInDesignatedDistrict: prev,
        temporaryTwoHouse: {
          previousAcquisitionDate: new Date("2018-01-10"),
          newAcquisitionDate: new Date("2020-01-20"),
          newHouseRegionCode: DAEHWA,
          newHouseInDesignatedDistrict: next,
        },
      } as BurdenedGiftTransferTaxInput,
      GIFT,
      DAEHWA,
    )?.regulated;
  it("미선언이면 두 주택 모두 조정 · 종전(증여) 주택·신규 주택이 각자의 선언을 따른다", () => {
    expect(gate()).toMatchObject({ previous: true, next: true });
    expect(gate(false)).toMatchObject({ previous: false, next: true });
    expect(gate(undefined, false)).toMatchObject({ previous: true, next: false });
  });
});

describe("B-1 ④ 본문", () => {
  it("증여 주택 선언은 코드와 함께 실리고, 조정 토글 실효값도 그 답으로 정해진다", () => {
    const it = item({ regionInDesignatedDistrict: false });
    const b = buildGiftBurdenedTransferBody(it, form(it));
    expect(b).toMatchObject({ regionCode: DAEHWA, regionInDesignatedDistrict: false, isRegulatedArea: false });
    const noCode = item({ regionInDesignatedDistrict: false }, null);
    expect(buildGiftBurdenedTransferBody(noCode, form(noCode))).not.toHaveProperty("regionInDesignatedDistrict");
    const undeclared = item();
    expect(buildGiftBurdenedTransferBody(undeclared, form(undeclared))).not.toHaveProperty("regionInDesignatedDistrict");
  });
  it("신규 주택 선언은 신규 주택 코드와 함께만 실린다", () => {
    const tt = {
      previousAcquisitionDate: new Date("2018-01-10"),
      newAcquisitionDate: new Date("2020-01-20"),
      newHouseRegionCode: DAEHWA,
      newHouseInDesignatedDistrict: false,
    };
    const withCode = item({ householdHousingCount: 2, temporaryTwoHouse: tt });
    const b = buildGiftBurdenedTransferBody(withCode, form(withCode)) as { temporaryTwoHouse: Record<string, unknown> };
    expect(b.temporaryTwoHouse).toMatchObject({ newHouseRegionCode: DAEHWA, newHouseInDesignatedDistrict: false });
    const noCode = item({ householdHousingCount: 2, temporaryTwoHouse: { ...tt, newHouseRegionCode: "" } });
    const e = buildGiftBurdenedTransferBody(noCode, form(noCode)) as { temporaryTwoHouse: Record<string, unknown> };
    expect(e.temporaryTwoHouse).not.toHaveProperty("newHouseInDesignatedDistrict");
  });
});

describe("R-1 소재지가 바뀌면 답을 지운다", () => {
  it("증여 주택 — 법정동이 바뀌면 지우고, 같으면(동·호 재선택) 그대로, 답이 없으면 빈 patch", () => {
    const it = item({ regionInDesignatedDistrict: true });
    expect(giftBurdenedDistrictResetPatch(it, GANGNAM_PNU).burdenedGiftTransferTax).toMatchObject({
      regionInDesignatedDistrict: undefined,
      isOneHousehold: true,
    });
    expect(giftBurdenedDistrictResetPatch(it, "")).toHaveProperty("burdenedGiftTransferTax");
    expect(giftBurdenedDistrictResetPatch(it, `${DAEHWA}100990000`)).toEqual({});
    expect(giftBurdenedDistrictResetPatch(item(), GANGNAM_PNU)).toEqual({});
  });
  it("신규 주택 — 코드가 바뀌면 지우고 같으면 남긴다", () => {
    expect(giftBurdenedNewHouseAddressPatch({ jibun: "x", pnu: GANGNAM_PNU }, DAEHWA)).toHaveProperty(
      "newHouseInDesignatedDistrict",
      undefined,
    );
    expect(giftBurdenedNewHouseAddressPatch({ jibun: "x", pnu: `${DAEHWA}100990000` }, DAEHWA)).not.toHaveProperty(
      "newHouseInDesignatedDistrict",
    );
  });
});

describe("W-1 ⑤ 화면", () => {
  const renderSet = (bgt: BurdenedGiftTransferTaxInput, set = vi.fn()) => {
    const it = item(bgt);
    render(
      <HousingFieldSet
        bgt={it.burdenedGiftTransferTax!}
        set={set}
        referenceDate={GIFT}
        stdPriceLabel="취득시 기준시가"
        stdPriceHint=""
        transferStdPrice={300_000_000}
        onTransferStdPriceChange={() => {}}
        transferStdPriceLabel="증여시 기준시가"
        isLand={false}
        item={it}
        transferDate={GIFT}
      />,
    );
    return set;
  };
  it("지구 한정 동이면 질문이 뜨고, 「지구 밖」을 고르면 같은 칸에 저장한다", () => {
    const set = renderSet({} as BurdenedGiftTransferTaxInput);
    expect(screen.getByTestId("designated-district-question-bg-gift-house")).toBeTruthy();
    fireEvent.click(screen.getByTestId("designated-district-out-bg-gift-house"));
    expect(set).toHaveBeenCalledWith({ regionInDesignatedDistrict: false });
  });
  it("지구 밖으로 답했으면 「양도시 조정」 토글이 그 답으로 자동 판정된다", () => {
    renderSet({ regionInDesignatedDistrict: false } as BurdenedGiftTransferTaxInput);
    expect(screen.getByTestId("bg-transfer-regulated").textContent).toContain("조정대상지역 아님으로 자동 판정");
  });
});

describe("E-1 route — 확인 필요 경고", () => {
  const warnings = async (bgt: Partial<BurdenedGiftTransferTaxInput>) => {
    const it = item({ residencePeriodMonths: 30, ...bgt });
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildGiftBurdenedTransferBody(it, form(it))),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
    return (json.data?.result?.warnings ?? []) as string[];
  };
  const NOTICE = /지구 안인지 고르지 않아/;
  it("미선언이면 경고가 있고, 지구 밖·안을 고르면 없다", async () => {
    expect((await warnings({})).some((w) => NOTICE.test(w))).toBe(true);
    expect((await warnings({ regionInDesignatedDistrict: false })).some((w) => NOTICE.test(w))).toBe(false);
    expect((await warnings({ regionInDesignatedDistrict: true })).some((w) => NOTICE.test(w))).toBe(false);
  });
});

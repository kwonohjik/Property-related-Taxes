/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑧·판정 메뉴 ④) — 「취득 당시 조정대상지역」 표시 정합 (결정 #38-10). 격자 전수는 `acq-regulated-gift-household-parity-38-10.anchor.test.ts`가
 * ④ 본문→엔진 정답으로 대조하고, 여기서는 **화면에 닿는 곳**을 본다.
 *
 * 서울 마포(1144010100) — 2017-08-03 지정 · 2023-01-05 해제.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | D-1 | Step4 ② 자동 판정 | 이월과세 거울상(시작일 지정 중 · 증여일 해제 뒤) → 미해당 · 일반 증여 반대 방향(시작일 비지정 · 증여일 지정 중) → 미해당 |
 * | D-2 | ⑤ §155⑳ 카드 · ⑧ | 같은 반대 방향에서 카드는 「거주요건이 없습니다」 · ⑧은 막지 않는다. 별도 세대(아니오)면 해당 · 막는다 |
 * | D-3 | 게이트 | 다건 임베드면 증여 세대 사실을 읽지 않는다(엔진도 받지 않는다) — 같은 입력이 해당 · 막는다 |
 * | D-4 | 판정 메뉴 ④ | `wasRegulatedAtAcquisition`이 Step3 자동 판정과 같은 값을 싣는다 |
 * | D-5 | Step4 「조정대상지역 자동 판별」 안내 카드 | ② 카드(엔진 basis)와 안내 카드(단일 기준일) 값이 갈리면 안내 카드의 취득 줄을 숨긴다(같은 화면에 반대 값 금지) · 같으면 그대로 보인다 |
 * | D-6 | 판정 메뉴 ④ 술어 | 세대 사실 오류(증여자 관계 미선택)면 ④도 사실을 싣지 않는다 — 화면·⑧과 같은 술어 |
 * | D-7 | Step3 basis 메모 | 같은 입력으로 다시 렌더해도 basis 객체가 안정이다(메모 의존성) |
 *
 * 부정형 단언에는 긍정 짝을 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { calcGiftHouseholdBasis } from "@/lib/calc/effective-regulated-at-acquisition";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

// D-7 — 호출 수를 센다(통과 호출이라 동작은 그대로)
vi.mock("@/lib/calc/effective-regulated-at-acquisition", async (orig) => {
  const mod = await orig<typeof import("@/lib/calc/effective-regulated-at-acquisition")>();
  return { ...mod, calcGiftHouseholdBasis: vi.fn(mod.calcGiftHouseholdBasis) };
});

let pathname = "/calc/transfer-tax";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(() => {
  cleanup();
  pathname = "/calc/transfer-tax";
});

const MAPO = "1144010100";
const REGULATED_TEXT = "이 주택은 조정대상지역 취득입니다.";
const NOT_REGULATED_TEXT = "이 주택은 조정대상지역 취득이 아니므로 거주요건이 없습니다.";
const BLOCK = "조정대상지역 취득 주택은 거주기간 2년(24개월) 이상이 필요합니다";

const RENTAL = {
  ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
  applyException: true,
  scenario: "B" as const,
  rentalUnits: [],
  wasRegisteredRentalOrChildcare: true,
  priorResidenceTransferDate: "2023-01-10",
  standardPriceAtAcquisitionForPhrp: "150,000,000",
  standardPriceAtPriorTransfer: "250,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
};

/** 일반 증여 — 2018-06-01 증여(마포 지정 중) · 증여자 2010 취득 · 세대 보유 시작일에 따라 판정이 갈린다. */
function giftForm(sh: "yes" | "no", start: string, gift = "2018-06-01"): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2025-06-02";
  f.isOneHousehold = true;
  f.contractTotalPrice = "900000000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: gift,
    donorAcquisitionDate: "2010-01-01",
    giftDonorRelation: "lineal",
    giftSameHousehold: sh,
    giftHouseholdHoldingStartDate: start,
    fixedAcquisitionPrice: "500000000",
    addressJibun: "서울 마포구 테스트동 1-1",
    regionCode: MAPO,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    rentalHousingException: RENTAL,
  });
  return f;
}

function carryoverForm(sh: "yes" | "no", start: string, gift: string): TransferFormData {
  const f = giftForm("yes", "");
  Object.assign(f.assets[0], {
    acquisitionCause: "carryover_gift",
    acquisitionDate: "",
    giftSameHousehold: "",
    giftHouseholdHoldingStartDate: "",
    donorAcquisitionDate: "",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: gift,
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "600000000",
      donorAcquisitionPrice: "200000000",
      donorSameHousehold: sh,
      donorHouseholdHoldingStartDate: start,
    },
    rentalHousingException: undefined,
  });
  return f;
}

const auto = (f: TransferFormData) => {
  render(<Step4 form={f} onChange={() => {}} />);
  const text = screen.getByTestId("transfer-regulated-acquisition-auto").textContent ?? "";
  cleanup();
  return text;
};
const card = (f: TransferFormData, formRegionCode = "") => {
  render(
    <AssetSectionExtras
      asset={f.assets[0]}
      assetIndex={0}
      transferDate={f.transferDate}
      onChange={() => {}}
      wasRegulatedAtAcquisition={f.wasRegulatedAtAcquisition}
      formRegionCode={formRegionCode}
    />,
  );
  const t = document.body.textContent ?? "";
  cleanup();
  return t;
};
const gate = (f: TransferFormData) => validateAssetEntry(f.assets[0], 0, f) ?? "";

describe("D-1 Step4 ② 자동 판정", () => {
  it("[D-1a] 이월과세 거울상 — 시작일 2018-01-10(지정 중) · 증여 2023-06-01(해제 뒤) → 미해당 · 증여일도 지정 중이면 해당(짝)", () => {
    expect(auto(carryoverForm("yes", "2018-01-10", "2023-06-01"))).toMatch(/취득일 기준 조정대상지역 미해당/);
    expect(auto(carryoverForm("yes", "2018-01-10", "2022-06-01"))).toMatch(/취득일 기준 조정대상지역 해당/);
  });
  it("[D-1b] 일반 증여 반대 방향 — 시작일 2016-01-01(비지정) · 증여 2018-06-01(지정 중) → 미해당 · 아니오(별도 세대)면 해당(짝)", () => {
    expect(auto(giftForm("yes", "2016-01-01"))).toMatch(/취득일 기준 조정대상지역 미해당/);
    expect(auto(giftForm("no", ""))).toMatch(/취득일 기준 조정대상지역 해당/);
  });
});

describe("D-2 ⑤ §155⑳ 카드 · ⑧", () => {
  it("[D-2a] 반대 방향 — 카드는 「거주요건이 없습니다」 · ⑧은 막지 않는다", () => {
    const f = giftForm("yes", "2016-01-01");
    const t = card(f);
    expect(t).toContain(NOT_REGULATED_TEXT);
    expect(t).not.toContain(REGULATED_TEXT);
    expect(gate(f)).not.toContain(BLOCK);
  });
  it("[D-2b] 긍정 짝 — 별도 세대(아니오)는 증여일 기준 해당: 카드 「조정대상지역 취득」 · ⑧ 막는다", () => {
    const f = giftForm("no", "");
    const t = card(f);
    expect(t).toContain(REGULATED_TEXT);
    expect(t).not.toContain(NOT_REGULATED_TEXT);
    expect(gate(f)).toContain(BLOCK);
  });
});

describe("D-3 다건 임베드 — #38-3 이후 다건 ④도 증여 세대 사실을 싣는다", () => {
  it("[D-3] 같은 반대 방향 입력이 다건 임베드여도 단건과 같다(미해당 · ⑧ 막지 않음) · 긍정 짝: 별도 세대(아니오)는 둘 다 해당", () => {
    for (const path of ["/calc/transfer-tax", "/calc/transfer-tax/multi/edit"]) {
      pathname = path;
      const f = giftForm("yes", "2016-01-01");
      expect(card(f)).toContain(NOT_REGULATED_TEXT);
      expect(gate(f)).not.toContain(BLOCK);
      expect(auto(f)).toMatch(/취득일 기준 조정대상지역 미해당/);
      const g = giftForm("no", "");
      expect(card(g)).toContain(REGULATED_TEXT);
      expect(gate(g)).toContain(BLOCK);
    }
    pathname = "/calc/transfer-tax";
  });
});

describe("D-4 판정 메뉴 — ④가 싣는 값이 Step3 자동 판정과 같다", () => {
  const judgment = (sh: "yes" | "no", start: string, gift: string): OneHouseJudgmentFormData => {
    const f = createInitialOneHouseJudgmentForm();
    return {
      ...f,
      transferDate: "2025-06-15",
      isOneHousehold: true,
      assets: [
        {
          ...f.assets[0],
          assetKind: "housing",
          acquisitionDate: gift,
          acquisitionCause: "gift",
          giftDonorRelation: "lineal",
          donorAcquisitionDate: "2010-01-01",
          giftSameHousehold: sh,
          giftHouseholdHoldingStartDate: start,
          regionCode: MAPO,
        },
      ],
    } as OneHouseJudgmentFormData;
  };
  const step3 = (f: OneHouseJudgmentFormData) => {
    render(<Step3 form={f} onChange={() => {}} />);
    const text = screen.getByTestId("one-house-regulated-auto").textContent ?? "";
    cleanup();
    return text;
  };
  it("[D-4a] 반대 방향(시작일 비지정 · 증여일 지정 중): Step3 미해당 · ④ boolean false", () => {
    const f = judgment("yes", "2016-01-01", "2022-06-01");
    expect(step3(f)).toMatch(/취득 당시 조정대상지역 미해당/);
    expect(buildOneHouseExemptionApiBody(f).wasRegulatedAtAcquisition).toBe(false);
  });
  it("[D-4b] 거울상(시작일 지정 중 · 증여일 해제 뒤): Step3 미해당 · ④ boolean false", () => {
    const f = judgment("yes", "2018-01-10", "2023-06-01");
    expect(step3(f)).toMatch(/취득 당시 조정대상지역 미해당/);
    expect(buildOneHouseExemptionApiBody(f).wasRegulatedAtAcquisition).toBe(false);
  });
  it("[D-4c] 긍정 짝 — 둘 다 지정 중이면 해당 · ④ boolean true / 아니오(별도 세대)는 증여일 기준 해당", () => {
    const both = judgment("yes", "2018-01-10", "2022-06-01");
    expect(step3(both)).toMatch(/취득 당시 조정대상지역 해당/);
    expect(buildOneHouseExemptionApiBody(both).wasRegulatedAtAcquisition).toBe(true);
    const no = judgment("no", "", "2022-06-01");
    expect(step3(no)).toMatch(/취득 당시 조정대상지역 해당/);
    expect(buildOneHouseExemptionApiBody(no).wasRegulatedAtAcquisition).toBe(true);
  });
});

describe("D-5 Step4 안내 카드(useRegulatedAreaAutoTip) — ② 카드와 같은 화면에 반대 값을 띄우지 않는다", () => {
  /** API 응답 모사 — 단일 기준일(증여일 2018-06-01, 마포 지정 중)이라 「해당」을 돌려준다. */
  const stubRegulatedApi = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          isRegulatedAtTransfer: false,
          wasRegulatedAtAcquisition: true,
          transferBasis: "양도일 근거",
          acquisitionBasis: "단일 기준일 근거",
          confidence: "high",
        }),
      })),
    );
  };
  afterEach(() => vi.unstubAllGlobals());

  it("[D-5a] 일반 증여 반대 방향(시작일 비지정 · 증여일 지정 중) — ②는 미해당이고 안내 카드의 취득 줄은 숨는다(양도일 줄은 그대로)", async () => {
    stubRegulatedApi();
    render(<Step4 form={giftForm("yes", "2016-01-01")} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/양도일\(2025-06-02\)/)).toBeTruthy());
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toMatch(/취득일 기준 조정대상지역 미해당/);
    expect(document.body.textContent).not.toContain("단일 기준일 근거");
    expect(document.body.textContent).not.toMatch(/취득일\(2018-06-01\)/);
  });
  it("[D-5b] 긍정 짝 — 증여 세대 사실이 없는 일반 매매 취득은 안내 카드가 취득 줄을 그대로 보인다", async () => {
    stubRegulatedApi();
    const f = giftForm("yes", "2016-01-01");
    Object.assign(f.assets[0], { acquisitionCause: "purchase", giftSameHousehold: "", giftHouseholdHoldingStartDate: "", donorAcquisitionDate: "" });
    render(<Step4 form={f} onChange={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toContain("단일 기준일 근거"));
    expect(document.body.textContent).toMatch(/취득일\(2018-06-01\)/);
  });
  it("[D-5c] 긍정 짝 — 별도 세대(아니오)는 ②와 안내 카드가 같은 값(해당)이라 취득 줄을 그대로 보인다", async () => {
    stubRegulatedApi();
    render(<Step4 form={giftForm("no", "")} onChange={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toContain("단일 기준일 근거"));
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toMatch(/취득일 기준 조정대상지역 해당/);
  });
});

describe("D-6 판정 메뉴 ④ — 세대 사실 오류 상태에서는 화면 basis·⑧과 같이 사실을 싣지 않는다", () => {
  const menu = (patch: Record<string, unknown>): OneHouseJudgmentFormData => {
    const f = createInitialOneHouseJudgmentForm();
    return {
      ...f,
      transferDate: "2025-06-15",
      isOneHousehold: true,
      assets: [
        {
          ...f.assets[0],
          assetKind: "housing",
          acquisitionDate: "2018-06-01",
          acquisitionCause: "gift",
          giftDonorRelation: "lineal",
          donorAcquisitionDate: "2010-01-01",
          giftSameHousehold: "yes",
          giftHouseholdHoldingStartDate: "2016-01-01",
          regionCode: MAPO,
          ...patch,
        },
      ],
    } as OneHouseJudgmentFormData;
  };
  it("[D-6a] 증여자 관계 미선택(⑧ 오류) — ④는 증여 사실을 싣지 않는다 · 완전하면 싣는다(짝)", () => {
    const bad = buildOneHouseExemptionApiBody(menu({ giftDonorRelation: "" }));
    expect(bad.giftSameHouseholdContinuous).toBeUndefined();
    expect(bad.donorAcquisitionDate).toBeUndefined();
    const ok = buildOneHouseExemptionApiBody(menu({}));
    expect(ok.giftSameHouseholdContinuous).toBe(true);
    expect(ok.donorAcquisitionDate).toBe("2010-01-01");
  });
});

describe("D-7 판정 메뉴 Step3 — basis 메모", () => {
  it("[D-7] 같은 폼으로 다시 렌더해도 basis를 다시 만들지 않는다 · 자산이 바뀌면 다시 만든다(짝)", () => {
    const f = createInitialOneHouseJudgmentForm();
    const form = {
      ...f,
      transferDate: "2025-06-15",
      isOneHousehold: true,
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-06-01", regionCode: MAPO }],
    } as OneHouseJudgmentFormData;
    const spy = vi.mocked(calcGiftHouseholdBasis);
    spy.mockClear();
    const { rerender } = render(<Step3 form={form} onChange={() => {}} />);
    const afterMount = spy.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);
    rerender(<Step3 form={form} onChange={() => {}} />);
    expect(spy.mock.calls.length).toBe(afterMount);
    rerender(<Step3 form={{ ...form, assets: [{ ...form.assets[0], acquisitionDate: "2019-06-01" }] }} onChange={() => {}} />);
    expect(spy.mock.calls.length).toBeGreaterThan(afterMount);
  });
});

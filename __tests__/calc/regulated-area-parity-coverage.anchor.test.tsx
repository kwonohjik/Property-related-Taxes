/** @vitest-environment jsdom */
/**
 * 조정대상지역 테스트 보강(C 묶음) — 코드로만 확인했던 두 주장을 시료로 고정한다.
 *
 * 10번 — 「Step4 「보유 상황」을 건너뛴 값 = 거친 값」(`regulated-area-skip-step4-sync-judgment.plan.md` V-1·V-2)을 신뢰도 medium 주소와
 *   증여받은 주택(일반 증여 세대 basis · 이월과세)에서 잰다. 「거침」은 Step4 훅이 쓰는 기준일 출처(`useAcquisitionRegulatedContext`)와
 *   훅이 부르는 실제 route로 만든다 — 기존 parity anchor는 기준일을 leaf로 넣어 Step4의 출처는 보지 않았다.
 *   판정 메뉴 ↔ 계산기도 같은 시료로 본다(`judgment-menu-regulated-area-address.plan.md` V-5).
 * 9번 — 판정 메뉴 ⑧(`one-house-exemption-validate.ts`)이 넘기는 「취득 당시 조정대상지역」은 facts 모드에서 결과에 닿지 않는다(관측 불가).
 *   그 사실을 고정해 두고, facts 모드가 이 값을 쓰기 시작하면 이 테스트가 깨져 ⑧ 값의 출처(④와 같은 leaf)를 다시 보게 한다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderHook, waitFor } from "@testing-library/react";
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST as regulatedAreaPOST } from "@/app/api/address/regulated-area/route";
import { useRegulatedAreaAutoTip } from "@/app/calc/transfer-tax/steps/step4-sections/useRegulatedAreaAutoTip";
import { useAcquisitionRegulatedContext } from "@/app/calc/transfer-tax/steps/step4-sections/useAcquisitionRegulatedContext";
import { captureBody } from "./_helpers/redev-one-house-route";
import { handoff } from "./_one-house-pr6a-routes";
import { calcResidenceJudgmentDate, calcStoredRegulatedFlags } from "@/lib/calc/effective-regulated-at-acquisition";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type F = TransferFormData;

/** 계산기 폼 — 주 자산 주소 문자열만(코드 없음) · 1세대 · 거주 0. */
function calcForm(asset: Record<string, unknown>, transferDate = "2025-06-02"): F {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.isOneHousehold = true;
  f.contractTotalPrice = "900000000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    fixedAcquisitionPrice: "500000000",
    regionCode: "",
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    ...asset,
  });
  return f;
}

/** 일반 증여 — 2018-06-01 증여 · 증여자 2010 취득 · 같은 세대로 2016-01-01부터 보유(`acq-regulated-gift-household-display-38-10` 시료와 같은 사실). */
const GIFT = {
  acquisitionCause: "gift",
  acquisitionDate: "2018-06-01",
  donorAcquisitionDate: "2010-01-01",
  giftDonorRelation: "lineal",
  giftSameHousehold: "yes",
  giftHouseholdHoldingStartDate: "2016-01-01",
};

/** 이월과세 증여 — 증여 등기 2018-06-01 · 증여자 2010 취득. */
const CARRYOVER = {
  acquisitionCause: "carryover_gift",
  acquisitionDate: "",
  giftSameHousehold: "",
  giftHouseholdHoldingStartDate: "",
  donorAcquisitionDate: "",
  carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2018-06-01", donorAcquisitionDate: "2010-01-01" },
};

/**
 * Step4 훅이 하는 일 — **실제 훅**(`useRegulatedAreaAutoTip`)을 렌더한다. 기준일·맥락은 Step4가 쓰는 출처(`useAcquisitionRegulatedContext`)에서,
 * 훅이 부르는 `/api/address/regulated-area`는 실제 route로 연결하고, 훅이 토글에 쓴 값(onChange 패치)을 읽는다.
 */
async function visited(f: F): Promise<{ date: string; flags: { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean } }> {
  const ctx = renderHook(() => useAcquisitionRegulatedContext(f)).result.current;
  const primary = f.assets[0];
  const patches: Partial<F> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string, init?: RequestInit) =>
      regulatedAreaPOST(new NextRequest(`http://localhost${u}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: String(init?.body) })),
    ),
  );
  renderHook(() =>
    useRegulatedAreaAutoTip({
      form: f,
      onChange: (d) => Object.assign(patches, d),
      primaryKind: primary.assetKind,
      primaryAddress: primary.addressRoad || primary.addressJibun || "",
      primaryRegionCode: primary.regionCode || "",
      residenceJudgmentDate: ctx.residenceJudgmentDate,
      judgmentDateLabel: ctx.judgmentDateLabel,
      acquisitionVerdict: ctx.acquisitionVerdict,
    }),
  );
  const address = primary.addressRoad || primary.addressJibun || "";
  if (address && f.transferDate && isHousingLike(primary.assetKind)) await waitFor(() => expect(Object.keys(patches).length).toBeGreaterThan(0));
  vi.unstubAllGlobals();
  return {
    date: ctx.residenceJudgmentDate,
    flags: {
      isRegulatedArea: patches.isRegulatedArea ?? f.isRegulatedArea === true,
      wasRegulatedAtAcquisition: patches.wasRegulatedAtAcquisition ?? f.wasRegulatedAtAcquisition === true,
    },
  };
}

describe("10번 — 건너뛴 값 = 거친 값 (medium · 증여)", () => {
  const CASES: [string, F, { isRegulatedArea: boolean; wasRegulatedAtAcquisition: boolean }][] = [
    // 남양주시는 시군구 단위로 매칭해 읍·면 예외를 못 본다(medium) — 2020-12-01 취득 당시 지정, 양도일(2026) 해제.
    [
      "P-1 medium 주소(남양주 화도읍) · 2020-12-01 취득",
      calcForm({ addressJibun: "경기도 남양주시 화도읍 1", acquisitionDate: "2020-12-01" }, "2026-06-01"),
      { isRegulatedArea: false, wasRegulatedAtAcquisition: true },
    ],
    [
      "P-2 일반 증여 · 세대 보유 2016-01-01 · 마포 주소 문자열",
      calcForm({ ...GIFT, addressJibun: "서울특별시 마포구 테스트동 1-1" }),
      // 마포(시군구 매칭 high): 세대 보유 시작일 2016-01-01 미지정 · 증여일 2018-06-01 지정 — 같은 세대 확인이라 둘 다 지정 중일 때만(`all`) → 아님.
      // (이 계획서 이전에는 기준일 하나(증여일)만 봐 true였다 — `gift-house-regulated-address-path.plan.md`.)
      { isRegulatedArea: false, wasRegulatedAtAcquisition: false },
    ],
    [
      "P-3 이월과세 증여 · 마포 주소 문자열",
      calcForm({ ...CARRYOVER, addressJibun: "서울특별시 마포구 테스트동 1-1" }),
      { isRegulatedArea: false, wasRegulatedAtAcquisition: true },
    ],
  ];

  it.each(CASES)("%s — Step4 기준일 = leaf 기준일 · route 판정 = leaf 판정 · ④ 본문도 같다", async (_n, f, expected) => {
    const v = await visited(f);
    expect(v.date).toBe(calcResidenceJudgmentDate(f.assets[0]));
    expect(calcStoredRegulatedFlags(f)).toEqual(v.flags);
    expect(v.flags).toEqual(expected);
    const body = await captureBody(f);
    expect([body.isRegulatedArea, body.wasRegulatedAtAcquisition]).toEqual([v.flags.isRegulatedArea, v.flags.wasRegulatedAtAcquisition]);
  });

  it("P-4 판정 메뉴 ↔ 계산기 — 일반 증여 · 주소 문자열 · 안 만짐: 두 본문의 조정대상지역 값이 같다", async () => {
    const base = createInitialOneHouseJudgmentForm();
    const jf = {
      ...base,
      isOneHousehold: true,
      transferDate: "2025-06-02",
      contractTotalPrice: "900000000",
      assets: [{ ...base.assets[0], assetKind: "housing", ...GIFT, addressJibun: "서울특별시 마포구 테스트동 1-1", residencePeriodMonthsAsset: "0" }],
    } as OneHouseJudgmentFormData;
    const menu = buildOneHouseExemptionApiBody(jf);
    const calc = await captureBody(handoff(jf, { assets: [{ ...handoff(jf).assets[0], fixedAcquisitionPrice: "500000000" }] } as Partial<F>));
    // 세대 보유 시작일 2016-01-01 미지정 · 증여일 2018-06-01 지정 → `all` → 아님 (P-2와 같은 사실).
    expect([menu.isRegulatedArea, menu.wasRegulatedAtAcquisition]).toEqual([false, false]);
    expect([calc.isRegulatedArea, calc.wasRegulatedAtAcquisition]).toEqual([menu.isRegulatedArea, menu.wasRegulatedAtAcquisition]);
  });
});

describe("9번 — 판정 메뉴 ⑧이 넘기는 「취득 당시 조정대상지역」은 facts 모드에서 관측되지 않는다", () => {
  /** §154⑩ 표준 경로 · 2019.2.12. 전 취득(종전규정) · 거주 0 — 이 값이 거주 2년 요구를 가르는 시료다. */
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
  const asset = calcForm({ acquisitionDate: "2018-06-01", rentalHousingException: RENTAL }).assets[0];
  const run = (mode: "full" | "facts", was: boolean) =>
    validateRentalHousingException(RENTAL, asset, 0, "장기임대주택 특례", "2025-06-02", mode, false, was);

  it("T-1 전제 — 계산기(full)에서는 이 값이 결과를 가른다(구별력 있는 시료)", () => {
    expect(JSON.stringify(run("full", true))).not.toBe(JSON.stringify(run("full", false)));
  });

  it("T-2 판정 메뉴(facts)에서는 값과 무관하다 — 이 테스트가 깨지면 facts 모드가 이 값을 쓰기 시작한 것이니 ⑧이 ④와 같은 leaf(`calcStoredRegulatedFlags`)로 값을 만드는지 함께 고정할 것", () => {
    expect(run("facts", true)).toEqual(run("facts", false));
  });
});

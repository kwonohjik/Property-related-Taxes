/** @vitest-environment jsdom */
/**
 * 증여받은 주택의 「취득 당시 조정대상지역」 — 주소 문자열 경로도 코드 경로와 같은 세대 사실 규칙(후보일·결합 방식)으로 판정한다.
 * 계획서 `docs/00-pm/gift-house-regulated-address-path.plan.md` (Q-1 a · Q-2 a · Q-3 a).
 *
 * 마포(코드 `1144010100` ↔ 주소 `서울특별시 마포구 테스트동 1-1`) 지정 이력(실측): 2017-09-01·2018-01-01·2018-06-01·2023-01-04 지정 /
 * 2016-01-01·2023-01-05·2023-06-01·2025-10-15 미지정 / 2025-10-16·2025-11-01·2026-06-01 지정.
 * 「코드 경로」는 같은 폼에 법정동코드를 넣은 ④ 본문(엔진 `resolveWasRegulatedAtAcquisition`이 정한다)이다.
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
import {
  calcStoredRegulatedFlags,
  regulatedAddressAssumptions,
  regulatedAddressVerdicts,
} from "@/lib/calc/effective-regulated-at-acquisition";
import { regulatedAssumptionRowHead } from "@/lib/calc/regulated-area-assumption-text";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type F = TransferFormData;
const ADDRESS = "서울특별시 마포구 테스트동 1-1";
const CODE = "1144010100";

function calcForm(asset: Record<string, unknown>, opts: { code?: boolean; address?: string } = {}): F {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-01";
  f.isOneHousehold = true;
  f.contractTotalPrice = "900000000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    fixedAcquisitionPrice: "300000000",
    regionCode: opts.code ? CODE : "",
    addressJibun: opts.address ?? ADDRESS,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    ...asset,
  });
  return f;
}

/** 일반 증여 — 증여자 2010 취득. `start`가 있으면 같은 세대 계속(그 날부터), `null`이면 별도 세대. */
const gift = (giftDate: string, start: string | null) => ({
  acquisitionCause: "gift",
  acquisitionDate: giftDate,
  donorAcquisitionDate: "2010-01-01",
  giftDonorRelation: "lineal",
  giftSameHousehold: start === null ? "no" : "yes",
  giftHouseholdHoldingStartDate: start ?? "",
});

/** 이월과세 — `start`가 있으면 같은 세대 계속(그 날부터), `""`이면 미답. */
const carryover = (registry: string, start: string, donorAcq = "2010-01-01") => ({
  acquisitionCause: "carryover_gift",
  acquisitionDate: "",
  giftSameHousehold: "",
  giftHouseholdHoldingStartDate: "",
  donorAcquisitionDate: "",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: registry,
    donorAcquisitionDate: donorAcq,
    donorSameHousehold: start ? ("yes" as const) : ("" as const),
    donorHouseholdHoldingStartDate: start,
  },
});

/** [이름, 증여 사실, 취득 당시 조정대상지역(코드 경로 = 주소 경로)] — 계획서 §1 실측표. */
const CASES: [string, Record<string, unknown>, boolean][] = [
  ["G-1 일반 · 같은 세대 2016-01-01 · 증여 2018-06-01", gift("2018-06-01", "2016-01-01"), false],
  ["G-2 일반 · 같은 세대 2017-09-01 · 증여 2018-06-01", gift("2018-06-01", "2017-09-01"), true],
  ["G-3 일반 · 별도 세대 · 증여 2018-06-01", gift("2018-06-01", null), true],
  ["G-4 일반 · 같은 세대 2018-01-01 · 증여 2023-06-01 (거울상)", gift("2023-06-01", "2018-01-01"), false],
  ["G-5 이월과세 · 같은 세대 2016-01-01 · 등기 2018-06-01", carryover("2018-06-01", "2016-01-01"), false],
  ["G-7 일반 · 같은 세대 2023-06-01 · 증여 2025-11-01", gift("2025-11-01", "2023-06-01"), false],
  ["G-8 이월과세 · 같은 세대 2018-01-01 · 등기 2023-06-01 (거울상)", carryover("2023-06-01", "2018-01-01"), false],
  ["G-9 이월과세 · 같은 세대 2023-06-01 · 등기 2025-11-01", carryover("2025-11-01", "2023-06-01"), false],
  ["G-6 이월과세 · 세대 미답 · 증여자 취득 2018-01-01 · 등기 2023-06-01", carryover("2023-06-01", "", "2018-01-01"), true],
];

describe("A-1~A-4 — 주소 경로 ④ 취득 당시 = 코드 경로", () => {
  it.each(CASES)("%s", async (_n, asset, expected) => {
    const byCode = await captureBody(calcForm(asset, { code: true }));
    const byAddress = await captureBody(calcForm(asset));
    expect(byCode.wasRegulatedAtAcquisition).toBe(expected);
    expect(byAddress.wasRegulatedAtAcquisition).toBe(expected);
  });
});

describe("A-5 — 직접 만진 토글은 저장값을 존중한다", () => {
  it("G-7 · 취득 당시 토글을 직접 「예」로 만짐 → 저장값 true", async () => {
    const f = calcForm(gift("2025-11-01", "2023-06-01"));
    expect(calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition).toBe(false);
    f.wasRegulatedAtAcquisition = true;
    f.wasRegulatedAtAcquisitionTouched = true;
    expect(calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition).toBe(true);
    expect((await captureBody(f)).wasRegulatedAtAcquisition).toBe(true);
  });
});

describe("A-6 — 판정 메뉴(같은 leaf)", () => {
  it("G-7 판정 메뉴 본문 = 계산기 본문 · 결론을 정한 날은 세대 보유 시작일", () => {
    const base = createInitialOneHouseJudgmentForm();
    const jf = {
      ...base,
      isOneHousehold: true,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ ...base.assets[0], assetKind: "housing", ...gift("2025-11-01", "2023-06-01"), addressJibun: ADDRESS, residencePeriodMonthsAsset: "0" }],
    } as OneHouseJudgmentFormData;
    expect(buildOneHouseExemptionApiBody(jf).wasRegulatedAtAcquisition).toBe(false);
    const v = regulatedAddressVerdicts(jf);
    expect(v.acquisitionDecided).toEqual({ date: "2023-06-01", label: "세대 보유 시작일" });
    expect(v.acquisition?.isRegulated).toBe(false);
  });
});

describe("A-7 — Step4 토글·안내 = ④ 값 (실제 훅)", () => {
  async function visited(f: F) {
    const ctx = renderHook(() => useAcquisitionRegulatedContext(f)).result.current;
    const primary = f.assets[0];
    const patches: Partial<F> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) =>
        regulatedAreaPOST(new NextRequest(`http://localhost${u}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: String(init?.body) })),
      ),
    );
    const hook = renderHook(() =>
      useRegulatedAreaAutoTip({
        form: f,
        onChange: (d) => Object.assign(patches, d),
        primaryKind: primary.assetKind,
        primaryAddress: primary.addressJibun ?? "",
        primaryRegionCode: primary.regionCode ?? "",
        residenceJudgmentDate: ctx.residenceJudgmentDate,
        judgmentDateLabel: ctx.judgmentDateLabel,
        acquisitionVerdict: ctx.acquisitionVerdict,
      }),
    );
    await waitFor(() => expect(Object.keys(patches).length).toBeGreaterThan(0));
    vi.unstubAllGlobals();
    return { patches, hook };
  }

  it.each([CASES[0], CASES[5], CASES[6]])("%s — 토글에 쓴 값 = ④ 값", async (_n, asset, expected) => {
    const f = calcForm(asset);
    const { patches } = await visited(f);
    expect(patches.wasRegulatedAtAcquisition).toBe(expected);
    expect(patches.wasRegulatedAtAcquisition).toBe(calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition);
  });

  it("G-7 안내 줄 — 결론을 정한 날(세대 보유 시작일 2023-06-01)과 그 근거", async () => {
    const f = calcForm(gift("2025-11-01", "2023-06-01"));
    const { hook } = await visited(f);
    await waitFor(() => expect(hook.result.current).toBeTruthy());
    const { render } = await import("@testing-library/react");
    const { container } = render(<>{hook.result.current}</>);
    expect(container.textContent).toContain("세대 보유 시작일(2023-06-01)");
    expect(container.textContent).toContain("미지정");
  });
});

describe("A-8 — 시·도를 생략한 주소(low): 결과 고지에 결론을 정한 날을 밝힌다", () => {
  it("G-7 사실 · 주소 「마포구 테스트동 1-1」", () => {
    const f = calcForm(gift("2025-11-01", "2023-06-01"), { address: "마포구 테스트동 1-1" });
    const rows = regulatedAddressAssumptions(f).filter((r) => r.which === "acquisition");
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBe("low");
    expect(rows[0].dateLabel).toBe("세대 보유 시작일");
    expect(regulatedAssumptionRowHead(rows[0])).toBe(`취득 당시(세대 보유 시작일 ${rows[0].date})`);
  });
});

describe("A-9 — 증여가 아닌 주택은 기준일 하나 그대로", () => {
  it("매매 · 취득 2018-06-01 → 지정 중 · 고지 날짜 이름 없음", async () => {
    const f = calcForm({ acquisitionDate: "2018-06-01" }, { address: "마포구 테스트동 1-1" });
    expect(calcStoredRegulatedFlags(f).wasRegulatedAtAcquisition).toBe(true);
    expect(regulatedAddressVerdicts(f).acquisitionDecided).toEqual({ date: "2018-06-01", label: undefined });
    expect(regulatedAddressAssumptions(f).every((r) => r.dateLabel === undefined)).toBe(true);
    expect(regulatedAssumptionRowHead(regulatedAddressAssumptions(f)[0])).toMatch(/^(양도일|취득 당시)\(\d{4}-\d{2}-\d{2}\)$/);
  });
});

describe("A-10 — 다건: 건마다 그 건의 세대 사실로 판정한다", () => {
  it("G-7 사실 건 = 비해당 · 별도 세대 건(G-3) = 해당", () => {
    const g7 = buildPropertyPayload(calcForm(gift("2025-11-01", "2023-06-01"))) as Record<string, unknown>;
    const g3 = buildPropertyPayload(calcForm(gift("2018-06-01", null))) as Record<string, unknown>;
    expect(g7.wasRegulatedAtAcquisition).toBe(false);
    expect(g3.wasRegulatedAtAcquisition).toBe(true);
  });
});

/**
 * 「보유 상황」(Step4)을 건너뛴 계산 = 거친 계산 — 조정대상지역 두 숨은 토글(양도 당시·취득 당시) parity anchor.
 * 계획서 `docs/00-pm/regulated-area-skip-step4-sync-judgment.plan.md` §1(실측)·§5(케이스 매트릭스).
 *
 * 주 자산 소재지가 주소 문자열뿐(법정동코드 없음)이면 판정은 Step4 훅(`useRegulatedAreaAutoTip`)만 했다 — 건너뛰면 기본값 「아님」이
 * ④에 가서 1주택 비과세(거주요건 누락)·2주택 중과 누락이 났다. 「거침」 폼은 훅이 부르는 실제 route(`/api/address/regulated-area`)에
 * 훅과 같은 본문을 보내 받은 값을 「안 만진 토글」에 넣어 만든다(훅 `:89`~`:92`와 같은 규칙).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as regulatedAreaPOST } from "@/app/api/address/regulated-area/route";
import { runCalc, captureBody, houseRow } from "./_helpers/redev-one-house-route";
import { HOUSE, form } from "./_helpers/g1-reverse-appurtenant-fixtures";
import { calcResidenceJudgmentDate, calcStoredRegulatedFlags } from "@/lib/calc/effective-regulated-at-acquisition";
import { sameDayHousingBundleIssue } from "@/lib/calc/same-day-housing-bundle";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { isHousingLike } from "@/lib/calc/housing-like-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type F = TransferFormData;
const GANGNAM = "서울특별시 강남구 테헤란로 123";
const MOKPO = "전라남도 목포시 영산로 1";

/** 주 자산 주소 문자열만(코드 없음) · 2018-03-02 매매 4억 → 양도 8억 · 거주 0 · 1세대 1주택. */
const mk = (over: Partial<F> = {}, asset: Record<string, unknown> = {}): F =>
  ({
    ...(form({
      ...HOUSE(0),
      addressJibun: "",
      addressRoad: GANGNAM,
      regionCode: "",
      acquisitionDate: "2018-03-02",
      residencePeriodMonthsAsset: "0",
      ...asset,
    }) as object),
    ...over,
  }) as F;

const twoHouse: Partial<F> = {
  transferDate: "2026-08-01",
  householdHousingCount: "2",
  houses: [houseRow("x1", "2015-01-01")],
};

/** Step4 훅이 하는 일을 그대로 — 같은 본문으로 route를 부르고, 안 만진 토글에만 결과를 쓴다. */
async function visited(f: F): Promise<F> {
  const primary = f.assets[0];
  const address = primary.addressRoad || primary.addressJibun || "";
  const regionCode = primary.regionCode ?? "";
  if ((!address && !regionCode) || !f.transferDate || !isHousingLike(primary.assetKind)) return f;
  const res = await regulatedAreaPOST(
    new NextRequest("http://localhost/api/address/regulated-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address || undefined,
        regionCode: regionCode || undefined,
        inDistrict: regionCode ? primary.regionInDesignatedDistrict : undefined,
        transferDate: f.transferDate,
        acquisitionDate: calcResidenceJudgmentDate(primary) || undefined,
      }),
    }),
  );
  const data = (await res.json()) as { error?: unknown; isRegulatedAtTransfer: boolean; wasRegulatedAtAcquisition: boolean };
  if (data.error) return f;
  return {
    ...f,
    ...(f.isRegulatedAreaTouched ? {} : { isRegulatedArea: data.isRegulatedAtTransfer }),
    ...(f.wasRegulatedAtAcquisitionTouched ? {} : { wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition }),
  };
}

const flags = (b: Record<string, unknown>) => [b.isRegulatedArea, b.wasRegulatedAtAcquisition];

describe("C-1·C-2 — 주소 문자열만 · 토글 안 만짐: 건너뛴 계산 = 거친 계산 (세액)", () => {
  it("C-1 1주택 — 취득 당시 조정대상지역 · 거주 0 → 비과세 아님 237,435,000", async () => {
    const skip = mk();
    const s = await runCalc(skip);
    const v = await runCalc(await visited(skip));
    expect(s.issues).toEqual([]);
    expect(flags(s.body)).toEqual([true, true]);
    expect(flags(s.body)).toEqual(flags(v.body));
    expect(s.result.isExempt).toBe(false);
    expect(s.result.totalTax).toBe(237_435_000);
    expect(s.result.totalTax).toBe(v.result.totalTax);
  });

  it("C-2 2주택 — 양도 당시 조정대상지역 → 중과 436,161,000", async () => {
    const skip = mk(twoHouse);
    const s = await runCalc(skip);
    const v = await runCalc(await visited(skip));
    expect(s.issues).toEqual([]);
    expect(flags(s.body)).toEqual([true, true]);
    expect(s.result.totalTax).toBe(436_161_000);
    expect(s.result.totalTax).toBe(v.result.totalTax);
  });
});

describe("C-3~C-7 — 판정하지 않는 경우는 저장값 그대로 (거친 계산과 같다)", () => {
  it("C-3 직접 만진 토글(아니오)은 존중한다 — 비과세 0", async () => {
    const skip = mk({
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isRegulatedAreaTouched: true,
      wasRegulatedAtAcquisitionTouched: true,
    });
    const s = await runCalc(skip);
    expect(flags(s.body)).toEqual([false, false]);
    expect(s.result.totalTax).toBe(0);
    expect(flags((await captureBody(await visited(skip))))).toEqual([false, false]);
  });

  it("C-4 비조정 시군구 주소 → 아님/아님", async () => {
    const skip = mk({}, { addressRoad: MOKPO });
    expect(flags(await captureBody(skip))).toEqual([false, false]);
    expect(flags(await captureBody(await visited(skip)))).toEqual([false, false]);
  });

  it("C-5 주소·코드 모두 없음 → 저장값(true 저장이면 true)", async () => {
    const skip = mk({ isRegulatedArea: true, wasRegulatedAtAcquisition: true }, { addressRoad: "" });
    expect(flags(await captureBody(skip))).toEqual([true, true]);
  });

  it("C-6 토지 — 훅이 돌지 않으므로 저장값(아님)", () => {
    const f = mk({}, { assetKind: "land", landNature: "general" });
    expect(calcStoredRegulatedFlags(f)).toEqual({ isRegulatedArea: false, wasRegulatedAtAcquisition: false });
  });

  it("C-7 법정동코드 있음 — 코드 판정(종전과 같다)", async () => {
    const skip = mk({}, { regionCode: "1168010100" });
    const s = await captureBody(skip);
    expect(flags(s)).toEqual([true, true]);
    expect(flags(s)).toEqual(flags(await captureBody(await visited(skip))));
  });

  it("날짜 형식이 틀리면 route가 400 → 훅이 아무것도 쓰지 않는다 → 저장값", () => {
    const f = mk({ transferDate: "2026-02-30" });
    expect(calcStoredRegulatedFlags(f)).toEqual({ isRegulatedArea: false, wasRegulatedAtAcquisition: false });
  });
});

describe("C-8 — 취득 당시 기준일은 훅과 같은 leaf(용도변경이면 주거용 사용 개시일)", () => {
  it("2016 취득(지정 전) · 2018 주거용 사용 개시(지정 중) → 취득 당시 조정대상지역", async () => {
    const skip = mk({}, { acquisitionDate: "2016-01-04", hasNonHousingConversion: true, residentialUseStartDate: "2018-03-02" });
    expect(calcStoredRegulatedFlags(skip).wasRegulatedAtAcquisition).toBe(true);
    const plain = mk({}, { acquisitionDate: "2016-01-04" });
    expect(calcStoredRegulatedFlags(plain).wasRegulatedAtAcquisition).toBe(false);
    expect(flags(await captureBody(skip))).toEqual(flags(await captureBody(await visited(skip))));
  });
});

describe("C-9 — 다건 ④도 같은 leaf", () => {
  it("다건 건 본문의 두 값이 건너뜀에서도 판정값", () => {
    const p = buildPropertyPayload(mk()) as Record<string, unknown>;
    expect(flags(p)).toEqual([true, true]);
  });
});

describe("C-10 — ⑧ 같은 날 양도 묶음 차단 범위도 실효값", () => {
  it("1세대 아님 + 주소 문자열 조정대상지역 주택 2채 함께 양도 → 건너뛰어도 막힌다(거친 계산과 같다)", async () => {
    const two = {
      ...mk({ isOneHousehold: false }),
    } as F;
    const second = { ...two.assets[0], assetId: "h2", assetLabel: "자산 2" };
    const f = { ...two, assets: [two.assets[0], second] } as F;
    expect(sameDayHousingBundleIssue(f)).not.toBeNull();
    expect(sameDayHousingBundleIssue(await visited(f))).not.toBeNull();
    // 비조정 주소면 종전대로 막지 않는다
    const mokpo = { ...f, assets: f.assets.map((a) => ({ ...a, addressRoad: MOKPO })) } as F;
    expect(sameDayHousingBundleIssue(mokpo)).toBeNull();
  });
});

describe("입주권·분양권 — Step4가 마운트 때 만짐 표지를 지우므로 표지를 보지 않는다", () => {
  it("분양권 · 만짐 표지 잔존(아니오) → 판정값", () => {
    const f = mk({ isRegulatedAreaTouched: true, isRegulatedArea: false }, { assetKind: "presale_right" });
    expect(calcStoredRegulatedFlags(f).isRegulatedArea).toBe(true);
  });
});

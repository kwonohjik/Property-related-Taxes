/**
 * @vitest-environment jsdom
 *
 * D2 — 양도일 당일·이후 취득한 명부 행은 양도일 현재 보유 주택이 아니다(`isOwnedAtTransfer`).
 * 동일자 취득·양도는 양도 후 취득으로 본다(서면인터넷방문상담4팀-1697 §155① · 재재산-836 §104).
 *
 * 판정 메뉴 route 결론은 해석례 평가셋(`E053-era`·`E055-era` match · `E053-era-daybefore` 음성 짝)이 고정한다.
 * 여기서는 그 결론이 기대는 **클라이언트 층**을 본다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | leaf | 경계 — 전날 보유 · 같은 날·다음 날 미보유 · 양도일 없음/형식 아님이면 거르지 않는다 |
 * | C-1 | 계산기 ④ body | 같은 날 취득 행이 주택 수(2채)·`houses[]`·§155① 신규주택 도출에서 빠진다 |
 * | C-2 | 계산기 ④ body | 전날 취득이면 3채·도출 없음(음성 짝) |
 * | J-1 | 판정 메뉴 ④ body | `houses[]`에서 빠지고 파생 주택 수가 2채다 |
 * | W-1 | ⑤ 명부 표 | 같은 날 취득 행에 「주택 수 제외」 배지 · 전날 행엔 없다 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { isOwnedAtTransfer } from "@/lib/calc/household-house-count";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, deriveJudgmentHouseCount } from "@/lib/stores/one-house-judgment-form.types";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const row = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    region: "capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

// E053: 종전 2000-03-15(양도) · 신규 2007-10-15 · 갈아탈 주택 swap · 양도 2008-04-15
const TRANSFER = "2008-04-15";
const houses = (swapAcq: string) => [
  row({ id: "new", acquisitionDate: "2007-10-15" }),
  row({ id: "swap", acquisitionDate: swapAcq }),
];

describe("L-1 leaf 경계", () => {
  it("취득일 < 양도일만 보유", () => {
    expect(isOwnedAtTransfer("2008-04-14", TRANSFER)).toBe(true);
    expect(isOwnedAtTransfer("2008-04-15", TRANSFER)).toBe(false);
    expect(isOwnedAtTransfer("2008-04-16", TRANSFER)).toBe(false);
  });
  it("양도일이 없거나 형식이 아니면 거르지 않는다(종전 그대로)", () => {
    expect(isOwnedAtTransfer("2030-01-01", undefined)).toBe(true);
    expect(isOwnedAtTransfer("2030-01-01", "")).toBe(true);
    expect(isOwnedAtTransfer("2030-01-01", "2008-4-15")).toBe(true);
    expect(isOwnedAtTransfer(undefined, TRANSFER)).toBe(true);
  });
});

describe("C 계산기 ④ body", () => {
  let body: Record<string, unknown> | undefined;
  beforeEach(() => {
    body = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function send(swapAcq: string) {
    const f = createDefaultTransferFormData();
    f.transferDate = TRANSFER;
    f.isOneHousehold = true;
    f.contractTotalPrice = "400000000";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2000-03-15",
      actualSalePrice: "400000000",
      fixedAcquisitionPrice: "100000000",
    });
    f.houses = houses(swapAcq);
    await callTransferTaxAPI(f);
    return body!;
  }

  it("C-1 같은 날 취득 행 — 2채 · 명부에서 빠짐 · 신규주택 도출", async () => {
    const b = await send(TRANSFER);
    expect(b.householdHousingCount).toBe(2);
    expect((b.houses as { id: string }[]).map((h) => h.id)).toEqual(["selling", "new"]);
    expect(b.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2000-03-15", newAcquisitionDate: "2007-10-15" });
  });
  it("C-2 전날 취득(음성 짝) — 3채 · 명부에 남음 · 도출 없음", async () => {
    const b = await send("2008-04-14");
    expect(b.householdHousingCount).toBe(3);
    expect((b.houses as { id: string }[]).map((h) => h.id)).toEqual(["selling", "new", "swap"]);
    expect(b).not.toHaveProperty("temporaryTwoHouse");
  });
});

describe("J-1 판정 메뉴 ④ body", () => {
  it("같은 날 취득 행은 houses[]·파생 주택 수에서 빠지고, 전날이면 남는다", () => {
    const form = (swapAcq: string) => {
      const f = createInitialOneHouseJudgmentForm();
      f.transferDate = TRANSFER;
      Object.assign(f.assets[0], { assetKind: "housing", acquisitionDate: "2000-03-15" });
      f.houses = houses(swapAcq);
      return f;
    };
    const same = form(TRANSFER);
    expect(deriveJudgmentHouseCount(same)).toBe(2);
    expect((buildOneHouseExemptionApiBody(same).houses as { id: string }[]).map((h) => h.id)).toEqual(["selling", "new"]);
    expect(deriveJudgmentHouseCount(form("2008-04-14"))).toBe(3);
  });
});

describe("W-1 ⑤ 명부 표 배지", () => {
  afterEach(cleanup);
  it("같은 날 취득 행에만 「주택 수 제외」 배지", () => {
    const f = { ...createDefaultTransferFormData(), transferDate: TRANSFER, houses: houses(TRANSFER) };
    render(<HousesListSection form={f} onChange={() => {}} />);
    expect(screen.getByTestId("house-after-transfer-badge-swap").textContent).toContain("주택 수 제외");
    expect(screen.queryByTestId("house-after-transfer-badge-new")).toBeNull();
  });
});

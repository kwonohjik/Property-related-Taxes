/**
 * anchor(④⑫⑬⑭) — 합가 전 보유 구성이 **화면 입력에서 엔진까지** 도달하는가 (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` 2·3단계 · V-3.
 *
 * 엔진 anchor(`one-house-merge-composition.anchor.test.ts`)는 `HouseInfo.mergeOrigin`이 **있으면**
 * 맞게 판정함을 보인다. 여기서는 폼 → API 변환 → Zod → route 매핑을 **실제로** 거쳐 같은 결론이
 * 나는지 본다 — 명시 매핑(`mapHousesToEngine`)은 한 곳만 빠져도 값이 조용히 사라진다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as judgmentPOST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockResolvedValue(new Map()) };
});

import { POST as multiPOST } from "@/app/api/calc/transfer/multi/route";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

/** 명부 행 — UI가 실제로 만드는 모양(필수 boolean 포함 — 빠지면 ⑫가 400). */
const house = (acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

/** 판정 메뉴 폼 — 양도 주택 2015-01-01 · 혼인 2020-01-01 · 양도 2026-03-01 · 8억 · 먼저 양도. */
function judgmentForm(h: HouseEntry): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-03-01",
    contractTotalPrice: "800000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" }],
    houses: [h],
    marriageDate: "2020-01-01",
    isFirstTransferredInMerge: true,
  };
}

async function judge(h: HouseEntry) {
  const res = await judgmentPOST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ratelimit-bypass": "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(judgmentForm(h))),
    }),
  );
  const json = await res.json();
  return { status: res.status, judgment: json.data?.judgment };
}

describe("RC-1 판정 메뉴 — 폼 → route → 엔진", () => {
  it("[RC-1a] ④ 명부 행의 합가 전 보유 쪽을 본문에 싣는다", () => {
    const body = buildOneHouseExemptionApiBody(judgmentForm(house("2018-01-01", { mergeOrigin: "counterpart_side" })));
    const rows = body.houses as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.id === "h1")?.mergeOrigin).toBe("counterpart_side");
    // 양도 주택 행에는 싣지 않는다 — 늘 양도자 쪽이다
    expect(rows.find((r) => r.id === "selling")?.mergeOrigin).toBeUndefined();
  });

  it("[RC-1b] enum 밖 값(저장소 손상)은 싣지 않는다 — ⑫ 400으로 판정 전체가 막히지 않게", () => {
    const body = buildOneHouseExemptionApiBody(
      judgmentForm(house("2018-01-01", { mergeOrigin: "spouse" as unknown as HouseEntry["mergeOrigin"] })),
    );
    expect((body.houses as Array<Record<string, unknown>>).find((r) => r.id === "h1")).not.toHaveProperty(
      "mergeOrigin",
      "spouse",
    );
  });

  it("[RC-1c] V-3 제보성 사례 — 다른 주택을 혼인 후 취득하면 합가 비과세가 나지 않는다", async () => {
    const r = await judge(house("2022-06-01"));
    expect(r.status).toBe(200);
    expect(r.judgment.isExempt).toBe(false);
    expect(r.judgment.appliedExceptions.map((e: { id: string }) => e.id)).not.toContain("155-5-marriage-merge");
  });

  it("[RC-1d] 긍정 짝 — 혼인 전 배우자 쪽이면 합가 비과세", async () => {
    const r = await judge(house("2018-01-01", { mergeOrigin: "counterpart_side" }));
    expect(r.judgment.isExempt).toBe(true);
    expect(r.judgment.requirementReview.scheme).toBe("155-4-5-merge");
  });

  it("[RC-1e] ⑭ 값이 엔진까지 간다 — 같은 날짜라도 양도자 쪽이면 불성립", async () => {
    const r = await judge(house("2018-01-01", { mergeOrigin: "seller_side" }));
    expect(r.status).toBe(200);
    expect(r.judgment.isExempt).toBe(false);
  });
});

describe("RC-2 계산기(다건 route) — 날짜 검증은 계산기에도 적용된다 (Q-5)", () => {
  /** 계산기 폼 — 세대 2주택 선언 + 명부 1행 · 혼인 2020-01-01 · 양도 2026-03-01. */
  function calcForm(otherAcq: string) {
    const form = createDefaultTransferFormData();
    form.transferDate = "2026-03-01";
    form.contractTotalPrice = "500,000,000";
    form.householdHousingCount = "2";
    form.isOneHousehold = true;
    form.isRegulatedArea = false;
    form.residencePeriodMonths = "120";
    form.marriageDate = "2020-01-01";
    form.isFirstTransferredInMerge = true;
    form.houses = [house(otherAcq)];
    form.assets[0] = {
      ...form.assets[0],
      assetKind: "housing",
      acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "300,000,000",
    };
    return form;
  }

  async function calc(otherAcq: string) {
    const res = await multiPOST(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ratelimit-bypass": "1" },
        body: JSON.stringify({
          taxYear: 2026,
          properties: [{ propertyId: "p1", propertyLabel: "건1", ...buildPropertyPayload(calcForm(otherAcq)) }],
        }),
      }),
    );
    const json = await res.json();
    return { status: res.status, prop: json.data?.properties?.[0] };
  }

  it("[RC-2a] 다른 주택을 혼인 후 취득 → 계산기도 합가 비과세를 적용하지 않는다", async () => {
    const r = await calc("2022-06-01");
    expect(r.status).toBe(200);
    expect(r.prop.isExempt).toBe(false);
  });

  it("[RC-2b] 긍정 짝 — 혼인 전 취득(소유 쪽 칸이 없는 계산기 = 판정 안 함)이면 종전대로 비과세", async () => {
    const r = await calc("2018-01-01");
    expect(r.status).toBe(200);
    expect(r.prop.isExempt).toBe(true);
  });
});

/**
 * anchor: 취득세 보유주택 목록 → 주택 수 자동 산정 — **UI가 만드는 실제 payload로 route 관통** (F1)
 *
 * 1세대1주택 리뷰(docs/reviews/one-house-exemption-review-2026-09.md) OH-02·03·24·25·26·27·52.
 * 종전 anchor는 UI가 만들지 않는 값(`propertyType: "apartment"`)을 픽스처로 써서 OH-02(항상 400)를
 * 가렸다. 여기서는 **`createOwnedHouseInfo`(Step2 「+ 보유 주택 추가」)가 만드는 행**을 그대로 쓰고
 * `buildAcquisitionTaxBody`(④) → POST(⑫ Zod → ⑭ route) → 엔진까지 태워 세액을 단언한다.
 *
 * 법령(KoreanLaw MCP·법제처 DRF 부칙 원문 확인, 2026-09-26):
 *  - 지방세법 시행령 §28의4①(MST 288831) — 입주권·분양권으로 취득하는 주택은 **그 권리**의 취득일
 *    기준으로 주택 수 산정. 「가장 빠른 날」은 1세대 내 **동일한 주택분양권**의 취득일이 둘 이상일 때만.
 *  - §28의4⑤ — 지분이 가장 큰 상속인이 둘 이상이면 1. 거주하는 사람 2. 나이가 가장 많은 사람.
 *  - §28의4⑥3호 — 상속개시일부터 5년이 지나지 않은 주택·조합원입주권·주택분양권·오피스텔 제외.
 *  - 지방세법 부칙(법률 제17473호) 제3조 — §13의3 2~4호는 2020.8.12. 이후 입주권·분양권·오피스텔을
 *    취득하는 분부터 적용. 제7조 — 그 전에 매매계약(오피스텔 분양계약 포함)을 체결한 경우 적용하지 않음.
 *  - 지방세법 시행령 부칙(대통령령 제30939호) 제2조 — §28의4① 후단은 2020.8.12. 이후 권리 취득분부터.
 *    제3조 — 2020.8.12. 전 상속 취득분은 이 영 시행 이후 5년 동안 소유주택 수에서 제외.
 *  - 지방세법 시행령 부칙(대통령령 제35477호) 제2조 — §28의2 1호·§28의4⑥1호가목 개정규정(수도권 외 2억)은
 *    2025.1.2. 이후 취득하는 주택부터. 그 전은 전국 1억(MST 269119 §28의2 1호).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/acquisition/route";
import { buildAcquisitionTaxBody } from "@/lib/calc/acquisition-tax-api";
import {
  INITIAL_FORM,
  createOwnedHouseInfo,
  type FormState,
  type OwnedHouseInfo,
} from "@/components/calc/acquisition/shared";

beforeEach(() => vi.clearAllMocks());

interface Res {
  appliedRate: number;
  acquisitionTax: number;
  houseCountDetail?: {
    effectiveCount: number;
    referenceDate: string;
    excludedDetails: { reason: string; assetId?: string }[];
    warnings: string[];
  };
}

async function postRaw(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: Res; error?: unknown } };
}

async function calc(form: FormState): Promise<Res> {
  const { status, json } = await postRaw(buildAcquisitionTaxBody(form));
  expect(status, JSON.stringify(json.error)).toBe(200);
  return json.data!;
}

/** 조정대상지역·수도권 5억 매매 — 1주택 1% / 2주택 8% / 3주택 12% */
function baseForm(over: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    reportedPrice: "500000000",
    standardValue: "500000000",
    isRegulatedArea: true,
    isMetropolitanRegion: true,
    balancePaymentDate: "2024-06-01",
    houseCountAfter: "1",
    ...over,
  };
}

/** Step2 「+ 보유 주택 추가」가 만드는 행 그대로 + 필요한 칸만 채운다 */
function row(id: string, over: Partial<OwnedHouseInfo>): OwnedHouseInfo {
  return { ...createOwnedHouseInfo(id), ...over };
}

const HOUSE_5E = (id: string, over: Partial<OwnedHouseInfo> = {}) =>
  row(id, { standardValue: "500000000", acquisitionDate: "2015-01-01", isMetropolitanRegion: true, ...over });

// ============================================================
// OH-02 — '주택' 행이 Zod enum 불일치로 항상 400
// ============================================================

describe("OH-02 — UI가 만드는 '주택' 행이 route를 통과한다", () => {
  it("F1-02a: 🔴 기본 행(propertyType 'housing') 1건 → 200 · 2주택 8% 40,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [HOUSE_5E("h1")] }));
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("F1-02b: 대조군 — 목록이 없으면 1주택 1% 5,000,000", async () => {
    const r = await calc(baseForm());
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(5_000_000);
  });
});

// ============================================================
// OH-03 — 2020.8.12. 전 취득·계약 입주권·분양권·오피스텔 (법률 제17473호 부칙 제3조·제7조)
// ============================================================

describe("OH-03 — 2020.8.12. 전 취득·계약한 입주권·분양권·오피스텔은 주택 수에 넣지 않는다", () => {
  const office = (acq: string, contract = "") =>
    row("o1", { propertyType: "officetel", standardValue: "150000000", acquisitionDate: acq, contractDate: contract });
  const right = (acq: string, contract = "") =>
    row("r1", { propertyType: "subscription_right", acquisitionDate: acq, contractDate: contract });

  it("F1-03a: 🔴 오피스텔 2019-05-01 취득 → 제외 · 1주택 1% 5,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [office("2019-05-01")] }));
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("F1-03b: 🔴 오피스텔 2020-08-11 취득(시행 전날) → 제외 · 1%", async () => {
    const r = await calc(baseForm({ ownedHouses: [office("2020-08-11")] }));
    expect(r.appliedRate).toBe(0.01);
  });

  it("F1-03c: 긍정 짝 — 오피스텔 2020-08-12 취득(시행일) → 산입 · 2주택 8%", async () => {
    const r = await calc(baseForm({ ownedHouses: [office("2020-08-12")] }));
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-03d: 🔴 오피스텔 2021 취득이라도 분양계약 2020-08-11 → 제외(부칙 제7조) · 1%", async () => {
    const r = await calc(baseForm({ ownedHouses: [office("2021-03-01", "2020-08-11")] }));
    expect(r.appliedRate).toBe(0.01);
  });

  it("F1-03e: 긍정 짝 — 분양계약 2020-08-12 → 산입 · 8%", async () => {
    const r = await calc(baseForm({ ownedHouses: [office("2021-03-01", "2020-08-12")] }));
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-03f: 🔴 주택분양권 2019-05-01 취득 → 제외 · 1% 5,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [right("2019-05-01")] }));
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("F1-03g: 긍정 짝 — 주택분양권 2020-08-12 취득 → 산입 · 8% 40,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [right("2020-08-12")] }));
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("F1-03h: 주택 행은 2020.8.12. 전 취득이어도 산입(부칙은 §13의3 2~4호만) · 8%", async () => {
    const r = await calc(baseForm({ ownedHouses: [HOUSE_5E("h1", { acquisitionDate: "2019-05-01" })] }));
    expect(r.appliedRate).toBe(0.08);
  });
});

// ============================================================
// OH-24 — 입주권·분양권 행의 「상속 취득」이 ④에서 버려짐
// ============================================================

describe("OH-24 — 상속 입주권·분양권 5년 미경과 제외(§28의4⑥3호)가 route에 닿는다", () => {
  const inheritedRight = (inherited: boolean) =>
    row("r1", {
      propertyType: "right",
      acquisitionDate: "2023-03-01",
      isInherited: inherited,
      inheritanceDate: inherited ? "2023-03-01" : "",
    });

  it("F1-24a: 🔴 상속 입주권(2023-03-01 상속) → 제외 · 1주택 1% 5,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [inheritedRight(true)] }));
    expect(r.houseCountDetail?.excludedDetails.map((e) => e.reason)).toContain("inheritance_under_5yr");
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("F1-24b: 긍정 짝 — 상속 토글 OFF → 산입 · 2주택 8% 40,000,000", async () => {
    const r = await calc(baseForm({ ownedHouses: [inheritedRight(false)] }));
    expect(r.acquisitionTax).toBe(40_000_000);
  });
});

// ============================================================
// OH-25 · OH-26 — 분양권·입주권 소급 산정 기준일
// ============================================================

describe("OH-25 — 소급 기준일은 취득하는 주택을 낳은 그 권리의 취득일", () => {
  const form = baseForm({
    acquiredViaRight: true,
    rightAcquisitionDate: "2026-03-01",
    balancePaymentDate: "2026-09-01",
    ownedHouses: [
      // 무관한 다른 분양권 — 기준일을 끌어당기면 안 된다
      row("r-other", { propertyType: "subscription_right", acquisitionDate: "2021-01-01" }),
      // 2020-09-01 상속 오피스텔 — 2026-03-01 기준 5년 경과 → 산입
      row("o1", {
        propertyType: "officetel",
        standardValue: "200000000",
        acquisitionDate: "2020-09-01",
        isInherited: true,
        inheritanceDate: "2020-09-01",
      }),
    ],
  });

  it("F1-25a: 🔴 기준일 2026-03-01 · 3주택 12% 60,000,000", async () => {
    const r = await calc(form);
    expect(r.houseCountDetail?.referenceDate).toBe("2026-03-01");
    expect(r.houseCountDetail?.effectiveCount).toBe(3);
    expect(r.acquisitionTax).toBe(60_000_000);
  });

  it("F1-25b: 🔴 다른 권리의 취득일이 비면 기준일이 ''가 되지 않고 400으로 막힌다(침묵 fallback 금지)", async () => {
    const f = {
      ...form,
      ownedHouses: [row("r-other", { propertyType: "subscription_right", acquisitionDate: "" }), form.ownedHouses[1]],
    };
    const { status } = await postRaw(buildAcquisitionTaxBody(f));
    expect(status).toBe(400);
  });

  it("F1-25c: 🔴 소급 토글 ON인데 권리취득일이 비면 400", async () => {
    const { status } = await postRaw(buildAcquisitionTaxBody({ ...form, rightAcquisitionDate: "" }));
    expect(status).toBe(400);
  });
});

describe("OH-26 — 소급 산정 시 기준일 뒤에 취득한 자산은 세지 않는다", () => {
  const viaRight = (officeAcq: string) =>
    baseForm({
      acquiredViaRight: true,
      rightAcquisitionDate: "2021-03-01",
      balancePaymentDate: "2024-06-01",
      ownedHouses: [row("o1", { propertyType: "officetel", standardValue: "150000000", acquisitionDate: officeAcq })],
    });

  it("F1-26a: 🔴 기준일(2021-03-01) 뒤 2022-05-01 취득 오피스텔 → 제외 · 1% 5,000,000", async () => {
    const r = await calc(viaRight("2022-05-01"));
    expect(r.houseCountDetail?.excludedDetails.map((e) => e.reason)).toContain("acquired_after_reference_date");
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("F1-26b: 🔴 기준일 다음날(2021-03-02) 취득 → 제외 · 1%", async () => {
    const r = await calc(viaRight("2021-03-02"));
    expect(r.appliedRate).toBe(0.01);
  });

  it("F1-26c: 긍정 짝 — 기준일 전날(2021-02-28) 취득 → 산입 · 2주택 8% 40,000,000", async () => {
    const r = await calc(viaRight("2021-02-28"));
    expect(r.acquisitionTax).toBe(40_000_000);
  });

  it("F1-26d: 🔴 주택 행도 같다 — 기준일 뒤 취득 주택 제외 · 1%", async () => {
    const r = await calc({
      ...viaRight("2021-02-28"),
      ownedHouses: [HOUSE_5E("h1", { acquisitionDate: "2022-05-01" })],
    });
    expect(r.appliedRate).toBe(0.01);
  });

  it("F1-26e: 소급 아님(일반 매매) — 잔금일 전 취득 오피스텔은 산입 · 8%", async () => {
    const r = await calc({ ...viaRight("2022-05-01"), acquiredViaRight: false, rightAcquisitionDate: "" });
    expect(r.appliedRate).toBe(0.08);
  });
});

// ============================================================
// OH-27 — 수도권 외 2억 기준은 2025.1.2. 이후 취득 주택부터 (대통령령 제35477호 부칙 제2조)
// ============================================================

describe("OH-27 — 저가주택 한도 연혁(취득하는 주택의 취득일 기준)", () => {
  // 보유 측: 수도권 외 1.5억 보유주택 1채
  const heldNonMetro = (balance: string) =>
    baseForm({
      balancePaymentDate: balance,
      ownedHouses: [row("h1", { standardValue: "150000000", acquisitionDate: "2015-01-01", isMetropolitanRegion: false })],
    });

  it("F1-27a: 🔴 2025-01-01 취득 → 전국 1억 기준 → 1.5억 보유주택 산입 · 2주택 8%", async () => {
    const r = await calc(heldNonMetro("2025-01-01"));
    expect(r.houseCountDetail?.effectiveCount).toBe(2);
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-27b: 긍정 짝 — 2025-01-02 취득 → 수도권 외 2억 → 제외 · 1%", async () => {
    const r = await calc(heldNonMetro("2025-01-02"));
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.appliedRate).toBe(0.01);
  });

  // 형제 경로: 취득하는 주택 자체의 중과 배제(§28의2 1호) — 비조정·수도권 외 1.5억, 4주택
  const acquiredNonMetro = (balance: string) =>
    baseForm({
      reportedPrice: "150000000",
      standardValue: "150000000",
      wholeHouseStandardValue: "150000000",
      isRegulatedArea: false,
      isMetropolitanRegion: false,
      houseCountAfter: "4",
      balancePaymentDate: balance,
    });

  it("F1-27c: 🔴 2024-06-01 취득 → 저가 배제 없음 · 비조정 4주택 12% 18,000,000", async () => {
    const r = await calc(acquiredNonMetro("2024-06-01"));
    expect(r.appliedRate).toBe(0.12);
    expect(r.acquisitionTax).toBe(18_000_000);
  });

  it("F1-27d: 🔴 2025-01-01 취득(전날) → 12%", async () => {
    const r = await calc(acquiredNonMetro("2025-01-01"));
    expect(r.appliedRate).toBe(0.12);
  });

  it("F1-27e: 긍정 짝 — 2025-01-02 취득 → 수도권 외 2억 이하 중과 배제 · 1% 1,500,000", async () => {
    const r = await calc(acquiredNonMetro("2025-01-02"));
    expect(r.appliedRate).toBe(0.01);
    expect(r.acquisitionTax).toBe(1_500_000);
  });

  it("F1-27f: 🔴 기준은 잔금일이 아니라 §20 취득일 — 등기 2025-01-01·잔금 2025-01-02 → 취득일 2025-01-01 → 12%", async () => {
    const r = await calc({ ...acquiredNonMetro("2025-01-02"), registrationDate: "2025-01-01" });
    expect(r.appliedRate).toBe(0.12);
    expect(r.acquisitionTax).toBe(18_000_000);
  });

  // 부담부증여 유상분(§13의2①)도 같은 leaf — 비조정·수도권 외 1.5억, 4주택, 채무 1억
  const burdened = (balance: string) =>
    baseForm({
      acquisitionCause: "burdened_gift",
      reportedPrice: "",
      standardValue: "150000000",
      marketValue: "150000000",
      encumbrance: "100000000",
      wholeHouseStandardValue: "150000000",
      isRegulatedArea: false,
      isMetropolitanRegion: false,
      houseCountAfter: "4",
      giftRelation: "other",
      balancePaymentDate: balance,
    });

  it("F1-27g: 🔴 부담부증여 2025-01-01 → 유상분 1억 × 12% = 12,000,000 + 무상분 1,750,000", async () => {
    const r = await calc(burdened("2025-01-01"));
    expect(r.acquisitionTax).toBe(13_750_000);
  });

  it("F1-27h: 긍정 짝 — 부담부증여 2025-01-02 → 유상분 저가 배제 1% = 1,000,000 + 1,750,000", async () => {
    const r = await calc(burdened("2025-01-02"));
    expect(r.acquisitionTax).toBe(2_750_000);
  });
});

// ============================================================
// OH-52 — 공동상속 동순위(§28의4⑤)
// ============================================================

describe("OH-52 — 동순위 입력이 route에 닿아 거주자 → 최연장자 순으로 판정된다", () => {
  // 상속개시 2015-01-01(2020.8.12. 전) → 부칙 제30939호 제3조 특례는 2025-08-11까지.
  // 잔금 2026-01-02는 특례·5년이 모두 지나 §28의4⑤ 소유자 판정으로 간다.
  const inheritedHouse = (over: Partial<OwnedHouseInfo>) =>
    row("inh", {
      standardValue: "300000000",
      acquisitionDate: "2015-01-01",
      isMetropolitanRegion: true,
      isInherited: true,
      inheritanceDate: "2015-01-01",
      shareInInheritance: "0.5",
      maxShareInInheritors: "0.5",
      ...over,
    });
  const f = (over: Partial<OwnedHouseInfo>) =>
    baseForm({ balancePaymentDate: "2026-01-02", ownedHouses: [inheritedHouse(over)] });

  it("F1-52a: 🔴 동순위 + 다른 상속인이 거주 + 본인 비거주·최연장자 아님 → 제외 · 1% 5,000,000", async () => {
    const r = await calc(f({ tieInMaxShare: true, otherTiedHeirResides: true }));
    expect(r.houseCountDetail?.effectiveCount).toBe(1);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("F1-52b: 🔴 동순위 + 다른 상속인 거주 + 본인이 최연장자여도 → 제외(거주자 우선) · 1%", async () => {
    const r = await calc(f({ tieInMaxShare: true, otherTiedHeirResides: true, isOldest: true }));
    expect(r.appliedRate).toBe(0.01);
  });

  it("F1-52c: 긍정 짝 — 동순위 아님(단독 최대) → 산입 · 2주택 8%", async () => {
    const r = await calc(f({ tieInMaxShare: false }));
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-52d: 긍정 짝 — 동순위 + 본인 거주 → 산입 · 8%", async () => {
    const r = await calc(f({ tieInMaxShare: true, isResident: true }));
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-52e: 긍정 짝 — 동순위 + 아무도 거주 안 함 + 본인 최연장자 → 산입 · 8%", async () => {
    const r = await calc(f({ tieInMaxShare: true, isOldest: true }));
    expect(r.appliedRate).toBe(0.08);
  });

  it("F1-52f: 동순위 + 아무도 거주 안 함 + 최연장자 아님 → 제외 · 1%", async () => {
    const r = await calc(f({ tieInMaxShare: true }));
    expect(r.appliedRate).toBe(0.01);
  });
});

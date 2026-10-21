/**
 * 주택 split 파트 이월과세 P3 A(토지만 이월과세 §97의2① + 건물 매매·신축) — ⑧≡⑫ 격자 + ④ body 계약 (2026-10-20)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §4 · engine.design.md §1.2(A 행)·§6
 * 형식은 C 격자(`transfer-split-part-carryover.c.parity-grid.test.ts`)와 같다 — 폼 → ④ body → ⑫ route, 같은 폼의 ⑧(단계 0·1)을 나란히.
 * 기대의 정본은 엔진 leaf가 ⑫ 400으로 내는 칸이다(`feedback_fe8_vs_12_parity_grid`). 두 호스트(매매·신축)를 같은 셀로 돈다.
 *
 * 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) leaf 소관 ⑧ 차단 ⇔ ⑫ 400 · (C) ⑧ 전용 사유는 ⑧ 차단 · (D) 화면에 없는 잔재는 세액을 바꾸지 않는다.
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { effectiveLandAcquisitionCause, effectiveLandCarryover, landCauseDisplay } from "@/lib/calc/transfer-land-part-cause";
import { landRebuildHost } from "@/lib/calc/transfer-land-rebuild";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf } from "./_helpers/split-carryover-c-form";
import { aAsset, aForm, withLandCarry, A_LAND_CARRYOVER, type AHost } from "./_helpers/split-carryover-a-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Cell = { name: string; make: (h: AHost) => TransferFormData; leafKey?: string; strictOnly?: boolean; bothWays?: boolean };

const companion = (): AssetForm =>
  ({
    ...makeDefaultAsset(2),
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "400,000,000",
  }) as unknown as AssetForm;

const CELLS: Cell[] = [
  // ── leaf 소관 ──
  // P5 — 1세대1주택 겹침은 막지 않는다(S9 삭제 → 해결자의 §97의2②2호 판정)
  { name: "1세대1주택 해당(주택) — 계산한다", make: (h) => aForm(h, { isOneHousehold: true }) },
  { name: "1세대 + 미등기", make: (h) => aForm(h, { isOneHousehold: true, isUnregistered: true }) },
  { name: "F-6 토지 증여자 취득일 > 증여일", make: (h) => aForm(h, {}, withLandCarry(h, { donorAcquisitionDate: "2023-03-02" })), leafKey: "landCarryoverPart.donorAcquisitionDate" },
  { name: "증여자 취득일 = 증여일(허용)", make: (h) => aForm(h, {}, withLandCarry(h, { donorAcquisitionDate: "2023-03-01" })) },
  { name: "평가액 > 과세가액", make: (h) => aForm(h, {}, withLandCarry(h, { giftTaxBase: "290,000,000" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "과세가액 비움", make: (h) => aForm(h, {}, withLandCarry(h, { giftTaxBase: "" })), leafKey: "carryoverGiftEvent.giftTaxBase" },
  { name: "산출세액 비움(0 허용)", make: (h) => aForm(h, {}, withLandCarry(h, { giftTaxCalculated: "" })) },
  { name: "증여자 취득가액 비움", make: (h) => aForm(h, {}, withLandCarry(h, { donorAcquisitionPrice: "" })), leafKey: "landCarryoverPart.donorAcquisitionPrice" },
  { name: "증여자 취득일 비움", make: (h) => aForm(h, {}, withLandCarry(h, { donorAcquisitionDate: "" })), leafKey: "landCarryoverPart.donorAcquisitionDate" },
  { name: "토지 증여 신고가액 비움(S7)", make: (h) => aForm(h, {}, aAsset(h, { landAcquisitionPrice: "" })), leafKey: "landAcquisitionPrice" },
  { name: "증여 등기접수일 비움", make: (h) => aForm(h, {}, withLandCarry(h, { giftRegistryDate: "" })), bothWays: true },
  { name: "구조: 소유자 분리(건물만 소유)", make: (h) => aForm(h, {}, aAsset(h, { selfOwns: "building_only" })), bothWays: true },
  { name: "구조: 부담부증여 양도", make: (h) => aForm(h, {}, aAsset(h, { transferType: "burdened_gift" })), bothWays: true },
  // ── ⑧ 전용(⑫보다 엄격) ──
  { name: "토지 증여일 = 건물 취득일(Q-4 같은 날)", make: (h) => aForm(h, {}, aAsset(h, { acquisitionDate: "2023-03-01", occupancyApprovalDate: h === "newConstruction" ? "2023-03-01" : undefined })), strictOnly: true },
  { name: "등기접수일 ≥ 양도일", make: (h) => aForm(h, {}, withLandCarry(h, { giftRegistryDate: "2025-06-30" })), strictOnly: true },
  { name: "관계 그 외", make: (h) => aForm(h, {}, withLandCarry(h, { donorRelation: "other" })), strictOnly: true },
  { name: "사망 선언 + 관계 미선택", make: (h) => aForm(h, {}, withLandCarry(h, { donorDeceased: true, donorRelation: "" })), strictOnly: true },
  { name: "가업상속 선언", make: (h) => aForm(h, {}, withLandCarry(h, { exclusionDeclared: { ...CARRYOVER_DEFAULTS.exclusionDeclared, isFamilyBusinessInheritedAsset: true } })), strictOnly: true },
  { name: "보이는 이전 형식 필요경비(directExpenses)", make: (h) => aForm(h, {}, aAsset(h, { directExpenses: "5,000,000" })), strictOnly: true },
  { name: "축 A: 구분양도인데 양도가액·기준시가 근거 없음", make: (h) => aForm(h, {}, aAsset(h, { landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" })), strictOnly: true },
  // ── 잔재(D) — 통과하고 세액이 기준과 같아야 한다 ──
  { name: "잔재: 토지 취득일 칸 옛 값(등기접수일과 다름)", make: (h) => aForm(h, {}, aAsset(h, { landAcquisitionDate: "2010-01-01" })) },
  { name: "잔재: 토지 방식 라디오 estimated", make: (h) => aForm(h, {}, aAsset(h, { landAcqMode: "estimated" })) },
  { name: "잔재: PHD 자동 ON", make: (h) => aForm(h, {}, aAsset(h, { usePreHousingDisclosure: true })) },
  { name: "잔재: 피상속인 취득일(상속 원인 때 입력)", make: (h) => aForm(h, {}, aAsset(h, { landDecedentAcquisitionDate: "1990-01-01" })) },
  { name: "잔재: 구주택 멸실·신축 통산 토글", make: (h) => aForm(h, {}, aAsset(h, { landRebuildEnabled: true })) },
];

for (const host of ["purchase", "newConstruction"] as const) {
  describe(`P3 A × ${host} — ⑧≡⑫ 격자`, () => {
    const baseTax = (async () => (await routeOf(POST, await bodyOf(aForm(host)))).json?.data?.result?.determinedTax as number)();

    it("기준 셀: ⑧ 통과 · ④ 사건 + 토지 파트만 · 토지 취득일 = 증여 등기접수일 · ⑫ 200 · 결정세액 172,260,000(엔진 anchor SPCO-T1)", async () => {
      const form = aForm(host);
      expect(issuesOf(form)).toEqual([]);
      const body = await bodyOf(form);
      expect(body.carryoverGiftEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, donorRelation: "lineal" });
      expect(body.landCarryoverPart).toEqual({ donorAcquisitionDate: "2000-01-01", donorAcquisitionPrice: 100_000_000 });
      expect("buildingCarryoverPart" in body).toBe(false);
      expect(body.landAcquisitionCause).toBe("carryover_gift");
      expect(body.acquisitionCause).toBe(host);
      expect(body.landAcquisitionDate).toBe("2023-03-01");
      expect(body.acquisitionDate).toBe("2021-03-01");
      expect(body.isSeparateAcquisition).toBe(true);
      expect(body.landAcqMode).toBe("actual");
      expect(body.buildingAcquisitionPrice).toBe(400_000_000);
      expect("carryoverTaxation" in body).toBe(false);
      expect("landDecedentAcquisitionDate" in body).toBe(false);
      expect(body.expenses).toBe(0);
      const r = await routeOf(POST, body);
      expect(r.status, JSON.stringify(r.json.error ?? {})).toBe(200);
      expect(r.json.data.result.determinedTax).toBe(172_260_000);
      expect(r.json.data.result.splitDetail.land.carryover.judgment).toBe("applied");
      expect(r.json.data.result.splitDetail.building.carryover).toBeUndefined();
    });

    for (const cell of CELLS) {
      it(cell.name, async () => {
        const form = cell.make(host);
        const issues = issuesOf(form);
        const r = await routeOf(POST, await bodyOf(form));
        const keys = Object.keys(r.fieldErrors);
        const blocked8 = issues.length > 0;
        if (!blocked8) expect(r.status, `⑧ 통과인데 ⑫ ${r.status} ${JSON.stringify(r.fieldErrors)}`).toBe(200);
        if (cell.leafKey) {
          expect(blocked8, `⑧ 차단 기대(${cell.leafKey})`).toBe(true);
          expect(keys.some((k) => k.includes(cell.leafKey!)), `⑫ 칸 ${cell.leafKey} ← ${JSON.stringify(keys)}`).toBe(true);
        }
        if (cell.bothWays) expect(blocked8, `⑧ ${JSON.stringify(issues.map((i) => i.field))} ↔ ⑫ ${r.status}`).toBe(r.status === 400);
        if (cell.strictOnly) expect(blocked8).toBe(true);
        if (cell.name.startsWith("잔재:")) {
          expect(blocked8, JSON.stringify(issues)).toBe(false);
          expect(r.json.data.result.determinedTax).toBe(await baseTax);
        }
      });
    }

    it("⑧ 앵커 — 화면 칸으로 이동: 등기접수일·증여자 취득일·과세가액·관계는 landCarryover.*, 구조(소유자 분리)는 토지 취득 원인", () => {
      const field = (f: TransferFormData) => issuesOf(f)[0]?.field;
      expect(field(aForm(host, {}, withLandCarry(host, { giftRegistryDate: "" })))).toBe("landCarryover.giftRegistryDate");
      expect(field(aForm(host, {}, withLandCarry(host, { donorAcquisitionDate: "" })))).toBe("landCarryover.donorAcquisitionDate");
      expect(field(aForm(host, {}, withLandCarry(host, { donorAcquisitionPrice: "" })))).toBe("landCarryover.donorAcquisitionPrice");
      expect(field(aForm(host, {}, withLandCarry(host, { giftTaxBase: "" })))).toBe("landCarryover.giftTaxBase");
      expect(field(aForm(host, {}, withLandCarry(host, { donorDeceased: true, donorRelation: "" })))).toBe("landCarryover.donorRelation");
      expect(field(aForm(host, {}, withLandCarry(host, { donorRelation: "other" })))).toBe("landAcquisitionCause");
      expect(field(aForm(host, {}, aAsset(host, { landAcquisitionPrice: "" })))).toBe("landAcquisitionPrice");
      expect(field(aForm(host, {}, aAsset(host, { selfOwns: "building_only" })))).toBe("landAcquisitionCause");
    });

    it("P5 — 1세대1주택이어도 자산 단계(0)·보유 상황 단계(1) 모두 막지 않는다(S9 삭제 · ②2호는 엔진이 판정)", () => {
      const form = aForm(host, { isOneHousehold: true });
      expect(collectStepIssues(0, form)).toEqual([]);
      expect(collectStepIssues(1, form).find((i) => i.field === "isOneHousehold")).toBeUndefined();
    });

    it("S2′ 함께 양도 자산 1건 — 첫 자산 A를 ⑧·⑫가 같이 막는다(앵커 토지 취득 원인)", async () => {
      const form = aForm(host, { assets: [aAsset(host), companion()], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
      expect(issuesOf(form).some((i) => i.field === "landAcquisitionCause")).toBe(true);
      const r = await routeOf(POST, await bodyOf(form));
      expect(r.status).toBe(400);
      expect(Object.keys(r.fieldErrors).some((k) => k.includes("landCarryoverPart"))).toBe(true);
    });

    it("두 번째 자산(컴패니언)의 A — ⑧이 맨 앞에서 막고(입력을 다 채우기 전) ④는 그 자산의 파트 키를 싣지 않는다", async () => {
      const form = aForm(host, { assets: [companion(), aAsset(host, { assetId: "a2" })], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
      const empty = aForm(host, { assets: [companion(), withLandCarry(host, { giftRegistryDate: "", donorAcquisitionDate: "" })], contractTotalPrice: "1600000000", bundledSaleMode: "actual" });
      for (const f of [form, empty]) {
        const i = issuesOf(f).find((x) => x.field === "landAcquisitionCause");
        expect(i?.message).toContain("함께 양도 2번째 이후 자산");
      }
      const body = await bodyOf(form);
      expect(JSON.stringify(body.companionAssets ?? [])).not.toContain("landCarryoverPart");
      expect("landCarryoverPart" in body).toBe(false);
    });

    it("다건 — ⑧ 지원 모드 아님(단건 전용 문구) · 우회 시 multi route가 400(strip 금지)", async () => {
      expect(validateMultiSupportedMode(aForm(host) as never)).toBe(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE);
      const payload = buildPropertyPayload(aForm(host) as never) as Record<string, unknown>;
      expect(payload.landCarryoverPart).toBeTruthy();
      const res = await POST_MULTI(
        new NextRequest("http://localhost/api/calc/transfer/multi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...JSON.parse(JSON.stringify(payload)) }], annualBasicDeductionUsed: 0 }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("숨은 이전 형식 필요경비(양도비 입력으로 칸이 숨음) — ⑧ 통과 · ④ expenses 0 · 양도비만 입력한 것과 세액 동일(엔진 S8)", async () => {
      const hidden = aForm(host, {}, aAsset(host, { directExpenses: "5,000,000", transferExpense: "1,000,000" }));
      const ref = aForm(host, {}, aAsset(host, { transferExpense: "1,000,000" }));
      expect(issuesOf(hidden)).toEqual([]);
      const b = await bodyOf(hidden);
      expect(b.expenses).toBe(0);
      const [rh, rr] = [await routeOf(POST, b), await routeOf(POST, await bodyOf(ref))];
      expect(rh.status, JSON.stringify(rh.fieldErrors)).toBe(200);
      expect(rh.json.data.result.determinedTax).toBe(rr.json.data.result.determinedTax);
    });

    it("부정형 짝 — 원인 상속·증여·토글 OFF·호스트 불일치면 A 키를 하나도 싣지 않는다(값은 보존)", async () => {
      for (const patch of [
        { landAcquisitionCause: "gift" },
        { landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1999-01-01" },
        { landAcquisitionCause: "", landCauseHost: "" },
        { landCauseHost: host === "purchase" ? "newConstruction" : "purchase" },
      ]) {
        const asset = aAsset(host, patch);
        expect(effectiveLandCarryover(asset), JSON.stringify(patch)).toBe(false);
        const body = await bodyOf(aForm(host, {}, asset));
        expect("carryoverGiftEvent" in body, JSON.stringify(patch)).toBe(false);
        expect("landCarryoverPart" in body, JSON.stringify(patch)).toBe(false);
        expect(asset.landCarryover).toEqual(A_LAND_CARRYOVER);
      }
    });
  });
}

describe("H-4 — 저장값이 술어를 통과하지 않는다(캐스트 제거)", () => {
  it("D1 술어는 상속·증여만 돌려준다 — 이월과세·매매·손상값은 \"\"", () => {
    for (const v of ["carryover_gift", "purchase", "foo", ""]) {
      expect(effectiveLandAcquisitionCause(aAsset("purchase", { landAcquisitionCause: v })), v).toBe("");
    }
    expect(effectiveLandAcquisitionCause(aAsset("purchase", { landAcquisitionCause: "gift" }))).toBe("gift");
  });
  it("손상값(\"foo\")은 A도 D1도 아니다 — ④는 원인 키를 싣지 않고 ⑤ 라벨 원인도 없음", async () => {
    const asset = aAsset("purchase", { landAcquisitionCause: "foo" });
    expect(landCauseDisplay(asset)).toBe("");
    const body = await bodyOf(aForm("purchase", {}, asset));
    expect(body.landAcquisitionCause).toBeUndefined();
    expect("carryoverGiftEvent" in body).toBe(false);
  });
});

describe("재건축 통산(구주택 멸실·신축) 호스트 — A는 열지 않는다", () => {
  it("매매 호스트 A → landRebuildHost null · 긍정 짝: 토지 원인 없이 취득일만 다른 매매는 «purchase»", () => {
    expect(landRebuildHost(aAsset("purchase"))).toBeNull();
    expect(landRebuildHost(aAsset("purchase", { landAcquisitionCause: "", landCauseHost: "" }))).toBe("purchase");
  });
});

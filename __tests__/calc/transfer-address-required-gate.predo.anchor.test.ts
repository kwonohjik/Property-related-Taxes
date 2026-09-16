/**
 * Pre-Do anchor — ⑧ 소재지·동·호 필수 게이트 (계획서 §4-1·§4-2 · Q-2·Q-3)
 *
 * 키가 물건을 유일 식별하려면 **식별자가 실제로 입력돼야** 한다. 지금은 소재지가
 * 어디서도 막히지 않는다(validate grep 0건 · 엔진 미emit).
 *
 * 🔑 **집합건물을 가르는 축을 새로 만들지 않는다** — `AddressSearch`가 이미 공동주택
 *    세대 목록을 조회하므로(`components/ui/address-search.tsx:203`) 「세대를 고를 수
 *    있었는데 안 골랐으면 차단」으로 간다. 토지·단독건물은 목록이 비어 자동 면제된다.
 *
 * ⚠️ N-1 — 신규 asset 필드는 **stale sessionStorage에서 `undefined`로 온다.**
 *    접근부 가드가 유일한 안전망이다 ([[feedback_new_asset_field_stale_sessionstorage_guard]]).
 *
 * 계획서: `docs/00-pm/business-key-property-identity.plan.md`
 */
import { describe, expect, it } from "vitest";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { isPropertyReady } from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

const ADDR_MSG = /소재지/;
const UNIT_MSG = /동·호|세대/;
const JIBUN = "서울 강남구 대치동 316";

/**
 * 🔑 **완성된 자산에서 출발한다.** 미완성 자산으로 재면 다른 필수 항목이 먼저 걸려
 *    「주소 때문에 막혔는지」를 가릴 수 없다 — G-4는 실제로 그래서 **구별력 0**이었다
 *    (착수 전인데도 `isPropertyReady`가 이미 false였다).
 *    [[feedback_mutation_zero_discrimination_is_not_proof]]
 */
function asset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    landNature: "standalone",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionDate: "2015-03-01",
    acquisitionCause: "purchase",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    directExpenses: "0",
    isNonBusinessLand: false,
    reductions: [],
    ...over,
  } as unknown as ReturnType<typeof makeDefaultAsset>;
}
function form(a: ReturnType<typeof makeDefaultAsset>) {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-06-03";
  f.contractTotalPrice = "1000000000";
  f.assets[0] = a;
  return f;
}

describe("⑧ 소재지 게이트", () => {
  // 🔴 G-1
  it("G-1: 소재지 미입력이면 차단된다", () => {
    const a = asset({ addressRoad: "", addressJibun: "" });
    expect(validateAssetEntry(a, 0, form(a)) ?? "").toMatch(ADDR_MSG);
  });

  // 🔴 G-2 — 집합건물(세대 목록이 있었다)인데 동·호 미선택
  it("G-2: 세대를 고를 수 있었는데 안 골랐으면 차단된다", () => {
    const a = asset({ addressJibun: JIBUN, hasAddressUnits: true, addressDong: "", addressHo: "" });
    expect(validateAssetEntry(a, 0, form(a)) ?? "").toMatch(UNIT_MSG);
  });

  // ✅ 유지 — 토지·단독건물은 면제 (완성 자산이므로 «오류 없음»까지 단언한다)
  it("G-3: 세대 목록이 없으면 동·호를 요구하지 않는다", () => {
    const a = asset({ addressJibun: JIBUN, hasAddressUnits: false, addressDong: "", addressHo: "" });
    expect(validateAssetEntry(a, 0, form(a))).toBeNull();
  });

  // ✅ 유지 — 동·호를 고른 집합건물은 통과
  it("G-3b: 세대를 골랐으면 통과한다", () => {
    const a = asset({ addressJibun: JIBUN, hasAddressUnits: true, addressDong: "101동", addressHo: "501" });
    expect(validateAssetEntry(a, 0, form(a))).toBeNull();
  });

  // 🔴 N-1 — stale sessionStorage: 플래그 자체가 없다
  it("N-1: 플래그가 없는(stale) 자산에서 크래시하지 않고 동·호를 요구하지 않는다", () => {
    const a = asset({ addressJibun: JIBUN });
    delete (a as unknown as Record<string, unknown>).hasAddressUnits;
    expect(() => validateAssetEntry(a, 0, form(a))).not.toThrow();
    expect(validateAssetEntry(a, 0, form(a))).toBeNull();
  });

  // 🔴 L-1 — Q-2 (가) 차단: 주소 없이 저장된 레거시 폼도 같은 술어로 막힌다
  it("L-1: 주소 없는 레거시 폼도 차단된다 (술어 단일)", () => {
    const a = asset({ addressRoad: "", addressJibun: "", acquisitionDate: "2020-01-01" });
    expect(validateAssetEntry(a, 0, form(a)) ?? "").toMatch(ADDR_MSG);
  });
});

describe("⑧ 다건 게이트 (Q-3 (가) 차단)", () => {
  function property(over: Record<string, unknown> = {}): PropertyItem {
    const a = asset(over);
    return {
      propertyId: "p1",
      propertyLabel: "양도 1번",
      completionPercent: 100,
      form: form(a),
    } as unknown as PropertyItem;
  }

  // ✅ 대조 — 나머지가 완성된 자산은 «지금» 준비 완료다 (G-4의 구별력 근거)
  it("G-4a: 주소를 포함해 전부 채운 자산은 준비 완료다", () => {
    expect(isPropertyReady(property({ addressJibun: JIBUN, hasAddressUnits: false }))).toBe(true);
  });

  // 🔴 G-4 — 주소«만» 비어 있다
  it("G-4: 다건에서도 소재지 미입력이면 준비 완료가 아니다", () => {
    expect(isPropertyReady(property({ addressRoad: "", addressJibun: "" }))).toBe(false);
  });
});

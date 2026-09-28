/**
 * L-12 — 「청산금분 양도일 현재 1세대1주택」 자기선언(`redevOneHouseAtSettlementSale`)의 배관
 *
 * ① 타입 · ② initial("") · ③ migrate(undefined → "") · ④ `buildRedevelopmentPayload`(축 밖이면 미송신) ·
 * 축 전환 정리(`clearOutOfScopeRedevPatch`). ⑫ Zod는 `transfer-tax-redevelopment-schema.plumbing`이,
 * 엔진 효과는 `settlement-l12-transfer-date.anchor.test.ts`(D-*)가 고정한다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import {
  clearOutOfScopeRedevPatch,
  settlementOneHouseAtSaleInScope,
} from "@/lib/calc/redev-field-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 완공APT + 청산금 수령 + 원조합원 + 동시신고 */
function simultaneous(o: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevSettlementDirection: "receive",
    redevIsSuccessorMember: "",
    redevReceiveOnlyMode: "",
    redevOneHouseAtSettlementSale: "yes",
    ...o,
  };
}

describe("L-12 · redevOneHouseAtSettlementSale 배관", () => {
  it("② 기본값은 미선택(\"\")", () => {
    expect(makeDefaultAsset(1).redevOneHouseAtSettlementSale).toBe("");
  });

  it("③ 구 저장분(필드 없음)은 \"\"로 채워진다", () => {
    const raw = { ...simultaneous() } as Record<string, unknown>;
    delete raw.redevOneHouseAtSettlementSale;
    expect(migrateAsset(raw).redevOneHouseAtSettlementSale).toBe("");
  });

  it("④ 동시신고 축이면 yes → true · no → false · \"\" → undefined", () => {
    expect(buildRedevelopmentPayload(simultaneous()).oneHouseAtSettlementSale).toBe(true);
    expect(
      buildRedevelopmentPayload(simultaneous({ redevOneHouseAtSettlementSale: "no" })).oneHouseAtSettlementSale,
    ).toBe(false);
    expect(
      buildRedevelopmentPayload(simultaneous({ redevOneHouseAtSettlementSale: "" })).oneHouseAtSettlementSale,
    ).toBeUndefined();
  });

  it.each([
    ["단독신고", { redevReceiveOnlyMode: "yes" as const }],
    ["청산금 납부", { redevSettlementDirection: "pay" as const }],
    ["승계조합원", { redevIsSuccessorMember: "yes" as const }],
    ["입주권", { assetKind: "right_to_move_in" as const, redevSubject: "right" as const }],
  ])("🔑 ④ stale 가드 — %s 축에서는 남은 값을 보내지 않는다", (_n, o) => {
    const a = simultaneous(o as Partial<AssetForm>);
    expect(settlementOneHouseAtSaleInScope(a)).toBe(false);
    expect(buildRedevelopmentPayload(a).oneHouseAtSettlementSale).toBeUndefined();
  });

  it("축 전환 정리 — 단독신고로 바꾸면 값이 비워진다 · 축 안이면 그대로", () => {
    expect(clearOutOfScopeRedevPatch(simultaneous({ redevReceiveOnlyMode: "yes" })).redevOneHouseAtSettlementSale).toBe("");
    expect(clearOutOfScopeRedevPatch(simultaneous())).not.toHaveProperty("redevOneHouseAtSettlementSale");
  });

  it("마이그레이션도 같은 정리를 한다 — 축 밖 저장값은 재수화 시 비워진다", () => {
    expect(migrateAsset(simultaneous({ redevReceiveOnlyMode: "yes" })).redevOneHouseAtSettlementSale).toBe("");
    expect(migrateAsset(simultaneous()).redevOneHouseAtSettlementSale).toBe("yes");
  });
});

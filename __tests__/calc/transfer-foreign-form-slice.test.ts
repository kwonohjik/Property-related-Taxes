/**
 * 국외 부동산 U1 — ①②③ 폼 슬라이스(타입·initial·normalize) · 기본값 3중 패턴(FRE-6·FRE-7)
 */
import { describe, it, expect } from "vitest";
import {
  FOREIGN_ASSET_KIND_DEFAULT,
  FOREIGN_RE_INITIAL,
  FOREIGN_TAX_METHOD_DEFAULT,
  makeDefaultForeignAsset,
  normalizeForeignRealEstate,
} from "@/lib/stores/calc-wizard-form-foreign";
import { createDefaultTransferFormData, migratePersistedTransferForm } from "@/lib/stores/calc-wizard-store";
import { buildForeignRealEstateBody } from "@/lib/calc/transfer-foreign-body";
import { collectForeignIssues } from "@/lib/calc/transfer-tax-validate-foreign";
import { isForeignRealEstateForm, isForeignResidenceBoundaryAmbiguous, isForeignResidenceUnderMin } from "@/lib/calc/transfer-foreign-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { foreignForm, k1Asset } from "./_foreign-form-fixture";

describe("② initial — 신규 폼·신규 카드", () => {
  it("기본은 국내 · 국외 카드 1건 · 외국납부세액 꺼짐 · 처리 방법 세액공제 · 종류 토지", () => {
    const f = createDefaultTransferFormData();
    expect(f.assetLocation).toBe("domestic");
    expect(isForeignRealEstateForm(f)).toBe(false);
    expect(f.foreignAssets).toHaveLength(1);
    expect(f.foreignAssets[0].kind).toBe("land");
    expect(f.foreignAssets[0].currency).toBe("USD");
    expect(f.foreignTaxEnabled).toBe(false);
    expect(f.foreignTaxMethod).toBe("credit");
    expect(f.foreignResidenceYears).toBe("");
  });

  it("createDefaultTransferFormData는 결정적이다 — 호출마다 같은 기본값(폼 초기값 비교·이력 해시가 흔들리지 않는다)", () => {
    const a = createDefaultTransferFormData();
    const b = createDefaultTransferFormData();
    expect(a.foreignAssets).toEqual(b.foreignAssets);
  });
});

describe("③ normalize — 구 세션·깨진 값", () => {
  it("FRE-6: 비배열 rows는 []로, 카드 필드 누락은 기본값으로", () => {
    const raw = {
      ...createDefaultTransferFormData(),
      assetLocation: "foreign",
      foreignAssets: [{ id: "x", capitalRows: "oops", costRows: null, taxRows: [{ date: 3, amountForeign: "1" }] }],
    };
    const f = normalizeForeignRealEstate(raw as unknown as TransferFormData);
    expect(f.foreignAssets[0].id).toBe("x");
    expect(f.foreignAssets[0].capitalRows).toEqual([]);
    expect(f.foreignAssets[0].costRows).toEqual([]);
    expect(f.foreignAssets[0].taxRows).toEqual([{ date: "", amountForeign: "1", exchangeRate: "" }]);
    expect(f.foreignAssets[0].kind).toBe(FOREIGN_ASSET_KIND_DEFAULT);
    expect(f.foreignAssets[0].currency).toBe("USD");
  });

  it("FRE-7: 깨진 enum은 initial과 같은 기본값 — 종류 land · 방법 credit · 소재 domestic", () => {
    const f = normalizeForeignRealEstate({
      ...createDefaultTransferFormData(),
      assetLocation: "mars",
      foreignTaxMethod: "weird",
      foreignAssets: [{ kind: "castle" }],
    } as unknown as TransferFormData);
    expect(f.assetLocation).toBe("domestic");
    expect(f.foreignTaxMethod).toBe(FOREIGN_TAX_METHOD_DEFAULT);
    expect(f.foreignAssets[0].kind).toBe(FOREIGN_ASSET_KIND_DEFAULT);
    expect(FOREIGN_RE_INITIAL.foreignTaxMethod).toBe(FOREIGN_TAX_METHOD_DEFAULT);
    expect(FOREIGN_RE_INITIAL.foreignAssets[0].kind).toBe(FOREIGN_ASSET_KIND_DEFAULT);
  });

  it("국외 카드가 비어 있으면(필드 없음·빈 배열) 빈 카드 1건을 둔다", () => {
    expect(normalizeForeignRealEstate({ ...createDefaultTransferFormData(), foreignAssets: [] } as unknown as TransferFormData).foreignAssets).toHaveLength(1);
    const legacy = { ...createDefaultTransferFormData() } as Record<string, unknown>;
    delete legacy.foreignAssets;
    delete legacy.assetLocation;
    const f = normalizeForeignRealEstate(legacy as unknown as TransferFormData);
    expect(f.foreignAssets).toHaveLength(1);
    expect(f.assetLocation).toBe("domestic");
  });

  it("migratePersistedTransferForm(sessionStorage·다건 자산 폼 공통 경로)이 국외 슬라이스를 보정한다 — 국외 입력은 보존", () => {
    const saved = foreignForm({ foreignTaxEnabled: true, foreignTaxMethod: "expense" });
    const roundTrip = migratePersistedTransferForm(JSON.parse(JSON.stringify(saved)));
    expect(roundTrip.assetLocation).toBe("foreign");
    expect(roundTrip.foreignAssets[0].transferAmount).toBe("900000");
    expect(roundTrip.foreignTaxMethod).toBe("expense");
    // 국내 assets[0]는 그대로(국내↔국외 왕복에서 국내 입력이 사라지지 않는다 — D-4)
    expect(roundTrip.assets).toHaveLength(1);

    // 국외 필드가 없던 옛 세션 — 국내 폼으로 열린다
    const old = JSON.parse(JSON.stringify(createDefaultTransferFormData())) as Record<string, unknown>;
    delete old.assetLocation;
    delete old.foreignAssets;
    delete old.foreignResidenceYears;
    const migrated = migratePersistedTransferForm(old);
    expect(migrated.assetLocation).toBe("domestic");
    expect(migrated.foreignAssets).toHaveLength(1);
  });
});

describe("기본값 3중 패턴 — 빌더·⑧이 initial과 같은 값을 쓴다", () => {
  it("종류가 비어도 빌더는 land, 방법이 비어도 credit — ⑧도 그 값으로 검증(차단하지 않는다)", () => {
    const form = foreignForm({ foreignTaxEnabled: true, foreignTaxMethod: "" as never }, [
      k1Asset({ kind: "" as never, taxRows: [{ date: "2026-07-10", amountForeign: "1000", exchangeRate: "1100" }] }),
    ]);
    const { body } = buildForeignRealEstateBody(form);
    expect(body.assets[0].kind).toBe("land");
    expect(body.foreignTax?.method).toBe("credit");
    expect(collectForeignIssues(form)).toEqual([]);
  });

  it("외국납부세액 토글이 꺼지면 숨은 납부 내역은 body·검증에 들어가지 않는다 (D-4)", () => {
    const hidden = [{ date: "", amountForeign: "", exchangeRate: "" }];
    const form = foreignForm({ foreignTaxEnabled: false }, [k1Asset({ taxRows: hidden })]);
    expect(buildForeignRealEstateBody(form).body.foreignTax).toBeUndefined();
    expect(collectForeignIssues(form)).toEqual([]);
  });
});

describe("거주 연수 술어", () => {
  it("5년 미만만 경고 · 빈 값·잘못된 값은 미입력(0년으로 읽지 않는다)", () => {
    expect(isForeignResidenceUnderMin("4")).toBe(true);
    expect(isForeignResidenceUnderMin("0")).toBe(true);
    expect(isForeignResidenceUnderMin("5")).toBe(false);
    expect(isForeignResidenceUnderMin("")).toBe(false);
    expect(isForeignResidenceUnderMin("abc")).toBe(false);
  });

  it("C-2 한계 — 정확히 5년 + 양도일이 서로 다른 자산이 함께 있을 때만 «확인 필요»", () => {
    expect(isForeignResidenceBoundaryAmbiguous("5", ["2026-07-10", "2026-03-05"])).toBe(true);
    expect(isForeignResidenceBoundaryAmbiguous("5", ["2026-07-10", "2026-07-10"])).toBe(false);
    expect(isForeignResidenceBoundaryAmbiguous("5", ["2026-07-10", ""])).toBe(false);
    expect(isForeignResidenceBoundaryAmbiguous("7", ["2026-07-10", "2026-03-05"])).toBe(false);
  });
});

describe("makeDefaultForeignAsset", () => {
  it("id는 호출마다 다르다", () => {
    expect(makeDefaultForeignAsset().id).not.toBe(makeDefaultForeignAsset().id);
  });
});

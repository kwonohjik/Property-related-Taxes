/**
 * anchor — 부담부증여 시가 모드 「매매사례가액(K-6)·감정가액(K-7)」 클라이언트 층 (①~④·⑧·⑬).
 *
 * 엔진·Zod는 PR-1(`77ac66c82`)이 anchor로 닫았다. 여기서 재는 것은 **화면 폼 → payload → 엔진 → validate**가
 * 한 줄로 이어지는가다 — 엔진 anchor는 input을 손으로 조립하므로 폼에서 그 값이 실리는지는 증명하지 않는다
 * (`feedback_api_trigger_without_input_path_is_noop`).
 *
 * 기준 사례: 교재 문제 20 상황 1 (토지, 채무 80M, 시가 400M, 증여일 기준시가 320M, 취득시 기준시가 180M,
 * 취득 당시 감정가 250M) → 취득가액 50,000,000 · 개산공제 1,080,000 · 양도차익 28,920,000.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { needsBgAcqStdPriceInput } from "@/lib/calc/burdened-gift-acq-std-price";
import { bgAcquisitionMethodPatch } from "@/components/calc/transfer/BurdenedGiftPresumedAcquisitionSection";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const TRANSFER_DATE = "2023-06-01";

/** 문제 20 상황 1 — 토지 + 시가 모드 + 감정가액. */
function land(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2018-10-20",
    acquisitionCause: "purchase",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "400,000,000",
    bgMortgageDebtAmount: "80,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    bgPresumedAcquisitionLand: "250,000,000",
    standardPriceAtTransfer: "320,000,000",
    standardPriceAtAcq: "180,000,000",
    ...over,
  } as AssetForm;
}

const housing = (over: Partial<AssetForm> = {}) =>
  land({
    assetKind: "housing",
    bgPresumedAcquisitionLand: "",
    bgPresumedAcquisitionTotal: "250,000,000",
    ...over,
  });

const V = (a: AssetForm, opts: { date?: string; axisB?: boolean } = {}) => {
  const { result, fieldOf } = collectWithFields(() =>
    validateBurdenedGiftAsset(a, "자산", undefined, opts.date ?? TRANSFER_DATE, opts.axisB),
  );
  return { msg: result, field: result ? fieldOf(result) : undefined };
};

const breakdownOf = (a: AssetForm) => {
  const info = buildBurdenedGiftInfo(a) as unknown as BurdenedGiftInfo;
  return buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: info.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
    info,
  });
};

describe("② 폼 → 엔진 수치 — 문제 20 상황 1 (28,920,000)", () => {
  it.each(["appraisal", "salesCase"] as const)("%s: 취득 50,000,000 · 개산공제 1,080,000 · 차익 28,920,000", (method) => {
    const b = breakdownOf(land({ bgAcquisitionMethod: method }));
    const l = b.perAsset.land;
    expect(b.acquisitionMethodUsed).toBe(method);
    expect(l.transferPrice).toBe(80_000_000);
    expect(l.acquisitionPrice).toBe(50_000_000);
    expect(l.estimatedDeduction).toBe(1_080_000);
    expect(l.presumedAcquisition).toBe(250_000_000);
    expect(l.transferPrice - l.acquisitionPrice - l.estimatedDeduction).toBe(28_920_000);
  });

  it("🔴 구별력 — 개산공제 base(취득시 기준시가)를 비우면 개산공제가 0이 된다 (⑤가 그 칸을 띄우는 이유)", () => {
    const b = breakdownOf(land({ standardPriceAtAcq: "" }));
    expect(b.perAsset.land.estimatedDeduction).toBe(0);
  });
});

describe("④ API 변환 — 새 방식일 때만, 입력 형태에 맞는 칸만 싣는다", () => {
  it("토지: 토지 칸만 (총액·건물 stale은 새지 않는다)", () => {
    const info = buildBurdenedGiftInfo(
      land({ bgPresumedAcquisitionTotal: "999", bgPresumedAcquisitionBuilding: "888" }),
    );
    expect(info.acquisitionMethod).toBe("appraisal");
    expect(info.presumedLandAcquisitionPrice).toBe(250_000_000);
    expect(info.presumedBuildingAcquisitionPrice).toBeUndefined();
    expect(info.presumedAcquisitionTotal).toBeUndefined();
  });

  it("주택: 총액만 (분리 칸 stale이 있어도 엔진 STEP 4가 총액을 무시하지 않도록 싣지 않는다)", () => {
    const info = buildBurdenedGiftInfo(housing({ bgPresumedAcquisitionLand: "777" }));
    expect(info.presumedAcquisitionTotal).toBe(250_000_000);
    expect(info.presumedLandAcquisitionPrice).toBeUndefined();
    expect(info.presumedBuildingAcquisitionPrice).toBeUndefined();
  });

  it("일반건물: 토지·건물 2칸", () => {
    const info = buildBurdenedGiftInfo(
      land({
        assetKind: "general_building",
        bgPresumedAcquisitionLand: "100,000,000",
        bgPresumedAcquisitionBuilding: "50,000,000",
        bgPresumedAcquisitionTotal: "1",
      }),
    );
    expect(info.presumedLandAcquisitionPrice).toBe(100_000_000);
    expect(info.presumedBuildingAcquisitionPrice).toBe(50_000_000);
    expect(info.presumedAcquisitionTotal).toBeUndefined();
  });

  it("0과 미입력은 다르다 — 빈 문자열만 undefined", () => {
    const g = (b: string) =>
      buildBurdenedGiftInfo(
        land({ assetKind: "general_building", bgPresumedAcquisitionLand: "100,000,000", bgPresumedAcquisitionBuilding: b }),
      ).presumedBuildingAcquisitionPrice;
    expect(g("0")).toBe(0);
    expect(g("")).toBeUndefined();
  });

  it("🔴 다른 방식에서는 싣지 않는다 (stale 금액이 실지·환산 계산으로 새면 안 된다)", () => {
    for (const m of ["actual", "converted", ""] as const) {
      const info = buildBurdenedGiftInfo(land({ bgAcquisitionMethod: m }));
      expect(info.presumedLandAcquisitionPrice).toBeUndefined();
      expect(info.presumedAcquisitionTotal).toBeUndefined();
    }
  });
});

describe("⑤ 게이트 — 개산공제 base 칸이 뜬다", () => {
  const mk = (m: AssetForm["bgAcquisitionMethod"]) =>
    needsBgAcqStdPriceInput({
      assetKind: "housing",
      transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_market",
      bgAcquisitionMethod: m,
      standardPriceAtAcq: "",
      standardPricePerSqmAtAcq: "",
      acquisitionArea: "",
    });
  it("salesCase·appraisal·converted → 필요 / actual → 불필요", () => {
    expect(mk("salesCase")).toBe(true);
    expect(mk("appraisal")).toBe(true);
    expect(mk("converted")).toBe(true);
    expect(mk("actual")).toBe(false);
  });
});

describe("⑤ onChange 패치 — 방식 전환 시 presumed 3칸 초기화 (useEffect 미러링 금지)", () => {
  it("매매사례 ↔ 감정, 매매사례 → 환산: 3칸을 비운다", () => {
    for (const [prev, next] of [["salesCase", "appraisal"], ["appraisal", "salesCase"], ["appraisal", "converted"]] as const) {
      expect(bgAcquisitionMethodPatch(prev, next)).toEqual({
        bgAcquisitionMethod: next,
        bgPresumedAcquisitionLand: "",
        bgPresumedAcquisitionBuilding: "",
        bgPresumedAcquisitionTotal: "",
      });
    }
  });
  it("같은 방식 재선택·실지 → 새 방식은 값을 건드리지 않는다", () => {
    expect(bgAcquisitionMethodPatch("appraisal", "appraisal")).toEqual({ bgAcquisitionMethod: "appraisal" });
    expect(bgAcquisitionMethodPatch("actual", "appraisal")).toEqual({ bgAcquisitionMethod: "appraisal" });
  });
});

describe("⑧ validate", () => {
  it("완전한 입력 → 통과 (토지·주택, 감정·매매사례)", () => {
    expect(V(land()).msg).toBeNull();
    expect(V(land({ bgAcquisitionMethod: "salesCase" })).msg).toBeNull();
    expect(V(housing()).msg).toBeNull();
  });

  it("금액 필수 — 토지: 토지 칸으로 점프", () => {
    const r = V(land({ bgPresumedAcquisitionLand: "" }));
    expect(r.msg).toMatch(/^자산: 부담부증여 감정가액 — 토지 취득 당시 감정가액을 입력하세요 \(소득세법 시행령 §176의2③2호\)\.$/);
    expect(r.field).toBe("bgPresumedAcquisitionLand");
  });

  it("금액 필수 — 주택 총액·매매사례 문구", () => {
    const r = V(housing({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "" }));
    expect(r.msg).toMatch(/^자산: 부담부증여 매매사례가액 — 취득 당시 매매사례가액을 입력하세요 \(소득세법 시행령 §176의2③1호\)\.$/);
    expect(r.field).toBe("bgPresumedAcquisitionTotal");
  });

  it("금액 필수 — 일반건물: 토지·건물 둘 다 비면 토지 칸, 하나만 있어도 통과", () => {
    const gb = (l: string, b: string) =>
      V(land({ assetKind: "general_building", bgPresumedAcquisitionLand: l, bgPresumedAcquisitionBuilding: b, gbAcqLandPricePerSqm: "1", gbAcqBuildingValue: "1" }));
    const empty = gb("", "");
    expect(empty.msg).toMatch(/토지 또는 건물의 취득 당시 감정가액/);
    expect(empty.field).toBe("bgPresumedAcquisitionLand");
    expect(gb("", "50,000,000").msg).toBeNull();
  });

  it("🔴 stale 방지 — 토지 자산에서 총액 칸만 차 있으면 금액 없음으로 본다 (④가 싣는 칸과 같은 칸만 본다)", () => {
    const r = V(land({ bgPresumedAcquisitionLand: "", bgPresumedAcquisitionTotal: "250,000,000" }));
    expect(r.field).toBe("bgPresumedAcquisitionLand");
  });

  it("개산공제 base(취득시 기준시가) 필수 — 주택·토지", () => {
    const r = V(housing({ standardPriceAtAcq: "" }));
    expect(r.msg).toMatch(/^자산: 부담부증여 감정가액 — 「② 양도정보」의 취득시 기준시가를 입력하세요/);
    expect(r.field).toBe("standardPriceAtAcq");
    expect(V(land({ standardPriceAtAcq: "" })).msg).toMatch(/취득시 기준시가\(또는 취득 당시 ㎡당 공시지가 \+ 면적\)를 입력하세요/);
  });

  it("상속 자산(상속개시일 1985.1.1. 이후) 차단 — 환산 차단과 같은 술어", () => {
    const r = V(land({ acquisitionCause: "inheritance", inheritanceStartDate: "2010-03-01" }));
    expect(r.msg).toMatch(/^자산: 상속받은 자산은 상속개시일 현재 .*매매사례가액·감정가액을 쓸 수 없습니다/);
    expect(r.field).toBe("bgAcquisitionMethod");
  });

  it("이월과세 차단 — 「당초 증여자」 값 요구가 아니라 방식 차단 메시지가 먼저다", () => {
    const r = V(land({ acquisitionCause: "carryover_gift" }));
    expect(r.msg).toMatch(/이월과세\(소득세법 §97의2\)가 적용되는 부담부증여는 .*매매사례가액.*감정가액/);
    expect(r.field).toBe("bgAcquisitionMethod");
  });

  it("축 B(지분 분할 취득) 차단", () => {
    const r = V(land(), { axisB: true });
    expect(r.msg).toMatch(/^자산: 지분 분할 취득/);
    expect(r.field).toBe("bgAcquisitionMethod");
    // 축 A·단건은 통과
    expect(V(land(), { axisB: false }).msg).toBeNull();
  });

  describe("§114조의2 — 증축 5년 이내 × 감정가액 (신축은 가산세를 연결해 통과 — PR-3)", () => {
    const extended = (over: Partial<AssetForm> = {}) =>
      housing({ isSelfBuilt: true, buildingType: "extension", extensionFloorArea: "120", constructionDate: "2020-05-01", ...over });
    it("감정가액 + 증축(85㎡ 초과) 5년 이내(양도일 2023-06-01) → 차단", () => {
      const r = V(extended());
      expect(r.msg).toMatch(/제114조의2에 따라 증축한 부분의 감정가액에 5% 가산세/);
      expect(r.field).toBe("bgAcquisitionMethod");
    });
    it("🔴 구별력 — 신축은 가산세를 연결해 계산하므로 통과한다", () => {
      expect(V(extended({ buildingType: "new", extensionFloorArea: "" })).msg).toBeNull();
    });
    it("🔴 구별력 — 매매사례가액은 대상이 아니다", () => {
      expect(V(extended({ bgAcquisitionMethod: "salesCase" })).msg).toBeNull();
    });
    it("증축 85㎡ 이하는 §114조의2 대상이 아니라 통과", () => {
      expect(V(extended({ extensionFloorArea: "60" })).msg).toBeNull();
    });
    it("5년 초과(양도일 2026-01-01) → 통과", () => {
      expect(V(extended(), { date: "2026-01-01" }).msg).toBeNull();
    });
    it("신축 아님(isSelfBuilt false) → 통과", () => {
      expect(V(extended({ isSelfBuilt: false })).msg).toBeNull();
    });
    it("양도일을 모르면 판정을 건너뛴다(옛 호출부 호환)", () => {
      const { result } = collectWithFields(() => validateBurdenedGiftAsset(extended(), "자산"));
      expect(result).toBeNull();
    });
  });

  it("미지정 메시지 — 접두 「부담부증여 시가 모드 — 취득가액 산정방식」 유지 + 4방식 안내", () => {
    const r = V(land({ bgAcquisitionMethod: "" }));
    expect(r.msg).toMatch(/^자산: 부담부증여 시가 모드 — 취득가액 산정방식\(실지취득가액·매매사례가액·감정가액·환산취득가액\)을 선택하세요/);
    expect(r.field).toBe("bgAcquisitionMethod");
  });

  it("기준시가 모드(stale 방식 값)는 새 방식 검사를 타지 않는다", () => {
    const a = land({ bgValuationMode: "sangjeungbeop_standard", bgPresumedAcquisitionLand: "" });
    expect(V(a).field).not.toBe("bgPresumedAcquisitionLand");
  });
});

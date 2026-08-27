/**
 * F-09 — 조정률 구분 II(최고층수·연면적)를 **항상 적용**하기 위한 선행 조건 2건.
 *
 * ── 축은 이미 확정됐다(2026-08-27 고시·계산사례 전수 실측)
 *   고시 제11조 구분 II 적용범위 단서는 「지하층·옥탑 제외 / 통나무조 제외 /
 *   **주거용건물은 아파트에 한해 최고층수기준만 적용**」뿐 — **용도 제한이 없다.**
 *   2026년 계산사례 상속 9건이 **예외 없이** 구분 II 를 받는다:
 *     근생(라멘)№41 은 「9. 1천㎡ 이하」**만**, 운동시설№24 는 「10. 1천~5천㎡」**만**으로
 *     조정률이 붙는다 — 다른 특성이 하나도 없다.
 *   갈림은 **주거/비주거**이지 「특성을 골랐는가」가 아니다(마.의 지상2·3 단독주택은 빈칸).
 *
 * ── 그런데 게이트를 그냥 풀면 새 결함이 난다 — 선행 조건 2건(이 PR 이 그것을 없앤다)
 *   ① **주거 판정이 조정률 모달에 종속돼 있다.** `isResidentialUse` 는 특성 모달의
 *      `onApply` 에서만 설정되고 초기값이 `false` 다 ⇒ 모달을 열지 않은 **단독주택 상증
 *      평가가 비주거로 취급돼 9번 0.90 이 잘못 붙는다**(홈택스 gold anchor 가 잡았다).
 *   ② **복합은 부분별 주거 판정이 없다.** 건물 단위 플래그 하나뿐이라 1층 근생 + 2·3층
 *      주택 혼합(계산서 작성례(3))에서 **주택 부분에도 II 가 붙어** 공식 작성례
 *      171,500,000 이 160,300,000 으로 깨진다.
 *
 * ── 처방: 주거 여부를 **용도번호로 자동 판정**한다(고시 용도지수표 구분 I = 주거용건물)
 *   체계마다 경계가 다르다 — 전 스킴 실측:
 *     2001~2002(39항목) 1~2 · 2003~2013 1~3 · 2014~2026(59·60항목) 1~2
 *   ⚠️ 2001~2002 는 #1 이 「단독주택·**아파트**」 통합이라 아파트 여부를 번호로 가를 수 없다
 *      — 그 시대만 사용자 플래그가 정본이다(「아파트에 한해 최고층수기준만」 단서 때문).
 *
 * 법령: 「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 「건물 기준시가 계산방법」
 *   고시 제8조(용도지수) 구분 I · 제11조(조정률) 구분 II. 양도(소득세법 §99①1호나목) 미적용.
 *
 * ⚠️ §1~§3 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { isResidentialUsage } from "@/lib/tax-engine/data/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

describe("F-09 — §1 용도번호 주거 판정 (수정 전 실패)", () => {
  it.each([
    [2002, 1, true], // 단독주택·아파트 통합
    [2002, 2, true], // 기타 주거용
    [2002, 3, false], // 관광호텔
    [2013, 3, true], // 기타 주거용 (2003~2013 은 1~3)
    [2013, 4, false], // 관광호텔
    [2026, 2, true], // 단독주택 등
    [2026, 3, false], // 관광호텔 (2014~ 는 1~2)
    [2026, 41, false], // 근린생활시설
  ])("%i년 용도 #%i → 주거 %s", (year, no, expected) => {
    expect(isResidentialUsage(year, no)).toBe(expected);
  });
});

/** 계산사례 마.(2026)의 지상2·3 단독주택 — 모달을 열지 않은 상태 */
const HOUSE_NO_MODAL: BuildingStandardPriceInput = {
  taxType: "inheritance_gift",
  floorArea: 390,
  builtYear: 2000,
  valuationYear: 2026,
  valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: 2_500_000 },
  // ⚠️ `isResidentialUse` 를 **의도적으로 넣지 않는다** — 모달 미개봉 상태의 재현이다.
};

describe("F-09 — §2 단일 경로: 주거는 특성 미선택이어도 조정률이 붙지 않는다 (수정 전 실패)", () => {
  it("단독주택 — 모달을 열지 않아도 9번이 붙지 않는다", () => {
    const r = calcBuildingStandardPrice(HOUSE_NO_MODAL);
    // 860,000 × 1.00 × 1.00 × 1.16 × 0.532 = 530,723 → 530,000 (계산사례 마. 지상2·3 일치)
    expect(r.valuation?.pricePerM2).toBe(530_000);
  });

  it("비주거는 반대로 특성 미선택이어도 9번을 받는다 — 고시 문언·계산사례", () => {
    const r = calcBuildingStandardPrice({
      ...HOUSE_NO_MODAL,
      valuation: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
    });
    // 860,000 × 1.00 × 0.95 × 1.16 × 0.532 × 0.90 = 453,768 → 453,000
    expect(r.valuation?.pricePerM2).toBe(453_000);
  });
});

describe("F-09 — §3 복합 경로: 부분별 주거 판정 (수정 전 실패)", () => {
  /** 계산사례 마. — 1층 슈퍼(근생 #41) + 2·3층 주택(#2), 연면적 390㎡ */
  const MIXED: BuildingStandardPriceInput = {
    taxType: "inheritance_gift",
    floorArea: 0,
    builtYear: 2000,
    valuationYear: 2026,
    valuation: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
    compositeParts: [
      { label: "1층 슈퍼", structureKey: "rc", usageNo: 41, floorArea: 100, specialFeatures: { commercialFloor: 20 } },
      { label: "2~3층 주택", structureKey: "rc", usageNo: 2, floorArea: 200 },
    ],
  };

  it("주택 부분은 조정률이 붙지 않고 상가 부분만 받는다 — 계산사례 마. 일치", () => {
    const bd = calcBuildingStandardPrice(MIXED).compositeBreakdowns ?? [];
    const shop = bd.find((b) => b.label === "1층 슈퍼");
    const house = bd.find((b) => b.label === "2~3층 주택");
    expect(shop?.pricePerM2).toBe(544_000); // 9번 × 20번 = 1.08
    expect(house?.pricePerM2).toBe(530_000); // 적용 항목 없음
  });
});

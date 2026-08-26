/**
 * F-02 Pre-Do anchor — §164⑧ 제1산식이 취득연도 용도번호를 「취득전기」 용도지수표에 그대로 조회한다.
 *
 * 결함 위치: `lib/tax-engine/building-standard-price.ts:464-469`
 *   const prevPoint: BuildingPointInput = {
 *     structureKey: input.prevStructureKey ?? acqPoint.structureKey,
 *     usageNo: input.prevUsageNo ?? acqPoint.usageNo,   // ← 취득연도 체계의 번호를 전년도 표에서 읽는다
 *     landPricePerM2: input.prevLandPricePerM2,
 *   };
 *   const prevBd = calcPointBreakdown(acquisitionYear - 1, prevPoint, ...);
 *
 * 용도번호 체계는 연도군별로 재편된다(`usage-index.ts` 헤더가 「★ 시대별로 번호 체계가 다름」을 스스로 경고).
 * 항목이 삽입되면 그 뒤 번호가 통째로 한 칸씩 밀리므로, 같은 번호를 전년도 표에서 읽으면
 * **인접한 다른 용도의 지수**가 적용된다.
 *
 * `prevUsageNo`·`prevStructureKey` 는 타입 선언과 위 소비 2줄 외에 저장소 전체에 writer 가 0건이다
 * (폼·`toEngineInput`·UI 어디에도 없다) ⇒ 위 fallback 이 프로덕션의 **유일 경로**다.
 *
 * 법령: 「소득세법 시행령」 제164조 제8항 · 「소득세법 시행규칙」 제80조 제2항 제2호
 *   ("전기의 기준시가 : 취득당시의 기준시가 결정일 전일의 **당해양도자산**의 기준시가")
 *   — 같은 자산이므로 같은 용도로 산정되어야 한다.
 *   용도지수표 자체는 국세청 「건물 기준시가 계산방법」 고시 — **고시 본문 미확인**.
 *
 * 설계문서: `docs/02-design/features/building-standard-price.engine.design.md:203-204`
 *   「미입력 시 acquisition 동명 항목 매칭, 매칭 실패 시 검증 오류」 — 구현이 이 규칙을 이행하지 않았다.
 *
 * ⚠️ §2 는 **F-02 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 *
 * 실측(2026-08-26, 전수 격자 2001~2026 × 각 연도 용도번호 전체 = 1,341 조합):
 *   S(번호·라벨 동일)                926건 — 무영향
 *   A(번호는 있으나 라벨 상이)        351건 = 지수까지 다름 208건 + 지수 동일 48건 + 동명무매칭 95건
 *   C(번호가 전년도 표에 아예 없음)     64건 — 현재도 차단됨(그중 38건은 2001년 = 별건 F-18)
 *   ⇒ **조용한 오산 208건**이 이 anchor 가 겨누는 대상이다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import {
  resolveUsageIndex,
  resolveUsageLabel,
} from "@/lib/tax-engine/data/building-standard-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

/** §164⑧ 제1산식(동일연도·취득전기) 입력. 위치지수 축을 없애려고 취득·양도·전기 공시지가를 같게 둔다. */
function sec164_8Input(over: {
  year: number;
  usageNo: number;
  landPricePerM2: number;
  builtYear: number;
  floorArea: number;
  prevUsageNo?: number;
}): BuildingStandardPriceInput {
  return {
    taxType: "transfer",
    floorArea: over.floorArea,
    builtYear: over.builtYear,
    acquisitionYear: over.year,
    transferYear: over.year,
    holdingMonths: 6,
    adjustMonths: 12,
    acquisition: { structureKey: "rc", usageNo: over.usageNo, landPricePerM2: over.landPricePerM2 },
    transfer: { structureKey: "rc", usageNo: over.usageNo, landPricePerM2: over.landPricePerM2 },
    prevLandPricePerM2: over.landPricePerM2,
    ...(over.prevUsageNo !== undefined && { prevUsageNo: over.prevUsageNo }),
  };
}

describe("F-02 §164⑧ 취득전기 용도번호 — §1 드리프트 표 고정 (수정 후에도 불변)", () => {
  // 2003년에 항목이 삽입되어 #2 이후 번호가 한 칸씩 밀렸다.
  it("2003 ↔ 2002: 같은 번호 #3 이 서로 다른 용도를 가리킨다", () => {
    expect(resolveUsageLabel(2003, 3)).toBe(
      "다중주택·다가구주택·연립주택·다세대주택·기숙사 등 기타 주거용건물",
    );
    expect(resolveUsageIndex(2003, 3)).toBe(90);

    // 전년도(2002) 표의 같은 번호 #3 — 전혀 다른 용도, 지수 130
    expect(resolveUsageLabel(2002, 3)).toBe("관광호텔(특1·2등급)");
    expect(resolveUsageIndex(2002, 3)).toBe(130);

    // 2003 #3 과 동명인 2002 항목은 #2 이고 지수는 90 으로 일치한다
    expect(resolveUsageLabel(2002, 2)).toBe(
      "다중주택·다가구주택·연립주택·다세대주택·기숙사 등 기타 주거용건물",
    );
    expect(resolveUsageIndex(2002, 2)).toBe(90);
  });

  it("2014 ↔ 2013: 같은 번호 #3 이 서로 다른 용도를 가리킨다 (반대 방향)", () => {
    expect(resolveUsageLabel(2014, 3)).toBe("관광호텔(특1·2등급)");
    expect(resolveUsageIndex(2014, 3)).toBe(140);

    // 전년도(2013) #3 은 주거용 — 지수 100
    expect(resolveUsageIndex(2013, 3)).toBe(100);

    // 2014 #3 과 동명인 2013 항목은 #4 이고 지수 140 으로 일치한다
    expect(resolveUsageLabel(2013, 4)).toBe("관광호텔(특1·2등급)");
    expect(resolveUsageIndex(2013, 4)).toBe(140);
  });

  it("2011 ↔ 2010: #5 는 라벨이 동일하다 (대조군 — 드리프트 없음)", () => {
    expect(resolveUsageLabel(2011, 5)).toBe(resolveUsageLabel(2010, 5));
    expect(resolveUsageIndex(2011, 5)).toBe(130);
    expect(resolveUsageIndex(2010, 5)).toBe(130);
  });
});

describe("F-02 §164⑧ 취득전기 용도번호 — §2 결함 고정 (수정 전 실패)", () => {
  /**
   * A-1. 취득·양도 2003 · rc · 용도 #3(다중주택 등, 지수 90) · 공시지가 1,000,000 · 신축 1995 · 200㎡
   *
   *   전기(2002)를 #3 으로 읽으면 「관광호텔(특1·2등급)」 지수 130 → 전기 기준시가가 취득당시보다 커진다
   *   → delta = acqStd − prevStd 가 음수 → 시행규칙 §80①1호 본문 단서(하한)에 걸려 양도 = 취득으로 주저앉는다.
   *   ⇒ §164⑧ 환산이 통째로 무력화된다.
   *
   *   전기를 동명 항목 #2(지수 90)로 읽으면 정상적으로 환산된다.
   */
  it("A-1 (2003 #3): 양도당시 기준시가 70,000,000 — 현재는 69,400,000(환산 무력화)", () => {
    const input = sec164_8Input({
      year: 2003,
      usageNo: 3,
      landPricePerM2: 1_000_000,
      builtYear: 1995,
      floorArea: 200,
    });
    const r = calcBuildingStandardPrice(input);

    expect(r.sameYearAdjusted).toBe(true);
    expect(r.acquisition?.standardPrice).toBe(69_400_000); // 취득당시는 영향 없음 (수정 후에도 불변)

    // 동명 매칭(#2, 지수 90)으로 산정한 정답. 현행은 69,400,000 (하한에 걸림) — 600,000 과소.
    expect(r.transfer?.standardPrice).toBe(70_000_000);
  });

  /**
   * A-2. 취득·양도 2014 · rc · 용도 #3(관광호텔 특1·2등급, 지수 140) · 공시지가 2,000,000 · 신축 2005 · 100㎡
   *
   *   전기(2013)를 #3 으로 읽으면 주거용 지수 100 → 전기 기준시가가 과소 → delta 과대 → 양도가 부풀려진다.
   *   전기를 동명 항목 #4(지수 140)로 읽는 것이 정답이다.
   */
  it("A-2 (2014 #3): 양도당시 기준시가 83,200,000 — 현재는 94,700,000(+11,500,000 과대)", () => {
    const input = sec164_8Input({
      year: 2014,
      usageNo: 3,
      landPricePerM2: 2_000_000,
      builtYear: 2005,
      floorArea: 100,
    });
    const r = calcBuildingStandardPrice(input);

    expect(r.sameYearAdjusted).toBe(true);
    expect(r.acquisition?.standardPrice).toBe(82_200_000); // 취득당시는 영향 없음

    expect(r.transfer?.standardPrice).toBe(83_200_000);
  });

  /**
   * 대조군. 라벨이 동일한 조합(2011 #5)은 수정 전후로 값이 같아야 한다.
   * 이 케이스가 깨지면 수정이 드리프트 없는 정상 경로까지 건드린 것이다.
   */
  it("대조군 (2011 #5, 라벨 동일): 수정 전후 불변 — 94,650,000", () => {
    const r = calcBuildingStandardPrice(
      sec164_8Input({
        year: 2011,
        usageNo: 5,
        landPricePerM2: 1_500_000,
        builtYear: 2000,
        floorArea: 150,
      }),
    );
    expect(r.acquisition?.standardPrice).toBe(92_550_000);
    expect(r.transfer?.standardPrice).toBe(94_650_000);
  });

  /**
   * 명시 입력 우선. `prevUsageNo` 를 직접 주면 그것이 fallback 보다 우선해야 한다.
   * (지금도 통과한다 — 수정이 이 우선순위를 뒤집지 않는지 지키는 가드다.)
   */
  it("prevUsageNo 명시 입력이 fallback 보다 우선한다 (수정 전에도 통과)", () => {
    const r = calcBuildingStandardPrice(
      sec164_8Input({
        year: 2003,
        usageNo: 3,
        landPricePerM2: 1_000_000,
        builtYear: 1995,
        floorArea: 200,
        prevUsageNo: 2, // 동명 항목을 손으로 지정
      }),
    );
    expect(r.transfer?.standardPrice).toBe(70_000_000);
  });
});

describe("F-02 §164⑧ 취득전기 용도번호 — §3 동명 무매칭 characterization (미결)", () => {
  /**
   * 🟡 미결 — 수정 방향이 아직 결정되지 않았다. 이 블록은 **현재 동작을 기록만** 한다.
   *
   * 취득연도 라벨과 동명인 항목이 전년도 표에 없는 조합이 실측 95건 있다.
   * 그런데 그 상당수는 **번호는 그대로인데 표기만 바뀐 것**이라 같은-번호 fallback 이 오히려 맞다.
   *   2010 #3 「다중주택·다가구·연립·다세대·기숙사 등 기타 주거용건물」(지수 100)
   *   2009 #3 「다중주택·다가구**주택**·연립**주택**·다세대**주택**·기숙사 등 기타 주거용건물」(지수 100)
   *   → 같은 용도, 같은 지수. 여기서 「동명 매칭 실패 = 검증 오류」로 처리하면 정상 계산을 차단하게 된다.
   *
   * 반면 2010 #7 「고시원」 ↔ 2009 #7 「여인숙」처럼 실제로 다른 용도인 조합도 섞여 있다.
   * 어느 쪽인지는 국세청 「건물 기준시가 계산방법」 고시의 용도 대응표가 있어야 가른다 — **고시 본문 미확인**.
   *
   * ⇒ 이 블록에는 「옳은 값」을 단언하지 않는다. 방향이 정해지면 갱신할 것.
   */
  it("2010 #3 (표기만 변경·지수 동일): 같은-번호 fallback 이 현재 정답과 일치한다", () => {
    expect(resolveUsageIndex(2010, 3)).toBe(100);
    expect(resolveUsageIndex(2009, 3)).toBe(100);
    // 라벨은 다르지만(표기 변경) 지수가 같아 금액 영향이 없다.
    expect(resolveUsageLabel(2010, 3)).not.toBe(resolveUsageLabel(2009, 3));
  });

  it("2010 #7 (실제 다른 용도): 같은-번호 fallback 이 다른 용도의 지수를 쓴다", () => {
    expect(resolveUsageLabel(2010, 7)).toBe("고시원");
    expect(resolveUsageLabel(2009, 7)).toBe("여인숙");
    // 지수도 실제로 갈린다 — 이쪽은 fallback 이 틀린 값을 쓰는 사례다(단언은 사실 고정이지 정답 주장이 아니다).
    expect(resolveUsageIndex(2010, 7)).toBe(100);
    expect(resolveUsageIndex(2009, 7)).toBe(90);
    // 「고시원」은 2009년 표에 존재하지 않는다 ⇒ 동명 매칭도 실패한다.
    const has고시원 = Array.from({ length: 60 }, (_, i) => resolveUsageLabel(2009, i + 1)).includes(
      "고시원",
    );
    expect(has고시원).toBe(false);
  });
});

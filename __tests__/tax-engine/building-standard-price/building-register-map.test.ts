/**
 * 건축물대장 자동조회 매핑 anchor (mapStructure·mapUsage).
 *
 * 설계: docs/02-design/features/building-register-autofill.design.md §8.1.
 * 표본: draft §Y 실측(강남파이낸스·은마·롯데/코엑스) + Pre-Do 동결 구조코드(codil+고시).
 */
import { describe, it, expect } from "vitest";
import {
  mapStructure,
  mapUsage,
} from "../../../lib/tax-engine/data/building-standard-price/building-register-map";
import {
  listStructureOptions,
  listUsageOptions,
} from "../../../lib/tax-engine/data/building-standard-price";
import { STRUCTURE_META } from "../../../lib/tax-engine/data/building-standard-price/structure-group-map";

describe("mapStructure", () => {
  it("실측 표본 — strctCd 대표 매핑", () => {
    expect(mapStructure("42", "철골철근콘크리트조")?.structureKey).toBe(
      "steel_frame_rc",
    ); // 강남파이낸스·롯데
    expect(mapStructure("21", "철근콘크리트조")?.structureKey).toBe("rc"); // 은마
  });

  it("etcStrct 없으면 대표값 + medium", () => {
    expect(mapStructure("21", undefined)).toEqual({
      structureKey: "rc",
      confidence: "medium",
    });
    expect(mapStructure("11", undefined)).toEqual({
      structureKey: "brick",
      confidence: "medium",
    });
  });

  it("etcStrct refine → fine 키 + high", () => {
    expect(mapStructure("21", "라멘조")).toEqual({
      structureKey: "ramen",
      confidence: "high",
    });
    expect(mapStructure("11", "시멘트벽돌")).toEqual({
      structureKey: "cement_brick",
      confidence: "high",
    });
    expect(mapStructure("12", "보강블록")).toEqual({
      structureKey: "reinforced_block",
      confidence: "high",
    });
    expect(mapStructure("31", "컨테이너")?.structureKey).toBe("container");
    expect(mapStructure("11", "황토")?.structureKey).toBe("ocher");
  });

  it("★31군 패널 괄호형 → steel_frame 대표값 fallback (조립식패널 오매핑 금지 회귀 가드)", () => {
    // `조립식패널`/`조립식패널eps` 키 제거 → prefab_panel 잘못된 high 매핑 금지
    expect(mapStructure("31", "철골조 중 조립식패널(EPS패널)")).toEqual({
      structureKey: "steel_frame",
      confidence: "medium",
    });
    expect(mapStructure("31", "조립식패널조")).toEqual({
      structureKey: "steel_frame",
      confidence: "medium",
    });
    expect(mapStructure("31", undefined)).toEqual({
      structureKey: "steel_frame",
      confidence: "medium",
    });
  });

  it("★51 일반목구조 → wood(목조), ≠wood_frame (고시 검증 RESOLVED 회귀 가드)", () => {
    expect(mapStructure("51", "목조")?.structureKey).toBe("wood");
    // refine 키에 "목조"/"목구조" 없음 → 대표 wood. 라벨 역인덱스 정규식 부재 증명.
    expect(mapStructure("51", "목구조")?.structureKey).toBe("wood");
    expect(mapStructure("51", "통나무")?.structureKey).toBe("solid_wood");
    expect(mapStructure("51", "경량목구조")?.structureKey).toBe("wood_frame");
  });

  it("strctCd 미수록 → null", () => {
    expect(mapStructure("99", undefined)).toBeNull();
    expect(mapStructure("", "철근콘크리트조")).toBeNull();
  });

  it("매핑 결과 키는 전부 STRUCTURE_META에 존재", () => {
    const codes = ["11", "12", "13", "21", "22", "31", "32", "42", "51"];
    for (const c of codes) {
      const r = mapStructure(c, undefined);
      expect(r).not.toBeNull();
      expect(STRUCTURE_META[r!.structureKey]).toBeDefined();
    }
  });
});

describe("mapUsage", () => {
  it("실측 표본 — prefix default", () => {
    expect(mapUsage("14000", undefined, undefined, 2023)).toEqual({
      usageNo: 29,
      confidence: "medium",
    }); // 강남파이낸스 업무
    expect(mapUsage("07000", undefined, undefined, 2023)).toEqual({
      usageNo: 10,
      confidence: "medium",
    }); // 롯데/코엑스 판매 default 단일
  });

  it("공동주택 층수 derive", () => {
    expect(mapUsage("02000", 14, undefined, 2023)).toEqual({
      usageNo: 1,
      confidence: "high",
    }); // 은마 14층 → 아파트
    expect(mapUsage("02000", 4, undefined, 2023)?.usageNo).toBe(2); // 4층 → 연립·다세대
    expect(mapUsage("02000", undefined, undefined, 2023)).toBeNull(); // 층수 없음 → 판정 불가
  });

  it("5자리 세부 override → high", () => {
    expect(mapUsage("07999", undefined, undefined, 2023)).toEqual({
      usageNo: 10,
      confidence: "high",
    });
    expect(mapUsage("03005", undefined, undefined, 2023)).toEqual({
      usageNo: 41,
      confidence: "high",
    }); // 의원
    expect(mapUsage("13011", undefined, undefined, 2023)?.usageNo).toBe(25); // 골프연습장
  });

  it("목욕장 면적의존 #37/#38/#39", () => {
    expect(mapUsage("03025", undefined, 5000, 2023)?.usageNo).toBe(37);
    expect(mapUsage("03025", undefined, 2000, 2023)?.usageNo).toBe(38);
    expect(mapUsage("03025", undefined, 500, 2023)?.usageNo).toBe(39);
    expect(mapUsage("03025", undefined, undefined, 2023)?.usageNo).toBe(41); // 면적 없음 fallback
  });

  it("미대응 → null", () => {
    expect(mapUsage("23010", undefined, undefined, 2023)).toBeNull(); // 교정·군사
    expect(mapUsage("28000", undefined, undefined, 2023)).toBeNull(); // prefix 미수록
  });

  it("연도 게이트 — scheme-60(2018~2026) 외 → null", () => {
    expect(mapUsage("14000", undefined, undefined, 2010)).toBeNull();
    expect(mapUsage("14000", undefined, undefined, 2027)).toBeNull();
  });

  it("결과 usageNo는 listUsageOptions(year)에 존재", () => {
    const codes: Array<[string, number | undefined]> = [
      ["14000", undefined],
      ["07000", undefined],
      ["03005", undefined],
    ];
    for (const [cd, flr] of codes) {
      const r = mapUsage(cd, flr, undefined, 2023);
      expect(r).not.toBeNull();
      expect(listUsageOptions(2023).some((o) => o.no === r!.usageNo)).toBe(true);
    }
    expect(listStructureOptions(2023).length).toBeGreaterThan(0);
  });
});

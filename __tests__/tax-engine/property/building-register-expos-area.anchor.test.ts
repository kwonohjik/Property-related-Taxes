/**
 * anchor(접근 B): 집합건물 전유공용면적 합산 — sumExclusiveCommonArea.
 *
 * 국세청 「건물 기준시가 계산방법 고시」상 건물면적 = 전유+공용 연면적이므로
 * exposPubuseGbCd "1"(전유)+"2"(공용) 모두 합산. 전유만 = 과소산정(접근 A 폐기 사유).
 * ⚠️ dongNm/hoNm 실 형식은 배포환경 실측 미검증 — 정규화 매칭으로 방어(문서 기반 mock).
 * 계획서: docs/02-design/features/building-std-collective-unit-exclusive-area-fix.plan.md §11
 */
import { describe, it, expect } from "vitest";
import {
  sumExclusiveCommonArea,
  type ExposPubuseAreaItem,
} from "@/lib/tax-engine/data/building-standard-price/building-register-map";

// 201동 3204호: 전유 84.99 + 공용 33.5 = 118.49 / 3205호는 별개
const ITEMS: ExposPubuseAreaItem[] = [
  { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "1", area: "84.99" }, // 전유
  { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "2", area: "33.5" }, // 공용
  { dongNm: "201동", hoNm: "3205", exposPubuseGbCd: "1", area: "84.99" }, // 다른 호
  { dongNm: "202동", hoNm: "3204", exposPubuseGbCd: "1", area: "99.9" }, // 다른 동
];

describe("sumExclusiveCommonArea — 전유+공용 합산", () => {
  it("해당 세대 전유+공용 area 합(round2)", () => {
    expect(sumExclusiveCommonArea(ITEMS, "201동", "3204")).toBe(118.49);
  });

  it("동/호명 접미('동'/'호')·공백 정규화 매칭", () => {
    const items: ExposPubuseAreaItem[] = [
      { dongNm: "201동", hoNm: "3204호", exposPubuseGbCd: "1", area: "84.99" },
      { dongNm: "201동", hoNm: "3204호", exposPubuseGbCd: "2", area: "33.5" },
    ];
    // 폼 값 "201동"/"3204"(호 없음) ↔ API "201동"/"3204호"
    expect(sumExclusiveCommonArea(items, "201동", "3204")).toBe(118.49);
  });

  it("전유만 있어도 합산(공용 행 부재)", () => {
    const items: ExposPubuseAreaItem[] = [
      { dongNm: "가동", hoNm: "101", exposPubuseGbCd: "1", area: "59.94" },
    ];
    expect(sumExclusiveCommonArea(items, "가동", "101")).toBe(59.94);
  });

  it("전유/공용(1·2) 외 코드 제외", () => {
    const items: ExposPubuseAreaItem[] = [
      { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "1", area: "84.99" },
      { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "9", area: "500" }, // 미상 코드
    ];
    expect(sumExclusiveCommonArea(items, "201동", "3204")).toBe(84.99);
  });

  it("매칭 세대 없으면 null(수동 fallback)", () => {
    expect(sumExclusiveCommonArea(ITEMS, "201동", "9999")).toBeNull();
  });

  it("호 공란(동만) → null — 동 전체 합산 방지(과대 차단)", () => {
    // 호 없이 동만이면 세대 특정 불가 → 동 전체(3204+3205) 합산이 아니라 null
    expect(sumExclusiveCommonArea(ITEMS, "201동", "")).toBeNull();
  });

  it("공동주택 다건 공용(층별 다행) 전부 합산", () => {
    const items: ExposPubuseAreaItem[] = [
      { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "1", area: "84.99" },
      { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "2", area: "20.0" },
      { dongNm: "201동", hoNm: "3204", exposPubuseGbCd: "2", area: "13.5" },
    ];
    expect(sumExclusiveCommonArea(items, "201동", "3204")).toBe(118.49);
  });
});

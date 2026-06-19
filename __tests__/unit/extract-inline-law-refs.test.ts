import { describe, it, expect } from "vitest";
import { extractInlineLawRefs } from "@/lib/utils/law-url";

/**
 * extractInlineLawRefs — 자유 텍스트 § 스캐너 (계획서 §5 Pre-Do 게이트, E-1).
 * 핵심: 기존 parseLawRefsForModal과 달리 § 앞 전체 구절을 법령명으로 오인하지 않는다.
 */
describe("extractInlineLawRefs", () => {
  const DEFAULT = "상증법"; // 상속·증여 탭 기본 법령

  it("자유 텍스트 + 기본법: 제목 속 §만 추출, 쓰레기 lawName 없음", () => {
    expect(extractInlineLawRefs("특수관계인 간 거래 (§35①)", DEFAULT)).toEqual([
      { label: "§35①", legalBasis: "상속세및증여세법 §35①" },
    ]);
  });

  it("[E-1 회귀] 제목 앞 구절이 lawName으로 새지 않는다", () => {
    const refs = extractInlineLawRefs("특수관계인 간 거래 (§35①)", DEFAULT);
    for (const r of refs) {
      expect(r.legalBasis).not.toContain("특수관계인");
      expect(r.legalBasis).not.toContain("거래");
      expect(r.legalBasis).not.toContain("(");
    }
  });

  it("설명문 중간 § + 꼬리말", () => {
    expect(
      extractInlineLawRefs("끄면 특수관계인 외 거래 (§35②) — 공제 3억 고정", DEFAULT),
    ).toEqual([{ label: "§35②", legalBasis: "상속세및증여세법 §35②" }]);
  });

  it("명시 외부법(법인세법) 토큰이 § 직전에 붙으면 그 법령으로", () => {
    expect(
      extractInlineLawRefs("법인세법 §52② 시가 해당·거래소 상장 시가거래 등", DEFAULT),
    ).toEqual([{ label: "§52②", legalBasis: "법인세법 §52②" }]);
  });

  it("본법 + 시령 단독: 직전 본법의 시행령으로 상속", () => {
    expect(extractInlineLawRefs("상증법 §60①·시령 §49①", DEFAULT)).toEqual([
      { label: "§60①", legalBasis: "상속세및증여세법 §60①" },
      { label: "§49①", legalBasis: "상속세및증여세법 시행령 §49①" },
    ]);
  });

  it("항+호+목 혼합: 항 마커만 label에, 조번호 정확", () => {
    expect(extractInlineLawRefs("§16③1호나", DEFAULT)).toEqual([
      { label: "§16③", legalBasis: "상속세및증여세법 §16③" },
    ]);
  });

  it("가지번호(의): §18의3 / §45의2③ / §3의2②", () => {
    expect(extractInlineLawRefs("§18의3", DEFAULT)).toEqual([
      { label: "§18의3", legalBasis: "상속세및증여세법 §18의3" },
    ]);
    expect(extractInlineLawRefs("§45의2③", DEFAULT)).toEqual([
      { label: "§45의2③", legalBasis: "상속세및증여세법 §45의2③" },
    ]);
  });

  it("복합 인용(+): §13①2호 + §3의2②", () => {
    expect(
      extractInlineLawRefs("영리법인 사전증여로 가져오기 (§13①2호 + §3의2②)", DEFAULT),
    ).toEqual([
      { label: "§13①", legalBasis: "상속세및증여세법 §13①" },
      { label: "§3의2②", legalBasis: "상속세및증여세법 §3의2②" },
    ]);
  });

  it("§71②1가: 항만, 호·목 무시", () => {
    expect(extractInlineLawRefs("연부연납 (§71②1가)", DEFAULT)).toEqual([
      { label: "§71②", legalBasis: "상속세및증여세법 §71②" },
    ]);
  });

  it("중복 조문 dedupe", () => {
    expect(extractInlineLawRefs("§22 ... §22 순금융재산", DEFAULT)).toEqual([
      { label: "§22", legalBasis: "상속세및증여세법 §22" },
    ]);
  });

  it("연속 인용 carry-over: '민법 §1013·§1073' → 둘 다 민법", () => {
    expect(
      extractInlineLawRefs("법정상속분(민법 §1009) 대신 (민법 §1013·§1073)", DEFAULT),
    ).toEqual([
      { label: "§1009", legalBasis: "민법 §1009" },
      { label: "§1013", legalBasis: "민법 §1013" },
      { label: "§1073", legalBasis: "민법 §1073" },
    ]);
  });

  it("외부법 토큰 뒤 다시 기본법: 제목 bare는 기본법, 토큰 뒤만 외부법", () => {
    // "과세제외 거래 (§35③)  법인세법 §52② ..." (title bare → 상증법, 법인세법 토큰 후 전환)
    expect(
      extractInlineLawRefs("과세제외 거래 (§35③)  법인세법 §52② 시가 해당", DEFAULT),
    ).toEqual([
      { label: "§35③", legalBasis: "상속세및증여세법 §35③" },
      { label: "§52②", legalBasis: "법인세법 §52②" },
    ]);
  });

  it("혼합 다법령: 단어로 끊기면 carry 안 함(기본법 복귀)", () => {
    // "조세범처벌법 §3① 벌금 / §15⑲2호 외부감사법 §39①"
    // §3①=조세범처벌법, §15(벌금/ 뒤 — 단어로 끊김)=상증법, §39①=외부감사법
    expect(
      extractInlineLawRefs(
        "조세범처벌법 §3① 벌금 / §15⑲2호 외부감사법 §39①",
        DEFAULT,
      ),
    ).toEqual([
      { label: "§3①", legalBasis: "조세범처벌법 §3①" },
      { label: "§15", legalBasis: "상속세및증여세법 §15" },
      { label: "§39①", legalBasis: "외부감사법 §39①" },
    ]);
  });

  it("국세기본법 토큰", () => {
    expect(extractInlineLawRefs("기한후신고 (국세기본법 §45의3)", DEFAULT)).toEqual([
      { label: "§45의3", legalBasis: "국세기본법 §45의3" },
    ]);
  });

  it("§ 없으면 빈 배열", () => {
    expect(extractInlineLawRefs("특수관계인 간 거래", DEFAULT)).toEqual([]);
    expect(extractInlineLawRefs("", DEFAULT)).toEqual([]);
  });
});

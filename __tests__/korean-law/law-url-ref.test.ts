/**
 * law-url 파서 anchor — 도움말 법조문 인용 → 모달 조회용 {lawName, articleNum}
 *
 * 설계: docs/02-design/features/inheritance-gift-law-citation-link.engine.design.md
 * 케이스 인벤토리 C-1~C-11 (실측 UI 인용 기반)
 */

import { describe, it, expect } from "vitest";
import {
  parseLawRef,
  parseLawRefsForModal,
  extractClauseMarkers,
} from "@/lib/utils/law-url";

describe("parseLawRef — 단일 ref (회귀 보존)", () => {
  it("C-1 정식명 + §", () => {
    expect(parseLawRef("상속세및증여세법 §19")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "19",
    });
  });

  it("C-2 약칭 상증법 + 뒤 설명 무시", () => {
    expect(parseLawRef("상증법 §22 금융재산 상속공제")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "22",
    });
  });

  it("C-3 가지번호 §18의2", () => {
    expect(parseLawRef("상증법 §18의2")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "18의2",
    });
  });

  it("C-8 조특법 §99의4", () => {
    expect(parseLawRef("조특법 §99의4")).toEqual({
      lawName: "조세특례제한법",
      articleNum: "99의4",
    });
  });

  // ── Phase 3 후속 선별 링크 신규 조문 패턴 (2026-06-15) ──
  it("C-12 조특법 §30의5 (창업자금 특례) + 뒤 설명 무시", () => {
    expect(parseLawRef("조특법 §30의5 창업자금")).toEqual({
      lawName: "조세특례제한법",
      articleNum: "30의5",
    });
  });

  it("C-13 소득세법 §104의3 (비사업용토지) — 본법 약칭+가지번호", () => {
    expect(parseLawRef("소득세법 §104의3 비사업용토지")).toEqual({
      lawName: "소득세법",
      articleNum: "104의3",
    });
  });

  it("C-14 상증령 §20의2 (동거주택 부득이사유) — 시행령 가지번호", () => {
    expect(parseLawRef("상증령 §20의2 부득이사유")).toEqual({
      lawName: "상속세및증여세법 시행령",
      articleNum: "20의2",
    });
  });

  it("C-15 상증규 §17의3 (추정이익 사유) — 시행규칙 가지번호", () => {
    expect(parseLawRef("상증규 §17의3 사유·환원율")).toEqual({
      lawName: "상속세및증여세법 시행규칙",
      articleNum: "17의3",
    });
  });

  // ── 양도세 약칭·표기 (2026-06-15, feat/transfer-law-citation-popup) ──
  it("TC-T1 소법 §97의2④2호 → 소득세법 (약칭 보강)", () => {
    expect(parseLawRef("소법 §97의2④2호")).toEqual({
      lawName: "소득세법",
      articleNum: "97의2",
    });
  });

  it("TC-T2 소령 §166⑥ → 소득세법 시행령 (약칭 보강)", () => {
    expect(parseLawRef("소령 §166⑥")).toEqual({
      lawName: "소득세법 시행령",
      articleNum: "166",
    });
  });

  it("TC-T3 소득세법시행령 §168조의14 → §+조 중복표기 흡수", () => {
    expect(parseLawRef("소득세법시행령 §168조의14")).toEqual({
      lawName: "소득세법 시행령",
      articleNum: "168의14",
    });
  });

  it("TC-T6 조특령 §98의5② → 조세특례제한법 시행령", () => {
    expect(parseLawRef("조특령 §98의5②")).toEqual({
      lawName: "조세특례제한법 시행령",
      articleNum: "98의5",
    });
  });

  // ── 현행 실패 실증 (Pre-Do anchor 핵심) ──
  it("C-7 상증령 §15 → 시행령 정식명 (현행 실패 예상)", () => {
    expect(parseLawRef("상증령 §15")).toEqual({
      lawName: "상속세및증여세법 시행령",
      articleNum: "15",
    });
  });
});

describe("parseLawRefsForModal — 복합 인용 분해", () => {
  it("C-4 상증법 §60·시행령 §49②④ → 2 refs (시행령 상속)", () => {
    expect(parseLawRefsForModal("상증법 §60·시행령 §49②④")).toEqual([
      { lawName: "상속세및증여세법", articleNum: "60" },
      { lawName: "상속세및증여세법 시행령", articleNum: "49" },
    ]);
  });

  it("C-6 상증법 §18의2 + 상증령 §15 → 2 refs", () => {
    expect(parseLawRefsForModal("상증법 §18의2 + 상증령 §15")).toEqual([
      { lawName: "상속세및증여세법", articleNum: "18의2" },
      { lawName: "상속세및증여세법 시행령", articleNum: "15" },
    ]);
  });

  it("C-11 상증규 §17의3⑤ + §56⑤ → 후속 §56 본법불명 skip(텍스트 유지)", () => {
    // §56은 실제 상증령이나, 법령명 없는 후속 §는 직전(상증규) 오상속 방지 위해 skip (DE-3)
    expect(parseLawRefsForModal("상증규 §17의3⑤ + §56⑤")).toEqual([
      { lawName: "상속세및증여세법 시행규칙", articleNum: "17의3" },
    ]);
  });

  it("TC-T5 법령명 없는 단독 §104의3 → skip(빈 배열, 회귀 보존)", () => {
    // 양도세는 법령명 생략 단독 § 흔함 — 링크하려면 legalBasis에 법령명 명시 필요
    expect(parseLawRefsForModal("§104의3")).toEqual([]);
  });
});

describe("extractClauseMarkers — 항(項) 마커 추출 (G-5 하이라이트)", () => {
  it("CM-1 단일 항 §63③", () => {
    expect(extractClauseMarkers("§63③ 할증평가")).toEqual(["③"]);
  });

  it("CM-2 복수 항 상증령 §56①④", () => {
    expect(extractClauseMarkers("상증령 §56①④ 순손익액")).toEqual(["①", "④"]);
  });

  it("CM-3 항 없음 §8 보험금 → 빈 배열(강조 없음, 전체 표시)", () => {
    expect(extractClauseMarkers("§8 보험금")).toEqual([]);
  });

  it("CM-4 §22② 금융재산공제", () => {
    expect(extractClauseMarkers("§22② 금융재산공제")).toEqual(["②"]);
  });

  it("CM-5 중복 제거·등장 순서 보존", () => {
    expect(extractClauseMarkers("상증령 §16③⑭ + §16③")).toEqual(["③", "⑭"]);
  });
});

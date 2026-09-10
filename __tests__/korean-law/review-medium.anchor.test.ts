/**
 * 1차 코드리뷰 «중간» 항목 수정의 회귀 anchor.
 *
 * 공통 성격: 전부 **조용히 어긋나는** 것들이다 — 하루 밀린 날짜, 무시되는 파라미터,
 * 갉아먹힌 법령명, 30일 고착되는 실패. 에러가 나지 않으니 안전망 없이는 재발해도 모른다.
 *
 * 정책: [[feedback_negative_anchor_needs_positive_twin]] · [[feedback_ui_engine_dual_truth_avoidance]]
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { todayYmdKst } from "@/lib/korean-law/client-core";
import { todayYmd } from "@/lib/korean-law/applicable-law";
import { parseDateRange } from "@/lib/korean-law/date-parser";
import { extractLawAndArticle } from "@/lib/korean-law/time-travel";
import { extractCitations } from "@/lib/korean-law/verify-citations";
import { searchLawInputSchema } from "@/lib/korean-law/types";

afterEach(() => vi.useRealTimers());

// ────────────────────────────────────────────────────────────────────────────
// 「오늘」 — KST 단일 소스
// ────────────────────────────────────────────────────────────────────────────

describe("TZ — 「오늘」은 한국 달력일 하나뿐이다", () => {
  it("TZ-1: KST 오전(=UTC 전날)에도 한국 날짜를 준다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T23:00:00Z")); // = 2026-09-10 08:00 KST
    // 종전 구현은 UTC 라 20260909 를 돌려줬다 → 개정 시행 당일 오전에 «직전 버전»이 현행이 됐다.
    expect(todayYmdKst()).toBe("20260910");
    expect(todayYmd()).toBe("20260910");
  });

  it("TZ-2: applicable-law 의 todayYmd 는 client-core 와 동일 함수 (중복 정의 금지)", () => {
    expect(todayYmd).toBe(todayYmdKst);
  });

  it("TZ-3: date-parser 도 같은 기준 — 「동일 기준」이라던 주석이 사실이 된다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T23:00:00Z"));
    // 실측(수정 전): todayYmd()=20260909 vs date-parser "올해" toDate=20260910 로 어긋났다.
    // ⚠ 「서로 일치」만 단언하면 둘 다 UTC 로 되돌아가도 통과한다(뮤테이션 실측 — 구별력 0).
    //   그래서 한국 달력일 구체값을 함께 못박는다.
    expect(parseDateRange("올해 판례").toDate).toBe("20260910");
    expect(parseDateRange("올해 판례").toDate).toBe(todayYmdKst());
  });

  it("TZ-4(긍정 짝): KST 오후처럼 UTC 와 날짜가 같은 시각은 그대로", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T05:00:00Z")); // = 14:00 KST
    expect(todayYmdKst()).toBe("20260910");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// efYd — 무시되던 파라미터 제거
// ────────────────────────────────────────────────────────────────────────────

describe("EF — 반영되지 않는 efYd 는 받지 않는다", () => {
  it("EF-1: 스키마에서 사라졌고, 보내와도 조용히 버려진다", () => {
    expect(Object.keys(searchLawInputSchema.shape)).not.toContain("efYd");
    const parsed = searchLawInputSchema.parse({ q: "소득세법", efYd: "20200101~20241231" });
    expect(parsed).not.toHaveProperty("efYd");
  });

  it("EF-2(긍정 짝): 실제로 반영되는 ancYd 는 그대로 남는다", () => {
    expect(searchLawInputSchema.parse({ q: "소득세법", ancYd: "20200101~20241231" }).ancYd)
      .toBe("20200101~20241231");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 법령명 추출 — 시점 표현 오염 / stopword 침식
// ────────────────────────────────────────────────────────────────────────────

describe("NAME — 법령명을 앞뒤로 갉아먹지 않는다", () => {
  it("NAME-1: 시점 표현이 법령명에 딸려 들어가지 않는다", () => {
    // 수정 전: { lawName: "년 시행 소득세법" } → fetchLawVersions NOT_FOUND
    expect(extractLawAndArticle("2021년 시행 소득세법 89조")).toEqual({
      lawName: "소득세법",
      articleNo: "제89조",
    });
    expect(extractLawAndArticle("2020 5 1 당시 소득세법 제89조의2")?.lawName).toBe("소득세법");
  });

  it("NAME-2(긍정 짝): 공백이 든 진짜 법령명은 보존된다", () => {
    expect(extractLawAndArticle("소득세법 시행령 155조")?.lawName).toBe("소득세법 시행령");
    expect(extractLawAndArticle("소득세법 89조 개정")).toEqual({
      lawName: "소득세법",
      articleNo: "제89조",
    });
  });

  it("NAME-3: stopword 로 시작하는 실재 법령명이 잘리지 않는다", () => {
    // 수정 전: 동물보호법 → "물보호법" · 위험물안전관리법 → "험물안전관리법"
    expect(extractCitations("동물보호법 제3조")[0]?.lawName).toBe("동물보호법");
    expect(extractCitations("위험물안전관리법 제5조")[0]?.lawName).toBe("위험물안전관리법");
    expect(extractCitations("법률구조법 제7조")[0]?.lawName).toBe("법률구조법");
  });

  it("NAME-4(긍정 짝): 접속어 뒤 법령명은 여전히 접속어 없이 잡힌다", () => {
    // stopword 루프를 지웠어도 정규식이 공백을 넘지 못해 이미 처리된다.
    expect(extractCitations("또한 소득세법 제89조에 따라")[0]?.lawName).toBe("소득세법");
    expect(extractCitations("따라서 지방세법 제111조")[0]?.lawName).toBe("지방세법");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// annex-content 킬 스위치 — 응답 재사용 금지
// ────────────────────────────────────────────────────────────────────────────

describe("FLAG — 비활성화 응답은 매 요청 새로 만든다", () => {
  it("FLAG-1: 킬 스위치를 켠 뒤 연속 두 번 호출해도 두 번째가 깨지지 않는다", async () => {
    const prev = process.env.LAW_ANNEX_BODY_ENABLED;
    process.env.LAW_ANNEX_BODY_ENABLED = "false";
    try {
      const { GET } = await import("@/app/api/law/annex-content/route");
      const req = () =>
        new NextRequest("http://localhost/api/law/annex-content?url=https://www.law.go.kr/x.pdf");
      // 수정 전: 모듈 레벨 상수를 재사용해 2회차에서
      //   TypeError: Body is unusable: Body has already been read
      const first = await GET(req());
      const second = await GET(req());
      expect(first.status).toBe(404);
      expect(second.status).toBe(404);
      await expect(first.json()).resolves.toHaveProperty("code");
      await expect(second.json()).resolves.toHaveProperty("code");
    } finally {
      if (prev === undefined) delete process.env.LAW_ANNEX_BODY_ENABLED;
      else process.env.LAW_ANNEX_BODY_ENABLED = prev;
    }
  });
});

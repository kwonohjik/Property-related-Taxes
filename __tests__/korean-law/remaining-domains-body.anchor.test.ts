/**
 * 나머지 8개 결정례 도메인 본문 파서 anchor — 종전엔 전부 getDecisionText 가 null(→ 「본문 제공 불가」 카드).
 *
 * 2026-10-04 표본 조사(도메인당 5~8건)로 확인한 응답 모양:
 *   · 평평  — ftc(FtcService)·nlrc(NlrcService)·fsc(FscService)·kcc(KccService)
 *   · 한 겹 — acr(AcrService.의결서)
 *   · 기본정보+본문 — ordin(LawService: 자치법규기본정보 + 조문.조[].조내용 + 제개정이유)
 *                    public(AdmRulService: 행정규칙과 같은 모양)
 *                    trty(BothTrtyService **또는** MultTrtyService: 조약기본정보 + 조약내용.조약내용)
 *   · 루트 이름이 Search→Service 치환 규칙 밖: ftc·nlrc·acr·fsc·kcc(`Ftc`→`FtcService`) · ordin(`LawService`) · trty(2종)
 *
 * 원칙:
 *   1. **당사자 개인정보는 싣지 않는다** — 피심정보·신청인·피신청인·대리인·조치대상자의인적사항·피심인·위원정보.
 *      본문이 비면 「가장 긴 문자열」을 집는 fallback 이 이들을 집어 갈 수 있으므로 원응답을 넘기지 않고
 *      필요한 필드만 새 객체로 만든다. fixture 에서 이 필드들의 값은 `SENSITIVE_*` 표지로 바꿔 두었다.
 *   2. 공정위·권익위의 `결정요지`는 요지가 아니라 「사건번호 : … 신청인 : …」 머리말 덩어리라 싣지 않는다.
 *   3. 「주문」 라벨은 원문 필드가 실제로 `주문` 일 때만(ftc·acr·kcc). 나머지는 소제목 단 「이유 / 전문」.
 *   4. ftc 일부 건은 필드가 **문자열 "null"** 로 온다 — 제목 「null」 을 띄우지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return { ...actual, fetchJson: vi.fn(), readCache: vi.fn(async () => null), writeCache: vi.fn(async () => undefined) };
});

import { fetchJson } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import type { DecisionDomain, DecisionText } from "@/lib/korean-law/types";
import F from "./fixtures/drf-body-remaining-domains.json";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

async function parse(domain: DecisionDomain, fixture: unknown): Promise<DecisionText> {
  mockFetch.mockResolvedValue(fixture);
  const t = await getDecisionText("1", domain);
  expect(t, `${domain} 이 null`).not.toBeNull();
  return t!;
}
const everything = (t: DecisionText) => JSON.stringify(t);

describe("BODY — 도메인별 본문", () => {
  it("BODY-ftc: 사건명·사건번호·의결일자, 주문은 「주문」, 이유는 본문", async () => {
    const t = await parse("ftc", F.ftc);
    expect(t.title).toContain("과징금 납부기한 연장");
    expect(t.caseNo).toBe("2011카총0367");
    expect(t.date).toBe("2011.2.22.");
    expect(t.ruling).toContain("신청을 각하한다");
    expect(t.reasoning).toContain("신청인 적격성");
  });

  it("BODY-nlrc: 판정사항·판정요지를 소제목과 함께 본문에 (판시사항 슬롯 금지)", async () => {
    const t = await parse("nlrc", F.nlrc);
    expect(t.title).toContain("부당해고 구제신청");
    expect(t.caseNo).toBe("2016부해OOO");
    expect(t.court).toBe("노동위원회");
    expect(t.date).toBe("2016.5.9.");
    expect(t.reasoning.indexOf("【판정사항】")).toBeGreaterThanOrEqual(0);
    expect(t.reasoning.indexOf("【판정요지】")).toBeGreaterThan(t.reasoning.indexOf("【판정사항】"));
    expect(t.holdings).toBe("");
  });

  it("BODY-acr: `의결서` 안에서 제목·의안번호·의결일, 주문·이유", async () => {
    const t = await parse("acr", F.acr);
    expect(t.title).toBe("112신고 처리 이의");
    expect(t.caseNo).toBe("제2020-5소위45-경01호");
    expect(t.date).toBe("2020.12.14.");
    expect(t.ruling).toContain("피신청인에게");
    expect(t.reasoning).toContain("신청취지");
  });

  it("BODY-fsc: 안건명·의결번호, 조치내용·조치이유", async () => {
    const t = await parse("fsc", F.fsc);
    expect(t.title).toContain("시세조종 금지 위반");
    expect(t.caseNo).toBe("의결 제2025-5호");
    expect(t.court).toBe("금융위원회");
    expect(t.reasoning.indexOf("【조치내용】")).toBeGreaterThanOrEqual(0);
    expect(t.reasoning.indexOf("【조치이유】")).toBeGreaterThan(t.reasoning.indexOf("【조치내용】"));
  });

  it("BODY-kcc: 안건명·안건번호·의결일자, 주문·이유", async () => {
    const t = await parse("kcc", F.kcc);
    expect(t.title).toContain("SD서비스 이용자 이익 저해행위");
    expect(t.caseNo).toBe("제2015 - 12 - 053호");
    expect(t.date).toBe("2015.3.26");
    expect(t.ruling).toContain("피심인은 HD전환");
  });

  it("BODY-ordin: 자치법규명·지자체, 조문(조내용)을 본문으로", async () => {
    const t = await parse("ordin", F.ordin);
    expect(t.title).toBe("춘천시 현황도로 재산세 비과세 적용 조례");
    expect(t.court).toBe("강원특별자치도 춘천시");
    expect(t.date).toBe("20251120");
    expect(t.reasoning).toContain("제1조(목적)");
    expect(t.reasoning).not.toMatch(/\[object|조문여부/);
  });

  it.each([["trty_both", "네덜란드왕국"], ["trty_mult", "국제소맥협정"]] as const)(
    "BODY-trty: 양자·다자 루트 둘 다 읽는다 (%s)",
    async (key, kw) => {
      const t = await parse("trty", F[key]);
      expect(t.title).toContain(kw);
      expect(t.caseNo.length).toBeGreaterThan(0);
      expect(t.reasoning.length).toBeGreaterThan(20);
    }
  );

  it("BODY-public: 행정규칙과 같은 모양 — 규정명·발령번호·부처, 조문을 본문으로", async () => {
    const t = await parse("public", F.public);
    expect(t.title).toBe("(거제해양관광개발공사) 감사 규정");
    expect(t.caseNo).toBe("186");
    expect(t.court).toBe("거제해양관광개발공사");
    expect(t.reasoning).toContain("총  칙");
  });
});

describe("SAFE — 개인정보·잘못된 라벨·가짜 값", () => {
  it.each(["ftc", "acr", "fsc", "kcc", "ordin", "public"] as const)(
    "SAFE-1: %s 결과 어디에도 당사자 정보(SENSITIVE_*)가 없다",
    async (d) => {
      const t = await parse(d, F[d]);
      expect(everything(t)).not.toContain("SENSITIVE_");
    }
  );

  it.each(["ftc", "acr"] as const)("SAFE-2: %s 의 「결정요지」 머리말 덩어리를 싣지 않는다", async (d) => {
    const t = await parse(d, F[d]);
    expect(everything(t)).not.toMatch(/사건번호\s*:|의안번호\s*:/);
  });

  it.each(["nlrc", "fsc", "ordin", "trty_both", "public"] as const)(
    "SAFE-3: 원문에 `주문`이 없는 %s 에는 「판시사항·판결요지·주문」 슬롯을 쓰지 않는다",
    async (key) => {
      const t = await parse(key.startsWith("trty") ? "trty" : (key as DecisionDomain), F[key]);
      expect(t.holdings).toBe("");
      expect(t.summary).toBeUndefined();
      expect(t.ruling).toBeUndefined();
    }
  );

  it("SAFE-4: 필드가 문자열 \"null\" 인 공정위 건 — 제목 「null」 을 띄우지 않는다", async () => {
    mockFetch.mockResolvedValue(F.ftc_nullStrings);
    const t = await getDecisionText("18701", "ftc");
    expect(t?.title ?? "(null 반환)").not.toBe("null");
    expect(t?.caseNo ?? "").not.toBe("null");
  });
});

describe("IMG — 이미지로만 온 본문", () => {
  it("IMG-1: 방통위 「이유」가 이미지뿐이면 그렇다고 말한다 (주문은 그대로, 엉뚱한 fallback 금지)", async () => {
    // 실측: kcc 이유는 `<img src=…flDownload…>` 10~19장뿐, 태그를 빼면 텍스트 0자(3/3). fixture 원문 그대로.
    const t = await parse("kcc", F.kcc);
    expect(t.ruling).toContain("피심인은 HD전환");
    expect(t.reasoning).toContain("이미지로만");
    expect(t.reasoning).not.toContain("피심인은 HD전환"); // 주문이 본문 자리에 중복으로 들어가지 않는다
  });

  it("IMG-2: 링크가 없는 도메인에서 「아래 원문 링크에서 확인」 이라고 말하지 않는다", async () => {
    mockFetch.mockResolvedValue({ FscService: { 안건명: "안건", 의결번호: "의결 제1호", 기관명: "금융위원회", 조치내용: "", 조치이유: "" } });
    const t = await getDecisionText("1", "fsc");
    expect(t!.sourceUrl).toBeUndefined();
    expect(t!.reasoning).not.toContain("아래 법제처 원문 링크");
  });

  it("IMG-3(긍정 짝): 링크가 있는 도메인의 본문 없음 안내는 링크를 가리킨다", async () => {
    mockFetch.mockResolvedValue({ NlrcService: { 제목: "제목", 사건번호: "서울2017조정OO", 기관명: "노동위원회", 판정사항: "", 판정요지: "", 판정결과: "", 내용: "" } });
    const t = await getDecisionText("77", "nlrc");
    expect(t!.sourceUrl).toBeDefined();
    expect(t!.reasoning).toContain("아래 법제처 원문 링크");
  });
});

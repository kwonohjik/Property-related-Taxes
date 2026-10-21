/**
 * verify-citations 테스트 — 네트워크 호출 mocked
 *
 * 검증 대상:
 *  - extractCitations: 법령명 역추적 + stopword 제거 + dedup
 *  - verifyCitations: ✓/✗/⚠ 3분류 + [HALLUCINATION_DETECTED] 헤더
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── client 모킹 (네트워크 호출 차단) ─────────────────────────────────────
vi.mock("@/lib/korean-law/client", () => ({
  searchLaw: vi.fn(),
  getLawText: vi.fn(),
}));

import { extractCitations, verifyCitations } from "@/lib/korean-law/verify-citations";
import { getLawText, searchLaw } from "@/lib/korean-law/client";

const mockGetLawText = getLawText as ReturnType<typeof vi.fn>;
const mockSearchLaw = searchLaw as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetLawText.mockReset();
  mockSearchLaw.mockReset();
});

describe("verify-citations: extractCitations", () => {
  it("단순 인용 1건 추출", () => {
    const text = "소득세법 제89조에 따라 비과세입니다.";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].lawName).toBe("소득세법");
    expect(citations[0].articleNo).toBe("제89조");
  });

  it("조의N 형식", () => {
    const text = "상속세및증여세법 제18조의2 동거주택 공제";
    const citations = extractCitations(text);
    expect(citations[0].articleNo).toBe("제18조의2");
  });

  it("항·호 포함", () => {
    const text = "소득세법 제104조 제7항 제2호 중과세";
    const citations = extractCitations(text);
    expect(citations[0].hang).toBe(7);
    expect(citations[0].ho).toBe(2);
  });

  it("stopword 접두사 제거 — \"또한 소득세법\"", () => {
    const text = "또한 소득세법 제89조에 따라";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
    expect(citations[0].lawName).toBe("소득세법");
  });

  it("stopword 접두사 제거 — \"따라서 지방세법\"", () => {
    const text = "따라서 지방세법 제111조의 취득세율이 적용됩니다.";
    const citations = extractCitations(text);
    expect(citations[0].lawName).toBe("지방세법");
  });

  it("dedup — 동일 인용 중복 제거", () => {
    const text =
      "소득세법 제89조에 따라 비과세입니다. 또한 소득세법 제89조 규정에 따라 추가로 ...";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(1);
  });

  it("여러 인용 동시 추출", () => {
    const text =
      "소득세법 제89조와 지방세법 제111조 및 종합부동산세법 제8조에 따라";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(3);
    expect(citations.map((c) => c.lawName)).toEqual([
      "소득세법",
      "지방세법",
      "종합부동산세법",
    ]);
  });

  it("법령명 없이 조문만 있으면 추출 제외", () => {
    const text = "제89조에 따라 처리합니다.";
    const citations = extractCitations(text);
    expect(citations).toHaveLength(0);
  });

  it("빈 텍스트 → 빈 배열", () => {
    expect(extractCitations("")).toEqual([]);
  });

  // 종전엔 공백 띄운 공식 이름 「소득세법 시행령」을 회복하지 못해 **0건**이었다 — 시행령 인용이 검증 없이 통과했다.
  it("「소득세법 시행령 제155조 제20항」 — 공백 띄운 시행령 이름", () => {
    const citations = extractCitations("소득세법 시행령 제155조 제20항에 따라 비과세한다.");
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ lawName: "소득세법 시행령", articleNo: "제155조", hang: 20 });
  });

  it("「소득세법 시행규칙 제71조 제2항」 — 시행규칙도 같다", () => {
    expect(extractCitations("소득세법 시행규칙 제71조 제2항")[0]).toMatchObject({ lawName: "소득세법 시행규칙", articleNo: "제71조", hang: 2 });
  });

  it("법령명 없는 「시행령 제155조」는 여전히 추출하지 않는다", () => {
    expect(extractCitations("시행령 제155조 제1항에 따라")).toHaveLength(0);
  });

  // 종전엔 법령명이 「시행령」으로 잡히고 ⑪ 이상 항이 빠졌다
  it("§ 표기 — 「소득세법 시행령 §155⑳」·「§155㉑」의 법령명과 항", () => {
    expect(extractCitations("소득세법 시행령 §155⑳ 장기임대주택")[0]).toMatchObject({ lawName: "소득세법 시행령", articleNo: "제155조", hang: 20 });
    expect(extractCitations("소득세법 시행령 §155㉑")[0]).toMatchObject({ lawName: "소득세법 시행령", articleNo: "제155조", hang: 21 });
    expect(extractCitations("소득세법 §89①3호")[0]).toMatchObject({ lawName: "소득세법", articleNo: "제89조", hang: 1, ho: 3 });
  });

  it("「상속세 및 증여세법 시행령」 — 「및」으로 이은 공식 이름을 자르지 않는다", () => {
    expect(extractCitations("상속세 및 증여세법 시행령 제15조 제1항")[0]).toMatchObject({ lawName: "상속세 및 증여세법 시행령", articleNo: "제15조", hang: 1 });
    expect(extractCitations("상속세 및 증여세법 시행령 §15①")[0]).toMatchObject({ lawName: "상속세 및 증여세법 시행령", articleNo: "제15조", hang: 1 });
  });

  it("법령명과 「시행령」 사이 공백이 두 칸이어도 회복한다", () => {
    expect(extractCitations("소득세법  시행령 제155조")[0]).toMatchObject({ lawName: "소득세법 시행령", articleNo: "제155조" });
  });

  // `[^\s,.)]*`가 「·§155①」까지 한 덩어리로 잡으면 parseCitation은 뒤 세그먼트의 ①을 항으로 읽는다 — ⑳이 검증되지 않았다
  it("「§155⑳·§155①」 — 「§N」 바로 뒤 원숫자가 우선한다", () => {
    expect(extractCitations("소득세법 시행령 §155⑳·§155①")[0]).toMatchObject({ articleNo: "제155조", hang: 20 });
  });

  it("같은 조문의 「제N조」·「§N」 표기는 한 건으로 합친다", () => {
    expect(extractCitations("소득세법 시행령 제155조 제20항과 소득세법 시행령 §155⑳")).toHaveLength(1);
  });
});

// 계획서 docs/00-pm/one-house-ai-recorded-leftovers.plan.md §3.1 (F-2~F-6)
describe("verify-citations: 법령명 회복 — 낫표·꼬리·상대 인용·이어받기", () => {
  const names = (text: string) => extractCitations(text).map((c) => [c.lawName, c.articleNo, c.hang ?? null]);

  // 종전엔 역추적 창이 「」」로 끝나 0건이었다 — 해석례 원문의 낫표 인용을 하나도 검사하지 않았다
  it("낫표 이름 — 「」·반각 ｢｣ 모두", () => {
    expect(names("「소득세법 시행령」 제155조 제20항에 따라")).toEqual([["소득세법 시행령", "제155조", 20]]);
    expect(names("｢민간임대주택에 관한 특별법｣ 제43조")).toEqual([["민간임대주택에 관한 특별법", "제43조", null]]);
    expect(names("「조세특례제한법」 §99의2①")).toEqual([["조세특례제한법", "제99조의2", 1]]);
  });

  // 종전엔 「특별법」으로 잡혀 법제처 검색이 다른 특별법(이태원참사 특별법 §43)을 「확인됨」으로 돌려줬다
  it("낫표 없는 띄어 쓴 이름 — 별칭 표의 정식명이면 그 이름, 아니면 꼬리만 잡히므로 추출하지 않는다", () => {
    expect(names("민간임대주택에 관한 특별법 제43조")).toEqual([["민간임대주택에 관한 특별법", "제43조", null]]);
    expect(names("국토의 계획 및 이용에 관한 법률 제117조")).toEqual([["국토의 계획 및 이용에 관한 법률", "제117조", null]]);
    expect(names("어린이놀이시설 안전관리에 관한 특별법 제12조")).toEqual([]);
    expect(names("주택임대차 보호에 관한 법률 제3조")).toEqual([]);
  });

  // 「및」 앞 단어를 정규식으로 붙이면 「과천시 및 택지개발촉진법」처럼 문장을 이름으로 읽는다 — 별칭 표 이름만 늘린다
  it("「상속세 및 증여세법」 본법은 통째로 · 「과천시 및 택지개발촉진법」은 택지개발촉진법", () => {
    expect(names("상속세 및 증여세법 제18조")).toEqual([["상속세 및 증여세법", "제18조", null]]);
    expect(names("과천시 및 택지개발촉진법 제3조")).toEqual([["택지개발촉진법", "제3조", null]]);
    expect(names("취지 및 소득세법 시행령 제155조")).toEqual([["소득세법 시행령", "제155조", null]]);
  });

  // 「및」 앞머리가 앞 조문의 「조」까지 삼켰다(PR-0 회귀)
  it("「제89조 및 소득세법 시행령」 — 앞 조문 글자를 법령명에 넣지 않는다", () => {
    expect(names("소득세법 제89조 및 소득세법 시행령 제155조")).toEqual([
      ["소득세법", "제89조", null],
      ["소득세법 시행령", "제155조", null],
    ]);
  });

  it("옛 조문 인용(「구 「…」」·이름 뒤 개정 괄호)은 현행으로 대조하지 않도록 추출하지 않는다", () => {
    expect(names("구 「소득세법 시행령」 제155조")).toEqual([]);
    expect(names("「소득세법 시행령(2022. 5. 31. 대통령령 제32654호로 개정된 것)」 제155조")).toEqual([]);
    expect(names("소득세법 시행령(2020. 2. 11. 대통령령 제30395호로 개정되기 전의 것) 제155조 제20항")).toEqual([]);
  });

  // 종전엔 「같은법시행령」·「동법」이 법령명으로 잡혀 거짓 「찾지 못함」이 됐다. 「앞 인용의 법령」을 따르게 하면
  // 관련 법령 목록의 「(4) 같은 법 시행령」처럼 다른 법령을 가리키는 경우가 표본 20건 중 3건이었다 ⇒ 검사하지 않는다
  it("상대 인용 — 「같은 법」「동법 시행령」「같은 영」「동법령」은 추출하지 않는다", () => {
    expect(names("소득세법 제89조와 동법 시행령 제154조 및 같은 영 제155조, 같은 법 제95조")).toEqual([["소득세법", "제89조", null]]);
    expect(names("같은법시행령 제155조")).toEqual([]);
    expect(names("동법 §95")).toEqual([]);
    expect(names("「같은 법」 제95조")).toEqual([]);
    expect(names("소득세법 제89조 및 동법령 제155조")).toEqual([["소득세법", "제89조", null]]);
    // 건너뛴 상대 인용 뒤의 「및 제156조」도 이어받지 않는다(바로 앞 인용이 상대 인용이다)
    expect(names("소득세법 제89조, 같은 법 시행령 제155조 및 제156조")).toEqual([["소득세법", "제89조", null]]);
  });

  it("이어받기 — 접속어만 사이에 둔 조문·§ 인용은 앞 법령명", () => {
    expect(names("소득세법 시행령 제155조 제1항 및 제156조의2")).toEqual([
      ["소득세법 시행령", "제155조", 1],
      ["소득세법 시행령", "제156조의2", null],
    ]);
    expect(names("소득세법 §89①3호·§95②")).toEqual([
      ["소득세법", "제89조", 1],
      ["소득세법", "제95조", 2],
    ]);
    // 이름 없는 조문 뒤는 이어받을 것이 없다
    expect(names("주택으로 보아 제155조 및 제156조")).toEqual([]);
  });

  it("붙여 쓴 「소득세법시행령」은 띄운 이름과 한 건", () => {
    expect(names("소득세법시행령 제155조와 소득세법 시행령 제155조")).toEqual([["소득세법 시행령", "제155조", null]]);
  });
});

describe("verify-citations: 16항 이상 항 확인", () => {
  const decree155 = (body: string) => ({
    title: "1세대1주택의 특례",
    fullText: `제155조(1세대1주택의 특례) ① 국내에 1개의 주택을 소유한 1세대가\n${body}`,
    lawName: "소득세법 시행령",
    articleNo: "제155조",
    sourceUrl: "",
  });

  it("현행 경로의 꺾쇠 표기 `<21>`도 21항으로 본다", async () => {
    mockGetLawText.mockResolvedValue(decree155("<21> 1세대가 장기임대주택의 임대기간요건"));
    const result = await verifyCitations("소득세법 시행령 제155조 제21항");
    expect(result.citations[0].status).toBe("verified");
  });

  it("원숫자 ㉑도 21항으로 본다", async () => {
    mockGetLawText.mockResolvedValue(decree155("㉑ 1세대가 장기임대주택의 임대기간요건"));
    const result = await verifyCitations("소득세법 시행령 §155㉑");
    expect(result.citations[0].status).toBe("verified");
  });

  it("없는 항(26)은 환각 — 꺾쇠·원숫자 어느 쪽에도 없다", async () => {
    mockGetLawText.mockResolvedValue(decree155("<25> 제1항을 적용할 때 ㉕"));
    const result = await verifyCitations("소득세법 시행령 제155조 제26항");
    expect(result.citations[0].status).toBe("not_found");
  });
});

describe("verify-citations: verifyCitations (mocked)", () => {
  it("모든 인용 실존 → [VERIFIED]", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ...",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "https://www.law.go.kr/법령/소득세법",
    });

    const result = await verifyCitations("소득세법 제89조에 따라 비과세입니다.");
    expect(result.header).toBe("[VERIFIED]");
    expect(result.isError).toBe(false);
    expect(result.verifiedCount).toBe(1);
    expect(result.hallucinationCount).toBe(0);
    expect(result.citations[0].status).toBe("verified");
  });

  it("조문 미존재 → [HALLUCINATION_DETECTED]", async () => {
    mockGetLawText.mockResolvedValue(null);
    mockSearchLaw.mockResolvedValue({
      lawName: "소득세법",
      lawId: "001",
      mst: "000",
      promulgationDate: "20240101",
    });

    const result = await verifyCitations("소득세법 제9999조에 따라");
    expect(result.header).toBe("[HALLUCINATION_DETECTED]");
    expect(result.isError).toBe(true);
    expect(result.hallucinationCount).toBe(1);
    expect(result.citations[0].status).toBe("not_found");
    expect(result.citations[0].reason).toContain("제9999조");
  });

  it("법령 자체가 없음 → [HALLUCINATION_DETECTED] + 법령 없음 메시지", async () => {
    mockGetLawText.mockResolvedValue(null);
    mockSearchLaw.mockResolvedValue(null);

    const result = await verifyCitations("허구의법 제1조에 따라");
    expect(result.isError).toBe(true);
    expect(result.citations[0].reason).toContain("찾지 못했습니다");
  });

  it("API 호출 실패 → [PARTIAL_VERIFIED]", async () => {
    mockGetLawText.mockRejectedValue(new Error("upstream 502"));

    const result = await verifyCitations("소득세법 제89조에 따라");
    expect(result.header).toBe("[PARTIAL_VERIFIED]");
    expect(result.isError).toBe(false); // 환각 아님
    expect(result.failedCount).toBe(1);
    expect(result.citations[0].status).toBe("failed");
  });

  it("인용 없음 → [VERIFIED] + 빈 배열", async () => {
    const result = await verifyCitations("일반 세무 안내 텍스트입니다.");
    expect(result.header).toBe("[VERIFIED]");
    expect(result.totalCount).toBe(0);
    expect(result.citations).toEqual([]);
  });

  it("혼합: 1건 실존 + 1건 환각 → [HALLUCINATION_DETECTED]", async () => {
    mockGetLawText.mockImplementation(async (lawName, articleNo) => {
      if (articleNo === "제89조") {
        return {
          title: "비과세",
          fullText: "제89조 본문",
          lawName,
          articleNo,
          sourceUrl: "",
        };
      }
      return null;
    });
    mockSearchLaw.mockResolvedValue({
      lawName: "소득세법",
      lawId: "001",
      mst: "000",
      promulgationDate: "20240101",
    });

    const result = await verifyCitations(
      "소득세법 제89조와 소득세법 제9999조"
    );
    expect(result.header).toBe("[HALLUCINATION_DETECTED]");
    expect(result.verifiedCount).toBe(1);
    expect(result.hallucinationCount).toBe(1);
  });

  it("항 검증 — 존재하는 항은 verified", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ② 해외 ③ 기타",
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "",
    });

    const result = await verifyCitations("소득세법 제89조 제2항에 따라");
    expect(result.verifiedCount).toBe(1);
    expect(result.citations[0].hang).toBe(2);
  });

  it("항 검증 — 존재하지 않는 항은 환각", async () => {
    mockGetLawText.mockResolvedValue({
      title: "양도소득세 비과세",
      fullText: "제89조 ① 다음 각 호의 소득 ② 해외", // 3항 없음
      lawName: "소득세법",
      articleNo: "제89조",
      sourceUrl: "",
    });

    const result = await verifyCitations("소득세법 제89조 제99항에 따라");
    expect(result.hallucinationCount).toBe(1);
    expect(result.citations[0].reason).toContain("제99항");
  });

  it("maxCitations 제한 + 안내 메시지", async () => {
    mockGetLawText.mockResolvedValue({
      title: "",
      fullText: "",
      lawName: "",
      articleNo: "",
      sourceUrl: "",
    });

    const text = Array.from({ length: 30 }, (_, i) => `소득세법 제${i + 1}조`).join(" ");
    const result = await verifyCitations(text, { maxCitations: 5 });
    expect(result.citations).toHaveLength(5);
    expect(result.totalCount).toBe(30);
    expect(result.summary).toContain("최대 5건만 검증");
  });
});

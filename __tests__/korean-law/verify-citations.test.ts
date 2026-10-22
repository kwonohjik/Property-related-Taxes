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

  // 종전엔 「같은법시행령」·「동법」이 법령명으로 잡혀 거짓 「찾지 못함」이 됐다. 지금은 같은 줄에서 마지막으로 이름이 나온
  // 법령을 따른다(계획서 Q-1 a). 「같은 영」은 앞 이름이 시행령일 때만 — 여기서는 앞 이름이 「소득세법」이라 건너뛴다
  it("상대 인용 — 「같은 법」「동법 시행령」은 앞 이름을 따르고, 가를 수 없는 「같은 영」「동법령」·이름 없는 것은 건너뛴다", () => {
    expect(names("소득세법 제89조와 동법 시행령 제154조 및 같은 영 제155조, 같은 법 제95조")).toEqual([
      ["소득세법", "제89조", null],
      ["소득세법 시행령", "제154조", null],
      ["소득세법", "제95조", null],
    ]);
    expect(names("같은법시행령 제155조")).toEqual([]);
    expect(names("동법 §95")).toEqual([]);
    expect(names("「같은 법」 제95조")).toEqual([]);
    expect(names("소득세법 제89조 및 동법령 제155조")).toEqual([["소득세법", "제89조", null]]);
    // 해소된 상대 인용 뒤의 「및 제156조」는 그 법령을 이어받는다
    expect(names("소득세법 제89조, 같은 법 시행령 제155조 및 제156조")).toEqual([
      ["소득세법", "제89조", null],
      ["소득세법 시행령", "제155조", null],
      ["소득세법 시행령", "제156조", null],
    ]);
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

// 계획서 docs/00-pm/law-citation-residuals.plan.md §5 P-1~P-8 — 착수 전 이 동작들을 지키는 테스트가 0건이었다(P0-1·P0-4)
describe("verify-citations: 띄어 쓴 가지 번호 · 앞 이름 · 항 이어짐 · 옛 이름", () => {
  const names = (text: string) => extractCitations(text).map((c) => [c.lawName, c.articleNo, c.hang ?? null]);
  const full = (text: string) => extractCitations(text).map((c) => [c.lawName, c.articleNo, c.hang ?? null, c.ho ?? null]);

  // 종전엔 「제99조」로 읽었다 — 그 조문은 대개 실존해 다른 조문으로 「확인됨」이 됐다
  it("P-1 「제99조의 2」「제 89 조」 — 띄어 써도 같은 조문", () => {
    expect(names("소득세법 제99조의 2 제1항")).toEqual([["소득세법", "제99조의2", 1]]);
    expect(names("조세특례제한법 제99조 의2에 따라")).toEqual([["조세특례제한법", "제99조의2", null]]);
    expect(names("소득세법 제 89 조")).toEqual([["소득세법", "제89조", null]]);
  });

  it("P-2 「의」 뒤 숫자가 가지 번호가 아니면(「1세대」「10년」) 가지 번호로 읽지 않는다", () => {
    expect(names("소득세법 시행령 제154조의 1세대1주택 비과세")).toEqual([["소득세법 시행령", "제154조", null]]);
    expect(names("조세특례제한법 제97조의 10년 이상 임대")).toEqual([["조세특례제한법", "제97조", null]]);
  });

  it("P-3 상대 인용 — 조문 없이 이름만 나온 법률도 앞 이름이다 · 「같은 영」은 앞 이름이 시행령일 때", () => {
    expect(names("소득세법 제89조 및 같은 법 시행령 제154조")).toEqual([
      ["소득세법", "제89조", null],
      ["소득세법 시행령", "제154조", null],
    ]);
    expect(names("도시 및 주거환경정비법에 따른 관리처분계획(같은 법 제74조)")).toEqual([["도시 및 주거환경정비법", "제74조", null]]);
    expect(names("「소득세법 시행령」 제154조 제1항 및 같은 영 제155조 제3항")).toEqual([
      ["소득세법 시행령", "제154조", 1],
      ["소득세법 시행령", "제155조", 3],
    ]);
  });

  it("P-4 목록 표시를 넘거나 줄이 바뀌면 상대 인용을 건너뛴다", () => {
    expect(names("(1) 소득세법 제89조 (2) 택지개발촉진법 제2조 (3) 같은 법 시행령 제3조")).toEqual([
      ["소득세법", "제89조", null],
      ["택지개발촉진법", "제2조", null],
    ]);
    expect(names("택지개발촉진법 제2조\n같은 법 제5조")).toEqual([["택지개발촉진법", "제2조", null]]);
    expect(names("택지개발촉진법 제2조 및 같은 법 시행령 제3조")).toEqual([
      ["택지개발촉진법", "제2조", null],
      ["택지개발촉진법 시행령", "제3조", null],
    ]);
  });

  it("P-5 약칭 — 인용 중인 조문 머리가 시행령·시행규칙이면 「법」은 모법, 「영」은 모법 시행령(붙여 쓴 이름 포함)", () => {
    expect(names("소득세법 시행령 제154조【1세대1주택의 범위】 ① 법 제89조제1항제3호에서")).toEqual([
      ["소득세법 시행령", "제154조", null],
      ["소득세법", "제89조", 1],
    ]);
    expect(names("소득세법 시행규칙 제71조【1세대1주택의 범위】 ② 영 제154조 제1항")).toEqual([
      ["소득세법 시행규칙", "제71조", null],
      ["소득세법 시행령", "제154조", 1],
    ]);
    expect(names("주차장법시행령 제6조(부설주차장의 설치기준) ① 법 제19조 제3항")).toEqual([
      ["주차장법 시행령", "제6조", null],
      ["주차장법", "제19조", 3],
    ]);
  });

  // 조문 본문 속 다른 시행령 언급을 앞 이름으로 잡으면 「법 제97조」가 소득세법으로 읽혔다(원문 묶음 표본 30건 중 2건)
  it("P-5b 약칭 — 조문 본문 안에서 언급된 다른 시행령이 아니라 조문 머리를 따른다", () => {
    expect(names("조세특례제한법 시행령 제97조【장기임대주택】 ② 「소득세법 시행령」 제32조를 준용한다. ③ 법 제97조 제3항")).toEqual([
      ["조세특례제한법 시행령", "제97조", null],
      ["소득세법 시행령", "제32조", null],
      ["조세특례제한법", "제97조", 3],
    ]);
  });

  it("P-6 약칭 — 앞 이름이 법률이거나 「이 법」이면 건너뛴다", () => {
    expect(names("소득세법 제89조에 따라 비과세하되 법 제95조")).toEqual([["소득세법", "제89조", null]]);
    expect(names("소득세법 시행령 제154조 … 이 법 제2조")).toEqual([["소득세법 시행령", "제154조", null]]);
    // 조문 머리가 없으면(본문 속 언급뿐) 정하지 않는다
    expect(names("소득세법 시행령 제155조 제1항에 따른 일시적 2주택은 법 제89조")).toEqual([["소득세법 시행령", "제155조", 1]]);
  });

  it("P-7 항·호만 이어진 인용과 「같은 조」는 같은 조문", () => {
    expect(names("소득세법 시행령 제155조 제20항 및 제21항")).toEqual([
      ["소득세법 시행령", "제155조", 20],
      ["소득세법 시행령", "제155조", 21],
    ]);
    expect(full("소득세법 제89조 제1항 제3호 및 제4호")).toEqual([
      ["소득세법", "제89조", 1, 3],
      ["소득세법", "제89조", 1, 4],
    ]);
    expect(names("소득세법 시행령 제155조 제1항, 같은 조 제2항")).toEqual([
      ["소득세법 시행령", "제155조", 1],
      ["소득세법 시행령", "제155조", 2],
    ]);
    // 줄이 바뀐 「같은 조」는 무엇을 가리키는지 정하지 않는다
    expect(names("소득세법 시행령 제155조 제1항\n같은 조 제2항")).toEqual([["소득세법 시행령", "제155조", 1]]);
    // 괄호 속 인용을 넘은 「같은 조」는 괄호 앞 조문일 수 있다 — 정하지 않는다
    expect(names("소득세법 시행령 제154조 제1항(고가주택은 같은 영 제160조) 같은 조 제2항")).toEqual([
      ["소득세법 시행령", "제154조", 1],
      ["소득세법 시행령", "제160조", null],
    ]);
    // 개정하는 법률(「주택법 일부개정법률」)은 법령명이 아니다
    expect(names("법률 제14866호 주택법 일부개정법률 제63조의2")).toEqual([]);
  });

  // 종전엔 「구 」를 건너뛰고 「소득세법」만 잡아 현행으로 검사했다(원문 묶음 89회) — 「구 「…」」 제외와 맞춘다
  it("P-8 「구 X법」과 그것(또는 개정 괄호가 붙은 이름)을 가리키는 상대 인용·약칭은 추출하지 않는다", () => {
    expect(names("구 소득세법 제89조")).toEqual([]);
    expect(names("구소득세법 제89조")).toEqual([]);
    expect(names("구 상속세 및 증여세법 제18조")).toEqual([]);
    expect(names("「구 소득세법 시행령」 제166조")).toEqual([]);
    expect(names("구법 제89조 및 구시행령 제154조")).toEqual([]);
    expect(names("구 소득세법 제94조의 권리로서 같은 법 제89조")).toEqual([]);
    expect(names("소득세법 시행규칙(2011. 3. 28. 기획재정부령 제195호로 개정되기 전의 것) 제72조 ② 법 제89조")).toEqual([]);
    // 「구강보건법」처럼 「구」로 시작하는 이름은 그대로
    expect(names("구강보건법 제5조")).toEqual([["구강보건법", "제5조", null]]);
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

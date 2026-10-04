/**
 * 법령해석례(expc)·행정규칙(admrul) 본문 조회 anchor — 두 도메인 모두 getDecisionText 가 null 이었다.
 *
 * 2026-10-04 실측: 앱 경로로 expc 5/5, admrul 4/5 가 null → decision-text 라우트가 404 를 돌려
 * 화면엔 「해당 결정 본문을 찾을 수 없습니다」만 뜨고 상세 화면(원문 링크 포함)에 도달하지 못했다.
 *   · expc  — 본문 응답 루트는 `ExpcService` 인데 코드는 `"Expc".replace("Search","Service")`(치환 없음 →
 *             `Expc`)로 찾아 어긋났다. 응답 전체가 컨테이너가 되어 필드를 못 읽고 null.
 *   · admrul — 루트는 맞지만 본문이 평평하지 않다: `행정규칙기본정보`(객체) + `조문내용`(배열 14/17·
 *             단일 문자열 3/17) + `제개정이유.제개정이유내용`(**배열의 배열**, 키 자체가 없는 건도 있다).
 *
 * 법령 용어를 틀리게 붙이지 않는다: 화면은 holdings·summary·ruling 을 「판시사항」·「판결요지」·「주문」
 * 으로 고정 표기한다. 해석례의 질의요지·회답이나 행정규칙의 제개정이유는 그 어휘가 아니므로
 * 소제목(【】)을 단 채 중립 라벨 「이유 / 전문」(reasoning) 한 영역에 싣는다.
 *
 * fixture: `fixtures/drf-body-expc-admrul.json` — 실응답에서 문자열은 앞 240자, 배열은 앞 3개만 남겼다
 * (키·타입·중첩 구조는 원문 그대로). 손으로 만든 이상적인 JSON 이 아니다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/korean-law/client-core", async (orig) => {
  const actual = await orig<typeof import("@/lib/korean-law/client-core")>();
  return {
    ...actual,
    fetchJson: vi.fn(),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => undefined),
  };
});

import { fetchJson, readCache } from "@/lib/korean-law/client-core";
import { getDecisionText } from "@/lib/korean-law/client-decisions-text";
import fixtures from "./fixtures/drf-body-expc-admrul.json";

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;
const mockReadCache = readCache as ReturnType<typeof vi.fn>;

const EXPC = fixtures.expc;
const ADM_ARRAY = fixtures.admrul_arrayArticles.body;
const ADM_STRING = fixtures.admrul_stringArticles.body;
const ADM_NO_REASON = fixtures.admrul_noReason.body;

beforeEach(() => vi.clearAllMocks());

describe("EXPC — 법령해석례 본문", () => {
  it("EXPC-1: 응답 루트 `ExpcService` 에서 안건번호·안건명·기관·일자를 읽는다 (종전엔 null)", async () => {
    mockFetch.mockResolvedValue(EXPC);
    const t = await getDecisionText("313499", "expc");
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ target: "expc", ID: "313499" });
    expect(t).not.toBeNull();
    expect(t!.caseNo).toBe("12-0368");
    expect(t!.title).toContain("공익사업용 토지");
    expect(t!.court).toBe("기획재정부");
    expect(t!.date).toBe("20120712");
  });

  it("EXPC-2: 질의요지 → 회답 → 이유 순으로 소제목과 함께 「이유 / 전문」 한 영역에 싣는다", async () => {
    mockFetch.mockResolvedValue(EXPC);
    const t = await getDecisionText("313499", "expc");
    const r = t!.reasoning;
    const [q, a, why] = ["【질의요지】", "【회답】", "【이유】"].map((h) => r.indexOf(h));
    expect(q).toBeGreaterThanOrEqual(0);
    expect(a).toBeGreaterThan(q);
    expect(why).toBeGreaterThan(a);
    expect(r).toContain("자연공원법"); // 질의요지 실제 내용
  });

  it("EXPC-3: 해석례에 「판시사항·판결요지·주문」 라벨을 붙이지 않는다", async () => {
    mockFetch.mockResolvedValue(EXPC);
    const t = await getDecisionText("313499", "expc");
    expect(t!.holdings).toBe("");
    expect(t!.summary).toBeUndefined();
    expect(t!.ruling).toBeUndefined();
  });

  it("EXPC-4: 캐시 키가 v3 — 종전 파서가 남긴 빈약한 결과를 30일간 재사용하지 않는다", async () => {
    mockFetch.mockResolvedValue(EXPC);
    await getDecisionText("313499", "expc");
    expect(mockReadCache.mock.calls[0][0]).toMatch(/^decision_text_expc_313499_comp_v3$/);
  });
});

describe("ADM — 행정규칙 본문", () => {
  it("ADM-1: 제목·발령번호·소관부처·시행일자를 `행정규칙기본정보` 에서 읽는다", async () => {
    mockFetch.mockResolvedValue(ADM_ARRAY);
    const t = await getDecisionText("2100000281776", "admrul");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("양도소득세 사무처리규정");
    expect(t!.caseNo).toBe("2751");
    expect(t!.court).toBe("국세청");
    expect(t!.date).toBe("20260705");
  });

  it("ADM-2: 조문내용(배열)을 본문으로, 제개정이유(배열의 배열)를 소제목 아래 뒤에 싣는다", async () => {
    mockFetch.mockResolvedValue(ADM_ARRAY);
    const t = await getDecisionText("2100000281776", "admrul");
    const r = t!.reasoning;
    const body = r.indexOf("총칙");
    const head = r.indexOf("【제개정이유】");
    expect(body).toBeGreaterThanOrEqual(0);
    expect(head).toBeGreaterThan(body);
    expect(r.indexOf("행정규칙 속 어려운 용어 정비")).toBeGreaterThan(head);
    // 중첩 배열이 `a,b,c` 로 문자열화되거나 `[object …]` 로 새지 않는다
    expect(r).not.toMatch(/\[object|,◇|^\s*\[/);
    expect(r).toContain("◇ 제ㆍ개정 이유");
  });

  it("ADM-3: 조문내용이 배열이 아니라 단일 문자열인 건(3/17)도 읽는다", async () => {
    mockFetch.mockResolvedValue(ADM_STRING);
    const t = await getDecisionText("2200000108699", "admrul");
    expect(t).not.toBeNull();
    expect(t!.title).toBe("등기신청시 납부할 취득세 및 등록면허세 등에 관한 예규");
    expect(t!.reasoning).toContain("국 명의의 가처분등기말소");
  });

  it("ADM-4: 제개정이유 키가 없는 건도 터지지 않고, 빈 소제목도 만들지 않는다", async () => {
    mockFetch.mockResolvedValue(ADM_NO_REASON);
    const t = await getDecisionText("2100000235916", "admrul");
    expect(t).not.toBeNull();
    expect(t!.reasoning.length).toBeGreaterThan(0);
    expect(t!.reasoning).not.toContain("【제개정이유】");
  });

  it("ADM-5: 행정규칙에 「판시사항·판결요지·주문」 라벨을 붙이지 않는다", async () => {
    mockFetch.mockResolvedValue(ADM_ARRAY);
    const t = await getDecisionText("2100000281776", "admrul");
    expect(t!.holdings).toBe("");
    expect(t!.summary).toBeUndefined();
    expect(t!.ruling).toBeUndefined();
  });
});

describe("TWIN — 다른 도메인의 파싱은 그대로", () => {
  it("TWIN-1(긍정 짝): 판례는 판시사항·판결요지가 여전히 자기 슬롯에 들어간다", async () => {
    mockFetch.mockResolvedValue({
      PrecService: {
        사건번호: "2020두12345",
        사건명: "양도소득세부과처분취소",
        판시사항: "판시사항 본문입니다",
        판결요지: "판결요지 본문입니다",
        판례내용: "이유 본문입니다",
        선고일자: "20200101",
        법원명: "대법원",
      },
    });
    const t = await getDecisionText("1", "prec");
    expect(t!.holdings).toBe("판시사항 본문입니다");
    expect(t!.summary).toBe("판결요지 본문입니다");
    expect(t!.reasoning).toBe("이유 본문입니다");
    expect(t!.reasoning).not.toContain("【");
  });
});

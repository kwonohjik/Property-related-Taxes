/**
 * KoreanLaw 모듈 코드리뷰 수정 4건의 회귀 anchor.
 *
 * 네 건 모두 **조용히 틀린 결과**를 내던 것들이라(에러도 빈 결과도 아니고 «그럴듯한
 * 오답») 안전망이 없으면 재발해도 아무도 모른다. 각 항목은 부정형 단언과
 * **긍정 짝**을 함께 둔다 — 가드가 정상 입력까지 막으면 구별력이 0이 되므로.
 *
 * 정책: [[feedback_negative_anchor_needs_positive_twin]] · [[feedback_pre_change_safety_net_probe]]
 */
import fs from "fs/promises";
import path from "path";
import { describe, it, expect, afterAll } from "vitest";
import { buildJoCode } from "@/lib/korean-law/article-parser";
import { extractTransitionExcerpts } from "@/lib/korean-law/applicable-law";
import { readCacheNonEmpty, writeCacheNonEmpty } from "@/lib/korean-law/client-core";
import { extractClauseMarkers, extractInlineLawRefs } from "@/lib/utils/law-url";

// ────────────────────────────────────────────────────────────────────────────
// ① buildJoCode — 시작 앵커 없이는 «끝의 숫자»만 잡아 다른 조문을 조회했다
// ────────────────────────────────────────────────────────────────────────────

describe("JO — buildJoCode 는 해석 불가 입력을 조용히 다른 조문으로 바꾸지 않는다", () => {
  it("JO-1: '제89조2'(오타)는 null — 수정 전 '000200'(=제2조)을 돌려줬다", () => {
    expect(buildJoCode("제89조2")).toBeNull();
  });

  it("JO-2: 법령명이 섞여 들어오면 null — 조문번호 파라미터의 계약 위반은 크게 실패시킨다", () => {
    // 수정 전 '010403'(제104조의3)을 돌려줬다. lawName·articleNo 는 API 상 별개 파라미터라
    // 합쳐 들어오는 것 자체가 오입력이고, 우연히 동작하면 오입력이 영영 드러나지 않는다.
    expect(buildJoCode("소득세법 제104조의3")).toBeNull();
  });

  it("JO-3: 파일 주석이 명시한 레거시 '제38조-1' → '003801'", () => {
    expect(buildJoCode("제38조-1")).toBe("003801");
  });

  it("JO-4(긍정 짝): 정상 표기는 그대로 동작 — 가드가 전부를 막는 게 아니다", () => {
    expect(buildJoCode("제38조")).toBe("003800");
    expect(buildJoCode("제10조의2")).toBe("001002");
    expect(buildJoCode("제104조의3")).toBe("010403");
    expect(buildJoCode("89")).toBe("008900");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ② 부칙 발췌 — 가지번호 자리 경계
// ────────────────────────────────────────────────────────────────────────────

const ADDENDA = [
  {
    ancNo: "12345",
    ancYd: "20240101",
    content:
      "제1조(시행일) 이 법은 2024년 1월 1일부터 시행한다.\n" +
      "제2조(적용례) 제121조의33의 개정규정은 이 법 시행 이후 양도하는 분부터 적용한다.",
  },
];
const REL = new Set(["12345"]);

describe("ADD — 부칙 발췌가 인접 조문의 경과규정을 삼키지 않는다", () => {
  it("ADD-1: '제121조의3' 조회가 '제121조의33' 적용례를 조문 전용으로 승격하지 않는다", () => {
    // 수정 전: articleSpecific=true 로 잡혀 UI 가 "📌 이 조문 관련 적용례"로 강조했다.
    const out = extractTransitionExcerpts(ADDENDA, REL, "제121조의3");
    // 판정 축은 articleSpecific 이다 — UI(ApplicableLawPanel)가 이 값으로
    // 📌 "이 조문 관련 적용례"(강조)와 접힌 "그 밖의 경과조치"(참고용)를 가른다.
    // 라인 자체는 "적용례" 신호가 있어 참고용으로는 계속 남는 것이 맞다.
    expect(out[0]?.articleSpecific).toBe(false);
    expect(out[0]?.lines.join(" ")).toContain("제121조의33");
  });

  it("ADD-2(긍정 짝): '제121조의33' 조회는 자기 적용례를 조문 전용으로 잡는다", () => {
    const out = extractTransitionExcerpts(ADDENDA, REL, "제121조의33");
    expect(out[0]?.articleSpecific).toBe(true);
    expect(out[0]?.lines.join(" ")).toContain("제121조의33");
  });

  it("ADD-3(회귀 보존): '제89조'의 소유격 '제89조의 개정규정'은 계속 잡고, 가지번호 '제89조의2'는 계속 제외", () => {
    const a = [
      { ancNo: "1", ancYd: "20200101", content: "제2조(적용례) 제89조의 개정규정은 …" },
    ];
    const b = [
      { ancNo: "1", ancYd: "20200101", content: "제2조(적용례) 제89조의2의 개정규정은 …" },
    ];
    expect(extractTransitionExcerpts(a, new Set(["1"]), "제89조")[0]?.articleSpecific).toBe(true);
    expect(extractTransitionExcerpts(b, new Set(["1"]), "제89조")[0]?.articleSpecific).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ③ 0건 결과 캐시 — 기록도 히트도 금지 (TTL 30일 고착 방지)
// ────────────────────────────────────────────────────────────────────────────

const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const KEYS = ["__anchor_empty_arr__", "__anchor_empty_page__", "__anchor_nonempty__"];
const fileOf = (k: string) => path.join(CACHE_DIR, `${k}.json`);
const exists = async (k: string) => fs.stat(fileOf(k)).then(() => true).catch(() => false);

afterAll(async () => {
  await Promise.all(KEYS.map((k) => fs.rm(fileOf(k), { force: true })));
});

describe("CACHE — 0건 결과는 30일 캐시로 굳지 않는다", () => {
  it("CACHE-1: 빈 배열은 기록되지 않는다", async () => {
    await writeCacheNonEmpty(KEYS[0], []);
    expect(await exists(KEYS[0])).toBe(false);
  });

  it("CACHE-2: items 0건 페이지도 기록되지 않는다", async () => {
    await writeCacheNonEmpty(KEYS[1], { items: [], totalCount: 0, page: 1, pageSize: 10 });
    expect(await exists(KEYS[1])).toBe(false);
  });

  it("CACHE-3: 이미 굳어 있는 0건 캐시는 히트로 인정하지 않는다 (빈 배열은 truthy)", async () => {
    // 구 버전이 남긴 `[]` 캐시가 실제로 `.legal-cache/` 에 존재했다(실측 43건 + 4건).
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(fileOf(KEYS[0]), "[]", "utf-8");
    expect(await readCacheNonEmpty<unknown[]>(KEYS[0])).toBeNull();
    // stale(allowStale) 경로도 동일 — 여기서 []를 돌려주면 upstream 에러를 삼킨다.
    expect(await readCacheNonEmpty<unknown[]>(KEYS[0], true)).toBeNull();
  });

  it("CACHE-4(긍정 짝): 결과가 있으면 정상 기록·히트 — 캐시를 껐다는 뜻이 아니다", async () => {
    await writeCacheNonEmpty(KEYS[2], [{ mst: "1" }]);
    expect(await exists(KEYS[2])).toBe(true);
    expect(await readCacheNonEmpty<{ mst: string }[]>(KEYS[2])).toEqual([{ mst: "1" }]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ④ 항(項) 마커 ⑯~⑳ — 저장소 자체 인용이 트리거
// ────────────────────────────────────────────────────────────────────────────

describe("MK — 항 마커는 ⑳까지 인식한다 (legal-codes 가 실제로 쓰는 범위)", () => {
  it("MK-1: §155⑳ — legal-codes/transfer-house.ts:PIT_RD_155_20 이 엔진 결과로 방출하는 값", () => {
    expect(extractClauseMarkers("소득세법 시행령 §155⑳")).toEqual(["⑳"]);
  });

  it("MK-2: §83조의4 ⑯⑰ — legal-codes/transfer-nbl.ts:OTHER_LAND_AREA_VACANT_LOT", () => {
    expect(extractClauseMarkers("소득세법 시행규칙 §83조의4 ⑯⑰")).toEqual(["⑯", "⑰"]);
  });

  it("MK-3(회귀 보존): ⑮ 이하 기존 동작 불변", () => {
    expect(extractClauseMarkers("§63③ 할증평가")).toEqual(["③"]);
    expect(extractClauseMarkers("상증령 §56①④ 순손익액")).toEqual(["①", "④"]);
    expect(extractClauseMarkers("§8 보험금")).toEqual([]);
  });

  it("MK-4: 배지 label·legalBasis 가 ⑳ 을 떨어뜨리지 않는다", () => {
    // 수정 전: [{ label: "§155", legalBasis: "소득세법 시행령 §155" }] — 항 표기가 소실됐다.
    expect(extractInlineLawRefs("소득세법 시행령 §155⑳", "소득세법")).toEqual([
      { label: "§155⑳", legalBasis: "소득세법 시행령 §155⑳" },
    ]);
  });
});

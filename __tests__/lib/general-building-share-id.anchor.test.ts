/**
 * 지분(%) 분할 카드 id 접미사 규약 — leaf anchor.
 *
 * 정본: `lib/tax-engine/general-building-share-id.ts`
 *
 * 이 규약을 모르는 **정확 비교**가 두 계층에서 조용히 어긋났다(2026-08-10):
 *   · 라우트 표시 — 사업용 토지가 비사업용 비율로 (기준시가 160,000,000 → 40,000,000)
 *   · 결과 화면·신고서 — 산식 미표시 · 행 메타 누락
 *
 * ⚠️ **단건(접미사 없음) 동작이 바뀌면 안 된다** — 아래 대조군이 그것을 지킨다.
 */
import { describe, it, expect } from "vitest";
import {
  SHARE_ID_SEPARATOR,
  baseCardId,
  shareIndexOf,
  isSameShare,
} from "@/lib/tax-engine/general-building-share-id";

/** 엔진이 만드는 카드 id 전량 — 새 카드가 생기면 여기에 추가한다. */
const CARD_IDS = [
  "land",
  "land_business",
  "land_nbl",
  "building",
  "building1",
  "building2",
] as const;

describe("general-building-share-id — 접미사 규약", () => {
  it("구분자는 `#`", () => {
    expect(SHARE_ID_SEPARATOR).toBe("#");
  });

  describe("baseCardId", () => {
    it("🔑 접미사가 있으면 벗긴다", () => {
      for (const id of CARD_IDS) {
        expect(baseCardId(`${id}#0`)).toBe(id);
        expect(baseCardId(`${id}#7`)).toBe(id);
      }
    });

    /** 양성 대조군 — 단건 경로가 계속 그대로여야 한다. */
    it("대조군 — 접미사가 없으면 그대로 돌려준다", () => {
      for (const id of CARD_IDS) {
        expect(baseCardId(id)).toBe(id);
      }
      // GB 외 자산 id(사용자 assetId)도 훼손하지 않는다
      expect(baseCardId("primary")).toBe("primary");
      expect(baseCardId("asset-2__appurtenant")).toBe("asset-2__appurtenant");
    });
  });

  describe("shareIndexOf", () => {
    it("접미사 인덱스를 숫자로 돌려준다", () => {
      expect(shareIndexOf("land#0")).toBe(0);
      expect(shareIndexOf("building2#3")).toBe(3);
      expect(shareIndexOf("land_business#10")).toBe(10);
    });

    it("단건은 undefined — 「지분 0」과 구별되어야 한다", () => {
      expect(shareIndexOf("land")).toBeUndefined();
      // 🔑 0과 undefined를 섞으면 단건이 「지분 0」으로 취급돼 assets[0] 조회가 우연히 맞는다.
      //    그 우연은 다지분에서 깨지므로 타입으로 갈라 둔다.
      expect(shareIndexOf("land")).not.toBe(0);
    });

    it("깨진 접미사는 undefined (assets 인덱스로 쓰이므로 방어)", () => {
      expect(shareIndexOf("land#")).toBeUndefined();
      expect(shareIndexOf("land#a")).toBeUndefined();
      expect(shareIndexOf("land#-1")).toBeUndefined();
      expect(shareIndexOf("land#1.5")).toBeUndefined();
    });
  });

  describe("isSameShare — 카드 짝짓기", () => {
    it("같은 지분끼리만 true", () => {
      expect(isSameShare("land#0", "building1#0")).toBe(true);
      expect(isSameShare("land#0", "building1#1")).toBe(false);
    });

    it("대조군 — 단건끼리는 true (짝짓기가 계속 성립한다)", () => {
      expect(isSameShare("land", "building1")).toBe(true);
    });

    it("🔑 단건과 지분 카드는 섞이지 않는다", () => {
      expect(isSameShare("land", "building1#0")).toBe(false);
    });
  });
});

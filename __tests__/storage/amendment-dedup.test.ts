/**
 * A9 — 수정신고 이력 dedup 충돌 방지.
 * 당초 신고와 수정신고는 주소·양도일이 동일하므로, amendmentMode로 businessKey를 분리해
 * 당초 record가 덮어써지지 않아야 한다.
 */
import { describe, it, expect } from "vitest";
import { extractBusinessKey } from "@/lib/storage/business-key";

const base = {
  assets: [{ addressJibun: "서울 강남구 대치동 1-1" }],
  transferDate: "2022-05-01",
};

describe("A9 수정신고 businessKey 분리", () => {
  it("당초와 수정은 서로 다른 businessKey", () => {
    const original = extractBusinessKey("transfer", { ...base, amendmentMode: false });
    const amended = extractBusinessKey("transfer", { ...base, amendmentMode: true });
    expect(original).toBeTruthy();
    expect(amended).toBeTruthy();
    expect(original).not.toBe(amended);
    expect(amended).toContain("|amend");
    expect(original).not.toContain("|amend");
  });
});

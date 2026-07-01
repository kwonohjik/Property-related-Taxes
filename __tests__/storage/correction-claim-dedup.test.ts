/**
 * R9 — 경정청구 이력 dedup 분리.
 * 당초·수정신고(|amend)·경정청구(|refund)는 주소·양도일이 동일하므로,
 * correctionKind로 businessKey를 분리해 3-record가 공존해야 한다(당초 미소실).
 */
import { describe, it, expect } from "vitest";
import { extractBusinessKey } from "@/lib/storage/business-key";

const base = {
  assets: [{ addressJibun: "서울 강남구 대치동 1-1" }],
  transferDate: "2022-05-01",
};

describe("R9 경정청구 businessKey 분리", () => {
  it("당초·수정신고·경정청구 3키가 서로 다름", () => {
    const original = extractBusinessKey("transfer", { ...base, amendmentMode: false });
    const amended = extractBusinessKey("transfer", {
      ...base,
      amendmentMode: true,
      correctionKind: "amend",
    });
    const refund = extractBusinessKey("transfer", {
      ...base,
      amendmentMode: true,
      correctionKind: "refund_claim",
    });

    expect(original).toBeTruthy();
    expect(amended).toContain("|amend");
    expect(refund).toContain("|refund");

    // 3키 모두 상이 → list()에서 3-record 공존(당초·수정 미소실)
    const keys = new Set([original, amended, refund]);
    expect(keys.size).toBe(3);
    // 당초는 정정 접미 없음 (addr|date의 | 구분자는 정상)
    expect(original).not.toContain("|amend");
    expect(original).not.toContain("|refund");
  });
});

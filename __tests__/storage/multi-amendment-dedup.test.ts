/**
 * M-A7 — 다건(multi 직접입력) 수정신고·경정청구 이력 dedup (S3).
 *
 * multi 이력 inputData는 MultiTransferFormData(properties[]) — top-level assets/transferDate 부재.
 * extractAddress/extractTransferDate가 properties[0].form에서 추출(S3)해야 businessKey가 도출되고,
 * amendmentMode/correctionKind 접미로 당초·수정신고(|amend)·경정청구(|refund) 3-record가 공존한다.
 */
import { describe, it, expect } from "vitest";
import { extractBusinessKey } from "@/lib/storage/business-key";

const base = {
  __multiTransfer: true,
  taxYear: 2026,
  properties: [
    {
      propertyId: "p1",
      propertyLabel: "건1",
      completionPercent: 100,
      form: {
        assets: [{ addressJibun: "서울 강남구 대치동 1-1" }],
        transferDate: "2026-02-15",
      },
    },
  ],
};

describe("M-A7 다건 수정신고·경정청구 businessKey 3-record 공존", () => {
  it("S3: multi inputData(properties[])에서 주소·양도일 추출", () => {
    const key = extractBusinessKey("transfer", { ...base, amendmentMode: false });
    expect(key).toBeTruthy();
    expect(key).toContain("서울 강남구 대치동 1-1");
    expect(key).toContain("2026.02.15");
  });

  it("당초·수정신고(|amend)·경정청구(|refund) 3키 상이", () => {
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
    expect(new Set([original, amended, refund]).size).toBe(3);
    expect(amended).toContain("|amend");
    expect(refund).toContain("|refund");
  });
});

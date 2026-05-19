import { describe, it, expect } from "vitest";
import {
  normalizeMarketTypeToStore,
  storeMarketToApi,
  isKiwoomFetchable,
} from "@/lib/kiwoom/market-mapping";

describe("market-mapping — anchor", () => {
  // K-MAP-01: API uppercase → store lowercase
  it("K-MAP-01: KOSPI → kospi (store)", () => {
    expect(normalizeMarketTypeToStore("KOSPI")).toBe("kospi");
    expect(normalizeMarketTypeToStore("KOSDAQ")).toBe("kosdaq");
    expect(normalizeMarketTypeToStore("KONEX")).toBe("konex");
    expect(normalizeMarketTypeToStore("UNKNOWN")).toBe("");
  });

  it("K-MAP-02: store → API (역방향)", () => {
    expect(storeMarketToApi("kospi")).toBe("KOSPI");
    expect(storeMarketToApi("kosdaq")).toBe("KOSDAQ");
    expect(storeMarketToApi("konex")).toBe("KONEX");
    expect(storeMarketToApi("unlisted")).toBe("UNKNOWN");
    expect(storeMarketToApi("other_asset")).toBe("UNKNOWN");
    expect(storeMarketToApi("")).toBe("UNKNOWN");
  });

  it("K-MAP-03: isKiwoomFetchable — 상장 종목만 true", () => {
    expect(isKiwoomFetchable("kospi")).toBe(true);
    expect(isKiwoomFetchable("kosdaq")).toBe(true);
    expect(isKiwoomFetchable("konex")).toBe(true);
    expect(isKiwoomFetchable("unlisted")).toBe(false); // 비상장 자동조회 미지원 (F-14)
    expect(isKiwoomFetchable("other_asset")).toBe(false);
    expect(isKiwoomFetchable("")).toBe(false);
  });
});

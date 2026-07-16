/**
 * 취득 위치지수 공시지가 트랙 판정 — §164⑤ ≤2000 경계.
 *
 * 계획서: docs/02-design/features/mixed-use-commercial-stdprice-modal-landprice-prefill.plan.md (§3-1·§3-2)
 *
 * 배경: PHD 배치 모달(PhdBuildingStdPriceModalButton:228-231)은 취득 ≤2000의 2001.1.1 공시지가를
 * 이미 landPrices.acquisition으로 방출하지만, ThreePointStandardPriceInput:662가 **받을 그릇이 없어**
 * 드롭했다(phdLandPricePerSqmAtAcq는 취득당시 연도 토지값 트랙이라 넣으면 오염).
 * → 전용 필드 phdLandPricePerSqmAtAcq2001 신설 + 트랙 라우팅.
 */
import { describe, it, expect } from "vitest";
import {
  isAcq2001LocationIndexTrack,
  pickAcqLocationIndexLandPrice,
} from "@/lib/calc/phd-acq-land-price-track";

describe("isAcq2001LocationIndexTrack — §164⑤ 취득 ≤2000 경계", () => {
  it("2000년 이전 취득 → 2001.1.1 위치지수 트랙", () => {
    expect(isAcq2001LocationIndexTrack(1997)).toBe(true);
    expect(isAcq2001LocationIndexTrack(1990)).toBe(true);
    expect(isAcq2001LocationIndexTrack(2000)).toBe(true); // 경계 포함
  });

  it("2001년 이후 취득 → 취득당시 연도 트랙", () => {
    expect(isAcq2001LocationIndexTrack(2001)).toBe(false); // 경계 제외
    expect(isAcq2001LocationIndexTrack(2005)).toBe(false);
    expect(isAcq2001LocationIndexTrack(2026)).toBe(false);
  });

  it("연도 미상(undefined·NaN) → false (취득당시 트랙 = 종전 동작 보존)", () => {
    expect(isAcq2001LocationIndexTrack(undefined)).toBe(false);
    expect(isAcq2001LocationIndexTrack(NaN)).toBe(false);
  });
});

describe("pickAcqLocationIndexLandPrice — 트랙별 소스 선택", () => {
  const AT_ACQ = "1000000"; // 취득당시(1997년) 공시지가 — 토지값 트랙
  const AT_2001 = "1200000"; // 2001.1.1 현재 공시지가 — 위치지수 트랙

  it("케이스 1: 취득 1997 + 2001값 있음 → 2001값 (본 건 해결)", () => {
    expect(pickAcqLocationIndexLandPrice(1997, AT_ACQ, AT_2001)).toBe(AT_2001);
  });

  it("케이스 2: 취득 1997 + 2001값 없음 → 빈 값 (취득당시 값을 절대 흘리지 않음)", () => {
    expect(pickAcqLocationIndexLandPrice(1997, AT_ACQ, "")).toBe("");
    expect(pickAcqLocationIndexLandPrice(1997, AT_ACQ, undefined)).toBe("");
  });

  it("케이스 4: 취득 2005 → 취득당시 값", () => {
    expect(pickAcqLocationIndexLandPrice(2005, AT_ACQ, AT_2001)).toBe(AT_ACQ);
  });

  it("케이스 6: 취득 2005 + 취득당시 값 없음 → 빈 값(미주입 → snapshot 복원값 보존)", () => {
    expect(pickAcqLocationIndexLandPrice(2005, "", AT_2001)).toBe("");
    expect(pickAcqLocationIndexLandPrice(2005, undefined, undefined)).toBe("");
  });

  it("케이스 7: 취득일 미입력 → 취득당시 트랙 (모달 연도 선택 시 기존 경계 가드가 초기화)", () => {
    expect(pickAcqLocationIndexLandPrice(undefined, AT_ACQ, AT_2001)).toBe(AT_ACQ);
  });

  it("케이스 8: 1997 → 2005 전환 시 2001값이 취득당시 트랙으로 새지 않는다", () => {
    expect(pickAcqLocationIndexLandPrice(2005, "", AT_2001)).toBe("");
  });
});

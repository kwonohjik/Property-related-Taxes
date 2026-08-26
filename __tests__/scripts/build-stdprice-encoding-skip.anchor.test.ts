/**
 * F-21 · F-22 Pre-Do anchor — 상가 기준시가 빌드 스크립트 2건.
 *
 * ── F-21 `detectStreamEncoding` — `head.subarray(0, 4096)` 절단
 *    8,192바이트를 모아 놓고 앞 4,096바이트만 `fatal` UTF-8 디코더에 넣었다.
 *    4,096번째가 다중바이트 문자 **중간**이면 BOM 없는 정상 UTF-8 이 cp949 로 오판되고,
 *    헤더가 깨져 필수 컬럼 14개가 전부 누락으로 보고되어 **그 파트가 통째로 스킵**된다.
 *    설계문서는 「선두 8KB 로 판별」인데 구현만 4KB 였다(설계 이탈).
 *    ⇒ 절단을 없애되 스트림 경계에서 잘린 **마지막 불완전 시퀀스만** 떼고 판별한다.
 *
 * ── F-22 스킵이 아무 데도 기록되지 않는다
 *    `probePart` 가 `null` 만 돌려주고 manifest 에도 종료코드에도 흔적이 남지 않아,
 *    결손 빌드가 조용히 배포되고 조회 계층은 결손 지역을 「그 해 그 지역은 고시가 없었다」로 안내했다.
 *    ⚠️ 스킵은 **고시일자를 확정하기 전에** 일어나 특정 일자에 귀속시킬 수 없다
 *       (헤더가 깨져 컬럼·고시일자를 못 읽는 것이 스킵 사유다).
 *       전 일자를 `coverage:"partial"` 로 바꾸면 조회 계층의 `coverage === "full"` 필터가
 *       조회를 통째로 죽이므로, **빌드 단위 기록(manifest.skippedParts) + 비정상 종료코드**로 드러낸다.
 *       ⇒ 리뷰가 제안한 「per-date partial」과 다른 방향이며, 그 이유를 여기에 남긴다.
 *
 * 법령: 빌드 파이프라인(법령 쟁점 없음). 산출물은 「소득세법 시행령」 제164조 제6항
 *   오피스텔·상업용 건물 기준시가 조회의 소스다.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";

const SRC = fs.readFileSync("scripts/build-commercial-stdprice.ts", "utf8");

/** 구현과 동일한 규칙 — 버퍼 끝의 불완전 UTF-8 시퀀스를 떼어낸다 */
function trimIncompleteUtf8(buf: Buffer): Buffer {
  for (let back = 1; back <= 3 && back <= buf.length; back++) {
    const b = buf[buf.length - back];
    if (b < 0x80) break;
    if (b >= 0xc0) {
      const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
      return back < len ? buf.subarray(0, buf.length - back) : buf;
    }
  }
  return buf;
}

describe("F-21 인코딩 자동감지 — §1 절단으로 오판하지 않는다 (수정 전 실패)", () => {
  it("4,096번째가 한글 중간인 UTF-8 버퍼를 cp949 로 오판하지 않는다", () => {
    // 4,095바이트 ASCII + 3바이트 한글 → 한글이 4096 경계를 가로지른다
    const head = Buffer.concat([Buffer.alloc(4095, 0x41), Buffer.from("가", "utf8")]);
    // 종전 구현: 앞 4,096바이트만 fatal 디코드 → 한글 3바이트 중 1바이트만 들어가 실패
    expect(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(0, 4096)),
    ).toThrow();
    // 수정 구현: 불완전 꼬리를 떼고 판별 → 성공
    expect(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(trimIncompleteUtf8(head)),
    ).not.toThrow();
  });

  it("스크립트가 4096 절단을 더 이상 쓰지 않는다", () => {
    expect(SRC).not.toContain("head.subarray(0, 4096)");
    expect(SRC).toContain("trimIncompleteUtf8");
  });

  it("진짜 cp949 는 여전히 cp949 로 판별된다 (역방향 가드)", () => {
    // cp949 「가」 = 0xB0 0xA1 — UTF-8 로는 유효하지 않은 시퀀스
    const cp949 = Buffer.concat([Buffer.alloc(100, 0x41), Buffer.from([0xb0, 0xa1, 0x41])]);
    expect(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(trimIncompleteUtf8(cp949)),
    ).toThrow();
  });
});

describe("F-22 변환 결손 기록 — §2 (수정 전 실패)", () => {
  it("스킵 사유를 호출부로 돌려준다", () => {
    expect(SRC).toContain("skipped: { label: string; reason: string }[]");
    for (const reason of ["데이터 행 없음", "필수 컬럼 누락", "고시일자 해석 불가"]) {
      expect(SRC).toContain(`reason: "${reason}"`);
    }
  });

  it("manifest 에 skippedParts 를 싣는다", () => {
    expect(SRC).toContain("skippedParts");
    expect(SRC).toMatch(/skippedParts\.length \? \{ skippedParts \}/);
  });

  it("스킵이 있으면 종료코드가 0 이 아니다 — CI 가 성공으로 읽지 않도록", () => {
    expect(SRC).toContain("process.exitCode = 1");
  });
});

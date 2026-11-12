/**
 * anchor — 기존주택 원조합원 §155① 판정이 일시적 2주택 정본 함수를 그대로 쓴다 (2026-11-13 리뷰 E-3)
 *
 * 종전 `one-house/original-member-right.ts`는 §155① 기한을 따로 계산해 세 사실을 빠뜨렸다 — 같은 사실의 일시적 2주택
 * 경로는 비과세, 원조합원 경로는 과세였다(probe 실측).
 *   ① §155①2호 괄호 — 조정대상지역 공고가 있은 날 이전 취득·계약은 조정 취득이 아니다(`resolveRegulatedAtNewAcquisition`)
 *   ② 연혁 부칙 계약일 — 대통령령 제30395호 부칙 제15조(2019.12.16. 이전 계약 → 종전 2년)
 *   ③ §155⑯ — 처분기한 5년 · 1년 요건 면제(지역 요건은 `meetsPublicInstitutionRelocationRegion`)
 *
 * A = 양도 주택, B = 입주권이 된 기존주택(행의 `acquisitionDate`).
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const iso = (d: Date | undefined) => d?.toISOString().slice(0, 10);

const GANGNAM = "1168010100"; // 2017-08-03 이후 계속 조정
const SEOCHO = "1165010100";
const OSAN = "4137010100"; // 2020-06-19 지정(효력일 = 공고일)
const CHEONAN_DN = "4413110100"; // 천안시 동남구 — 비조정
const CHEONAN_DN2 = "4413110300";

function verdict(p: { aAcq: string; bAcq: string; transfer: string; aCode: string; bCode: string; right?: Partial<PresaleRight> }) {
  return resolveArticle89Clause2(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D(p.aAcq),
      transferDate: D(p.transfer),
      regionCode: p.aCode,
      presaleRights: [
        {
          id: "r1",
          type: "redevelopment_right",
          acquisitionDate: D(p.bAcq),
          region: "capital",
          regionCode: p.bCode,
          memberOrigin: "original_house",
          ...p.right,
        },
      ],
    } as Partial<TransferTaxInput>),
    undefined,
  );
}

describe("① §155①2호 괄호 — 공고가 있은 날 이전 취득", () => {
  // B를 지정 공고일(= 효력일) 당일 취득 → 조정 취득이 아니다 → 본문 3년. 종전에는 조정→조정 1년(2019-12-17 체제)이라 과세.
  const base = { aAcq: "2015-01-01", bAcq: "2020-06-19", transfer: "2021-12-01", aCode: GANGNAM, bCode: OSAN };
  it("공고일 당일 취득 → 3년 기한 · 예외 성립", () => {
    const v = verdict({ ...base, right: { originalMemberMoveInDate: D("2020-07-01") } });
    expect(v.status).toBe("exception_met");
    expect(iso(v.deadline)).toBe("2023-06-19");
  });
  it("짝: 공고 다음 날 취득 → 조정→조정 1년 · 불성립", () => {
    const v = verdict({ ...base, bAcq: "2020-06-20", right: { originalMemberMoveInDate: D("2020-07-01") } });
    expect(v.status).toBe("excluded");
  });
});

describe("② 연혁 부칙 계약일 — 2019.12.16. 이전 계약", () => {
  const base = { aAcq: "2015-01-01", bAcq: "2020-03-02", transfer: "2021-06-01", aCode: GANGNAM, bCode: SEOCHO };
  it("계약 2019-12-01 → 종전 2년 기한 · 예외 성립", () => {
    const v = verdict({
      ...base,
      right: { originalMemberMoveInDate: D("2020-04-01"), originalMemberContractDate: D("2019-12-01") },
    });
    expect(v.status).toBe("exception_met");
    expect(iso(v.deadline)).toBe("2022-03-02");
  });
  it("짝: 계약일 없음 → 1년 기한 · 불성립", () => {
    expect(verdict({ ...base, right: { originalMemberMoveInDate: D("2020-04-01") } }).status).toBe("excluded");
  });
});

describe("③ §155⑯ 공공기관·법인 지방이전", () => {
  // 비조정 지역끼리 · B 취득 2019-01-01 · 양도 2023-06-01(3년 초과 5년 이내)
  const late = { aAcq: "2015-01-01", bAcq: "2019-01-01", transfer: "2023-06-01", aCode: CHEONAN_DN, bCode: CHEONAN_DN2 };
  it("이전지 코드 없음(자기선언) → 5년 기한 · 예외 성립", () => {
    const v = verdict({ ...late, right: { originalMemberPublicInstitutionRelocation: true } });
    expect(v.status).toBe("exception_met");
    expect(iso(v.deadline)).toBe("2024-01-02"); // 2024-01-01(공휴일) → 민법 §161
  });
  it("이전지가 같은 시(천안시 서북구) → 지역 요건 충족 · 예외 성립", () => {
    const v = verdict({
      ...late,
      right: { originalMemberPublicInstitutionRelocation: true, originalMemberRelocatedSigunguCode: "4413300000" },
    });
    expect(v.status).toBe("exception_met");
  });
  it("짝: 이전지가 비연접(부산 해운대구) → 지역 요건 미충족 · 3년 기한 · 불성립", () => {
    const v = verdict({
      ...late,
      right: { originalMemberPublicInstitutionRelocation: true, originalMemberRelocatedSigunguCode: "2635000000" },
    });
    expect(v.status).toBe("excluded");
  });
  it("짝: ⑯ 선언 없음 → 불성립", () => {
    expect(verdict(late).status).toBe("excluded");
  });

  // ⑯ 후단 — A 취득 6개월 뒤 B 취득(1년 요건 미충족)
  const short = { aAcq: "2018-07-01", bAcq: "2019-01-01", transfer: "2021-06-01", aCode: CHEONAN_DN, bCode: CHEONAN_DN2 };
  it("⑯ 후단 1년 요건 면제 → 예외 성립", () => {
    expect(verdict({ ...short, right: { originalMemberPublicInstitutionRelocation: true } }).status).toBe("exception_met");
  });
  it("짝: ⑯ 없으면 1년 요건 미충족 · 불성립", () => {
    expect(verdict(short).status).toBe("excluded");
  });
});

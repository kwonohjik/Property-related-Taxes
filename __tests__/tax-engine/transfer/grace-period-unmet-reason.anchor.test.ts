/**
 * 다주택 중과 경과조치(소령 §167의3①12의2 나·다목) 미충족 사유 `unmet` — 계획서
 * `docs/01-plan/features/surcharge-grace-period-unmet-reason.plan.md` §4 케이스 매트릭스 G-1~G-16.
 *
 * 양도 주택 성남시 중원구(`4113110100` — 나목4) 표 지역 · 6개월), 양도일 2026-09-18.
 * 회귀 단언: `suspended`는 변경 전 함수 결과와 같다(Pre-Do 실측). 유예 케이스의 `basis`·`deadline`도 같다.
 */
import { describe, expect, it } from "vitest";
import { checkGracePeriodExemption } from "@/lib/tax-engine/multi-house-surcharge-exclusion";

const T = new Date("2026-09-18");
const SEONGNAM = "4113110100";
const YONGIN_GIHEUNG = "4146310100"; // 2026-07-01 지정 — 나·다목 대상 지역 아님
const D = (s: string) => new Date(s);

const na = (o: { app?: string; permit?: boolean; contract?: string; deposit?: boolean }) => ({
  contractDate: D(o.contract ?? "2026-04-25"),
  isLandPermitTarget: true,
  permitApplicationDate: o.app === undefined ? D("2026-04-17") : o.app ? D(o.app) : undefined,
  permitGranted: o.permit ?? true,
  depositReceiptConfirmed: o.deposit ?? true,
});
const da = (o: { contract?: string; deposit?: boolean }) => ({
  contractDate: D(o.contract ?? "2026-04-25"),
  isLandPermitTarget: false,
  depositReceiptConfirmed: o.deposit ?? true,
});

type Row = [id: string, gp: ReturnType<typeof na> | ReturnType<typeof da>, region: string, suspended: boolean, unmet: string[]];
const ROWS: Row[] = [
  ["G-1 나 전부 충족", na({}), SEONGNAM, true, []],
  ["G-2 ★ 나 허가 수령 미확인(사용자 사례)", na({ permit: false }), SEONGNAM, false, ["na2_permit"]],
  ["G-3 나 계약금 증빙 미확인", na({ deposit: false }), SEONGNAM, false, ["deposit"]],
  ["G-4 나 허가·계약금 둘 다", na({ permit: false, deposit: false }), SEONGNAM, false, ["na2_permit", "deposit"]],
  ["G-5 나 허가 신청 2026-05-10", na({ app: "2026-05-10" }), SEONGNAM, false, ["na1_application"]],
  ["G-6 나 허가 신청일 없음", na({ app: "" }), SEONGNAM, false, ["na1_application"]],
  ["G-7 나 기한 초과(계약 2026-02-01)", na({ contract: "2026-02-01" }), SEONGNAM, false, ["deadline"]],
  ["G-8 나 허가·계약금·기한", na({ permit: false, deposit: false, contract: "2026-02-01" }), SEONGNAM, false, ["na2_permit", "deposit", "deadline"]],
  ["G-9 나 2026-05-10 이후 계약 · 절대기한 11-09", na({ contract: "2026-05-20" }), SEONGNAM, true, []],
  ["G-10 다 전부 충족", da({}), SEONGNAM, true, []],
  ["G-11 다 계약금 증빙 미확인", da({ deposit: false }), SEONGNAM, false, ["deposit"]],
  ["G-12 다 계약 2026-05-20", da({ contract: "2026-05-20" }), SEONGNAM, false, ["da1_contract_late"]],
  ["G-13 다 계약 늦음·계약금", da({ contract: "2026-05-20", deposit: false }), SEONGNAM, false, ["da1_contract_late", "deposit"]],
  ["G-14 다 기한 초과(계약 2026-02-01)", da({ contract: "2026-02-01" }), SEONGNAM, false, ["deadline"]],
  ["G-15 나 전부 충족 · 소재지 대상 아님", na({}), YONGIN_GIHEUNG, false, ["region"]],
];

describe("12의2 나·다목 — suspended 회귀(변경 전 실측값)", () => {
  it.each(ROWS)("%s", (_id, gp, region, suspended) => {
    expect(checkGracePeriodExemption(T, gp, region).suspended).toBe(suspended);
  });

  it("유예 케이스의 basis·deadline — G-1 na 10-26 · G-9 na 11-09 · G-10 da 10-26", () => {
    const pick = (gp: Row[1]) => {
      const r = checkGracePeriodExemption(T, gp, SEONGNAM);
      return [r.basis, r.deadline?.toISOString().slice(0, 10)];
    };
    expect(pick(na({}))).toEqual(["na", "2026-10-26"]);
    expect(pick(na({ contract: "2026-05-20" }))).toEqual(["na", "2026-11-09"]);
    expect(pick(da({}))).toEqual(["da", "2026-10-26"]);
  });

  it("G-16 가목 — 양도일 2026-05-09면 내용과 무관하게 유예(basis a · unmet 없음)", () => {
    const r = checkGracePeriodExemption(D("2026-05-09"), na({ permit: false, deposit: false }), SEONGNAM);
    expect(r).toEqual({ suspended: true, basis: "a" });
  });
});

describe("12의2 나·다목 — 미충족 사유 unmet(전부 나열 · Q-2 a)", () => {
  it.each(ROWS)("%s", (_id, gp, region, suspended, unmet) => {
    const r = checkGracePeriodExemption(T, gp, region);
    expect(r.unmet ?? []).toEqual(unmet);
    expect(r.suspended).toBe(suspended);
  });

  it("기한 초과 사유와 함께 기한 날짜를 돌려준다 — G-7 2026-08-03(8-01 토요일 → 민법 §161 익일)", () => {
    const r = checkGracePeriodExemption(T, na({ contract: "2026-02-01" }), SEONGNAM);
    expect(r.deadline?.toISOString().slice(0, 10)).toBe("2026-08-03");
  });
});

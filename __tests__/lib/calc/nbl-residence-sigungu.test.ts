/**
 * 갭 1 — 재촌 시군구 매칭 결선 (wired-but-disconnected)
 *
 * Pre-Do(TDD): form-mapper(mapAssetToNblInput)가 nblLandSigunguCode를 input.landLocation으로
 *   매핑하지 않아, 농지·임야 거주이력을 입력해도 residence.ts:38에서 즉시 false →
 *   재촌 0건 → 자경 교집합 0 → 기간기준 미충족 → 비사업용 과대판정(부당 +10%p).
 *
 * 본 anchor는 (1) form-mapper 단위: input.landLocation.sigunguCode 세팅 +
 *   adjacentSigunguCodes(SIGUNGU_CODES lookupSigungu 5자리) 주입, (2) 풀 엔진:
 *   도시지역 밖 농지·자경 전기간·거주 시군구=토지 시군구(11680 서초구) → isNonBusinessLand=false
 *   를 단언. 현행은 landLocation undefined로 (1)(2) 모두 FAIL.
 *
 * 근거: 소득세법 시행령 §168의8②(농지 재촌=시군구 사실상 거주)·§168의9②(임야 동일/연접 시군구·30km).
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land";

// 행정표준코드 11680 = 서울특별시 **강남구** (서초구는 11650).
// ⚠️ 2026-08-01 정정: 종전 주석·변수명은 11680을 「서초구」라고 적고 있었다 —
//    `sigungu-codes.ts`가 구 체계라 그렇게 보였을 뿐이며, 현행 표준·PNU에서는 강남구다
//    (계획서 D-3: 서울은 도봉구부터 한 칸씩 밀려 있었다).
//    단언 자체는 우연히 유지됐으나 이름이 사실과 달라 판독을 오도했다.
const GANGNAM = "11680";
const GANGNAM_NAME = "서울특별시 강남구";

function farmlandRaw(overrides: Record<string, unknown> = {}) {
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest", // 도시지역 밖 → 사용기준 충족 시 사업용
    acquisitionArea: "1000",
    acquisitionDate: "2016-01-01",
    transferDate: "2026-06-01",
    nblFarmingSelf: true,
    nblLandSigunguCode: GANGNAM,
    nblLandSigunguName: GANGNAM_NAME,
    // 자경 전기간
    nblBusinessUsePeriods: [
      { startDate: "2016-01-01", endDate: "2026-06-01", usageType: "자경" },
    ],
    // 거주 이력: 토지 소재지와 동일 시군구(재촌) — sigungu 매칭 경로(거리 fallback 아님)
    nblResidenceHistories: [
      { sigunguCode: GANGNAM, sigunguName: GANGNAM_NAME, startDate: "2016-01-01", endDate: "2026-06-01", hasResidentRegistration: true },
    ],
    ...overrides,
  };
}

describe("[NBL-RESIDENCE] 갭1 재촌 시군구 매칭 결선", () => {
  it("form-mapper: nblLandSigunguCode → input.landLocation.sigunguCode + adjacentSigunguCodes 주입", () => {
    const input = buildNblEngineInput(farmlandRaw() as never);
    expect(input).toBeDefined();
    // (현행 FAIL) landLocation 미매핑 → undefined
    expect(input!.landLocation?.sigunguCode).toBe(GANGNAM);
    // 연접 시군구(SIGUNGU_CODES lookupSigungu) 주입 — 강남구(11680) 인접에 송파구(11710) 포함
    expect(input!.adjacentSigunguCodes).toBeDefined();
    expect(input!.adjacentSigunguCodes).toContain("11710");
  });

  it("풀 엔진: 도시지역 밖 농지·자경 전기간·거주=토지 시군구 → 사업용(isNonBusinessLand=false)", () => {
    const input = buildNblEngineInput(farmlandRaw() as never);
    const r = judgeNonBusinessLand(input!);
    // (현행 FAIL) landLocation undefined → 재촌 0 → 비사업용 true
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("대조: 거주 시군구가 토지와 다르고 연접도 아니면 재촌 미인정 → 비사업용(true)", () => {
    // 부산 해운대(26350) 거주 — 서초(11680)와 동일/연접 아님
    const raw = farmlandRaw({
      nblResidenceHistories: [
        { sigunguCode: "26350", sigunguName: "부산광역시 해운대구", startDate: "2016-01-01", endDate: "2026-06-01", hasResidentRegistration: true },
      ],
    });
    const input = buildNblEngineInput(raw as never);
    const r = judgeNonBusinessLand(input!);
    expect(r.isNonBusinessLand).toBe(true);
  });
});

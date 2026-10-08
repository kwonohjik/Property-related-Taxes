/**
 * anchor — 「동 안 일부 지구만 조정대상지역」인 동은 코드로 확정하지 않고 「지정 지구 안인가」 선언을 따른다
 * (사용자 결정 2026-10-08).
 *
 * 국토교통부 2019.11.6. 주거정책심의위원회 결과(2019.11.8. 효력): 고양시는 삼송택지개발지구, 원흥·지축·향동
 * 공공주택지구, 덕은·킨텍스1단계 도시개발지구, 고양관광문화단지(한류월드)만, 남양주시는 다산동·별내동만 조정대상지역으로
 * 남았다. 데이터는 이 지구를 법정동 단위(대화동·장항동 등)로 넓혀 두었으므로 동 전체가 지정으로 나왔다.
 * 광교·동탄2 택지도 같은 구조다.
 *
 * 미선언은 지구 안(지정 — 모름=불리) + 확인 필요다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  isRegulatedByBjdCode,
  designatedDistrictsForCode,
  governingDesignationStart,
} from "@/lib/tax-engine/data/regulated-areas";
import { REGULATED_REGIONS } from "@/lib/tax-engine/data/regulated-areas-data";
import { resolveWasRegulatedAtAcquisition } from "@/lib/tax-engine/transfer-tax-exemption-holding";
import { resolveRegulatedAtNewAcquisition } from "@/lib/tax-engine/transfer-tax-temporary-two-house-timing";
import {
  designatedDistrictUndeclared,
  DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX,
} from "@/lib/tax-engine/one-house/designated-district-undeclared";
import { preDesignationContractInScope } from "@/lib/calc/pre-designation-contract-scope";
import { buildHouseAddressPatch } from "@/lib/calc/house-region";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import { DesignatedDistrictQuestion } from "@/components/calc/transfer/DesignatedDistrictQuestion";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AddressValue } from "@/components/ui/address-search";
import { baseTransferInput } from "../_helpers/mock-rates";

afterEach(cleanup);

const DAEHWA = "4128710400"; // 고양시 일산서구 대화동 — 2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만
const GANGNAM = "1168010100";
const GIJANG_ILGWANG = "2671031021"; // 부산 기장군 일광면 — 면 전체 지정(정확)
const D = (s: string) => new Date(s);

describe("판정 — 지구 한정 동", () => {
  it("2019.11.8.~2020.6.18. 대화동: 선언이 없으면 지정(모름=불리) + districtOnly · confidence medium", () => {
    const j = isRegulatedByBjdCode(DAEHWA, "2020-01-15");
    expect(j.isRegulated).toBe(true);
    expect(j.confidence).toBe("medium");
    expect(j.districtOnly?.district).toBe("킨텍스1단계 도시개발지구");
  });

  it("지구 밖 선언 → 미지정 · 지구 안 선언 → 지정(둘 다 확정)", () => {
    expect(isRegulatedByBjdCode(DAEHWA, "2020-01-15", false)).toMatchObject({ isRegulated: false, confidence: "high" });
    const inside = isRegulatedByBjdCode(DAEHWA, "2020-01-15", true);
    expect(inside).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(inside.districtOnly).toBeUndefined();
  });

  it("시 전역 지정 구간(2018 · 2020.6.19. 이후)은 선언과 무관하게 동 전체 지정", () => {
    for (const date of ["2018-06-01", "2021-03-01"]) {
      for (const inDistrict of [undefined, false, true]) {
        const j = isRegulatedByBjdCode(DAEHWA, date, inDistrict);
        expect(j.isRegulated).toBe(true);
        expect(j.districtOnly).toBeUndefined();
      }
    }
  });

  it("면·동 전체가 지정된 항목(기장 일광면)과 일반 지역(강남)은 종전 그대로 확정", () => {
    expect(isRegulatedByBjdCode(GIJANG_ILGWANG, "2018-10-01")).toMatchObject({ isRegulated: true, confidence: "high" });
    expect(isRegulatedByBjdCode(GIJANG_ILGWANG, "2018-10-01").districtOnly).toBeUndefined();
    expect(isRegulatedByBjdCode(GANGNAM, "2020-01-15").districtOnly).toBeUndefined();
  });

  it("공고 식별(11호·§155①2호 괄호)도 같은 선언을 쓴다 — 지구 밖이면 그 날 지정 구간이 없다", () => {
    expect(governingDesignationStart(DAEHWA, "2020-01-15", false)).toBeNull();
    expect(governingDesignationStart(DAEHWA, "2020-01-15", true)).not.toBeNull();
  });

  it("지구 이름은 광교·고양·남양주(다산·별내)·동탄2 묶음 35개 항목에 모두 있다", () => {
    const tagged = REGULATED_REGIONS.flatMap((r) => r.includedSubCodes ?? []).filter((s) => s.district);
    expect(tagged).toHaveLength(35);
    expect(new Set(tagged.map((s) => s.district))).toEqual(
      new Set([
        "광교택지개발지구",
        "삼송택지개발지구",
        "원흥 공공주택지구",
        "지축 공공주택지구",
        "향동 공공주택지구",
        "덕은 도시개발지구",
        "고양관광문화단지(한류월드)",
        "킨텍스1단계 도시개발지구",
        "다산동(행정동)",
        "별내동(행정동)",
        "동탄2택지개발지구",
      ]),
    );
    expect(designatedDistrictsForCode(DAEHWA).map((d) => d.district)).toEqual(["킨텍스1단계 도시개발지구"]);
    expect(designatedDistrictsForCode(GANGNAM)).toEqual([]);
    expect(designatedDistrictsForCode("41287")).toEqual([]); // 5자리는 하위 규칙을 못 가른다
  });
});

describe("엔진 소비 지점 — 선언이 위치 사실로 모든 날짜에 같이 쓰인다", () => {
  const sale = (over: Partial<TransferTaxInput>) =>
    baseTransferInput({
      propertyType: "housing",
      acquisitionDate: D("2020-01-15"),
      transferDate: D("2024-06-01"),
      regionCode: DAEHWA,
      ...over,
    });

  it("취득 당시 조정(§154① 거주요건): 미선언 지정 · 지구 밖 미지정", () => {
    expect(resolveWasRegulatedAtAcquisition(sale({}))).toBe(true);
    expect(resolveWasRegulatedAtAcquisition(sale({ regionInDesignatedDistrict: false }))).toBe(false);
  });

  it("§155①2호 신규 주택(명부 행) 취득 당시: 신규 주택 선언을 쓴다", () => {
    const tt = (inDistrict?: boolean) =>
      resolveRegulatedAtNewAcquisition(
        sale({
          regionCode: GANGNAM,
          temporaryTwoHouse: {
            previousAcquisitionDate: D("2015-01-01"),
            newAcquisitionDate: D("2020-01-15"),
            newHouseRegionCode: DAEHWA,
            ...(inDistrict !== undefined ? { newHouseInDesignatedDistrict: inDistrict } : {}),
          },
        }),
      );
    expect(tt().next).toBe(true);
    expect(tt(false).next).toBe(false);
    expect(tt(false).bothRegulated).toBe(false);
  });
});

describe("확인 필요 고지", () => {
  it("미선언이면 양도 주택 고지 · 선언하면 없음", () => {
    const base = baseTransferInput({
      propertyType: "housing",
      acquisitionDate: D("2020-01-15"),
      transferDate: D("2024-06-01"),
      regionCode: DAEHWA,
    });
    const u = designatedDistrictUndeclared(base);
    expect(u.map((x) => x.id)).toEqual([`${DESIGNATED_DISTRICT_UNDECLARED_ID_PREFIX}selling`]);
    expect(u[0].reason).toContain("킨텍스1단계 도시개발지구");
    expect(designatedDistrictUndeclared({ ...base, regionInDesignatedDistrict: false })).toEqual([]);
    // 지구 한정 구간 밖(시 전역 지정 · 미지정)은 묻지 않는다
    expect(designatedDistrictUndeclared({ ...base, acquisitionDate: D("2018-01-01"), transferDate: D("2024-06-01") })).toEqual([]);
  });

  it("승계취득 입주권 행은 소재지가 조정대상지역 판정에 쓰이지 않아 묻지 않는다", () => {
    const base = baseTransferInput({ propertyType: "housing", transferDate: D("2024-06-01") });
    const right = { id: "r", type: "redevelopment_right" as const, acquisitionDate: D("2020-01-15"), region: "capital" as const, regionCode: DAEHWA };
    expect(designatedDistrictUndeclared({ ...base, presaleRights: [{ ...right, memberOrigin: "successor" }] })).toEqual([]);
    expect(designatedDistrictUndeclared({ ...base, presaleRights: [{ ...right, memberOrigin: "original_house" }] })).toHaveLength(1);
  });
});

describe("클라이언트 — ⑤ 질문 · 주소 변경 초기화 · ④ payload · 11호 범위", () => {
  it("대화동 코드면 질문이 뜨고 고른 값을 돌려준다 · 강남이면 뜨지 않는다", () => {
    let picked: boolean | undefined;
    render(<DesignatedDistrictQuestion regionCode={DAEHWA} value={undefined} onChange={(v) => (picked = v)} idSuffix="t" />);
    expect(screen.getByTestId("designated-district-question-t").textContent).toContain("킨텍스1단계 도시개발지구");
    fireEvent.click(screen.getByTestId("designated-district-out-t"));
    expect(picked).toBe(false);
    cleanup();
    render(<DesignatedDistrictQuestion regionCode={GANGNAM} value={undefined} onChange={() => {}} idSuffix="g" />);
    expect(screen.queryByTestId("designated-district-question-g")).toBeNull();
  });

  it("명부 행 주소: 법정동이 바뀌면 선언을 지우고, 같은 동(동·호 재발화)이면 유지한다", () => {
    const v = (pnu: string) => ({ road: "", jibun: "x", building: "", detail: "", lng: "", lat: "", pnu }) as AddressValue;
    expect("inDesignatedDistrict" in buildHouseAddressPatch(v(`${GANGNAM}100010000`), DAEHWA)).toBe(true);
    expect(buildHouseAddressPatch(v(`${GANGNAM}100010000`), DAEHWA).inDesignatedDistrict).toBeUndefined();
    expect("inDesignatedDistrict" in buildHouseAddressPatch(v(`${DAEHWA}100010000`), DAEHWA)).toBe(false);
  });

  it("입주권 행 payload는 코드가 있을 때만 선언을 싣는다", () => {
    const row = { id: "p", type: "redevelopment_right" as const, acquisitionDate: "2020-01-15", region: "capital" as const };
    const p = buildPresaleRightsPayload("housing", [
      { ...row, regionCode: DAEHWA, inDesignatedDistrict: false },
      { ...row, id: "q", inDesignatedDistrict: true },
    ]);
    expect(p?.map((x) => x.inDesignatedDistrict)).toEqual([false, undefined]);
  });

  it("11호(공고 전 매매계약) 범위도 선언을 따른다", () => {
    const a = { assetKind: "housing", regionCode: DAEHWA, transferDate: "2020-03-01", houseRows: 1, presaleRights: 0 };
    expect(preDesignationContractInScope(a)).toBe(true);
    expect(preDesignationContractInScope({ ...a, regionInDesignatedDistrict: false })).toBe(false);
  });
});

/**
 * PNU(19자리) → 건축HUB getBrTitleInfo 파라미터 분해.
 *
 * PNU 구조: 시군구5 + 읍면동3 + 리2 + 산여부1 + 본번4 + 부번4 (pnu-sigungu.ts:4 주석).
 * - bjdongCd = 읍면동3 + 리2 통합 5자리(법정동코드).
 * - platGbCd: pnu[10]("1"=대지/"2"=산) → HUB platGbCd("0"=대지/"1"=산).
 *   ★ 산술 트릭(Number-1) 금지 — 명시 분기(코드값 silent 오매핑 위험).
 *
 * `pnu-sigungu.ts`는 sigungu 5자리만 추출 → bjdong/bun/ji/platGbCd 분해는 본 헬퍼 신규.
 */
export interface BuildingRegisterPnuParts {
  /** [0:5] 시군구코드 */
  sigunguCd: string;
  /** [5:10] 읍면동3 + 리2 통합 5자리(법정동코드) */
  bjdongCd: string;
  /** HUB 대지구분: pnu[10]==="2"(산) ? "1" : "0"(대지) */
  platGbCd: string;
  /** [11:15] 본번 */
  bun: string;
  /** [15:19] 부번 */
  ji: string;
}

/** 19자리 PNU만 허용. 아니면 null(라우트가 400 안내). */
export function decomposePnuForBuildingRegister(
  pnu: string,
): BuildingRegisterPnuParts | null {
  if (!/^\d{19}$/.test(pnu)) return null;
  return {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    platGbCd: pnu[10] === "2" ? "1" : "0", // 명시 분기(대지/산 2-case)
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19),
  };
}

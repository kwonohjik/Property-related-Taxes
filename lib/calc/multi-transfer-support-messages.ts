/**
 * 다건 합산(/multi) 미지원 모드 안내 — ⑧(`multi-transfer-tax-validate.ts`)과 ⑫(`lib/api/transfer-tax-schema.ts`)가
 * **같은 문구**를 쓰도록 모은 곳. 서버 스키마가 import하므로 이 파일은 **의존성이 없어야** 한다
 * (validate 파일은 클라이언트 컴포넌트·스토어를 끌고 온다).
 */

/** 다건 route(⑭)는 `carryoverTaxation`을 매핑하지 않는다 — 이월과세는 단건 전용(F-5). */
export const MULTI_CARRYOVER_UNSUPPORTED_MESSAGE = "배우자등 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.";

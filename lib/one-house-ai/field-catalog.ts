/**
 * 1세대1주택 AI 사실 추출 — **필드 사전** (판정 메뉴 폼 `OneHouseJudgmentFormData`의 추출 대상 경로).
 *
 * LLM이 해석례·사용자 서술에서 읽어 낸 「경로 = 값」을 이 사전으로 검증한 뒤 폼에 넣는다
 * (타입·경로 표기는 `field-catalog.types.ts`). 800줄 정책에 따라 주제별 파일로 나누고 여기서 합친다.
 *
 * 순서: 최상위 → asset → houses[] → presaleRights[] → 그 밖(finalHouseRestartDisposals[]).
 *
 * 사전에 두지 않는 경로:
 *   - 행 식별자 `houses[].id`·`presaleRights[].id`·`finalHouseRestartDisposals[].id`·
 *     `asset.rentalHousingException.rentalUnits[].unitId` — 추출기가 관리한다.
 *   - `asset.residenceInputMode` — 추출기가 고정한다.
 *   - 배열 자체(`asset.rentalHousingException.rentalUnits`) — 행은 하위 경로로 만든다.
 */
import type { FieldSpec } from "./field-catalog.types";
import { ONE_HOUSE_FIELD_CATALOG_TOP } from "./field-catalog-top";
import { ONE_HOUSE_FIELD_CATALOG_ASSET } from "./field-catalog-asset";
import { ONE_HOUSE_FIELD_CATALOG_HOUSES } from "./field-catalog-houses";
import { ONE_HOUSE_FIELD_CATALOG_RIGHTS } from "./field-catalog-rights";

export const ONE_HOUSE_FIELD_CATALOG = [
  ...ONE_HOUSE_FIELD_CATALOG_TOP,
  ...ONE_HOUSE_FIELD_CATALOG_ASSET,
  ...ONE_HOUSE_FIELD_CATALOG_HOUSES,
  ...ONE_HOUSE_FIELD_CATALOG_RIGHTS,
] as const satisfies readonly FieldSpec[];

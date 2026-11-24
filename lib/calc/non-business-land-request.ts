/**
 * NBL 정밀판정 raw 페이로드 → 엔진 input 변환 (⑭ 서버 헬퍼)
 *
 * 아키텍처 B(서버측 매퍼 단일소스): 클라이언트가 raw 평면(nbl*)을 전송하면
 * route가 본 헬퍼로 `mapAssetToNblInput`(flat→nested + 날짜 일괄 파싱)을 1회 호출한다.
 * 단건 `route.ts`·다건 `multi/route.ts` 공용.
 *
 * ⚠️ parseNumber는 bespoke 인라인 — `parseAmount`/`parseDecimal`은 React 컴포넌트 파일이라
 *    서버 import 부적절.
 */
import type { z } from "zod";

import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import type { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { evaluateUnconditionalExemption } from "@/lib/calc/nbl-unconditional-exemption-status";
import { buildUncondSourceRecord, nblAcquisitionDateOf } from "@/lib/calc/nbl-unconditional-exemption-status";
import { nblLandSigunguCodeOf } from "./nbl-land-sigungu";
import { effectiveOtherHasBuildingOf } from "./nbl-other-state-history-scope";
import { revenuePeriodWireFields } from "./nbl-revenue-period-scope";
import { housePriorNeedsMetropolitanOf } from "./nbl-other-state-history-scope";
import { nblHousingStateHistoryApplies } from "./nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";
import { stateHistoryWireFields } from "./nbl-other-state-history-scope";
import { householdHouseWireFields } from "./nbl-vacant-lot-household-scope";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { getLandCategoryGroup } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesMetropolitanArea } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesPeriodJudgmentDate } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesUrbanIncorporationDate } from "@/lib/tax-engine/non-business-land/land-category";

/** Zod 검증 후 출력(z.infer = z.output) — 빌더의 z.input과 구분 */
type NonBusinessLandRaw = z.infer<typeof nonBusinessLandRawSchema>;

/**
 * 자산-수준 「공유 지분율」(%) → [0..1] 비율. `getOwnershipRatio`와 **동치**여야 한다
 * (동치는 `__tests__/lib/calc/nbl-ownership-ratio-resort-gate.anchor.test.tsx`가 지킨다).
 */
function deriveOwnershipRatio(asset: AssetForm): number {
  const n = parseFloat(asset.ownershipNumerator || "100");
  const d = parseFloat(asset.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0) return 1;
  return Math.min(n / d, 1);
}

export function parseRawNumber(s: string): number | undefined {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * raw nbl 페이로드를 엔진 `NonBusinessLandInput`으로 변환.
 * @returns 정밀판정 미사용/미선택(매퍼 null) 시 undefined.
 */
export function buildNblEngineInput(
  raw: NonBusinessLandRaw | undefined,
): NonBusinessLandInput | undefined {
  if (!raw) return undefined;
  return (
    mapAssetToNblInput(raw as Record<string, unknown>, {
      acquisitionDate: toDate(raw.acquisitionDate, "nonBusinessLandRaw.acquisitionDate"),
      transferDate: toDate(raw.transferDate, "nonBusinessLandRaw.transferDate"),
      parseDate: toOptionalDate,
      parseNumber: parseRawNumber,
    }) ?? undefined
  );
}

/**
 * NBL2611-V6-PU11 · B1 — raw 페이로드가 **무조건 사업용 의제(영 §168의14③)** 로 성립하는가 (⑫ 전용).
 *
 * ⑧(`validateNblDetailedJudgment`)은 의제가 성립하면 지목·기간 행 검증을 건너뛴다(그 칸이 화면에서 비활성이라 고칠 수 없다).
 * ⑫가 같은 조건을 쓰지 않으면 「⑧ 통과 ↔ ⑫ 400」 모순이 생기므로 **엔진 자신의 판정**(`checkUnconditionalExemption`)을
 * raw에서 다시 돌려 같은 결론을 얻는다 — 조건을 따로 재구현하지 않는다. 날짜가 깨져 변환이 실패하면 의제 불성립으로 본다
 * (다른 검증이 그 오류를 먼저 낸다).
 */
export function isNblRawUnconditionallyExempt(raw: Record<string, unknown>): boolean {
  try {
    const input = buildNblEngineInput(raw as NonBusinessLandRaw);
    if (!input) return false;
    return checkUnconditionalExemption(input, getLandCategoryGroup(input.landType)).isExempt;
  } catch {
    return false;
  }
}

/**
 * 이월과세(`carryover_gift`) 자산의 **이월과세 배제 시(시나리오 B) 비사업용 토지 입력** — NBL2611-R23 · Q-11.
 *
 * 영 §168의14③3호 괄호는 「법 제97조의2제1항을 적용받는 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날」이다 —
 * 배제(②1호 수용 2년 이전 증여 선언 · ②3호 세액 비교로 B 채택 · ③ 기간 경과)되면 기산일은 수증일(등기접수일)이다.
 * 같은 raw를 **일반 증여·수증일 취득**으로 다시 매핑한다 — 취득일에서 파생되는 값(준비기간 2년·수입금액비율 영위일수·종중 취득일)이 함께 바뀌어야 해서
 * 엔진이 입력 하나의 날짜만 갈아 끼우는 방식은 쓰지 않는다. 이월과세가 아니거나 수증일이 없으면 undefined.
 */
export function buildNblEngineInputGiftBasis(
  raw: NonBusinessLandRaw | undefined,
  giftRegistryDate: string | Date | undefined,
): NonBusinessLandInput | undefined {
  if (!raw || giftRegistryDate === undefined || giftRegistryDate === "") return undefined;
  const flat = raw as Record<string, unknown>;
  if (flat.acquisitionCause !== "carryover_gift") return undefined;
  const gift = toDate(giftRegistryDate, "carryoverTaxation.giftRegistryDate");
  return (
    mapAssetToNblInput(
      { ...flat, acquisitionCause: "gift", donorAcquisitionDate: "" },
      {
        acquisitionDate: gift,
        transferDate: toDate(raw.transferDate, "nonBusinessLandRaw.transferDate"),
        parseDate: toOptionalDate,
        parseNumber: parseRawNumber,
      },
    ) ?? undefined
  );
}

/**
 * 도시지역 편입일 단일 소스 — ④ raw 빌더와 ⑧ validate가 **같은 값**을 보게 한다.
 *
 * 두 규칙이 겹쳐 있어 어느 한쪽에서 재구현하면 조용히 어긋난다:
 *  1. 직접입력이 유효한 `YYYY-MM-DD`가 아니면(과거 raw text `"20230214"` 등) 미입력으로 본다.
 *     `new Date("20230214")`는 Invalid → `toOptionalDate`가 undefined → 편입유예 미적용.
 *  2. 미입력이면 §66 자경 편입 부분감면의 편입일로 fallback한다(동일 사건 — 농지의 도시지역 편입).
 *
 * @returns 해소된 편입일(YYYY-MM-DD) 또는 빈 문자열
 */
export function resolveNblUrbanIncorporationDate(asset: AssetForm): string {
  const direct = /^\d{4}-\d{2}-\d{2}$/.test(asset.nblUrbanIncorporationDate || "")
    ? asset.nblUrbanIncorporationDate
    : "";
  const sf = asset.reductions?.find((r) => r.type === "self_farming");
  const selfFarming =
    sf?.type === "self_farming" && sf.useSelfFarmingIncorporation
      ? sf.selfFarmingIncorporationDate
      : undefined;
  return direct || selfFarming || "";
}

/**
 * AssetForm → NBL raw 페이로드 (④ 클라이언트 빌더 — 단건·다건 공용).
 * 정밀판정 토글 ON + 필수(면적·취득일) 충족 시 전송. 지목·용도지역은 필수이나,
 * 무조건 사업용 의제(§168의14③) 성립 시에는 미선택이어도 전송(엔진이 Step 2에서 지목 무관 판정).
 * store nbl* 평면을 prefix-pick으로 그대로 운반 → 서버 buildNblEngineInput이 nested + Date 변환.
 */
export function buildNonBusinessLandRaw(
  asset: AssetForm,
  transferDate: string,
): Record<string, unknown> | undefined {
  const isExempt = evaluateUnconditionalExemption(asset, transferDate).isExempt;
  if (
    asset.assetKind !== "land" ||
    !asset.nblUseDetailedJudgment ||
    !asset.acquisitionArea ||
    !nblAcquisitionDateOf(asset) ||
    (!isExempt && (!asset.nblLandType || !asset.nblZoneType))
  ) {
    return undefined;
  }
  const nblFields = Object.fromEntries(
    // `nblOtherLegacyRelatedReselect`는 화면 고지 표지(표시 전용)라 보내지 않는다 — 서버가 읽을 곳이 없다.
    // E3-④ `nblOtherHouseholdHouseStatus`(13호 «세대 주택 소유 여부» 질문 답)도 UI 전용이다 — 서버·엔진은 행 없음 = 현행(Q-4 (가))이라 읽을 곳이 없다.
    Object.entries(asset).filter(([k]) => k.startsWith("nbl") && k !== "nblOtherLegacyRelatedReselect" && k !== "nblOtherHouseholdHouseStatus"),
  );
  // NBL2611-B1 — 지목별 입력 소비: 그 지목이 판정에 쓰지 않는 칸의 값은 store에 남아 있어도(이력 복원 보존) 보내지 않는다.
  // ⑤ 렌더·⑧ 검증·서버 매퍼가 같은 엔진 술어(`consumes*`)를 쓴다 — useEffect로 store를 지우지 않는다.
  const consumes = {
    incorporation: consumesUrbanIncorporationDate(asset.nblLandType),
    // E3-③ B — 기타토지는 소비표 열을 열지 않고(D-13) «철거된 건축물 = 주택» 행이 있고 수도권이 배율을 가르는 용도지역일 때만 보낸다(엔진 술어 단일 소스 — 안 열면 서버가 수도권 미제공으로 읽어 보수적 3배 · 초과 접힘).
    metro: consumesMetropolitanArea(asset.nblLandType) || housePriorNeedsMetropolitanOf(asset, transferDate),
    deemed: consumesPeriodJudgmentDate(asset.nblLandType),
  };
  return {
    ...nblFields,
    /**
     * NBL-STATE-HISTORY-U1 — 기타토지 소유기간 중 건축물 이력. **⑤ 렌더·⑧ 검증과 같은 전체 술어**(`nblStateHistoryApplies` — 기타토지 ∨ 주택부수토지)가 거짓이면 `""`·`[]`로 비워 보낸다 —
     * 연접 다필지로 질문이 숨은 뒤 남은 stale `changed`·잘못된 사건 행이 닿으면 ⑧은 건너뛰는데 ⑫는 400으로 막는 막다른 길이 된다.
     * 참이고 `unchanged`·`unknown`이면 모드는 유지하고 사건만 비운다(엔진이 고지를 모드로 가른다). `changed`이면 사건 행을 그대로 싣는다.
     * `nblFields` 스프레드 **뒤**에 둔다(저장된 stale 값을 덮어쓴다). 양도일 현재 「건축물 있음」도 `changed`이면 사건이 정한다(⑫·⑭와 같은 파생 — 숨은 토글값이 모순돼도 사건이 이긴다).
     */
    ...stateHistoryWireFields(asset),
    ...(nblOtherStateEventsInUse(asset) ? { nblOtherHasBuilding: effectiveOtherHasBuildingOf(asset) } : {}),
    /**
     * NBL-STATE-HISTORY-E3-④ — 13호 «세대 주택 소유 기간» 행. **⑤ 렌더·⑧ 검증과 같은 술어**(`vacantLotHousePeriodsReadOf` — 엔진 술어 `vacantLotHousePeriodsRead`)가 거짓이거나 질문이 `owned`가 아니면 `[]`로 덮어 쓴다 —
     * `nbl*` prefix-pick은 저장된 stale 행을 그대로 싣고, 숨은 행이 닿으면 ⑧은 건너뛰는데 ⑫′가 구조 결함으로 400을 만드는 막다른 길이 된다. 종료일 비움은 키 생략(= 양도일까지).
     */
    ...householdHouseWireFields(asset),
    /** E3-③ A — 주택부수토지 카드는 «건축물 있음» 토글이 없다: 질문이 적용되면 양도일 현재 주택을 `true`로 고정해 싣는다(⑭ `tailHasBuilding = true` · 화면 «주택: 있음(지목에서 정함)»과 같은 값 — 기타토지 stale 토글이 새지 않는다). */
    ...(nblHousingStateHistoryApplies(asset) ? { nblOtherHasBuilding: true } : {}),
    /**
     * NBL-STATE-HISTORY-E3-② — 업종 영위 기간. **⑤ 렌더·⑧ 검증과 같은 술어**(`nblRevenuePeriodOn`)가 거짓이면 `false`·`""`·`[]`로 덮어 쓴다 — `nbl*` prefix-pick은 저장값을 그대로 싣고,
     * 숨은 stale 값이 닿으면 ⑧은 건너뛰는데 ⑫가 400으로 막는다. 참이면 폐업일과 **표가 받는 연도의 행만** 싣는다(개시일은 기존 `nblRevenueCurrentBusinessStartDate`가 prefix-pick으로 간다).
     */
    ...revenuePeriodWireFields(asset, transferDate),
    /**
     * 공유 지분 — 자산-수준 「공유 지분율」(%) **단일 소스**에서 파생한다 (2026-09-04).
     *
     * 종전에는 NBL 섹션에 「공동소유 지분」 입력칸이 따로 있었고, 같은 값을 **한 화면에서 두 번,
     * 서로 다른 단위로** 받았다 — 자산-수준은 백분율(단독 100), NBL은 비율(단독 1). 그래서
     * 백분율 감각으로 `50`을 넣으면 UI 자동조회(`NblLandAutoFetch`)는 `공시지가 × 면적 × 50`을
     * verbatim 곱하고 엔진은 조용히 1로 접었다. ⑧ validate가 이를 차단하고 있었으나, 차단은
     * 두 단위가 공존한다는 사실 자체를 없애지 못한다.
     *
     * ⇒ 입력칸을 없애고 여기서 파생한다. `nblFields` 스프레드 **뒤**에 두어 레거시 저장 데이터의
     *   `nblOwnershipRatio`(구 비율값)를 반드시 덮어쓴다 — 순서를 바꾸면 stale 값이 되살아난다.
     *
     * 산식은 `getOwnershipRatio`(transfer-tax-api-asset-basics.ts)와 동일하다. 그 파일은
     * React 컴포넌트(`CurrencyInput`)를 import하므로 서버도 쓰는 본 모듈에서 직접 import하지
     * 않는다(파일 상단 ⚠️ 주석과 같은 이유). 동치는 anchor 테스트가 지킨다.
     */
    nblOwnershipRatio: String(deriveOwnershipRatio(asset)),
    nblUrbanIncorporationDate: consumes.incorporation ? resolveNblUrbanIncorporationDate(asset) : "",
    nblIsMetropolitanArea: consumes.metro ? asset.nblIsMetropolitanArea : "",
    nblDeemedTransferReason: consumes.deemed ? asset.nblDeemedTransferReason : "none",
    nblDeemedTransferDate: consumes.deemed ? asset.nblDeemedTransferDate : "",
    nblLandSigunguCode: nblLandSigunguCodeOf(asset),
    // 농지 좌표(직선거리 30km 재촌 판정 기준점) — 양도 물건 주소검색 시 세팅됨.
    nblLandLat: asset.latitude,
    nblLandLng: asset.longitude,
    // 무조건 의제 판정에 필요한 nbl* 미prefix 필드 — ⑧ 어댑터와 **같은 레코드 조립**을 쓴다.
    // (공익수용 단일 소스 transferCause·고시일 fallback / §168의14③3호나목 취득일 소급)
    transferCause: asset.transferCause,
    expropriationNoticeDate: asset.expropriationNoticeDate,
    acquisitionCause: asset.acquisitionCause,
    decedentAcquisitionDate: asset.decedentAcquisitionDate,
    // 상속인이 아닌 수유자 — 상속일 때만 싣는다(취득원인을 바꾼 뒤 남은 값은 닿지 않는다)
    nonHeirBequest: asset.acquisitionCause === "inheritance" && asset.nonHeirBequest ? true : undefined,
    donorAcquisitionDate: buildUncondSourceRecord(asset).donorAcquisitionDate,
    acquisitionArea: asset.acquisitionArea,
    // 소유기간 기산일 — 이월과세는 증여자 취득일(단일 소스 `nblAcquisitionDateOf`). 와이어 `acquisitionDate`(증여 등기접수일)와 다른 값이다.
    acquisitionDate: nblAcquisitionDateOf(asset),
    transferDate,
  };
}

/**
 * 취득 경위에 달린 무조건 사업용 의제 선언 4종 — 축 B 지분 판정에서 첫 카드 선언을 그대로 쓸 수 없는 것.
 * (계획서 `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md` §4-2)
 *
 * 공익수용(③3호)은 선언이 땅 단위이고 취득일은 지분 값을 쓰므로 빠진다. 공장 인접도 땅 단위다.
 * ③1호(2006.12.31. 이전 상속)는 선언이 아니라 지분의 취득원인·취득일로 자동 판정하므로 빠진다
 * (계획서 `docs/00-pm/nbl-unconditional-inherit-cause.plan.md`). ③4호 가목(도시지역 농지 종중)은 「종중 소유」 하나로 받는다
 * (계획서 `docs/00-pm/nbl-jongjoong-toggle-merge.plan.md`).
 */
export const NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS = [
  "nblExemptLongOwned20y",
  "nblExemptAncestor8YearFarming",
  "nblExemptJongjoongOwned",
  "nblExemptInong",
] as const satisfies readonly (keyof AssetForm)[];

/**
 * 축 B(같은 땅을 지분으로 나눠 취득) 둘째 이후 지분의 정밀판정 레코드 — ④ 페이로드와 ⑧ 검증이 **같은 레코드**를 본다.
 *
 * 「소득세법」 §104의3①은 「해당 토지를 소유하는 기간」으로, 「소득세법 시행령」 §168의14③3호는 「취득일」로 판정한다.
 * 그래서 **땅에 관한 사실**(지목·용도지역·사용기간·재촌·면적·소재지·양도원인·고시일 — 지분 카드에는 입력이 없다)은
 * 첫 카드 값을, **지분에 관한 사실**(취득일·취득원인·피상속인·증여자 취득일·수유자 여부·지분율)은 그 지분 카드 값을 쓴다.
 *
 * 취득원인·취득일이 첫 카드와 다르면 취득 경위에 달린 의제 선언 4종을 끈다 — 첫 카드에서 한 선언이 이 지분의
 * 취득 경위에도 맞는지 확인되지 않았기 때문이다(결과 안내는 다건 엔진 `nblShareExemptionWithheldNotice`).
 * 임야·목장 「상속 3년 이내」와 무조건 의제 ③1호·③4호 나목은 선언이 아니라 취득원인·취득일에서 정해지므로(서버 매퍼 `resolveInheritanceStartDate`)
 * 위 지분 사실을 싣는 것만으로 지분마다 따로 판정된다.
 */
export function buildFractionalShareNblRecord(share: AssetForm, primary: AssetForm): AssetForm {
  const sameAcquisition =
    share.acquisitionCause === primary.acquisitionCause && nblAcquisitionDateOf(share) === nblAcquisitionDateOf(primary);
  return {
    ...primary,
    acquisitionDate: share.acquisitionDate,
    acquisitionCause: share.acquisitionCause,
    decedentAcquisitionDate: share.decedentAcquisitionDate,
    nonHeirBequest: share.nonHeirBequest,
    donorAcquisitionDate: share.donorAcquisitionDate,
    carryover: share.carryover,
    ownershipNumerator: share.ownershipNumerator,
    ownershipDenominator: share.ownershipDenominator,
    ...(sameAcquisition
      ? {}
      : Object.fromEntries(NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS.map((f) => [f, false]))),
  };
}


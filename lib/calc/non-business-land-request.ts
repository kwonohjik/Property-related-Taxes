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
import { buildUncondSourceRecord } from "@/lib/calc/nbl-unconditional-exemption-status";
import { nblLandSigunguCodeOf } from "./nbl-land-sigungu";

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

function parseRawNumber(s: string): number | undefined {
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
    !asset.acquisitionDate ||
    (!isExempt && (!asset.nblLandType || !asset.nblZoneType))
  ) {
    return undefined;
  }
  const nblFields = Object.fromEntries(
    Object.entries(asset).filter(([k]) => k.startsWith("nbl")),
  );
  return {
    ...nblFields,
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
    nblUrbanIncorporationDate: resolveNblUrbanIncorporationDate(asset),
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
    donorAcquisitionDate: buildUncondSourceRecord(asset).donorAcquisitionDate,
    acquisitionArea: asset.acquisitionArea,
    acquisitionDate: asset.acquisitionDate,
    transferDate,
  };
}

/**
 * 취득 경위에 달린 무조건 사업용 의제 선언 6종 — 축 B 지분 판정에서 첫 카드 선언을 그대로 쓸 수 없는 것.
 * (계획서 `docs/00-pm/axis-b-land-share-nbl-detailed-judgment.plan.md` §4-2)
 *
 * 공익수용(③3호)은 선언이 땅 단위이고 취득일은 지분 값을 쓰므로 빠진다. 공장 인접도 땅 단위다.
 */
export const NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS = [
  "nblExemptInheritBefore2007",
  "nblExemptLongOwned20y",
  "nblExemptAncestor8YearFarming",
  "nblExemptJongjoongOwned",
  "nblExemptUrbanFarmlandJongjoong",
  "nblExemptInong",
] as const satisfies readonly (keyof AssetForm)[];

/**
 * 축 B(같은 땅을 지분으로 나눠 취득) 둘째 이후 지분의 정밀판정 레코드 — ④ 페이로드와 ⑧ 검증이 **같은 레코드**를 본다.
 *
 * 「소득세법」 §104의3①은 「해당 토지를 소유하는 기간」으로, 「소득세법 시행령」 §168의14③3호는 「취득일」로 판정한다.
 * 그래서 **땅에 관한 사실**(지목·용도지역·사용기간·재촌·면적·소재지·양도원인·고시일 — 지분 카드에는 입력이 없다)은
 * 첫 카드 값을, **지분에 관한 사실**(취득일·취득원인·피상속인·증여자 취득일·지분율)은 그 지분 카드 값을 쓴다.
 *
 * 취득원인·취득일이 첫 카드와 다르면 취득 경위에 달린 의제 선언 6종을 끈다 — 첫 카드에서 한 선언이 이 지분의
 * 취득 경위에도 맞는지 확인되지 않았기 때문이다(결과 안내는 다건 엔진 `nblShareExemptionWithheldNotice`).
 * 임야·목장 「상속 3년 이내」 입력은 끄지 않고 지분 사실로 다시 정한다(`shareInheritanceWithin3YearsFacts`).
 */
export function buildFractionalShareNblRecord(share: AssetForm, primary: AssetForm): AssetForm {
  const sameAcquisition =
    share.acquisitionCause === primary.acquisitionCause && share.acquisitionDate === primary.acquisitionDate;
  return {
    ...primary,
    acquisitionDate: share.acquisitionDate,
    acquisitionCause: share.acquisitionCause,
    decedentAcquisitionDate: share.decedentAcquisitionDate,
    donorAcquisitionDate: share.donorAcquisitionDate,
    carryover: share.carryover,
    ownershipNumerator: share.ownershipNumerator,
    ownershipDenominator: share.ownershipDenominator,
    ...(sameAcquisition
      ? {}
      : {
          ...Object.fromEntries(NBL_ACQUISITION_DEPENDENT_EXEMPT_FLAGS.map((f) => [f, false])),
          ...shareInheritanceWithin3YearsFacts(share, primary),
        }),
  };
}

/**
 * 임야·목장 「상속 3년 이내」 입력 — 취득 경위가 첫 카드와 다른 지분은 **그 지분 사실로** 정한다
 * (계획서 `docs/00-pm/axis-b-share-nbl-forest-pasture-inheritance.plan.md` §3-1·§3-2).
 *
 * 「소득세법 시행령」 §168의9③7호·§168의10②1호는 「상속받은 … 상속개시일부터 3년이 경과하지 아니한」 것이다.
 * 두 요건(상속 여부·상속개시일)은 지분 카드의 취득원인·취득일(상속이면 상속개시일)이 이미 받는다.
 * 첫 카드에 선언이 있을 때만 적용한다 — 단건도 토글·상속일을 넣어야만 적용되는 규약과 같다(Q-2 a).
 */
function shareInheritanceWithin3YearsFacts(
  share: AssetForm,
  primary: AssetForm,
): Pick<AssetForm, "nblForestInheritedWithin3Years" | "nblForestInheritanceDate" | "nblPastureInheritanceDate"> {
  const inherited = share.acquisitionCause === "inheritance";
  const forest = inherited && primary.nblForestInheritedWithin3Years === true;
  return {
    nblForestInheritedWithin3Years: forest,
    nblForestInheritanceDate: forest ? share.acquisitionDate : "",
    nblPastureInheritanceDate: inherited && primary.nblPastureInheritanceDate ? share.acquisitionDate : "",
  };
}

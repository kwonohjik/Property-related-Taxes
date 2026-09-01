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

/** Zod 검증 후 출력(z.infer = z.output) — 빌더의 z.input과 구분 */
type NonBusinessLandRaw = z.infer<typeof nonBusinessLandRawSchema>;

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
  // 토지 소재지 시·군·구: NBL 전용값 우선, 미입력 시 양도 물건 소재지(acquisitionSigunguCode)로 fallback.
  // acquisitionSigunguCode는 10자리("XXXXX00000") → 5자리로 정규화(NBL sigungu-codes는 5자리계).
  const acqSigungu5 = (asset.acquisitionSigunguCode || "").slice(0, 5);
  return {
    ...nblFields,
    nblUrbanIncorporationDate: resolveNblUrbanIncorporationDate(asset),
    nblLandSigunguCode: asset.nblLandSigunguCode || acqSigungu5,
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

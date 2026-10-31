/**
 * 원조합원 재개발 자산의 「취득당시 토지 ㎡당 단가」 — 영 §164④ 브리지
 * (계획서 successor-right-carryover-contribution.plan.md §18 Q-1·Q-2 a).
 *
 * 그 칸(`redevLandPricePerSqmAtAcq`)은 두 조문이 분자로 쓴다 — 토지 출자 영 §166③(취득일 현재 법 §99①1호 기준시가)과
 * 주택 출자 영 §164⑦ 본문(취득시 토지 기준시가). 1990.8.30. 개별공시지가 고시 전에 취득한 토지는 그 값이 존재하지 않고,
 * 법 §99③2호가 위임한 영 §164④ 가액이 그 자리를 채운다. 일반건물·상가 브리지(`transfer-pre1990-gb-bridge.ts`)와 같은
 * 3단 구조(게이트 · 파생 · effective)다.
 *
 * - 기준일은 `redevPreApprovalAcquisitionDate`(이월과세면 당초 증여자 취득일) — ⑤ 조회 칸·§164⑦ 판정과 같은 날이다.
 * - 래치 `pre1990Enabled`를 요구하지 않는다 — 법이 정한 계산이라 켜고 끄는 선택이 아니다(`transfer-pre1990-housing-land-bridge.ts`와 같다).
 * - 입력은 기존 `pre1990*` 5필드, 면적은 ① 「토지 면적」(`redevLandArea`). 상속·증여받은 토지 출자는 §163⑨ ② 칸(#2782)과
 *   같은 필드라 한 번 입력으로 ②와 ③ 분자가 같은 값이 된다.
 *
 * ⚠️ 3중 패턴 — ⑤ 표시·④ 전송·⑧ 검증이 `effectiveRedevLandPricePerSqmAtAcq` 하나를 쓴다. 파생값은 store에 쓰지 않는다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import { toDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import { LAND_PRICE_NOTICE_START } from "./transfer-pre1990-commercial-bridge";
import { redevPreApprovalAcquisitionDate } from "./redev-carryover-acq-mode";
import { redevPreApprovalAcqMode } from "./redev-pre-approval-acq-mode";
import { isRedevPhdTriggered } from "./redev-phd-trigger";

/**
 * 영 §164④ 구간인가 — 원조합원(승계 제외) 재개발 자산 + ⑤ 환산 + 종전 토지 취득일 < 1990-08-30 + 그 칸을 분자로 쓰는 분기
 * (토지 출자 §166③ · 주택 출자 §164⑦ 본문 발동).
 */
export function redevLandSec164Applies(asset: AssetForm): boolean {
  if (asset.redevIsSuccessorMember === "yes") return false;
  const originalMember =
    asset.assetKind === "redevelopment_apt" ||
    (asset.assetKind === "right_to_move_in" && asset.isSuccessorRightToMoveIn !== true);
  if (!originalMember || redevPreApprovalAcqMode(asset) !== "estimated") return false;
  const acq = redevPreApprovalAcquisitionDate(asset);
  if (!acq || acq >= LAND_PRICE_NOTICE_START) return false;
  return asset.redevOriginalAssetType === "land" || isRedevPhdTriggered(asset);
}

/** 영 §164④ 환산 — 취득시 토지 ㎡당 가액(원, 정수). 구간이 아니거나 5필드·면적이 덜 차면 null. */
export function deriveRedevLandSec164PerSqm(asset: AssetForm): number | null {
  if (!redevLandSec164Applies(asset)) return null;
  const area = parseDecimal(asset.redevLandArea);
  if (!area || area <= 0) return null;

  const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(asset.pre1990Grade_current);
  const gPrev = buildGrade(asset.pre1990Grade_prev);
  const gAcq = buildGrade(asset.pre1990Grade_atAcq);
  const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
  if (!gCur || !gPrev || !gAcq || p1990 <= 0) return null;

  try {
    // 양도일은 환산에 쓰이지 않는다(`validateInput` 통과용) — 취득일을 더미로 둔다. CAP-2는 종전 토지 취득일 기준.
    const acq = toDate(redevPreApprovalAcquisitionDate(asset), "redevPreApprovalAcquisitionDate");
    return calculatePre1990LandValuation({
      acquisitionDate: acq,
      transferDate: acq,
      areaSqm: area,
      pricePerSqm_1990: p1990,
      pricePerSqm_atTransfer: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    }).pricePerSqmAtAcquisition;
  } catch {
    return null;
  }
}

/** ④ API·⑧ validate·⑤ UI 공용 — 취득당시 토지 ㎡당 단가의 최종 유효값. 직접 입력이 우선, 없으면 §164④ 파생값. */
export function effectiveRedevLandPricePerSqmAtAcq(asset: AssetForm): number {
  return parseAmount(asset.redevLandPricePerSqmAtAcq) || (deriveRedevLandSec164PerSqm(asset) ?? 0);
}

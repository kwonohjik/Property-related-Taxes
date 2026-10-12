/**
 * 「§89② 3년 초과 예외 선언 카드가 **화면에 있는가**」 — ⑤ 렌더 · ⑧ 검증 공용 술어.
 *
 * ## 왜 필요한가 — 카드는 스스로 사라지는데 ⑧은 선택을 무게이트로 검증했다 (2026-09-07)
 *
 * ⑤ `RightThreeYearExceptionSection`은 **두 조건**에서만 뜬다:
 *   1. 주 자산이 §154① 비과세 판정 대상(`isOneHouseExemptionAsset` — 주택·재개발APT).
 *      카드가 그 섹션(`Step4.tsx:523`) 안에 있다.
 *   2. 세대 보유 권리 중 **취득일부터 3년을 넘겨** 양도한 것이 하나라도 있다
 *      (엔진 술어 `isRightThreeYearExceeded` 공용).
 *
 * 반면 ⑧(`transfer-tax-validate.ts`)은 `rightThreeYearExceptionKind`만 보고 필수값을
 * 요구했다. 그래서 「신축주택이 완성된 뒤 양도했다」나 「경매·공매」를 고른 **뒤**
 *
 *   · 양도일을 3년 **이내**로 고치거나
 *   · 세대 보유 권리 행을 지우거나
 *   · 자산 종류를 주택 → 토지 등으로 바꾸면
 *
 * 카드는 사라진 채 `rightThreeYearExceptionKind`만 남아 「신축주택 완성일을 입력하세요」로
 * 계산이 **영구 차단**됐다 — 그 값을 채우거나 선택을 해제할 컨트롤이 화면 어디에도 없어
 * 세션 초기화 외에 탈출 수단이 없었다.
 *
 * ## ④는 건드리지 않았다 — 소비 조건이 이미 좁다
 *
 * ④ `buildRightThreeYearExceptionPayload`는 무게이트지만, 엔진은 이 선언을 **§89② 배제
 * 경로 안에서만** 읽는다(`transfer-tax-89-2-exclusion.ts:363`) — 권리가 없으면 그 경로에
 * 진입하지 않고, 3년 이내면 그 앞의 `withinDeadline`에서 이미 `exception_met`으로 빠진다.
 * 즉 카드가 사라지는 세 경로 모두 payload가 **소비되지 않는다**.
 */
import { isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { isRightThreeYearExceeded } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { presaleRightDefinitionAcquisitionDate } from "@/lib/tax-engine/presale-right-definition-date";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import { isOriginRedevRightCounted } from "@/lib/tax-engine/one-house/new-house-origin";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 3년을 넘겨 카드를 연 권리의 **종류**(조합원입주권 → §156의2④ · 분양권 → §156의3③) — 노출 술어와 같은 모집단이다.
 *
 * 인용은 이 종류로 고른다(엔진 `timingFrom`이 권리 종류로 `RIGHT_3YR_EXCEPTION_156_2_4`/`PRESALE_3YR_EXCEPTION_156_3_3`을 가르는 것과 같은 규칙, X2-2).
 * 입주권과 분양권이 함께 있으면 둘 다 담는다(입주권 → 분양권 순).
 *
 * ⚠️ 취득일이 빈 권리 행은 「입력 중」이라 판정 대상이 아니다(종전 ⑤ 동작 그대로).
 */
export function rightThreeYearExceptionRightKinds(form: TransferFormData): ("redevelopment_right" | "presale_right")[] {
  if (!isOneHouseExemptionAsset(form.assets?.[0]?.assetKind)) return [];
  if (!form.transferDate) return [];
  const transferDate = new Date(form.transferDate);
  const exceeded = (form.presaleRights ?? []).filter(
    (r) =>
      r.acquisitionDate &&
      // 기존주택 원조합원 입주권은 §156의2④·시행규칙 §75①의 대상이 아니다 — §155①로 판정한다.
      !(r.type === "redevelopment_right" && r.memberOrigin === "original_house") &&
      isRightThreeYearExceeded({
        // 동일세대 상속 분양권은 피상속인 취득일부터 센다 — 엔진 기한 판정과 같은 leaf(`resolveAcquiredRightTiming`).
        rightAcquisitionDate: presaleRightDefinitionAcquisitionDate({
          type: r.type,
          acquisitionDate: new Date(r.acquisitionDate),
          isInherited: r.isInherited,
          decedentSameHouseholdAtInheritance: r.decedentSameHouseholdAtInheritance,
          decedentAcquisitionDate: r.decedentAcquisitionDate ? new Date(r.decedentAcquisitionDate) : undefined,
        }),
        transferDate,
      }),
  );
  // 결정 #43 — 승계 입주권·상가토지 원조합원으로 취득해 완공된 **신규 주택 행**도 권리 취득일부터 3년을 넘기면 §156의2④ 선언 대상이다
  // (엔진 `judgeNewHouseOrigin`이 같은 선언을 읽는다). 2006.1.1. 전 인가·승계분은 §89② 대상이 아니라 제외한다(엔진과 같은 술어).
  const originRowExceeded = (form.houses ?? []).some((h) => {
    if (h.acquisitionOrigin !== "successor_right" && h.acquisitionOrigin !== "original_member_non_house") return false;
    if (!h.rightAcquisitionDate) return false;
    const acquired = new Date(h.rightAcquisitionDate);
    const approval = h.rightApprovalDate ? new Date(h.rightApprovalDate) : undefined;
    return isOriginRedevRightCounted(h.acquisitionOrigin, acquired, approval) && isRightThreeYearExceeded({ rightAcquisitionDate: acquired, transferDate });
  });
  const kinds: ("redevelopment_right" | "presale_right")[] = [];
  if (originRowExceeded || exceeded.some((r) => r.type === "redevelopment_right")) kinds.push("redevelopment_right");
  if (exceeded.some((r) => r.type === "presale_right")) kinds.push("presale_right");
  return kinds;
}

/**
 * ⑤ §89② 3년 초과 예외 카드의 노출 조건.
 *
 * ⚠️ 취득일이 빈 권리 행은 「입력 중」이라 판정 대상이 아니다(종전 ⑤ 동작 그대로).
 */
export function rightThreeYearExceptionVisible(form: TransferFormData): boolean {
  return rightThreeYearExceptionRightKinds(form).length > 0;
}

/** 카드 법령 모달용 — 권리 종류별 3년 초과 예외 조문(엔진 상수 그대로)과 그 약식 표기(`§156의2④`). */
export function rightThreeYearExceptionCitations(
  kinds: readonly ("redevelopment_right" | "presale_right")[],
): { legalBasis: string; short: string }[] {
  return kinds.map((k) => {
    const legalBasis = k === "presale_right" ? TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3 : TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4;
    // 「소득세법 시행령 §156의2 ④」 → 「§156의2④」 — 표기를 따로 적지 않고 상수에서 뽑는다.
    return { legalBasis, short: legalBasis.replace("소득세법 시행령 ", "").replace(/\s/g, "") };
  });
}

/**
 * 인용 문구 — 호·후단 접미사(`1호·2호 후단`)가 있으면 항마다 붙인다. 단일 종류면 종전 문구(`§156의2④1호·2호 후단`)와 같고,
 * 둘이 섞이면 `§156의2④·§156의3③의 1호·2호 후단`으로 적는다.
 */
export function rightThreeYearExceptionCiteText(
  kinds: readonly ("redevelopment_right" | "presale_right")[],
  suffix = "",
): string {
  const shorts = rightThreeYearExceptionCitations(kinds).map((c) => c.short);
  if (shorts.length <= 1 || !suffix) return `${shorts.join("·")}${suffix}`;
  return `${shorts.join("·")}의 ${suffix}`;
}

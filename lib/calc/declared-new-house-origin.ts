/**
 * §155① 신규 주택 **취득 경위** — 보유 주택 목록(명부 행)이 없는 두 경로의 답 (결정 #43-3 · #43-4).
 *
 * 명부 행은 행마다 경위(`HouseEntry.acquisitionOrigin`)를 받는다. 신규 주택을 **직접 선언**하는 경로는 행이 없다 —
 *   · 양도세 계산기·판정 메뉴: 폼 전역 `temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`(`resolveTemporaryTwoHouse`의 폴백)
 *   · 증여세 부담부증여 화면: `BurdenedGiftTransferTaxInput.temporaryTwoHouse`(신규 주택 취득일 한 칸)
 * 이 두 경로가 같은 세 필드(`newHouseOriginKind`·`newHouseRightAcquisitionDate`·`newHouseRightApprovalDate`)를 받고,
 * 엔진에는 명부 경로와 **같은 모양**(`temporaryTwoHouse.newHouseOrigin`)으로 싣는다 — 판정은 같은 정본(`judgeNewHouseOrigin`)이 한다.
 *
 * 🔑 **미답은 막지 않는다.** 답이 없으면(`kind` 빈 값) 종전과 같이 `not_collected`(취득일 그대로 판정 + 확인 필요)다 — 명부 행의
 *    「미답 = 모름(불성립)」과 다르다. 직접 선언 경로는 종전에 이 질문이 없었으므로, 답하지 않은 세대의 세액을 바꾸지 않는다.
 *    「모름」을 골랐다면 그것은 답이다(명부 행과 같이 불성립 + 확인 필요).
 * 🔑 ⑤ 표시(`DeclaredNewHouseOriginBlock`)·④ 변환·⑧ 검증이 이 파일의 같은 술어를 쓴다(3중 패턴).
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { effectiveNewHouseAcquisitionDate } from "./household-house-count";
import { newHouseOriginIssue } from "./new-house-origin-scope";

type OriginKind = NonNullable<HouseEntry["acquisitionOrigin"]>;

/** 양도세 폼(`TransferFormData`)과 증여세 부담부증여 `temporaryTwoHouse`가 **같은 이름·모양**으로 갖는 세 필드. 미답은 빈 값. */
export interface DeclaredNewHouseOriginFields {
  /** 신규 주택 취득 경위 — ""(미답) | `HouseEntry.acquisitionOrigin`과 같은 집합 */
  newHouseOriginKind?: "" | OriginKind;
  /** 권리 취득일(`YYYY-MM-DD`) — 의미는 경위마다 다르다(`HouseEntry.rightAcquisitionDate`와 같다) */
  newHouseRightAcquisitionDate?: string;
  /** 승계 입주권 관리처분계획 인가일(`YYYY-MM-DD`) — 선택 */
  newHouseRightApprovalDate?: string;
}

/** 엔진 `temporaryTwoHouse.newHouseOrigin`(문자열 날짜) — 명부 경로의 `TemporaryTwoHouseDates.newHouseOrigin`과 같은 모양. */
export interface DeclaredNewHouseOrigin {
  kind: OriginKind | "not_collected";
  rightAcquisitionDate?: string;
  rightApprovalDate?: string;
}

/** 답이 있는가 — ⑤⑧의 「묻는 중」 판단과 ④의 `not_collected` 분기가 같은 술어를 쓴다. */
export function declaredNewHouseOriginAnswered(f: DeclaredNewHouseOriginFields): f is DeclaredNewHouseOriginFields & { newHouseOriginKind: OriginKind } {
  return !!f.newHouseOriginKind;
}

/** ④ — 엔진에 싣는 `newHouseOrigin`. 미답 = `not_collected`. */
export function declaredNewHouseOriginOf(f: DeclaredNewHouseOriginFields): DeclaredNewHouseOrigin {
  if (!declaredNewHouseOriginAnswered(f)) return { kind: "not_collected" };
  return {
    kind: f.newHouseOriginKind,
    ...(f.newHouseRightAcquisitionDate ? { rightAcquisitionDate: f.newHouseRightAcquisitionDate } : {}),
    ...(f.newHouseRightApprovalDate ? { rightApprovalDate: f.newHouseRightApprovalDate } : {}),
  };
}

/**
 * 신규 주택의 **유효 취득일** — 기존주택의 연장인 경위(원조합원 기존주택·자가 재건축)는 선후를 완공일이 아니라 기존(헐기 전)
 * 주택 취득일로 본다. 명부 경로(`resolveTemporaryTwoHouse`)와 같은 술어(`effectiveNewHouseAcquisitionDate`)다.
 */
export function declaredNewHouseEffectiveAcquisitionDate(
  newAcquisitionDate: string,
  f: DeclaredNewHouseOriginFields,
): string {
  if (!declaredNewHouseOriginAnswered(f)) return newAcquisitionDate;
  return (
    effectiveNewHouseAcquisitionDate({
      acquisitionDate: newAcquisitionDate,
      acquisitionOrigin: f.newHouseOriginKind,
      rightAcquisitionDate: f.newHouseRightAcquisitionDate,
    }) ?? newAcquisitionDate
  );
}

/**
 * ⑧ — 답이 앞뒤가 맞지 않는다(권리 취득일 누락·완공일보다 늦음·인가일이 승계취득일보다 늦음). 미답은 막지 않는다.
 * 규칙은 명부 행(`newHouseOriginIssue`)과 **같은 함수**다 — 신규 주택 취득일(완공·잔금일)이 행의 취득일 자리에 선다.
 */
export function declaredNewHouseOriginIssue(
  f: DeclaredNewHouseOriginFields,
  newAcquisitionDate: string | undefined,
): { field: "newHouseOriginKind"; message: string } | null {
  if (!declaredNewHouseOriginAnswered(f)) return null;
  const issue = newHouseOriginIssue(
    {
      id: "declared",
      acquisitionDate: newAcquisitionDate,
      acquisitionOrigin: f.newHouseOriginKind,
      rightAcquisitionDate: f.newHouseRightAcquisitionDate,
      rightApprovalDate: f.newHouseRightApprovalDate,
    } as Parameters<typeof newHouseOriginIssue>[0],
    "declared",
  );
  return issue ? { field: "newHouseOriginKind", message: issue.message } : null;
}

/**
 * 공용 블록(`HouseEntryNewHouseOriginBlock`)의 명부 행 patch → 세 필드 patch.
 * 블록은 경위를 바꿀 때 권리 취득일·인가일을 `undefined`로 함께 비운다 — 키가 있으면 빈 값으로 옮긴다(useEffect 미러링 아님).
 */
export function declaredNewHouseOriginPatch(
  p: Partial<Pick<HouseEntry, "acquisitionOrigin" | "rightAcquisitionDate" | "rightApprovalDate">>,
): Partial<Required<DeclaredNewHouseOriginFields>> {
  return {
    ...("acquisitionOrigin" in p ? { newHouseOriginKind: p.acquisitionOrigin ?? "" } : {}),
    ...("rightAcquisitionDate" in p ? { newHouseRightAcquisitionDate: p.rightAcquisitionDate ?? "" } : {}),
    ...("rightApprovalDate" in p ? { newHouseRightApprovalDate: p.rightApprovalDate ?? "" } : {}),
  };
}

/**
 * Q-8 — 다주택 중과 장기임대주택(소득세법 시행령 §167의3①2호) 임대사업 승계: 명부 행·양도 주택 2호 선언 공용 leaf.
 * ⑤ 노출(`HouseRentalSuccessionFields`) · ④ 전송(`rentalPeriodDatesPayload`) · ⑧ 검증(`rentalPeriodDatesIssue`)이 같은 술어를 쓴다(3중 패턴).
 *
 * - 종류 읽기는 ⑳ 카드와 같은 `rentalSuccessionOf`(옛 `isInheritedRental` = 상속).
 * - 개월 칸은 `decedentRentalMonths`를 세 종류가 공유한다(의미 = 전 임대사업자 임대개월).
 * - 동일세대원 증여는 증여자 등록일이 필수다(자동 대체 금지 — ⑳ `rentalUnitRegistrationBasis`와 같은 규칙).
 *   상속은 피상속인 등록일이 선택이다 — 비우면 엔진이 상속인 등록일로 판정하고(칸 신설 전과 같은 결과) 확인 필요를 알린다.
 */
import { rentalSuccessionOf } from "@/lib/stores/calc-wizard-asset-rental-period";
import type { RentalSuccessionForm } from "@/lib/stores/calc-wizard-asset-rental-period";

export interface HouseRentalSuccessionFacts {
  rentalSuccession?: RentalSuccessionForm;
  isInheritedRental?: boolean;
  decedentRentalMonths?: string;
  predecessorBusinessRegistrationDate?: string;
  predecessorRentalRegistrationDate?: string;
  predecessorRentalRegisteredDate?: string;
}

/** 피상속인·증여자 등록 칸 범위 — 상속·동일세대원 증여 */
export function housePredecessorRegistrationInScope(f: HouseRentalSuccessionFacts | undefined): boolean {
  const k = f ? rentalSuccessionOf(f) : "";
  return k === "inheritance" || k === "household_gift";
}

/** 칸 이름의 주어 — 피상속인·증여자·전 임대사업자 */
export const PREDECESSOR_WHO = {
  inheritance: "피상속인",
  household_gift: "증여자",
  assumption: "전 임대사업자",
} as const;

/**
 * ⑤ 승계 종류 변경 patch — 한 번의 갱신으로 종류·옛 상속 플래그를 정리하고, 종류가 바뀌면 개월·전 임대사업자 날짜를 비운다
 * (뜻이 종류마다 다르다 · useEffect 미러링 금지). 같은 종류를 다시 고르면 입력을 지우지 않는다.
 */
export function houseRentalSuccessionPatch(f: HouseRentalSuccessionFacts, kind: RentalSuccessionForm): HouseRentalSuccessionFacts {
  if (rentalSuccessionOf(f) === kind) return { rentalSuccession: kind || undefined, isInheritedRental: undefined };
  return {
    rentalSuccession: kind || undefined,
    isInheritedRental: undefined,
    decedentRentalMonths: undefined,
    predecessorBusinessRegistrationDate: undefined,
    predecessorRentalRegistrationDate: undefined,
    predecessorRentalRegisteredDate: undefined,
  };
}

/** ④ `houseSchema` 필드 — 종류·전 임대사업자 개월·(상속·증여이고 두 날짜가 있을 때) 전 임대사업자 등록 */
export function houseRentalSuccessionPayload(f: HouseRentalSuccessionFacts): object {
  const kind = rentalSuccessionOf(f);
  if (!kind) return {};
  const months = parseFloat(f.decedentRentalMonths ?? "");
  const biz = f.predecessorBusinessRegistrationDate;
  const app = f.predecessorRentalRegistrationDate;
  return {
    rentalSuccession: kind,
    decedentRentalMonths: months > 0 ? months : undefined,
    ...(housePredecessorRegistrationInScope(f) && biz && app
      ? {
          predecessorRegistration: {
            businessRegistrationDate: biz,
            rentalRegistrationDate: app,
            rentalRegisteredDate: f.predecessorRentalRegisteredDate || undefined,
          },
        }
      : {}),
  };
}

/** ⑧ 승계 입력 문제 — 개월 필수 · 증여는 증여자 날짜 필수 · 상속은 날짜를 넣기 시작했으면 둘 다 */
export function houseRentalSuccessionIssue(f: HouseRentalSuccessionFacts): string | null {
  const kind = rentalSuccessionOf(f);
  if (!kind) return null;
  const who = PREDECESSOR_WHO[kind];
  if (!(parseFloat(f.decedentRentalMonths ?? "") > 0))
    return kind === "inheritance"
      ? "상속받아 계속 임대하는 주택이면 피상속인 임대기간(개월)을 입력하세요."
      : `${who} 임대기간(개월)을 입력하세요.`;
  if (!housePredecessorRegistrationInScope(f)) return null;
  const biz = f.predecessorBusinessRegistrationDate;
  const app = f.predecessorRentalRegistrationDate;
  const reg = f.predecessorRentalRegisteredDate;
  if (kind === "household_gift" || biz || app || reg) {
    if (!biz) return `${who} 사업자 등록일을 입력하세요.`;
    if (!app) return `${who} 임대사업자 등록 신청일을 입력하세요.`;
  }
  if (reg && app && reg < app) return `${who} 임대사업자 등록일은 등록 신청일(${app}) 이후여야 합니다.`;
  return null;
}

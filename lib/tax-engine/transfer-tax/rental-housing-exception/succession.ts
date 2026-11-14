/**
 * §155⑳ 임대사업 승계(G-3·G-5) — 결과 echo · 확인 필요 고지 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` PR-2).
 * 개월 합산은 호출부(④)가 `rentalMonths`에 이미 반영한다 — 이 파일은 사실을 되비추고 근거 한계를 알릴 뿐 세액·판정에 관여하지 않는다.
 */

import type { RentalUnitInput, RentalUnitVerdict } from "./types";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** `RentalUnitVerdict.succession` — 승계 입력이 없으면 undefined(키 자체를 싣지 않는다). */
export function successionEcho(u: RentalUnitInput): RentalUnitVerdict["succession"] {
  if (!u.succession) return undefined;
  const { kind, predecessorMonths } = u.succession;
  const donor = u.donorRegistration;
  if (!donor) return { kind, predecessorMonths };
  return {
    kind,
    predecessorMonths,
    donorBusinessRegistrationDate: ymd(donor.businessRegistrationDate),
    donorRentalRegistrationDate: ymd(donor.rentalRegistrationDate),
    ...(donor.rentalRegisteredDate ? { donorRentalRegisteredDate: ymd(donor.rentalRegisteredDate) } : {}),
  };
}

/**
 * 승계 근거의 한계 고지 — 상속은 조특령 §97⑤3호 준용으로 낼 말이 없고, 증여·포괄양수만 낸다.
 * - 증여: 목 유지는 재산세제과-1591이 정면, 기준시가 상한·임대개시일을 증여자 기준으로 보는 직접 근거는 없다(V-4).
 * - 포괄양수: 5310은 ㉓1호 1/2 기산일만 정면이라 목 판정은 양수인 본인 등록으로 했다(Q-5 · V-5).
 */
export function successionNotice(i: number, u: RentalUnitInput): string | undefined {
  if (!u.succession) return undefined;
  const n = i + 1;
  const m = u.succession.predecessorMonths;
  if (u.succession.kind === "household_gift" && u.donorRegistration) {
    return (
      `${n}호: 같은 세대원에게서 증여받아 계속 임대하는 주택(포괄승계)이라 목·의무기간·등록 기한은 증여자의 등록일 기준으로 판정하고 ` +
      `임대기간은 증여자 임대개월 ${m}개월을 합산했습니다(사전-2022-법규재산-0744[기획재정부 재산세제과-1591, 2022.12.27.] · 서면-2022-법규재산-4972). ` +
      "임대개시일 기준시가 상한도 같은 목으로 보았으나 증여자 기준으로 보는 직접 해석은 확인하지 못했습니다(확인 필요). " +
      "양도일 현재 사업자등록·임대 등록(소령 §155⑳2호)은 수증자 본인 기준입니다."
    );
  }
  if (u.succession.kind === "assumption") {
    return (
      `${n}호: 포괄양수(임대사업자 지위 승계)라 임대기간에 전 임대사업자 임대개월 ${m}개월을 합산했습니다. ` +
      "목·의무기간·기준시가 상한은 양수인 본인의 등록일로 판정했습니다 — 포괄양수 뒤 목 판정 근거(전 임대사업자 등록 기준으로 볼 수 있는지)는 " +
      "확인하지 못했습니다(확인 필요). 소령 §155㉓1호 1/2의 기산일이 전 임대사업자 등록일부터라는 점만 서면-2020-법규재산-5310[법규과-2305, 2022.8.10.]에 있습니다."
    );
  }
  return undefined;
}

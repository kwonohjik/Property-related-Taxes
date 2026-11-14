/**
 * §155⑳ 임대사업 승계 echo (G-3·G-5 · Q-6) — 계산기 결과 카드·판정 메뉴 결과 카드 공용. 금액 아님.
 *
 * 엔진 echo(`RentalUnitVerdict.succession` / `OneHouseRentalHousingVerdict.unitSuccessions`)를 호별 한 줄로 풀어 쓴다 —
 * 여기서 다시 계산하지 않는다. 호는 0-based `unitIndex`로 받아 「N호」로 표기한다.
 */
import type { RentalUnitVerdict } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

export type RentalSuccessionEchoItem = NonNullable<RentalUnitVerdict["succession"]> & { unitIndex: number };

/** 호별 한 줄 — 어느 승계였는지 · 더한 전 임대사업자 개월 · 증여면 목 판정에 쓴 증여자 등록 날짜 */
export function rentalSuccessionEchoText(s: RentalSuccessionEchoItem): string {
  const head = `${s.unitIndex + 1}호: `;
  if (s.kind === "inheritance") return `${head}상속받아 계속 임대 — 피상속인 임대기간 ${s.predecessorMonths}개월을 더했습니다`;
  if (s.kind === "assumption") {
    return `${head}그 밖의 포괄양수 — 전 임대사업자 임대기간 ${s.predecessorMonths}개월을 더했고, 목은 본인 등록일 기준으로 판정했습니다`;
  }
  if (!s.donorRentalRegistrationDate) return `${head}같은 세대원에게 증여받아 계속 임대 — 증여자 임대기간 ${s.predecessorMonths}개월을 더했습니다`;
  const registered = s.donorRentalRegisteredDate ? ` · 지자체 등록일 ${s.donorRentalRegisteredDate}` : "";
  const detail = `증여자 세무서 사업자등록일 ${s.donorBusinessRegistrationDate ?? "-"}${registered}`;
  return (
    `${head}같은 세대원에게 증여받아 계속 임대 — 증여자 임대기간 ${s.predecessorMonths}개월을 더했고, ` +
    `목은 증여자 지자체 등록 신청일 ${s.donorRentalRegistrationDate} 기준으로 판정했습니다(${detail})`
  );
}

export function RentalSuccessionEchoNote({ items }: { items: RentalSuccessionEchoItem[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <ul data-testid="rental-succession-echo" className="space-y-0.5 text-xs">
      {items.map((s) => (
        <li key={s.unitIndex} data-testid={`rental-succession-echo-${s.unitIndex}`}>
          {rentalSuccessionEchoText(s)}
        </li>
      ))}
    </ul>
  );
}

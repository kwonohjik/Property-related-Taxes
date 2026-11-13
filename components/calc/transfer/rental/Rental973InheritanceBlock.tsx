"use client";

/**
 * §97의3 상속받은 임대주택 — 피상속인 임대기간 합산 (조특령 §97의3④ → §97⑤3호 · V-14)
 *
 * 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md §3.2 (Q-0~Q-6 권장안).
 * - 상속 자산에서만 보인다(호출부가 `rental973InheritanceInScope`로 가른다 — ④⑧과 같은 leaf).
 * - 상속개시일은 칸을 두지 않는다 — 자산 카드 취득일(「상속개시일」)을 쓴다.
 * - §97의5 블록(`Rental975InheritanceBlock`)은 필드명·문구(10년 「계속」·3개월 등록·6개월 단절)가 §97의5 전용이라 공유하지 않는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";

interface Props {
  reductionType: string;
  checked: boolean;
  decedentRegistrationDate: string;
  decedentRentalStartDate: string;
  /** 자산 카드 취득일(= 상속개시일) — 안내 문구용 */
  inheritanceDate?: string;
  /** Q-2 — 2020.7.10 이전 단기→장기 변경신고를 고른 상태(함께 켜면 ⑧이 막는다) */
  conflictsConversion: boolean;
  onChange: (patch: { isInherited973?: boolean; decedentRegistrationDate973?: string; decedentRentalStartDate973?: string }) => void;
}

export function Rental973InheritanceBlock({
  reductionType,
  checked,
  decedentRegistrationDate,
  decedentRentalStartDate,
  inheritanceDate,
  conflictsConversion,
  onChange,
}: Props) {
  return (
    <ToggleCard
      data-field={`reduction.${reductionType}.isInherited973`}
      checked={checked}
      onCheckedChange={(v) =>
        onChange(v ? { isInherited973: true } : { isInherited973: false, decedentRegistrationDate973: "", decedentRentalStartDate973: "" })
      }
      title="상속받은 임대주택 — 피상속인 임대기간 합산"
      description="피상속인이 장기일반·공공지원 민간임대주택으로 임대하던 기간을 상속인의 임대기간(8년·10년)에 통산합니다 (조특령 §97의3④ → §97⑤3호 준용)"
      tone="violet"
    >
      <div className="space-y-2">
        {conflictsConversion && (
          <ToneCard tone="rose">
            <p className="text-xs">
              위에서 「2020.7.10 이전 변경신고」를 골랐습니다. 피상속인 임대기간 합산과 단기 임대기간 산입은 함께 계산하지 않습니다 —
              누구의 단기 임대기간을 어느 날부터 산입할지 정한 규정·해석이 없습니다. 둘 중 하나를 끄세요.
            </p>
          </ToneCard>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium">피상속인 장기일반·공공지원 등록등일</label>
          <DateInput
            data-field={`reduction.${reductionType}.decedentRegistrationDate973`}
            value={decedentRegistrationDate}
            onChange={(v) => onChange({ decedentRegistrationDate973: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            피상속인이 장기일반·공공지원(구 준공공) 민간임대주택으로 등록한 날과 세무서 사업자등록일 중 늦은 날입니다.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">피상속인 임대개시일</label>
          <DateInput
            data-field={`reduction.${reductionType}.decedentRentalStartDate973`}
            value={decedentRentalStartDate}
            onChange={(v) => onChange({ decedentRentalStartDate973: v })}
          />
        </div>
        <p className="text-micro text-muted-foreground">
          피상속인 기간은 상속개시일{inheritanceDate ? `(${inheritanceDate})` : ""}까지 셉니다. 아래 등록일·임대개시일에는 <b>상속인 본인</b>의
          날짜를 넣으세요. 두 기간을 통산하며, 공실 3개월 초과 구간과 상속개시일부터 상속인이 임대를 시작하기 전까지는 세지 않습니다.
          등록 시한·8년 50% 경과규정(2022.12.31 이전 등록)은 상속인의 등록일로 판정합니다.
          §97의3에 피상속인 기간 합산을 적용한 해석례는 찾지 못해 확인이 필요합니다.
        </p>
      </div>
    </ToggleCard>
  );
}

"use client";

/**
 * §97의5 상속받은 임대주택 — 피상속인 임대기간 합산 (조특령 §97의5③ → §97⑤3호 · V-13)
 *
 * 계획서 docs/01-plan/features/rental-97-5-inheritance-merge.plan.md §3.2 (사용자 결정 2026-11-13 Q-A~Q-G).
 * - 상속 자산에서만 보인다(호출부가 `rental975InheritanceInScope`로 가른다 — ④⑧과 같은 leaf).
 * - 상속개시일은 칸을 두지 않는다 — 자산 카드 취득일(「상속개시일」)을 쓴다(Q-F).
 * - §97의4 블록(`Rental974InputForm`)은 §97의4 전용 의미(소령 §167의3 일몰 기준일)에 묶여 있어 공유하지 않는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

interface Props {
  reductionType: string;
  checked: boolean;
  decedentRegistrationDate: string;
  decedentRentalStartDate: string;
  /** 자산 카드 취득일(= 상속개시일) — 안내 문구용 */
  inheritanceDate?: string;
  onChange: (patch: { isInherited975?: boolean; decedentRegistrationDate975?: string; decedentRentalStartDate975?: string }) => void;
}

export function Rental975InheritanceBlock({ reductionType, checked, decedentRegistrationDate, decedentRentalStartDate, inheritanceDate, onChange }: Props) {
  return (
    <ToggleCard
      data-field={`reduction.${reductionType}.isInherited975`}
      checked={checked}
      onCheckedChange={(v) =>
        onChange(v ? { isInherited975: true } : { isInherited975: false, decedentRegistrationDate975: "", decedentRentalStartDate975: "" })
      }
      title="상속받은 임대주택 — 피상속인 임대기간 합산"
      description="피상속인이 장기일반·공공지원 민간임대주택으로 임대하던 기간을 상속인의 10년 계속 임대에 합산합니다 (조특령 §97의5③ → §97⑤3호 준용)"
      tone="violet"
    >
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium">피상속인 장기일반·공공지원 등록등일</label>
          <DateInput
            data-field={`reduction.${reductionType}.decedentRegistrationDate975`}
            value={decedentRegistrationDate}
            onChange={(v) => onChange({ decedentRegistrationDate975: v })}
          />
          <p className="mt-1 text-micro text-muted-foreground">
            피상속인이 장기일반·공공지원(구 준공공) 민간임대주택으로 등록한 날과 세무서 사업자등록일 중 늦은 날입니다.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">피상속인 임대개시일</label>
          <DateInput
            data-field={`reduction.${reductionType}.decedentRentalStartDate975`}
            value={decedentRentalStartDate}
            onChange={(v) => onChange({ decedentRentalStartDate975: v })}
          />
        </div>
        <p className="text-micro text-muted-foreground">
          피상속인 기간은 상속개시일{inheritanceDate ? `(${inheritanceDate})` : ""}까지 셉니다. 아래 등록일·임대개시일에는 <b>상속인 본인</b>의
          날짜를 넣으세요 — 상속개시일부터 3개월 안에 등록해야 하고, 상속개시일부터 상속인이 임대를 시작하기까지 6개월이 넘으면 계속 임대가 끊깁니다.
          §97의5에 피상속인 기간 합산을 적용한 해석례는 찾지 못해 확인이 필요합니다.
        </p>
      </div>
    </ToggleCard>
  );
}

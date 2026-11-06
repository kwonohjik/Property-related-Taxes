"use client";

/**
 * §99·§99의3 **재개발 완공 아파트 조합원 갈래** 입력 — 두 감면 폼 공용 (NH-36 · NH-16 ③2호 · NH-27).
 *
 * 조합원이 받은 신축주택은 「자기가 건설한 주택(조합원 취득 포함)」 갈래라 취득 유형·매매계약일 대신 준공일로 판정한다.
 * 준공일이 신축주택취득기간 뒤면 조합의 잔여주택 계약 사실(예·아니오·모름)을 묻는다 — 「모름」은 적용하지 않고 확인 필요로 표시.
 * 판정 술어는 엔진·④·⑧과 같은 `redevMemberNeedsRemainderAnswerIso`다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { redevMemberNeedsRemainderAnswerIso } from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";
import { NEW_HOUSING_ACQUISITION_ARTICLE as ART } from "@/lib/tax-engine/legal-codes/transfer-house";
import type { RedevMemberFormScope } from "@/lib/calc/redev-field-scope";

type Tri = "yes" | "no" | "unknown";

export function RedevMemberNewHouseFields({
  article,
  member,
  remainderContract,
  onRemainderContractChange,
  isNationalHousing,
}: {
  article: "new_99" | "new_99_3";
  member: RedevMemberFormScope;
  remainderContract: "" | Tri;
  onRemainderContractChange: (v: Tri) => void;
  isNationalHousing?: boolean;
}) {
  const is993 = article === "new_99_3";
  const periodLabel = is993 ? "2001.5.23.~2003.6.30." : isNationalHousing ? "1998.5.22.~1999.12.31.(국민주택)" : "1998.5.22.~1999.6.30.";
  const needsRemainder = redevMemberNeedsRemainderAnswerIso(article, member.completionDate || undefined, isNationalHousing);
  const prefix = is993 ? "new993" : "new99";
  return (
    <div className="space-y-2 sm:col-span-2" data-testid={`${prefix}-redev-member`}>
      <p className="text-xs font-medium">취득 유형 — 조합원 취득 주택</p>
      <p className="text-caption text-muted-foreground leading-relaxed">
        재개발·재건축 조합원이 받은 신축주택은 「자기가 건설한 주택(조합원이 취득하는 주택 포함)」 갈래라 매매계약일·취득 유형 대신{" "}
        <strong>준공일{member.completionDate ? ` ${member.completionDate}` : "(아직 입력하지 않음)"}</strong>로 신축주택취득기간({periodLabel})과 「취득일부터
        5년」을 판정합니다 ({is993 ? ART.NEW_99_3_SELF_BUILT : ART.NEW_99_SELF_BUILT} · 서면인터넷방문상담4팀-2145).
        {member.houseContributed
          ? " 주택을 출자한 조합원이라 안분 분모는 종전주택 취득 당시 기준시가입니다."
          : ""}
      </p>
      {needsRemainder && (
        <div className="space-y-1.5" data-field={is993 ? "reduction.new_99_3.remainderContract993" : "reduction.new_99.remainderContract99"}>
          <p className="text-xs font-medium">
            준공일이 신축주택취득기간 뒤입니다. 조합이 그 기간 안에 조합원 외의 사람과 남은 주택(잔여주택) 매매계약을 직접 체결하고 계약금을 받았나요?
          </p>
          <RadioCardGroup
            name={`${prefix}-remainder-contract`}
            tone="amber"
            layout="stack"
            value={remainderContract}
            onChange={onRemainderContractChange}
            data-testid={`${prefix}-remainder-contract`}
            options={[
              { value: "yes" as const, label: "예", description: "기간 안에 잔여주택 매매계약을 직접 체결하고 계약금을 받았다", testId: `${prefix}-remainder-contract-yes` },
              { value: "no" as const, label: "아니오", description: "그런 계약이 없다 — 적용되지 않습니다", testId: `${prefix}-remainder-contract-no` },
              { value: "unknown" as const, label: "모름", description: "적용하지 않고 결과에 확인 필요로 표시합니다", testId: `${prefix}-remainder-contract-unknown` },
            ]}
          />
          <p className="text-micro text-muted-foreground">
            신축주택취득기간 경과 후 사용승인·사용검사를 받은 조합원 주택은 이 사실이 있을 때만 대상입니다 ({is993 ? ART.NEW_99_3_MEMBER_REMAINDER : ART.NEW_99_MEMBER_REMAINDER} 단서)
          </p>
        </div>
      )}
    </div>
  );
}

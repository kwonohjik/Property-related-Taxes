"use client";

/**
 * §154① 단서 삭제 전 4호(임대사업자 등록 주택) — 경과조치 판정 사실 입력 (OH-38).
 *
 * `ExemptionProvisoSection`에서 사유 「4호 임대사업자 등록」을 골랐을 때만 그린다.
 * 칸별 노출은 `rental4hoFieldScope` 하나로 정한다 — ④(본문 조립)·⑧(필수 검증)이 같은 술어를 쓴다.
 *
 * 🔑 예/아니오는 3-state 라디오다(미선택 = 미입력). 토글(기본 OFF)로 받으면 「손대지 않음」이
 *    「임대의무기간 준수·5% 이내」로 읽혀 면제가 조용히 적용된다.
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { rental4hoFieldScope, type Rental4hoFormSlice } from "@/lib/calc/rental-4ho-proviso";

type Fields = Omit<Rental4hoFormSlice, "transferDate">;
type Status = Exclude<Fields["proviso4hoStatus"], "">;
type YesNo = "yes" | "no";

interface Props {
  value: Partial<Rental4hoFormSlice>;
  onChange: (patch: Partial<Fields>) => void;
}

const STATUS_OPTIONS: RadioCardOption<Status>[] = [
  {
    value: "maintained",
    label: "등록 유지",
    description: "임대의무기간 중 양도·임대료 연 5% 초과 증액이면 적용되지 않습니다",
    testId: "proviso-4ho-status-maintained",
  },
  {
    value: "auto_cancelled",
    label: "자동말소 (민간임대주택법 §6⑤)",
    description: "임대의무기간 종료로 말소 — 임대의무기간·5% 요건을 따지지 않습니다",
    testId: "proviso-4ho-status-auto_cancelled",
  },
  {
    value: "voluntary_cancelled",
    label: "자진말소 (민간임대주택법 §6①11호)",
    description: "임대의무기간 내 말소 신청 — 임대의무기간·5% 요건을 따지지 않습니다",
    testId: "proviso-4ho-status-voluntary_cancelled",
  },
  {
    value: "demolition_cancelled",
    label: "재개발·재건축 멸실로 말소",
    description: "철거 후 등록 말소 — 임대의무기간·5% 요건을 따지지 않습니다",
    testId: "proviso-4ho-status-demolition_cancelled",
  },
  {
    value: "other",
    label: "그 밖의 사유로 말소",
    description: "직접 선례가 없어 판정하지 않고 판정 보류로 안내합니다",
    testId: "proviso-4ho-status-other",
  },
];

const yesNoOptions = (prefix: string, yes: string, no: string): RadioCardOption<YesNo>[] => [
  { value: "yes", label: yes, testId: `${prefix}-yes` },
  { value: "no", label: no, testId: `${prefix}-no` },
];

export function Rental4hoProvisoFields({ value, onChange }: Props) {
  const scope = rental4hoFieldScope({
    transferDate: value.transferDate ?? "",
    proviso4hoStatus: value.proviso4hoStatus ?? "",
    proviso4hoRentOver5: value.proviso4hoRentOver5 ?? "",
  });
  return (
    <div className="space-y-2" data-testid="proviso-4ho-fields">
      <p className="text-caption text-violet-700">
        2020년 2월 11일 이후 양도는 2019년 12월 16일 이전에 두 등록을 모두 신청한 경우에만 적용됩니다
        (대통령령 제30395호 부칙 제38조). 거주요건만 면제되고 보유 2년은 필요합니다.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FieldCard label="사업자등록 신청일" required hint="세무서 — 소득세법 §168①">
          <DateInput
            value={value.proviso4hoBusinessRegDate ?? ""}
            onChange={(v) => onChange({ proviso4hoBusinessRegDate: v })}
          />
        </FieldCard>
        <FieldCard
          label="임대사업자 등록 신청일"
          required
          hint="시·군·구 — 민간임대주택법 §5①. 분양권 상태에서 신청한 경우도 포함됩니다. 지위를 포괄승계했다면 최초 신청일"
        >
          <DateInput
            value={value.proviso4hoRentalRegDate ?? ""}
            onChange={(v) => onChange({ proviso4hoRentalRegDate: v })}
          />
        </FieldCard>
      </div>

      {scope.regulatedOneHouse && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            신청 당시 세대가 조정대상지역에 이 주택(분양권 상태였다면 그 분양권) 1채만 보유했나요?
          </label>
          <RadioCardGroup<YesNo>
            name="proviso4hoRegulatedOneHouse"
            layout="inline"
            value={value.proviso4hoRegulatedOneHouse ?? ""}
            onChange={(v) => onChange({ proviso4hoRegulatedOneHouse: v })}
            options={yesNoOptions("proviso-4ho-regulated-one-house", "예", "아니오")}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">양도일 현재 임대사업자 등록 상태</label>
        <RadioCardGroup<Status>
          name="proviso4hoStatus"
          tone="violet"
          value={value.proviso4hoStatus ?? ""}
          onChange={(v) => onChange({ proviso4hoStatus: v })}
          options={STATUS_OPTIONS}
        />
      </div>

      {scope.maintainedQuestions && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">임대의무기간(민간임대주택법 §43) 중에 양도하나요?</label>
            <RadioCardGroup<YesNo>
              name="proviso4hoDuringMandatory"
              layout="inline"
              value={value.proviso4hoDuringMandatory ?? ""}
              onChange={(v) => onChange({ proviso4hoDuringMandatory: v })}
              options={yesNoOptions("proviso-4ho-during-mandatory", "예", "아니오")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">임대보증금·임대료를 연 5% 넘게 올린 적이 있나요?</label>
            <RadioCardGroup<YesNo>
              name="proviso4hoRentOver5"
              layout="inline"
              value={value.proviso4hoRentOver5 ?? ""}
              onChange={(v) => onChange({ proviso4hoRentOver5: v })}
              options={yesNoOptions("proviso-4ho-rent-over5", "예", "아니오")}
            />
          </div>
        </div>
      )}

      {scope.rentIncreaseContractDate && (
        <FieldCard
          label="5% 넘게 올린 계약의 체결·갱신일"
          required
          hint="여러 번이면 가장 늦은 날 — 2019년 2월 12일 이후 체결·갱신한 계약부터 제외 사유가 됩니다"
        >
          <DateInput
            value={value.proviso4hoRentOver5ContractDate ?? ""}
            onChange={(v) => onChange({ proviso4hoRentOver5ContractDate: v })}
          />
        </FieldCard>
      )}

      {scope.giftSeparated && (
        <ToggleCard
          variant="card"
          tone="violet"
          title="증여로 임대사업자 지위를 넘겨받고 그 증여자와 세대가 갈라졌습니다"
          description="2019년 12월 17일 이후 증여로 등록 신청자의 임대사업자 지위를 포괄승계했고, 양도일 현재 그 증여자와 같은 세대가 아니면(이혼 등) 적용되지 않습니다 (사전-2024-법규재산-0747)."
          checked={value.proviso4hoGiftSeparated === true}
          onCheckedChange={(v) => onChange({ proviso4hoGiftSeparated: v })}
        />
      )}
    </div>
  );
}

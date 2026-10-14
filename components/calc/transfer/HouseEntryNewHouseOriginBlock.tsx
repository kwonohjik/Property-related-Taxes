"use client";

/**
 * HouseEntryNewHouseOriginBlock — 이 행의 주택을 **어떻게 취득했는가** (§155① 신규 주택 취득 경위 · 결정 #43 · G6-4)
 *
 * 양도 주택보다 나중에 취득한 행(= §155① 신규 주택 후보)에만 연다. 분양권·조합원입주권으로 취득해 완공된 주택에 완공(잔금)일을
 * 「취득일」로 넣으면, 해석이 일시적 2주택으로 보지 않은 **순차 사례**(권리를 종전주택 취득 전에 산 경우)까지 비과세가 나온다 —
 * 취득일 한 칸으로는 가릴 수 없어 경위와 권리 취득일을 따로 받는다.
 *
 * 🔑 「모름」은 유효한 답이다 — 일시적 2주택을 적용하지 않고 판정하며, 그 답이 결론을 가를 때만 확인 필요를 알린다(원칙 1).
 * 🔑 이 칸은 `completionDate`(§167의3①12가목 소형신축 준공일)와 다른 사실이다 — 섞지 않는다.
 * 🔴 미러링을 하지 않는다 — 경위를 바꾸면 그 경위에 쓰이지 않는 날짜를 onChange에서 함께 비운다(useEffect 아님).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

/**
 * 이 블록이 읽고 쓰는 필드만 — 명부 행(`HouseEntry`)과 명부가 없는 직접 선언 경로(`DeclaredNewHouseOriginBlock` — 결정 #43-3·#43-4)가 함께 쓴다.
 * 명부 행은 그대로 넘어간다(`HouseEntry`가 이 모양을 포함한다).
 */
type OriginFields = Pick<HouseEntry, "id" | "acquisitionOrigin" | "rightAcquisitionDate" | "rightApprovalDate">;

interface Props {
  house: OriginFields;
  onUpdate: (patch: Partial<OriginFields>) => void;
}

type Origin = NonNullable<HouseEntry["acquisitionOrigin"]>;

/** 경위마다 「권리 취득일」 칸의 이름과 안내가 다르다 — 칸 하나에 의미를 맡기지 않도록 라벨을 갈라 준다. */
const DATE_LABEL: Partial<Record<Origin, { label: string; hint: string }>> = {
  successor_right: {
    label: "조합원입주권 승계취득일",
    hint: "매매 등으로 입주권을 승계취득한 날입니다. 종전주택을 가진 채 취득한 입주권이면 입주권 취득일부터 3년 안에 종전주택을 양도해야 합니다(시행령 §156의2③).",
  },
  presale: {
    label: "분양권 취득일",
    hint: "청약으로 받은 분양권은 당첨일, 선착순 분양은 동·호 지정 후 계약을 체결한 날입니다. 상속받은 분양권은 상속개시 당시 피상속인과 같은 세대였으면 피상속인이 분양권을 취득한 날, 그 밖의 상속은 상속개시일, 증여받은 분양권은 증여일입니다. 2020.12.31. 이전에 취득한 분양권은 주택 수에 들지 않던 때라 완공일을 취득일로 보는 현행 판정이 그대로 적용됩니다.",
  },
  original_member_non_house: {
    label: "관리처분계획 인가일",
    hint: "상가·토지 등을 출자한 원조합원은 관리처분계획 인가일에 입주권을 취득한 것으로 봅니다.",
  },
  original_member_house: {
    label: "기존주택 취득일",
    hint: "재개발·재건축된 주택은 기존주택의 연장이라 새로 취득한 주택이 아닙니다. 일시적 2주택 선후는 완공일이 아니라 기존주택 취득일로 판정합니다.",
  },
  self_rebuild: {
    label: "헐기 전 주택 취득일",
    hint: "보유하던 주택을 헐고 다시 지은 주택은 기존주택의 연장이라 새로 취득한 주택이 아닙니다. 선후는 헐기 전 주택 취득일로 판정합니다.",
  },
};

export function HouseEntryNewHouseOriginBlock({ house, onUpdate }: Props) {
  const origin = house.acquisitionOrigin;
  const dateSpec = origin ? DATE_LABEL[origin] : undefined;
  return (
    <ToneCard tone="violet" sectionNum="취득 경위" bodyClassName="space-y-2.5" title="이 주택을 어떻게 취득했습니까 (일시적 2주택)" noDark>
      <p className="text-micro text-muted-foreground" data-testid="house-row-origin-intro">
        양도 주택보다 나중에 취득한 주택입니다. 분양권·조합원입주권으로 취득해 완공된 주택이면 완공일이 아니라 <b>권리를 취득한 날</b>이 판정의 기준이 될 수 있습니다.
      </p>
      <RadioCardGroup
        name={`acquisitionOrigin-${house.id}`}
        data-testid="house-row-origin"
        tone="violet"
        layout="stack"
        options={[
          { value: "general", label: "일반 취득 — 매매·상속·증여 등", testId: "house-row-origin-general" },
          { value: "presale", label: "분양권으로 취득한 주택", testId: "house-row-origin-presale" },
          { value: "successor_right", label: "조합원입주권을 승계취득해 완공된 주택", testId: "house-row-origin-successor_right" },
          { value: "original_member_non_house", label: "원조합원(상가·토지 등 출자)으로 완공된 주택", testId: "house-row-origin-original_member_non_house" },
          { value: "original_member_house", label: "원조합원 — 기존주택을 재개발·재건축한 주택", testId: "house-row-origin-original_member_house" },
          { value: "self_rebuild", label: "보유 주택을 헐고 다시 지은 주택(자가 재건축·신축)", testId: "house-row-origin-self_rebuild" },
          {
            value: "unknown",
            label: "모름",
            description: "일시적 2주택을 적용하지 않고 판정하며, 결론을 가를 때 확인 필요를 알립니다.",
            testId: "house-row-origin-unknown",
          },
        ]}
        value={origin ?? ""}
        onChange={(v) =>
          onUpdate({
            acquisitionOrigin: v as Origin,
            // 경위가 바뀌면 그 경위에 쓰이지 않는 날짜는 비운다(의미가 다른 칸이라 이월하지 않는다).
            rightAcquisitionDate: undefined,
            rightApprovalDate: undefined,
          })
        }
      />
      {dateSpec && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{dateSpec.label}</label>
          <DateInput
            data-testid="house-row-right-acquisition-date"
            value={house.rightAcquisitionDate ?? ""}
            onChange={(v) => onUpdate({ rightAcquisitionDate: v })}
          />
          <p className="text-xs text-muted-foreground">{dateSpec.hint}</p>
        </div>
      )}
      {origin === "successor_right" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">관리처분계획 인가일 (선택)</label>
          <DateInput
            data-testid="house-row-right-approval-date"
            value={house.rightApprovalDate ?? ""}
            onChange={(v) => onUpdate({ rightApprovalDate: v })}
          />
          <p className="text-xs text-muted-foreground" data-testid="house-row-right-approval-date-hint">
            입주권은 관리처분계획 인가 뒤에 생기므로 인가일은 승계취득일보다 늦을 수 없습니다. 승계취득일이 2006.1.1. 전이면 인가도 그 전이라 「소득세법」 §89②의 조합원입주권이 아니라 일반 취득과 같이 판정합니다(인가일을 비워도 같습니다).
          </p>
        </div>
      )}
    </ToneCard>
  );
}

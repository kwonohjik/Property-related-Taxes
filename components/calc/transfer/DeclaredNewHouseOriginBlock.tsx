"use client";

/**
 * DeclaredNewHouseOriginBlock — 보유 주택 목록 **행이 없는** 신규 주택의 취득 경위 질문 (§155① · 결정 #43-3·#43-4)
 *
 * 명부 행은 행 편집 모달(`HouseEntryNewHouseOriginBlock`)에서 경위를 답한다. 신규 주택 취득일을 **직접 선언**하는 두 경로 —
 * 양도세 계산기·판정 메뉴의 직접 선언 폴백(`temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)과 증여세 부담부증여 화면 — 는 행이 없어
 * 종전에는 경위를 묻지 못했다(`not_collected`). 같은 공용 블록을 그대로 쓰고, 값은 세 필드(`declared-new-house-origin.ts`)에 저장한다.
 *
 * 🔑 미답은 막지 않는다 — 답하지 않으면 종전과 같이 취득일 그대로 판정하고 확인 필요를 알린다(「모름」은 명부 행과 같이 답이다).
 * 🔴 미러링을 하지 않는다 — 경위 변경 시 권리 취득일·인가일 비우기는 공용 블록의 onChange가 한다(useEffect 아님).
 */
import { HouseEntryNewHouseOriginBlock } from "@/components/calc/transfer/HouseEntryNewHouseOriginBlock";
import {
  declaredNewHouseOriginPatch,
  type DeclaredNewHouseOriginFields,
} from "@/lib/calc/declared-new-house-origin";

interface Props {
  fields: DeclaredNewHouseOriginFields;
  /** 선언한 신규 주택 취득일(완공·잔금일) — 안내 문구에 보인다. */
  newAcquisitionDate?: string;
  onChange: (patch: Partial<Required<DeclaredNewHouseOriginFields>>) => void;
}

export function DeclaredNewHouseOriginBlock({ fields, newAcquisitionDate, onChange }: Props) {
  return (
    // data-field — ⑧ 검증 오류가 이 칸으로 이동한다(`declaredNewHouseOriginIssue`의 field).
    <div data-testid="declared-new-house-origin" data-field="newHouseOriginKind" className="space-y-1.5">
      <p className="text-micro text-muted-foreground" data-testid="declared-new-house-origin-note">
        보유 주택 목록의 행이 아니라 이전에 입력되었거나 다른 화면에서 넘어온 신규 주택 취득일{newAcquisitionDate ? `(${newAcquisitionDate})` : ""}로
        일시적 2주택을 판정하는 경우입니다. 아래 질문에 답하지 않으면 그 취득일 그대로 판정하고 확인 필요로 알립니다.
      </p>
      <HouseEntryNewHouseOriginBlock
        house={{
          id: "declared",
          acquisitionOrigin: fields.newHouseOriginKind || undefined,
          rightAcquisitionDate: fields.newHouseRightAcquisitionDate || undefined,
          rightApprovalDate: fields.newHouseRightApprovalDate || undefined,
        }}
        onUpdate={(p) => onChange(declaredNewHouseOriginPatch(p))}
      />
    </div>
  );
}

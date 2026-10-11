"use client";

/**
 * SellingHouseOriginBlock — **양도 주택**이 기존주택의 연장(헐고 다시 지은 주택·원조합원 기존주택의 완공 주택)인가
 * (§155① 종전주택 취득일 · 결정 #43 하위 2 가 · G6-4).
 *
 * 명부 행의 취득 경위 질문(`HouseEntryNewHouseOriginBlock`)의 짝이다. 양도 주택 「취득일」에 사용승인일·잔금일을 넣으면 헐기 전 주택을 가진
 * 기간 중 취득한 주택이 「양도 주택보다 먼저 취득」으로 읽혀 신규 주택 후보에서 빠진다 — 헐기 전 주택 취득일을 따로 받는다.
 *
 * 🔑 선택 입력이다 — 「일반 취득」이면 아무것도 입력하지 않는다(취득일 그대로). 갈래를 고르고 날짜를 비우면 ⑧이 막는다.
 * 🔴 미러링을 하지 않는다 — 갈래를 「일반 취득」으로 바꾸면 날짜를 onChange에서 함께 비운다(useEffect 아님).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

interface Props {
  asset: Pick<AssetForm, "sellingHouseRebuildKind" | "sellingHouseExistingAcquisitionDate">;
  onUpdate: (patch: Pick<AssetForm, "sellingHouseRebuildKind" | "sellingHouseExistingAcquisitionDate">) => void;
}

export function SellingHouseOriginBlock({ asset, onUpdate }: Props) {
  const kind = asset.sellingHouseRebuildKind;
  return (
    <ToneCard tone="violet" sectionNum="양도 주택 취득 경위" bodyClassName="space-y-2.5" title="양도하는 주택은 어떻게 취득했습니까 (일시적 2주택)" noDark>
      <p className="text-micro text-muted-foreground" data-testid="selling-house-origin-intro">
        헐고 다시 지은 주택은 기존주택의 연장이라 일시적 2주택의 선후를 사용승인일이 아니라 <b>헐기 전 주택 취득일</b>로 봅니다. 해당하지 않으면 「일반 취득」을 두세요.
      </p>
      <RadioCardGroup
        name="sellingHouseRebuildKind"
        data-testid="selling-house-origin"
        tone="violet"
        layout="stack"
        options={[
          { value: "general", label: "일반 취득 — 매매·상속·증여 등", testId: "selling-house-origin-general" },
          { value: "self_rebuild", label: "보유 주택을 헐고 다시 지은 주택(자가 재건축·신축)", testId: "selling-house-origin-self_rebuild" },
          { value: "original_member_house", label: "원조합원 — 기존주택을 재개발·재건축한 주택", testId: "selling-house-origin-original_member_house" },
        ]}
        value={kind ?? "general"}
        onChange={(v) =>
          onUpdate({
            sellingHouseRebuildKind: v === "general" ? undefined : (v as NonNullable<typeof kind>),
            sellingHouseExistingAcquisitionDate: undefined,
          })
        }
      />
      {kind && (
        <div className="space-y-1.5" data-field="sellingHouseExistingAcquisitionDate">
          <label className="text-sm font-medium">헐기 전(기존) 주택 취득일</label>
          <DateInput
            data-testid="selling-house-existing-acquisition-date"
            value={asset.sellingHouseExistingAcquisitionDate ?? ""}
            onChange={(v) => onUpdate({ sellingHouseRebuildKind: kind, sellingHouseExistingAcquisitionDate: v })}
          />
          <p className="text-xs text-muted-foreground">
            비과세 보유기간·장기보유특별공제는 위 양도 주택 「취득일」대로이고, 이 날짜는 일시적 2주택의 종전주택 취득일에만 쓰입니다.
          </p>
        </div>
      )}
    </ToneCard>
  );
}

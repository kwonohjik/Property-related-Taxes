"use client";

/**
 * §154⑧3호 상속주택 자체 양도 — 동일세대 보유·거주기간 통산 토글 카드 (3키: 동일세대 여부·개시일·통산 거주 개월).
 *
 * `CompanionAcqInheritanceBlock`(상속 호스트)에서 추출했다(D2-2, 2026-10-09) — 건물 상속 + 토지 매매(D2) 토글 패널도
 * **같은 칸**을 쓴다(계획서 §12.1 D2-Q3: 건물만 상속받아도 영 §154⑧3호는 적용). 문구·키·초기화 patch를 한 곳에 둔다.
 * `children`은 토글 안의 추가 내용(상속 블록의 §155② 합가 예외 등) — D2에서는 비운다(§155②는 미적용).
 */
import type { ReactNode } from "react";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function InheritedCohabitationCard(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  children?: ReactNode;
}) {
  const { asset, onChange } = props;
  return (
    <ToggleCard
      variant="card"
      tone="violet"
      checked={asset.decedentSameHouseholdBeforeInheritance}
      onCheckedChange={(v) => {
        onChange({
          decedentSameHouseholdBeforeInheritance: v,
          ...(v ? {} : { decedentCohabitationHoldingStartDate: "", decedentCohabitationResidenceMonths: "" }),
        });
      }}
      title="상속개시 당시 피상속인과 동일세대"
      description="동일세대로 함께 거주·보유하던 상속주택을 양도하는 경우, 상속개시 전 동일세대 보유·거주기간을 1세대1주택 비과세·표2 장특공제 판정에 통산합니다 (소령 §154⑧3호)"
    >
      <div className="space-y-2 pt-1">
        <div className="space-y-1">
          <label className="block text-caption text-muted-foreground font-medium">
            동일세대 거주·보유 개시일
          </label>
          <DateInput
            data-field="decedentCohabitationHoldingStartDate"
            value={asset.decedentCohabitationHoldingStartDate}
            onChange={(v) => onChange({ decedentCohabitationHoldingStartDate: v })}
          />
          <p className="text-caption text-muted-foreground/70">
            상속개시 전 피상속인과 동일세대로서 이 주택에 거주·보유하기 시작한 날 (비과세 보유기간 기산).
          </p>
        </div>
        <div className="space-y-1">
          <label className="block text-caption text-muted-foreground font-medium">
            동일세대 통산 거주기간 (개월)
          </label>
          <div className="w-32">
            <DecimalInput
              value={asset.decedentCohabitationResidenceMonths}
              onChange={(v) => onChange({ decedentCohabitationResidenceMonths: v })}
            />
          </div>
          <p className="text-caption text-muted-foreground/70">
            상속개시 전 피상속인과 동일세대로서 이 주택에 실제 거주한 기간(개월). 비과세 거주요건·표2
            장특공제 대상 판정에 통산됩니다. 상속개시일 이후 상속인 본인 실거주는 &lsquo;거주기간&rsquo;에 별도 입력.
          </p>
        </div>
        {props.children}
      </div>
    </ToggleCard>
  );
}

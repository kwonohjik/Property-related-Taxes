"use client";

/**
 * 기존주택 원조합원 조합원입주권 행 — §155① 일시적 2주택 판정 사실 (#2054 후속)
 *
 * 기존주택 원조합원은 「소득세법 시행령」 §155① 일시적 2주택으로 판정한다(엔진 `one-house/original-member-right.ts` —
 * 신규 주택 = 입주권이 된 기존주택, 기산일 = 기존주택 취득일). 그 경로에 일시적 2주택과 같은 두 사실을 받는다.
 *
 * - §155⑱ 처분기한 예외 사유 — 「기존주택을 취득한 날부터 3년이 되는 날 현재」 각 호 해당이면 기한을 넘겨도 충족
 * - §155①2호 가목·단서(2019-12-17 체제) — 세대전원 전입일 · 기존 임차인 임대차 종료일. 그 체제에서만 연다
 *   (`originalMemberMoveInRelevant` — ⑧과 같은 게이트)
 *
 * 문구·검증은 일시적 2주택 경로(`TempTwoHouseRegulatedInputs` · `temporaryTwoHouseEraIssues`)와 같다.
 */
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TempTwoHouseDelayReasonInput } from "@/components/calc/transfer/TempTwoHouseDeadlineExceptionInputs";
import { originalMemberMoveInRelevant } from "@/lib/calc/right-member-origin-scope";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

type Patch = Partial<
  Pick<
    PresaleRightEntry,
    | "originalMemberMoveInDate"
    | "originalMemberExistingTenant"
    | "originalMemberTenantLeaseEndDate"
    | "originalMemberDisposalDelayReason"
  >
>;

interface Props {
  row: PresaleRightEntry;
  idx: number;
  transferDate: string | undefined;
  onChange: (patch: Patch) => void;
}

export function OriginalMemberTempTwoHouseInputs({ row, idx, transferDate, onChange }: Props) {
  const moveInRelevant = originalMemberMoveInRelevant(row, transferDate);
  return (
    <div className="space-y-2.5" data-testid={`original-member-temp-two-house-${idx}`}>
      {moveInRelevant && (
        <>
          <div className="space-y-1">
            <span className="block text-caption text-muted-foreground font-medium">
              기존주택으로 세대전원 이사·전입신고한 날
            </span>
            <DateInput
              data-testid={`original-member-move-in-date-${idx}`}
              data-field={`presaleRights.${idx}.originalMemberMoveInDate`}
              value={row.originalMemberMoveInDate ?? ""}
              onChange={(v) => onChange({ originalMemberMoveInDate: v })}
            />
            <span className="block text-caption text-muted-foreground">
              기존주택 취득일부터 1년 이내에 세대전원이 이사하고 전입신고를 마쳐야 합니다(§155①2호 가목). 취학·근무상
              형편·질병 요양 등 부득이한 사유로 일부 세대원이 이사하지 못한 경우도 포함됩니다. 기존주택이 관리처분·멸실로
              1년 안에 전입할 수 없게 된 경우에도 이 기한은 늘어나지 않습니다.
            </span>
          </div>
          <ToggleCard
            data-testid={`original-member-existing-tenant-${idx}`}
            checked={row.originalMemberExistingTenant === true}
            onCheckedChange={(v) => onChange({ originalMemberExistingTenant: v })}
            title="기존주택 취득일 현재 기존 임차인이 거주 (§155①2호 단서)"
            description="임대차계약서 등으로 확인되고 그 임대차기간이 취득일부터 1년 후에 끝나면, 전입·양도 기한이 전 소유자와 임차인 간 임대차계약 종료일까지(취득일부터 최대 2년) 늘어납니다"
            tone="sky"
          >
            <div className="space-y-1">
              <span className="block text-caption text-muted-foreground font-medium">
                전 소유자와 임차인 간 임대차계약 종료일
              </span>
              <DateInput
                data-testid={`original-member-lease-end-date-${idx}`}
                data-field={`presaleRights.${idx}.originalMemberTenantLeaseEndDate`}
                value={row.originalMemberTenantLeaseEndDate ?? ""}
                onChange={(v) => onChange({ originalMemberTenantLeaseEndDate: v })}
              />
              <span className="block text-caption text-muted-foreground">
                기존주택 취득일 이후 갱신한 임대차계약은 인정되지 않습니다.
              </span>
            </div>
          </ToggleCard>
        </>
      )}
      <div data-testid={`original-member-disposal-delay-${idx}`}>
        <TempTwoHouseDelayReasonInput
          name={`original-member-disposal-delay-${row.id}`}
          newHouseLabel="기존주택"
          form={{
            disposalDelayReason: (row.originalMemberDisposalDelayReason ?? "") as Parameters<
              typeof TempTwoHouseDelayReasonInput
            >[0]["form"]["disposalDelayReason"],
          }}
          onChange={(p) => onChange({ originalMemberDisposalDelayReason: p.disposalDelayReason })}
        />
      </div>
    </div>
  );
}

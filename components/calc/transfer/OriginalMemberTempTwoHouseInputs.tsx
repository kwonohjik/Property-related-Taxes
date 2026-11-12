"use client";

/**
 * 기존주택 원조합원 조합원입주권 행 — §155① 일시적 2주택 판정 사실 (#2054 후속)
 *
 * 기존주택 원조합원은 「소득세법 시행령」 §155① 일시적 2주택으로 판정한다(엔진 `one-house/original-member-right.ts` —
 * 신규 주택 = 입주권이 된 기존주택, 기산일 = 기존주택 취득일). 그 경로에 일시적 2주택과 같은 사실을 받는다.
 *
 * - 기존주택 매매계약 체결·계약금 지급일 — §155①2호 괄호(공고 전 계약)·연혁 부칙의 계약일 기준(리뷰 E-3)
 * - §155①2호 가목·단서(2019-12-17 체제) — 세대전원 전입일 · 기존 임차인 임대차 종료일. 그 체제에서만 연다
 *   (`originalMemberMoveInRelevant` — ⑧과 같은 게이트)
 * - §155⑯ 공공기관·법인 지방이전 — 기존주택 소재지는 이 행의 정비구역 주소로 판정한다(리뷰 E-3)
 * - §155⑱ 처분기한 예외 사유 — 「기존주택을 취득한 날부터 3년이 되는 날 현재」 각 호 해당이면 기한을 넘겨도 충족
 *
 * 문구·검증은 일시적 2주택 경로(`TempTwoHouseRegulatedInputs` · `temporaryTwoHouseEraIssues`)와 같다.
 */
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { TempTwoHouseDelayReasonInput } from "@/components/calc/transfer/TempTwoHouseDeadlineExceptionInputs";
import { TempTwoHouseRelocationInputs } from "@/components/calc/transfer/TempTwoHouseDeadlineExceptionInputs";
import { originalMemberMoveInRelevant } from "@/lib/calc/right-member-origin-scope";
import { judgeRelocationRegion } from "@/lib/calc/relocation-region-verdict";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

type Patch = Partial<
  Pick<
    PresaleRightEntry,
    | "originalMemberContractDate"
    | "originalMemberPublicInstitutionRelocation"
    | "originalMemberRelocatedInstitutionJibun"
    | "originalMemberRelocatedSigunguCode"
    | "originalMemberMoveInDate"
    | "originalMemberExistingTenant"
    | "originalMemberTenantLeaseEndDate"
    | "originalMemberDisposalDelayReason"
    | "originalMemberDisposalDelayDisposedByThatMethod"
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
  const relocation = row.originalMemberPublicInstitutionRelocation === true;
  const newHouseSigunguCode = extractSigunguCodeFromPnu(row.regionCode);
  return (
    <div className="space-y-2.5" data-testid={`original-member-temp-two-house-${idx}`}>
      <div className="space-y-1">
        <span className="block text-caption text-muted-foreground font-medium">
          기존주택 매매계약 체결·계약금 지급일 <span className="font-normal">(해당 시)</span>
        </span>
        <DateInput
          data-testid={`original-member-contract-date-${idx}`}
          data-field={`presaleRights.${idx}.originalMemberContractDate`}
          value={row.originalMemberContractDate ?? ""}
          onChange={(v) => onChange({ originalMemberContractDate: v })}
        />
        <span className="block text-caption text-muted-foreground">
          기존주택 취득일보다 먼저 계약하고 계약금을 지급했다면 입력하세요(증빙서류로 확인되는 경우). 조정대상지역 공고가
          있은 날 이전 계약이면 조정대상지역 취득으로 보지 않고, 2018년 9월 13일·2019년 12월 16일 또는 2026년 8월 3일
          이전 계약이면 종전 처분기한이 적용됩니다(대통령령 제29242호 부칙 제2조·제30395호 부칙 제15조·제36737호 부칙 제2조).
        </span>
      </div>
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
      <div data-testid={`original-member-relocation-${idx}`}>
        <TempTwoHouseRelocationInputs
          form={{
            publicInstitutionRelocation: relocation,
            relocatedInstitutionJibun: row.originalMemberRelocatedInstitutionJibun ?? "",
            relocatedSigunguCode: row.originalMemberRelocatedSigunguCode ?? "",
            newHouseJibun: "",
            newHouseSigunguCode: newHouseSigunguCode ?? "",
            disposalDelayReason: "",
          }}
          onChange={(p) =>
            onChange({
              ...(p.publicInstitutionRelocation !== undefined
                ? { originalMemberPublicInstitutionRelocation: p.publicInstitutionRelocation }
                : {}),
              ...(p.relocatedInstitutionJibun !== undefined
                ? { originalMemberRelocatedInstitutionJibun: p.relocatedInstitutionJibun }
                : {}),
              ...(p.relocatedSigunguCode !== undefined ? { originalMemberRelocatedSigunguCode: p.relocatedSigunguCode } : {}),
            })
          }
          relocationRegionVerdict={judgeRelocationRegion({
            publicInstitutionRelocation: relocation,
            relocatedSigunguCode: row.originalMemberRelocatedSigunguCode || undefined,
            newHouseSigunguCode,
          })}
          newHouseLabel="기존주택"
          newHouseLocationNote={
            newHouseSigunguCode
              ? "이 입주권 행에 입력한 정비구역(기존주택) 주소로 판정합니다 — 주소를 고치면 판정도 함께 바뀝니다."
              : "이 입주권 행에 정비구역(기존주택) 주소를 입력하면 연접 여부를 자동 판정합니다 — 입력하지 않으면 위 선택을 그대로 따릅니다."
          }
        />
      </div>
      <div data-testid={`original-member-disposal-delay-${idx}`}>
        <TempTwoHouseDelayReasonInput
          name={`original-member-disposal-delay-${row.id}`}
          newHouseLabel="기존주택"
          transferDate={transferDate}
          form={{
            disposalDelayDisposedByThatMethod: row.originalMemberDisposalDelayDisposedByThatMethod === true,
            disposalDelayReason: (row.originalMemberDisposalDelayReason ?? "") as Parameters<
              typeof TempTwoHouseDelayReasonInput
            >[0]["form"]["disposalDelayReason"],
          }}
          onChange={(p) =>
            onChange({
              ...(p.disposalDelayReason !== undefined ? { originalMemberDisposalDelayReason: p.disposalDelayReason } : {}),
              ...(p.disposalDelayDisposedByThatMethod !== undefined
                ? { originalMemberDisposalDelayDisposedByThatMethod: p.disposalDelayDisposedByThatMethod }
                : {}),
            })
          }
        />
      </div>
    </div>
  );
}

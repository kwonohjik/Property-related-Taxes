"use client";

/**
 * AptDeadlineExtensionFields — 소령 §167의3⑪ 기한 연장 사실 입력 (2호 명부 행·양도 주택 · 3호 · §155⑳ 임대주택 공용)
 *
 * 법문(MST 290841 · 2026.10.1. 시행 실독): 「⑪ … 기한은 2027년 12월 31일로 한다. 다만, 해당 주택이 다음 각 호의
 * 어느 하나에 해당하는 주택인 경우에는 2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날을 그 기한으로 한다.」
 *   1. 「민간임대주택에 관한 특별법」 제43조에 따른 임대의무기간이 2027년 1월 1일 이후 종료되는 주택: 같은 법
 *      제6조제5항에 따라 임대주택 등록이 말소되는 날부터 1년이 되는 날
 *   2. 2027년 1월 1일 이후 조정대상지역으로 신규 지정된 지역(2026년 12월 31일 현재 조정대상지역에 해당하는 지역은
 *      제외한다)에 소재하는 주택: 조정대상지역의 공고일부터 1년이 되는 날
 *   3. 2027년 12월 31일 이전 또는 제1호나 제2호에 따른 기한 이전에 … 인가 또는 지정이 있는 경우 해당 사업의 대상이
 *      되는 주택: 해당 목에서 정하는 이전고시일부터 1년이 되는 날
 *
 * 3-state: 「모름」(기본 — 엔진 판정 보류) / 「연장 사유 없음」(기한 2027.12.31. 확정) / 「연장 사유 있음」(날짜).
 * 상태 전환과 날짜 정리는 `withAptDeadlineExtensionStatus`(④·⑧과 같은 leaf) — onChange 직접 patch, useEffect 미러링 금지.
 * ⚠️ 3호 「인가 또는 지정」 시점 요건은 엔진이 보지 않는다(이전고시일만) — 안내 문구로만 알린다.
 */

import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  aptDeadlineExtensionStatus,
  withAptDeadlineExtensionStatus,
  type AptDeadlineExtensionStatus,
} from "@/lib/calc/apt-deadline-extension-scope";
import type { AptDeadlineExtensionForm } from "@/lib/stores/calc-wizard-asset-nbl";
import type { ToggleCardTone } from "@/components/calc/inputs/ToggleCard";

interface Props {
  value: AptDeadlineExtensionForm | undefined;
  onChange: (next: AptDeadlineExtensionForm | undefined) => void;
  /** 라디오 `name`·testid 유일성 — 화면마다 다른 접두어(행 id · "selling" · 임대주택 호 번호 등) */
  idPrefix: string;
  tone?: ToggleCardTone;
}

const LABEL = "block text-caption text-muted-foreground font-medium";
const HINT = "text-caption text-muted-foreground/70";

export function AptDeadlineExtensionFields({ value, onChange, idPrefix, tone = "violet" }: Props) {
  const status = aptDeadlineExtensionStatus(value);
  const ext = value ?? {};
  const patchDate = (p: AptDeadlineExtensionForm) => onChange({ ...ext, status: "has", ...p });

  return (
    <div className="space-y-2" data-testid={`apt-deadline-ext-${idPrefix}`}>
      <div className="space-y-1">
        <label className={LABEL}>아파트 양도기한 연장 사유 (소령 §167의3⑪)</label>
        <p className={HINT}>
          기한은 2027.12.31.입니다. 아래 사유가 있으면 2027.12.31.과 각 날부터 1년이 되는 날 중 가장 늦은 날까지
          연장됩니다. 「모름」으로 두면 판정을 보류하고 종전 기준으로 계산한 뒤 확인이 필요하다고 안내합니다.
        </p>
        <RadioCardGroup<AptDeadlineExtensionStatus>
          name={`apt-deadline-ext-status-${idPrefix}`}
          data-testid={`apt-deadline-ext-status-${idPrefix}`}
          layout="inline"
          tone={tone}
          value={status}
          onChange={(next) => onChange(withAptDeadlineExtensionStatus(value, next))}
          options={[
            { value: "unknown", label: "모름", testId: `apt-deadline-ext-unknown-${idPrefix}` },
            { value: "none", label: "연장 사유 없음", testId: `apt-deadline-ext-none-${idPrefix}` },
            { value: "has", label: "연장 사유 있음", testId: `apt-deadline-ext-has-${idPrefix}` },
          ]}
        />
      </div>

      {status === "none" && (
        <p className={HINT}>⑪ 각 호에 해당하지 않으므로 기한은 2027.12.31.입니다.</p>
      )}

      {status === "has" && (
        <div className="space-y-2">
          <p className={HINT}>해당하는 날만 적으세요. 하나 이상 적어야 합니다.</p>
          <div className="space-y-1">
            <label className={LABEL}>
              ⑪1호 — 임대주택 등록이 말소되는 날 (임대의무기간 2027.1.1. 이후 종료 · 민간임대주택법 §6⑤)
            </label>
            <DateInput
              data-testid={`apt-deadline-ext-d1-${idPrefix}`}
              value={ext.dutyPeriodEndCancellationDate ?? ""}
              onChange={(s) => patchDate({ dutyPeriodEndCancellationDate: s || undefined })}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>⑪2호 — 조정대상지역 공고일 (2027.1.1. 이후 신규 지정)</label>
            <DateInput
              data-testid={`apt-deadline-ext-d2-${idPrefix}`}
              value={ext.newRegulatedAreaAnnouncementDate ?? ""}
              onChange={(s) => patchDate({ newRegulatedAreaAnnouncementDate: s || undefined })}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>⑪3호 — 이전고시일 (재건축·재개발·소규모주택정비)</label>
            <DateInput
              data-testid={`apt-deadline-ext-d3-${idPrefix}`}
              value={ext.relocationAnnouncementDate ?? ""}
              onChange={(s) => patchDate({ relocationAnnouncementDate: s || undefined })}
            />
            <p className={HINT}>
              2027.12.31.(또는 1·2호 기한) 이전에 조합설립인가·관리처분계획인가 등이 있은 사업의 대상 주택에 한합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

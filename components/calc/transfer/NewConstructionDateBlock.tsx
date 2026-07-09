"use client";

/**
 * 신축(자가건축) 주택 취득일 4-시점 입력 블록 (영 §162①4호)
 *
 * 자가건축 주택의 취득일은 아래 네 날짜 중 가장 이른 날로 봄:
 *   ① 사용승인일 (사용승인서 교부일 — 영 §162①4호 본문)
 *   ② 사용검사필증 교부일 (도시계획법·건축법 별도 용어, G-5 추가)
 *   ③ 임시사용승인일 (사용승인일보다 이른 경우에만 의미)
 *   ④ 사실상 사용일 (사용승인 전 실제 입주·사용한 날)
 *
 * UI 순서 = 엔진 계산 로직 순서:
 *   사용승인일(필수) → 사용검사필증 교부일(선택) → 임시사용승인일(선택) → 사실상 사용일(선택) → 자동 판정 안내
 *
 * tone: amber (취득 정보 섹션)
 * 규칙: DateInput 사용, placeholder 숫자 예시 금지, tone 배경 유지
 */

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";

interface Props {
  /** 사용승인일 (YYYY-MM-DD) — 필수 */
  occupancyApprovalDate: string;
  onOccupancyApprovalDateChange: (v: string) => void;
  /** 사용검사필증 교부일 (YYYY-MM-DD) — 선택, 사용승인일과 별도 시점인 경우만 */
  approvalCertificateDate: string;
  onApprovalCertificateDateChange: (v: string) => void;
  /** 임시사용승인일 (YYYY-MM-DD) — 선택, 사용승인일보다 이른 경우만 */
  temporaryApprovalDate: string;
  onTemporaryApprovalDateChange: (v: string) => void;
  /** 사실상 사용일 (YYYY-MM-DD) — 선택, 사용승인 전 실사용 시 */
  actualUseDate: string;
  onActualUseDateChange: (v: string) => void;
}

/**
 * 4-시점 중 가장 이른 날을 취득일로 결정 (영 §162①4호)
 * 빈 값은 무시. 모두 빈 값이면 undefined 반환.
 */
export function computeEarliestDate(
  occupancyApprovalDate: string,
  approvalCertificateDate: string,
  temporaryApprovalDate: string,
  actualUseDate: string,
): string | undefined {
  const dates = [occupancyApprovalDate, approvalCertificateDate, temporaryApprovalDate, actualUseDate].filter(
    (d) => d && d.length === 10,
  );
  if (dates.length === 0) return undefined;
  return dates.sort()[0];
}

export function NewConstructionDateBlock({
  occupancyApprovalDate,
  onOccupancyApprovalDateChange,
  approvalCertificateDate,
  onApprovalCertificateDateChange,
  temporaryApprovalDate,
  onTemporaryApprovalDateChange,
  actualUseDate,
  onActualUseDateChange,
}: Props) {
  const earliest = computeEarliestDate(occupancyApprovalDate, approvalCertificateDate, temporaryApprovalDate, actualUseDate);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-amber-700">
          자가건축 주택 취득일 (소득세법 시행령 §162①4호)
        </p>
      </div>

      <p className="text-caption text-amber-600 leading-relaxed">
        자가건축 주택의 취득일은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중
        <strong> 가장 이른 날</strong>을 기준으로 합니다.
      </p>

      {/* ① 사용승인일 — 필수 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
            ①
          </span>
          <p className="text-xs font-semibold text-amber-700">사용승인일 (필수)</p>
        </div>
        <FieldCard
          label="사용승인일"
          hint="사용승인서 교부일. 취득일의 기본 기준 (영 §162①4호 본문)."
          required
        >
          <DateInput
            value={occupancyApprovalDate}
            onChange={onOccupancyApprovalDateChange}

          />
        </FieldCard>
      </div>

      {/* ② 사용검사필증 교부일 — 선택 (G-5) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
            ②
          </span>
          <p className="text-xs font-semibold text-amber-700">사용검사필증 교부일 (선택)</p>
        </div>
        <FieldCard
          label="사용검사필증 교부일"
          hint="사용승인일과 동일하면 미입력. 도시계획법·건축법 용어 차이로 별도 시점인 경우만 입력하세요."
        >
          <DateInput
            value={approvalCertificateDate}
            onChange={onApprovalCertificateDateChange}

          />
        </FieldCard>
      </div>

      {/* ③ 임시사용승인일 — 선택 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
            ③
          </span>
          <p className="text-xs font-semibold text-amber-700">임시사용승인일 (선택)</p>
        </div>
        <FieldCard
          label="임시사용승인일"
          hint="임시사용승인일이 사용승인일보다 이른 경우에만 입력하세요. 이 경우 임시사용승인일이 취득일이 됩니다."
        >
          <DateInput
            value={temporaryApprovalDate}
            onChange={onTemporaryApprovalDateChange}

          />
        </FieldCard>
      </div>

      {/* ④ 사실상 사용일 — 선택 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-micro font-bold text-amber-800 select-none">
            ④
          </span>
          <p className="text-xs font-semibold text-amber-700">사실상 사용일 (선택)</p>
        </div>
        <FieldCard
          label="사실상 사용일"
          hint="사용승인일 전 실제로 입주하여 사용한 날입니다. 이 날이 가장 이르면 이 날이 취득일이 됩니다."
        >
          <DateInput
            value={actualUseDate}
            onChange={onActualUseDateChange}

          />
        </FieldCard>
      </div>

      {/* 자동 판정 안내 박스 */}
      <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-caption text-amber-800 space-y-0.5">
        <p className="font-semibold">자동 취득일 판정:</p>
        {earliest ? (
          <p>
            위 네 날짜 중 가장 이른 날 ={" "}
            <strong>{earliest}</strong>이(가) 취득일로 적용됩니다.
          </p>
        ) : (
          <p>사용승인일을 입력하면 취득일이 자동 판정됩니다.</p>
        )}
        <p className="text-amber-600 mt-1">
          ※ 별도의 &quot;취득일&quot; 입력은 필요 없습니다. 위 네 날짜 중 가장 이른 날이 자동으로 취득일로 적용됩니다.
        </p>
      </div>
    </div>
  );
}

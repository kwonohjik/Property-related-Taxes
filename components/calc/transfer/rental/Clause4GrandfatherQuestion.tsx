"use client";

/**
 * PR-B — 조특령 §97의3③4호(기준시가 6억·3억 한도)의 부칙 예외 질문 — §97의3·§97의5 공용.
 *
 * 대통령령 제29241호 부칙 §2② — 「1. 2018년 9월 13일 이전에 주택(주택을 취득할 수 있는 권리를 포함한다.
 * 이하 이 항에서 같다)을 취득한 경우 2. 2018년 9월 13일 이전에 주택을 취득하기 위하여 매매계약을 체결하고
 * 계약금을 지급한 사실이 증빙서류에 의하여 확인되는 경우」 종전 규정(한도 없음)에 따른다.
 *
 * 표시 조건은 엔진과 **같은 함수**(`isClause4Applicable`)다 — 취득일·매매계약일만으로 이미 예외이거나
 * 양도가 시행일 전이면 묻지 않는다. 그 밖의 경우(분양권·입주권을 먼저 취득한 사실 등)만 사용자가 답한다.
 * 미응답("")은 한도를 적용한다(종전 동작). 숨겨진 뒤 남은 답은 엔진이 같은 함수로 이미 예외 처리하므로 결과를 바꾸지 않는다.
 */
import { useId } from "react";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { isClause4Applicable } from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import { toOptionalDate } from "@/lib/api/date-coerce";

interface Props {
  /** `reduction.<type>.clause4Grandfather` */
  dataField: string;
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no") => void;
  acquisitionDate?: string;
  transferDate?: string;
  /** 자산-수준 매매계약일(분양·매매계약 + 계약금 납부) */
  assetContractDate?: string;
}

export function Clause4GrandfatherQuestion({ dataField, value, onChange, acquisitionDate, transferDate, assetContractDate }: Props) {
  const uid = useId();
  const transfer = toOptionalDate(transferDate);
  const acquisition = toOptionalDate(acquisitionDate);
  if (!transfer || !acquisition) return null;
  if (!isClause4Applicable({ transferDate: transfer, acquisitionDate: acquisition, contractDate: toOptionalDate(assetContractDate) })) {
    return null;
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium">2018.9.13. 이전 취득·계약</p>
      <p className="mb-1.5 text-micro text-muted-foreground">
        2018.9.13. 이전에 이 주택(분양권·입주권 포함)을 취득했거나, 매매계약을 체결하고 계약금을 지급한 사실이 증빙서류로
        확인되면 기준시가 한도(6억·수도권 밖 3억)를 적용하지 않습니다 (대통령령 제29241호 부칙 §2②). 답하지 않으면 한도를 적용합니다.
      </p>
      <RadioCardGroup
        data-field={dataField}
        name={`clause4Grandfather-${uid}`}
        layout="inline"
        tone="violet"
        value={value}
        onChange={(v) => onChange(v as "yes" | "no")}
        options={[
          { value: "yes", label: "예 — 2018.9.13. 이전 취득·계약" },
          { value: "no", label: "아니오" },
        ]}
      />
    </div>
  );
}

"use client";

import { importStepLabel } from "@management/shift-management/ui";
import { IOS, iosType } from "../../_lib/tokens";
import { IosIcon } from "./IosIcon";

interface StepperProps {
  /** 現在段(1-3)。page.tsx が phase から importPhaseToStep で算出して渡す。 */
  current: 1 | 2 | 3;
}

/**
 * 取込の 3 段ステッパー(①ファイルを選ぶ ─ ②内容を確認 ─ ③カレンダーに反映)。
 * 現在段を青、完了段を緑チェックで表示する薄いプレゼン。段の意味は表示のみ。
 */
export function Stepper({ current }: StepperProps) {
  const steps: (1 | 2 | 3)[] = [1, 2, 3];
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "4px 0 18px" }}>
      {steps.map((n, index) => {
        const isDone = n < current;
        const isOn = n === current;
        const numBg = isDone ? IOS.color.green : isOn ? IOS.color.blue : IOS.gray.g5;
        const numColor = isDone || isOn ? "#FFFFFF" : IOS.color.secondaryLabel;
        return (
          <div key={n} style={{ display: "contents" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: numBg,
                  color: numColor,
                  ...iosType("footnote"),
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 26px",
                  fontWeight: 700,
                }}
              >
                {isDone ? <IosIcon name="check" size={15} strokeWidth={2.2} /> : n}
              </span>
              <span
                className="jobcan-step-label"
                style={{
                  ...iosType("footnote"),
                  color: isOn ? IOS.color.label : IOS.color.secondaryLabel,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {importStepLabel(n)}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 2,
                  minWidth: 12,
                  margin: "0 8px",
                  background: n < current ? IOS.color.green : IOS.gray.g5,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

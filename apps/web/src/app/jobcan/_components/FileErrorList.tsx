"use client";

import { describeImportReason } from "@management/shift-management/ui";
import type { JobcanImportFileError } from "@management/shift-management";
import type { ConversionError } from "../_lib/import-client";
import { IOS, iosType } from "../_lib/tokens";
import { IosCallout } from "./ios";

interface FileErrorListProps {
  fileErrors: JobcanImportFileError[];
  conversionErrors: ConversionError[];
}

/** 取り込めなかったファイル(fileErrors + conversionErrors)の一覧。reason は日本語化。 */
export function FileErrorList({ fileErrors, conversionErrors }: FileErrorListProps) {
  const total = fileErrors.length + conversionErrors.length;
  if (total === 0) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <h3
        style={{
          color: IOS.color.redText,
          margin: "0 0 8px",
          padding: "0 4px",
          ...iosType("headline"),
        }}
      >
        取り込めなかったファイル({total}件)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {fileErrors.map((error, index) => (
          <IosCallout key={`fe-${error.fileName}-${index}`} tone="danger" title={error.fileName}>
            <div>{describeImportReason(error.reason)}</div>
            {error.message && (
              <div style={{ color: IOS.color.secondaryLabel, marginTop: 2 }}>
                {error.message}
              </div>
            )}
          </IosCallout>
        ))}
        {conversionErrors.map((error, index) => (
          <IosCallout key={`ce-${error.fileName}-${index}`} tone="danger" title={error.fileName}>
            <div>{describeImportReason("conversion_error")}</div>
            {error.message && (
              <div style={{ color: IOS.color.secondaryLabel, marginTop: 2 }}>
                {error.message}
              </div>
            )}
          </IosCallout>
        ))}
      </div>
    </section>
  );
}

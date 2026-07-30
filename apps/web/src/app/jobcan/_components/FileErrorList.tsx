"use client";

import { describeImportReason } from "@management/shift-management/ui";
import type { JobcanImportFileError } from "@management/shift-management";
import type { ConversionError } from "../_lib/import-client";
import { COLORS } from "../_lib/tokens";

interface FileErrorListProps {
  fileErrors: JobcanImportFileError[];
  conversionErrors: ConversionError[];
}

/** 取り込めなかったファイル(fileErrors + conversionErrors)の一覧。reason は日本語化。 */
export function FileErrorList({ fileErrors, conversionErrors }: FileErrorListProps) {
  const total = fileErrors.length + conversionErrors.length;
  if (total === 0) return null;

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <h3 style={{ color: COLORS.danger, marginBottom: ".5rem" }}>
        取り込めなかったファイル({total}件)
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {fileErrors.map((error, index) => (
          <li
            key={`fe-${error.fileName}-${index}`}
            style={{
              padding: ".5rem .8rem",
              border: `1px solid ${COLORS.dangerBorder}`,
              background: COLORS.dangerBg,
              borderRadius: 4,
              marginBottom: ".3rem",
            }}
          >
            <strong>{error.fileName}</strong>
            <div style={{ color: COLORS.danger }}>
              {describeImportReason(error.reason)}
            </div>
            {error.message && (
              <div style={{ color: COLORS.muted, fontSize: ".9em" }}>
                {error.message}
              </div>
            )}
          </li>
        ))}
        {conversionErrors.map((error, index) => (
          <li
            key={`ce-${error.fileName}-${index}`}
            style={{
              padding: ".5rem .8rem",
              border: `1px solid ${COLORS.dangerBorder}`,
              background: COLORS.dangerBg,
              borderRadius: 4,
              marginBottom: ".3rem",
            }}
          >
            <strong>{error.fileName}</strong>
            <div style={{ color: COLORS.danger }}>
              {describeImportReason("conversion_error")}
            </div>
            {error.message && (
              <div style={{ color: COLORS.muted, fontSize: ".9em" }}>
                {error.message}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

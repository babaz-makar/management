"use client";

import { COLORS } from "../_lib/tokens";
import { formatBytes, totalSize, type ClientLimitWarning } from "../_lib/import-client";

interface FileDropZoneProps {
  files: File[];
  limitWarnings: ClientLimitWarning[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

/** ファイル選択 + 選択済み一覧(個別除去・合計サイズ・事前上限警告)。 */
export function FileDropZone({
  files,
  limitWarnings,
  disabled,
  onAdd,
  onRemove,
  onClear,
}: FileDropZoneProps) {
  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <label style={{ display: "inline-block", marginBottom: ".5rem" }}>
        <span style={{ marginRight: ".75rem" }}>ジョブカンの xlsx を選択(複数可)</span>
        <input
          type="file"
          multiple
          accept=".xlsx"
          disabled={disabled}
          onChange={(e) => {
            const selected = e.target.files ? Array.from(e.target.files) : [];
            if (selected.length > 0) onAdd(selected);
            // 同じファイルを再選択できるよう value をリセット。
            e.target.value = "";
          }}
        />
      </label>

      {files.length === 0 ? (
        <p style={{ color: COLORS.muted, marginTop: ".25rem" }}>
          まだファイルが選択されていません。
        </p>
      ) : (
        <div>
          <p style={{ margin: ".25rem 0", color: COLORS.muted }}>
            {files.length}件 / 合計 {formatBytes(totalSize(files))}
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              style={{ marginLeft: "1rem" }}
            >
              すべて外す
            </button>
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: ".4rem .6rem",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  marginBottom: ".3rem",
                  background: COLORS.surface,
                }}
              >
                <span>
                  {file.name}
                  <span style={{ color: COLORS.muted, marginLeft: ".5rem" }}>
                    {formatBytes(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                  aria-label={`${file.name} を外す`}
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {limitWarnings.length > 0 && (
        <ul
          style={{
            marginTop: ".75rem",
            padding: ".6rem .9rem",
            color: COLORS.warning,
            background: COLORS.warningBg,
            border: `1px solid ${COLORS.warningBorder}`,
            borderRadius: 4,
          }}
        >
          {limitWarnings.map((warning) => (
            <li key={warning.kind}>{warning.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

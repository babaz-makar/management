"use client";

import { IOS, iosButtonColors, iosType } from "../_lib/tokens";
import { IosCallout } from "./ios";
import { IosCard, IosEmpty } from "./ios";
import { GroupedList, ListRow } from "./ios";
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
  // tinted 青のラベルで素の file input を隠し、機能(複数選択・再選択)は据え置く。
  const tinted = iosButtonColors("tinted", disabled ? "disabled" : "default");

  return (
    <IosCard style={{ marginBottom: 24 }} padding={16}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: IOS.metrics.controlHeight,
          padding: "0 18px",
          borderRadius: IOS.metrics.radiusCard,
          background: tinted.background,
          color: tinted.color,
          cursor: disabled ? "not-allowed" : "pointer",
          ...iosType("headline"),
        }}
      >
        ジョブカンの xlsx を選択(複数可)
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
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        />
      </label>

      {files.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <IosEmpty
            icon={<span>&#9633;</span>}
            title="ファイル未選択"
            description="まだファイルが選択されていません。"
          />
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              color: IOS.color.secondaryLabel,
              ...iosType("subhead"),
            }}
          >
            <span>
              {files.length}件 / 合計 {formatBytes(totalSize(files))}
            </span>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              style={{
                border: "none",
                background: "transparent",
                color: disabled ? IOS.gray.g1 : IOS.color.blue,
                cursor: disabled ? "not-allowed" : "pointer",
                padding: "4px 2px",
                ...iosType("subhead"),
              }}
            >
              すべて外す
            </button>
          </div>
          <GroupedList>
            {files.map((file, index) => (
              <ListRow
                key={`${file.name}-${index}`}
                title={file.name}
                subtitle={formatBytes(file.size)}
                last={index === files.length - 1}
                detail={
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    disabled={disabled}
                    aria-label={`${file.name} を外す`}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: disabled ? IOS.gray.g1 : IOS.color.redText,
                      cursor: disabled ? "not-allowed" : "pointer",
                      padding: "4px 2px",
                      ...iosType("subhead"),
                    }}
                  >
                    外す
                  </button>
                }
              />
            ))}
          </GroupedList>
        </div>
      )}

      {limitWarnings.length > 0 && (
        <IosCallout tone="warning" style={{ marginTop: 12 }}>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {limitWarnings.map((warning) => (
              <li key={warning.kind}>{warning.message}</li>
            ))}
          </ul>
        </IosCallout>
      )}
    </IosCard>
  );
}

"use client";

import { IOS, iosButtonColors, iosType } from "../_lib/tokens";
import { GroupedList, IosCallout, IosCard, IosEmpty, IosIcon, ListRow } from "./ios";
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
  // filled 濃青の主ボタンに格上げ(素の file input はラベルで隠し、複数選択・再選択は据え置き)。
  const filled = iosButtonColors("filled", disabled ? "disabled" : "default");

  return (
    <IosCard style={{ marginBottom: 24 }} padding={16}>
      <label
        style={{
          ...iosType("headline"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: IOS.metrics.buttonPrimaryHeight,
          width: "100%",
          padding: "0 18px",
          borderRadius: IOS.metrics.radiusCard,
          background: filled.background,
          color: filled.color,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <IosIcon name="file" size={18} />
        ジョブカンのファイルを選ぶ(複数OK)
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
            icon={<IosIcon name="tray" size={38} />}
            title="まだファイルを選んでいません"
            description="ジョブカンからダウンロードした xlsx を選んでください。"
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

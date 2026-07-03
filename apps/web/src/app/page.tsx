export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "3rem 1.5rem",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: ".25rem" }}>management</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        ツール開発用のプレビューホストです。各ツールは <code>packages/&#123;ツール名&#125;</code> に自己完結して作り、
        本アプリへはフォルダごとコピーして結合します。
      </p>
      <p style={{ color: "#666" }}>
        自分のツールをここで確認するには、<code>src/app/page.tsx</code> でそのツールを import し、
        <code>next.config.ts</code> の <code>transpilePackages</code> にパッケージ名を追加してください。
      </p>
    </main>
  );
}

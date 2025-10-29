function SolomonLanding() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 grid place-items-center shadow-sm">
              <span className="font-bold text-white text-lg">S</span>
            </div>
            <div className="leading-tight">
              <p className="font-semibold">ソロモンシステムズ</p>
              <p className="text-xs text-slate-500">クラウド×現場改善</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
　　　　　　<a href="#roadmap" className="hover:text-blue-600">ロードマップ</a>
　　　　　　<a href="#login" className="hover:text-blue-600">ログイン（準備中）</a>         
            <a href="#services" className="hover:text-blue-600">サービス</a>
            <a href="#features" className="hover:text-blue-600">特長</a>
            <a href="#pricing" className="hover:text-blue-600">料金</a>
            <a href="#faq" className="hover:text-blue-600">FAQ</a>
            <a href="#contact" className="hover:text-blue-600">お問い合わせ</a>
          </nav>
          <a href="#contact" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white shadow hover:bg-blue-700 transition">
            無料相談
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-sky-50 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              現場の「照合」と「棚卸」を、
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-400">かんたん・正確・素早く</span>
            </h1>
            <p className="mt-6 text-base md:text-lg text-slate-600">
              キントーン連携のクラウドサービスで、QRコードの読み取りから一致判定、履歴記録、在庫集計までを一気通貫。モバイルにも対応し、作業負荷とミスを減らします。
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a href="#services" className="rounded-xl px-5 py-3 text-sm font-medium bg-blue-600 text-white shadow hover:bg-blue-700 transition">サービスを見る</a>
              <a href="#contact" className="rounded-xl px-5 py-3 text-sm font-medium border border-slate-300 hover:bg-slate-50 transition">デモ相談する</a>
            </div>
            <div className="mt-6 text-xs text-slate-500">
              ※ 検品工程や出荷前確認、棚卸カウントに最適です。
            </div>
          </div>
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl border border-slate-200 shadow-sm bg-white p-4">
              <div className="h-full w-full grid grid-rows-6 gap-3">
                <div className="row-span-1 rounded-lg bg-slate-100 flex items-center justify-between px-4">
                  <span className="text-sm font-medium">照合ジョブ #2025-10-01</span>
                  <span className="text-xs text-slate-500">kintone連携</span>
                </div>
                <div className="row-span-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">スキャン① 製品</p>
                    <div className="mt-2 h-24 rounded bg-slate-100 grid place-items-center text-slate-400 text-xs">カメラプレビュー</div>
                    <div className="mt-2 text-xs">製品名・ロット・製造日・サイズ</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">スキャン② ラベル</p>
                    <div className="mt-2 h-24 rounded bg-slate-100 grid place-items-center text-slate-400 text-xs">カメラプレビュー</div>
                    <div className="mt-2 text-xs">箱ラベルの一致確認</div>
                  </div>
                </div>
                <div className="row-span-2 grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                    <p className="font-medium text-emerald-700">一致</p>
                    <p className="mt-1 text-emerald-700">OK: 24件</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="font-medium text-amber-700">注意</p>
                    <p className="mt-1 text-amber-700">要確認: 2件</p>
                  </div>
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
                    <p className="font-medium text-rose-700">不一致</p>
                    <p className="mt-1 text-rose-700">NG: 1件</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">UIイメージ（実機とは異なる場合があります）</p>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">提供サービス</h2>
        <p className="mt-3 text-slate-600">現場の主要ユースケースに合わせた2つのクラウドアプリを提供します。</p>
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="text-sm font-semibold text-blue-600">照合</div>
            <h3 className="mt-1 text-xl font-semibold">SHO-GO（仮称）</h3>
            <p className="mt-2 text-slate-600">
              製品→ラベルの固定スキャン順で、QRに含まれる製品名・ロット・製造日・サイズを照合。合否判定と履歴記録を自動化し、作業者IDも保存します。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 list-disc list-inside">
              <li>キントーンのフィールド照合に対応</li>
              <li>スマホ/QRリーダー利用OK（モバイル対応）</li>
              <li>スキャン順の制御と作業ガイド</li>
              <li>結果はマイページで可視化・CSV出力</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="text-sm font-semibold text-blue-600">棚卸・在庫</div>
            <h3 className="mt-1 text-xl font-semibold">TANA-OROSHI（仮称）</h3>
            <p className="mt-2 text-slate-600">
              レコードごとに最大15項目まで読み取り条件を設定。合致したスキャンを合格とし、在庫集計や差異分析を効率化します。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700 list-disc list-inside">
              <li>柔軟な条件設定（ソロモンのマイページで編集）</li>
              <li>棚卸の進捗ダッシュボード</li>
              <li>履歴とユーザー操作ログを自動保存</li>
              <li>キントーン連携でマスタ一元化</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-slate-50 border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">ソロモンの特長</h2>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            {[
              {title: 'キントーン親和性', desc: '既存アプリのフィールドと照合。運用を変えずに拡張できます。'},
              {title: '現場ファーストUI', desc: '誤操作を減らす導線設計と大きなボタン、明快な判定表示。'},
              {title: 'モバイル最適化', desc: 'スマホ/タブレットでの片手操作とQR高精度スキャンに配慮。'},
              {title: '履歴とトレーサビリティ', desc: '誰が・いつ・何をスキャンしたかを自動で残します。'},
              {title: '柔軟な条件設定', desc: '最大15項目まで条件化。SKU増にもスケールします。'},
              {title: '導入とサポート', desc: '要件整理から設定、教育まで伴走支援します。'},
            ].map((f) => (
              <div key={f.title} className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-blue-600/10 grid place-items-center">
                  <span className="text-blue-700 text-sm">★</span>
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">料金（例）</h2>
        <p className="mt-3 text-slate-600">要件に応じて最適なプランをご提案します。以下は一例です。</p>
        <div className="mt-8 grid md:grid-cols-3 gap-6">
          {[{
            name: 'スターター', price: '¥29,800/月〜', pts: ['単一拠点', '基本照合/棚卸', 'メールサポート']
          },{
            name: 'スタンダード', price: '¥79,800/月〜', pts: ['複数拠点', 'ダッシュボード', '優先サポート']
          },{
            name: 'エンタープライズ', price: '個別見積', pts: ['要件定義〜導入支援', '権限/監査ログ', 'SLA対応']
          }].map((p) => (
            <div key={p.name} className="rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <div className="mt-2 text-2xl font-bold">{p.price}</div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700 list-disc list-inside flex-1">
                {p.pts.map(pt => <li key={pt}>{pt}</li>)}
              </ul>
              <a href="#contact" className="mt-6 inline-flex justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition">相談する</a>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-slate-50 border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl md:text-3xl font-bold">よくある質問</h2>
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            {[{
              q: 'キントーン以外のシステムとも連携できますか？', a: 'WebhookやCSVを介した連携に対応予定です。要件に応じて個別にご提案します。'
            },{
              q: '端末やQRリーダーの指定はありますか？', a: '一般的なスマートフォンやUSB/Bluetooth QRリーダーで動作するよう設計しています。'
            },{
              q: '現場教育はサポートしてもらえますか？', a: '導入時のトレーニングや操作マニュアルの整備を支援します。'
            },{
              q: '導入までの期間はどれくらいですか？', a: '要件定義〜初期設定で数週間程度が目安です（案件規模により変動）。'
            }].map(item => (
              <div key={item.q} className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
                <p className="font-semibold">Q. {item.q}</p>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      {/* Member (準備中) */}
<section id="login" className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
  <h2 className="text-2xl md:text-3xl font-bold">会員ページ（準備中）</h2>
  <p className="mt-3 text-slate-600">
    ここでは将来的に「kintone接続の登録」「アプリ一覧」「JSの生成・配布URLの発行」を提供します。
  </p>

  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
    <h3 className="font-semibold">MVPで先にできること</h3>
    <ul className="mt-2 list-disc list-inside text-sm text-slate-700 space-y-1">
      <li>1レコード → A4 PDF の差し込み出力（kintoneボタン連携）</li>
      <li>アプリごとの設定を保存し、JSを生成（配布URLを固定化）</li>
      <li>発行ログの保存（だれが・いつ・どれを出力）</li>
    </ul>
    <p className="mt-4 text-sm text-slate-600">
      会員機能が公開されたら、メールでご案内します。事前登録はこちらから。
    </p>
    <div className="mt-4">
      <a
        href="#contact"
        className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-medium border border-slate-300 hover:bg-white bg-slate-100"
      >
        事前登録する（問い合わせフォームへ）
      </a>
    </div>
  </div>
</section>

      <section id="contact" className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">お問い合わせ</h2>
        <p className="mt-3 text-slate-600">要件の整理やデモのご相談はこちらから。1営業日以内にご連絡します。</p>

        {/* Google Form embed */}
        <div className="mt-6">
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <iframe
              src="https://docs.google.com/forms/d/e/1FAIpQLSdEtR8mywUXsIJ1oH4rZSIVXhsx67hFnhQ2C4v5fNwm73pq0Q/viewform?embedded=true"
              width="640"
              height="1598"
              frameBorder="0"
              marginHeight="0"
              marginWidth="0"
              title="お問い合わせフォーム"
            >
              読み込んでいます…
            </iframe>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">© 2025 合同会社ソロモンシステムズ</p>
          <div className="flex items-center gap-6 text-sm">
            <a href="#" className="hover:text-blue-600">プライバシー</a>
            <a href="#" className="hover:text-blue-600">利用規約</a>
            <a href="#contact" className="hover:text-blue-600">お問い合わせ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SolomonLanding />);




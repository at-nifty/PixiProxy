// contentTransformer.js

const cheerio = require('cheerio');
const sharp = require('sharp');
const iconv = require('iconv-lite');
// PostCSS関連 (必要に応じてインストール: npm install postcss cssnano)
// const postcss = require('postcss');
// const cssnano = require('cssnano');

async function transformHtml(htmlContent) {
    const $ = cheerio.load(htmlContent);

    // 1. スクリプトタグの削除または無効化
    $('script').remove(); // JavaScriptを完全に削除
    // $('script').attr('type', 'text/disabled'); // 無効化する場合

    // 2. スタイルタグのインライン化または簡素化 (簡易的な例)
    $('style').each((i, el) => {
        const cssContent = $(el).html();
        // ここでCSS変換ロジックを呼び出すか、簡易的な変換を行う
        const transformedCss = transformCss(cssContent); // transformCss関数を呼び出す
        $(el).html(transformedCss); // 変換したCSSに戻す
    });

    // 3. リンクのパス変換 (相対パスから絶対パスへの変換など)
    // DreamcastブラウザのベースURL解釈が不完全な場合に対応
    $('a[href], link[href], img[src]').each((i, el) => {
        let href = $(el).attr('href') || $(el).attr('src');
        if (href && !href.startsWith('http')) {
            // 例: 相対パスを絶対パスに変換 (プロキシサーバーの処理でURLを解決する必要がある)
            // これは複雑になるため、最初はスキップしても良い
            // console.warn(`Relative path found: ${href}. Absolute path conversion not implemented.`);
        }
    });

    // 4. HTML5固有のタグの削除またはダウングレード
    $('video, audio, canvas, svg, nav, article, section, header, footer').each((i, el) => {
        // 例: videoタグを削除し、代わりに静止画リンクを挿入
        if ($(el).is('video')) {
            const poster = $(el).attr('poster');
            if (poster) {
                $(el).replaceWith(`<img src="${poster}" alt="Video thumbnail">`);
            } else {
                $(el).remove();
            }
        } else {
            $(el).contents().unwrap(); // 子要素は残し、親タグを削除
        }
    });

    // 5. 不要な属性の削除 (例: data-*, aria-*)
    $('*').each((i, el) => {
        Object.keys(el.attribs).forEach(attr => {
            if (attr.startsWith('data-') || attr.startsWith('aria-')) {
                $(el).removeAttr(attr);
            }
        });
    });

    // 6. 画像のURL書き換え（プロキシ経由で画像を取得させるため）
    // imgタグのsrcをプロキシサーバー経由のURLに書き換える
    // 例: <img src="http://example.com/image.jpg"> -> <img src="http://proxy-ip:8080/proxy_image?url=http://example.com/image.jpg">
    $('img[src]').each((i, el) => {
        const originalSrc = $(el).attr('src');
        if (originalSrc) {
            // ここでプロキシサーバーのIPアドレスとポートを適切に設定する
            const proxiedSrc = `/proxy_image?url=${encodeURIComponent(originalSrc)}`;
            $(el).attr('src', proxiedSrc);
        }
    });
    // Linkタグのfaviconも同様に変換する
    $('link[rel="icon"], link[rel="shortcut icon"]').each((i, el) => {
        const originalHref = $(el).attr('href');
        if (originalHref) {
            const proxiedHref = `/proxy_image?url=${encodeURIComponent(originalHref)}`;
            $(el).attr('href', proxiedHref);
        }
    });

    return $.html();
}

async function transformCss(cssContent) {
    // PostCSSを使ってより高度な変換を行うことも可能
    // const result = await postcss([
    //     // 例: 古いブラウザでサポートされないCSSプロパティを削除するカスタムプラグイン
    //     // postcss-discard-unused, postcss-preset-env (IEサポート指定) など
    // ]).process(cssContent, { from: undefined });
    // return result.css;

    // 簡易的なCSS最適化 (RegExpなどを用いる)
    let transformedCss = cssContent;
    // 不要なコメントを削除
    transformedCss = transformedCss.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '');
    // 不要な空白文字の削除 (厳密なパースではないので注意)
    transformedCss = transformedCss.replace(/\s*([{};,:])\s*/g, '$1');
    transformedCss = transformedCss.replace(/;\s*}/g, '}');

    // `@media` クエリなど、レガシーブラウザが解釈できないものを削除または無視
    transformedCss = transformedCss.replace(/@media[^\{]*\{[\s\S]*?\}/g, '');

    // CSS変数 (--var-name) の削除
    transformedCss = transformedCss.replace(/var\(--[a-zA-Z0-9-]+\)/g, 'initial'); // または適当な代替値に

    // Flexbox, Gridなどのモダンなレイアウトプロパティの削除（レイアウトが崩れる可能性大）
    transformedCss = transformedCss.replace(/(display:\s*(flex|grid|inline-flex|inline-grid);)/g, '');
    transformedCss = transformedCss.replace(/(align-items|justify-content|gap|grid-template-columns|grid-row-gap|flex-direction):[^;]*;/g, '');

    return transformedCss;
}

async function transformImage(imageBuffer, originalContentType) {
    // sharp を使って画像最適化
    // JPEGに変換し、品質を落とす
    return await sharp(imageBuffer)
        .jpeg({ quality: 50 }) // 品質50%に圧縮
        .toBuffer();
    // 他にもリサイズなど、必要に応じて追加
    // .resize(640, 480, { fit: 'inside' }) // 最大幅640px, 高さ480pxにリサイズ
}

module.exports = {
    transformHtml,
    transformCss,
    transformImage,
};
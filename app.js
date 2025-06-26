// app.js (メインファイル)

const http = require('http');
const https = require('https');
const url = require('url');
const cheerio = require('cheerio'); // HTML解析用
const sharp = require('sharp');     // 画像最適化用
const iconv = require('iconv-lite'); // 文字コード変換用

// 後で独自のHTML/CSS/画像変換モジュールとして切り出す
const contentTransformer = require('./contentTransformer'); 

const PROXY_PORT = 8080; // ドリームキャストが接続するプロキシポート

const server = http.createServer((clientReq, clientRes) => {
    const parsedUrl = url.parse(clientReq.url);
    const targetUrl = parsedUrl.href; // クライアントがリクエストしたURL

    console.log(`[Proxy Request] ${clientReq.method} ${targetUrl}`);

    // HTTPSサイトへのリクエストを処理
    const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.protocol === 'https:' ? 443 : 80,
        path: parsedUrl.path,
        method: clientReq.method,
        headers: clientReq.headers, // クライアントからのヘッダをそのまま転送 (一部調整が必要な場合あり)
        rejectUnauthorized: false // 自己署名証明書などを許可するため。本番運用では注意が必要
    };

    // HTTPSリクエストの場合、httpsモジュールを使用
    const backendRequestModule = parsedUrl.protocol === 'https:' ? https : http;

    const proxyReq = backendRequestModule.request(requestOptions, (proxyRes) => {
        let rawData = [];
        proxyRes.on('data', (chunk) => {
            rawData.push(chunk);
        });

        proxyRes.on('end', async () => {
            const buffer = Buffer.concat(rawData);
            const contentType = proxyRes.headers['content-type'] || '';

            // レスポンスヘッダをクライアントに転送 (一部調整)
            const clientResponseHeaders = { ...proxyRes.headers };
            delete clientResponseHeaders['content-encoding']; // 圧縮解除後に再圧縮しないため

            // Content-Typeに応じた変換処理
            if (contentType.includes('text/html')) {
                // HTML変換
                const originalHtml = iconv.decode(buffer, 'utf-8'); // UTF-8としてデコード (現代のサイトはほとんどUTF-8)
                const transformedHtml = await contentTransformer.transformHtml(originalHtml);
                const encodedHtml = iconv.encode(transformedHtml, 'Shift_JIS'); // Shift_JISに変換して返す

                clientResponseHeaders['content-type'] = 'text/html; charset=Shift_JIS';
                clientResponseHeaders['content-length'] = Buffer.byteLength(encodedHtml);

                clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                clientRes.end(encodedHtml);
            } else if (contentType.includes('text/css')) {
                // CSS変換
                const originalCss = iconv.decode(buffer, 'utf-8');
                const transformedCss = await contentTransformer.transformCss(originalCss);
                const encodedCss = iconv.encode(transformedCss, 'Shift_JIS'); // 必要ならShift_JISに変換

                clientResponseHeaders['content-type'] = 'text/css; charset=Shift_JIS';
                clientResponseHeaders['content-length'] = Buffer.byteLength(encodedCss);

                clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                clientRes.end(encodedCss);
            } else if (contentType.includes('image/')) {
                // 画像変換
                try {
                    const transformedImageBuffer = await contentTransformer.transformImage(buffer, contentType);
                    clientResponseHeaders['content-type'] = 'image/jpeg'; // JPEGに変換したとして固定
                    clientResponseHeaders['content-length'] = Buffer.byteLength(transformedImageBuffer);
                    
                    clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                    clientRes.end(transformedImageBuffer);
                } catch (imgErr) {
                    console.error(`[Image Transformation Error] ${imgErr}`);
                    // 変換失敗時は元の画像をそのまま返すか、エラー画像を返す
                    clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                    clientRes.end(buffer);
                }
            } else if (contentType.includes('application/javascript') || contentType.includes('text/javascript')) {
                // JavaScriptは基本的に無視または削除
                clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                clientRes.end(''); // 空のレスポンスを返す
            } else {
                // その他のコンテンツはそのまま転送
                clientRes.writeHead(proxyRes.statusCode, clientResponseHeaders);
                clientRes.end(buffer);
            }
        });
    });

    proxyReq.on('error', (err) => {
        console.error(`[Proxy Request Error] ${err.message}`);
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end('Bad Gateway or Proxy Error.');
    });

    // クライアントからのリクエストボディを転送 (POSTなど)
    clientReq.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
    console.log(`Proxy server listening on port ${PROXY_PORT}`);
    console.log(`Set your Dreamcast browser proxy to: [Ubuntu CT IP Address]:${PROXY_PORT}`);
});
const express = require('express');
const axios = require('axios');

// --- 配置区 ---
const EMBY_SERVER_URL = 'http://ipv6.863325.xyz:9096';
const PORT = process.env.PORT || 3000; // Render 会通过 PORT 环境变量告诉我们应该监听哪个端口
// --- 配置区结束 ---

// 创建一个 Express 应用实例
const app = express();

// 使用 app.all('*', ...) 来捕获所有路径、所有方法的请求
app.all('*', async (req, res) => {
    if (!EMBY_SERVER_URL) {
        return res.status(500).json({ error: 'Server configuration error: EMBY_SERVER_URL is not set.' });
    }

    const targetUrl = `${EMBY_SERVER_URL}${req.url}`;
    console.log(`Forwarding request: ${req.method} ${targetUrl}`);

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: filterAndForwardHeaders(req.headers, new URL(targetUrl).host),
            // 注意：Express 会自动处理请求体，我们可以直接使用 req.body
            // 但为了确保二进制数据正确传递，我们直接从原始请求流中获取 body
            data: req, 
            responseType: 'arraybuffer',
            validateStatus: () => true,
            maxRedirects: 0,
            timeout: 9000,
        });

        // 将来自 Emby 服务器的响应头原样复制回客户端
        for (const [key, value] of Object.entries(response.headers)) {
            res.setHeader(key, value);
        }

        // 发送从 Emby 收到的状态码和数据
        res.status(response.status).send(response.data);

    } catch (error) {
        console.error('Proxy internal error:', error.message);
        const details = error.code === 'ECONNABORTED' 
            ? 'The request to the upstream server timed out.' 
            : 'The proxy server encountered an error while trying to connect to the upstream Emby server.';
        
        res.status(502).json({ 
            error: 'Bad Gateway', 
            details: details 
        });
    }
});

// 启动服务器，开始监听指定的端口
app.listen(PORT, () => {
    console.log(`Emby proxy server is running on port ${PORT}`);
});


/**
 * 过滤并转发请求头
 */
function filterAndForwardHeaders(originalHeaders, targetHost) {
    const headers = { ...originalHeaders };
    headers.host = targetHost;
    // Render 平台添加的头信息通常以 'x-render-' 开头
    const headersToRemove = [
        'x-forwarded-for',
        'x-real-ip',
        'connection',
        'x-render-instance-id',
        'x-render-origin-server'
    ];
    headersToRemove.forEach(h => delete headers[h]);
    return headers;
}
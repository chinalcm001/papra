# Papra Receipt Assistant MVP

一个零依赖的轻量 sidecar，为 Papra 增加“中文聊天式找小票”。它不改 Papra 的存储、OCR 或数据库，只通过 Papra Public API 搜索文档，因此方便升级上游版本。

## MVP 功能

- 中文聊天式搜索，例如：`帮我找去年在 MediaMarkt 买的 Rowenta 吸尘器小票`
- 常见中文商品名自动扩展为西班牙语关键词
- 中文商店别名转换（宜家→IKEA、家乐福→Carrefour 等）
- “去年 / 前年 / 今年”自动转换成年份关键词
- 保留品牌、型号、年份等原始拉丁字符关键词
- 调用 Papra 全文搜索 API
- 展示匹配文档、OCR 摘要、标签和日期
- 一键打开 Papra 中保存的原始小票图片/PDF
- API Token 只保存在服务端环境变量，不暴露到浏览器
- 内置演示模式，不连接 Papra 也能先看效果

## 为什么第一版做成 sidecar

Papra 的核心优势是稳定的文件保存、OCR 和全文搜索。第一版刻意不修改 Papra 核心代码，减少升级冲突。如果这个交互验证好用，再把组件嵌入 Papra 主界面。

## 先看演示

```bash
PAPRA_DEMO=true node server.mjs
```

打开：`http://localhost:8787`

## 连接你的 Papra

1. 在 Papra 创建 API Token，至少授予 `documents:read`。
2. 找到 Organization ID。
3. 复制环境变量：

```bash
cp .env.example .env
```

4. 设置：

```env
PAPRA_URL=https://你的-papra-地址
PAPRA_API_TOKEN=你的-token
PAPRA_ORGANIZATION_ID=你的-organization-id
```

5. 启动：

```bash
set -a
. ./.env
set +a
node server.mjs
```

或 Docker：

```bash
docker compose -f docker-compose.example.yml up -d --build
```

## 测试

无需安装依赖：

```bash
node --test test/search-query.test.mjs
```

## 当前限制

- 第一版使用本地词典，不调用 LLM，因此稳定、零成本，但词汇量有限。
- 主要优化中文→西班牙语小票检索；复杂自然语言理解后续可加入可选 AI provider。
- 演示模式的“查看原始小票”只返回说明文字；连接真实 Papra 后会代理原始文件。

## 下一版建议

- 可选 OpenAI / Gemini / Ollama 语义查询 provider
- 自动识别“去年夏天”“大约 300 欧”“在 MediaMarkt 买的”等条件
- 搜索历史与常用商品词自动学习
- 保修期标签和到期提醒
- 在 Papra 主界面增加小票助手入口

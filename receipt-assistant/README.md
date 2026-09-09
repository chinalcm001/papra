# Papra Ledger Assistant v0.2

一个轻量 sidecar：Papra 负责保存/OCR/检索原始票据，助手负责结构化记账、查询、汇总和中文聊天入口。两者解耦，方便继续跟随 Papra 上游升级。

## 已实现

- 文字自然语言记账：`昨天在 Mercadona 买菜 35.60欧`
- 语音输入：浏览器语音转文字后走同一记账流程
- 保存前确认/修改金额、日期、分类、商店和备注
- SQLite 独立账本，金额使用整数 cents 保存
- 查询最近记录：`最近10笔`
- 汇总：`这个月超市花了多少`、`今年餐饮支出多少`
- 按分类/商店统计收入、支出、结余
- 中文找西班牙小票：`找去年 MediaMarkt 买的 Rowenta 吸尘器小票`
- 中文商品词扩展为西班牙语 OCR 关键词
- 打开 Papra 保存的原始图片/PDF
- Papra API Token 只留在服务端

## 数据结构

- Papra：原始小票、PDF、OCR 文本、标签等
- Assistant SQLite：结构化交易记录
- `receipt_document_id` 字段已预留，后续可以把一笔账直接关联到 Papra 原始小票

## Portainer

仓库根目录已经增加 `docker-compose.yml`，可以从 Git 仓库直接部署。详见根目录 `PORTAINER.md`。

## 本地启动

```bash
PAPRA_DEMO=true LEDGER_DB_PATH=./data/ledger.sqlite node server.mjs
```

打开 `http://localhost:8787`。

记账本身不依赖 Papra API Token；只有“找原始小票”需要配置：

```env
PAPRA_URL=http://papra:1221
PAPRA_API_TOKEN=...
PAPRA_ORGANIZATION_ID=org_...
LEDGER_DB_PATH=/data/ledger.sqlite
DEFAULT_CURRENCY=EUR
TZ=Europe/Madrid
```

## 测试

```bash
node --test test/search-query.test.mjs test/ledger.test.mjs
```

## 当前限制

- v0.2 的意图识别和分类采用本地规则，稳定、零 API 成本，但复杂口语还不如 LLM。
- 语音输入使用浏览器 Web Speech API；不同浏览器支持程度不同，麦克风功能通常在 HTTPS/localhost 下最可靠。
- 当前“总结”是确定性的账本统计，不让模型自行计算金额。
- 还没有自动从一张新小票生成记账记录；这是下一阶段最值得做的功能。

## 下一步

1. 上传/拍照小票 → Papra OCR → 自动生成待确认账目
2. 一笔账关联原始 Papra 小票
3. 可选 OpenAI / Gemini / Ollama 作为复杂自然语言解析器，本地规则作为 fallback
4. 周/月消费总结与异常支出提示
5. 预算与分类趋势
6. 保修/售后提醒

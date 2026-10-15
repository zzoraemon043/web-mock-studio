# Web Mock Studio（繁體中文）

[English](README.md)

**在瀏覽器裡 Mock 任何 API。不需伺服器、不需安裝、不需帳號。**

Web Mock Studio 是一個純前端、零後端、離線優先的 API 逆向除錯與智慧 Mock 測試工作台，
為前端工程師、QA 與 API 開發者設計。所有運算與資料都留在你的瀏覽器中。

## 快速啟動

```bash
git clone https://github.com/zzoraemon043/web-mock-studio.git && cd web-mock-studio && npm install && npm run dev
```

開啟 `http://localhost:5173`。內建的範例工作區包含分頁列表、依 ID 查詢、樣板化登入與不穩定的健康檢查四條規則，
切到 Request Runner 按下 **Send** 即可看到被攔截的流量。

## 核心功能

| 模組 | 功能 | 說明 |
| --- | --- | --- |
| **攔截引擎** | Service Worker 攔截 | 直接在瀏覽器內攔截 `fetch` 與 `XMLHttpRequest`，無需 Node 本機伺服器；不支援時自動降級為頁內 `fetch` 攔截。 |
| | 路由比對 | `/users/:id`、選填參數 `/:id?`、OpenAPI 風格 `/users/{id}`、結尾萬用字元 `*`、綁定來源的完整 URL，以及 Query 條件（等於、存在、不存在、正規表示式）。最精確的規則優先。 |
| | 網路模擬 | Fast 4G、4G、3G、Slow 3G 延遲預設與抖動；依比例注入 400、401、403、404、429、500、502、503 或真實的網路斷線。 |
| **資料工廠** | Schema 逆向推導 | 貼上 JSON 範例即產生 JSON Schema 2020-12，包含 required、nullable、數值範圍、陣列長度、格式與列舉偵測。 |
| | 語義假資料 | 40 種輕量化產生器（姓名、信箱、頭像、地址、座標、UUID、時間戳、價格、文字），不依賴外部 faker 套件。 |
| | 可重現 | 以種子驅動的 PRNG，同一種子永遠產生相同的 10、50、100 筆資料。 |
| **請求器** | cURL 逆向解析 | 支援 DevTools「Copy as cURL」（bash 與 cmd）、`-d`、`--json`、`-F`、`-u`、`-b`、`-G`、`-I` 等，直接貼進網址列即可。 |
| | CORS 指引 | 區分 CORS、混合內容與主機無法連線，並提供離線替代方案；可一鍵把真實回應擷取為 Mock 規則。 |
| **工作區** | 持久化與匯出 | 儲存於 IndexedDB（退回 LocalStorage），整個工作區可匯出／匯入為單一 JSON 檔。 |
| | 程式碼產生 | 匯出為 MSW v2 handlers，或可直接貼入任何網頁的獨立攔截腳本。 |
| **體驗** | 快捷鍵 | `Cmd/Ctrl+K` 命令面板、`Alt+1~4` 切換工具、`Alt+N` 新增規則、`Alt+P` 暫停攔截；支援淺色、深色與跟隨系統。 |

架構說明、使用範例與部署方式請參閱 [英文版 README](README.md)。

## 授權

以 [MIT License](LICENSE) 釋出。

Copyright (c) 2026 zzoraemon043

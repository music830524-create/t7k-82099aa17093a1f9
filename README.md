# 多益單字練習 7000

手機用的多益單字練習網站：7,010 個單字分基礎／核心／進階／高階（780–900 分）四級，每 100 字一個單元。
模式有單字卡、英→中、中→英、拼字和單字表，另有錯題本（間隔複習 0/1/3/7/14/30 天）與搜尋。
每個單字都有兩個英文例句與繁體中文翻譯，出現在單字卡翻面、測驗對答案、單字表／搜尋／錯題本的「例句」；點例句可聽發音。

- 進度每答一題就存在瀏覽器 localStorage（`toeic7000_progress_v1`），可加入手機主畫面離線使用。
- 首頁「備份進度」可匯出／匯入進度碼。
- 例句放在 `ex/{級數}-{單元}.json`（每 100 字一檔，共 72 檔），用到時才載入，背景會慢慢抓齊並由 service worker 快取，離線也能看。
- 原始碼在 `dev/`（React + esbuild），`cd dev && npm ci && ./build.sh` 會重新產生 `app.js` 與 `sw.js`。

## 資料來源與授權

單字資料來自 [kknono668/toeic-vocab-tw](https://huggingface.co/datasets/kknono668/toeic-vocab-tw)（Hugging Face），採 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 授權；
本站對資料做了簡轉繁（OpenCC s2twp）、分級與縮短部分釋義，修改後的資料（`dev/src/data.ts`、打包進 `app.js`）同樣以 CC BY-SA 4.0 釋出。

### 例句

- 7,010 個單字 × 2 句 = 14,020 句，全部都有中文翻譯。
- **13,502 句（96.3%）** 取自同一個 kknono668/toeic-vocab-tw 資料集的 `examples` 欄位（CC BY-SA 4.0）。
  其中少數含簡體字的句子用 OpenCC 轉成台灣正體，另修了幾句中文裡夾雜未翻譯英文的翻譯。
- **518 句（3.7%，分布在 332 個單字）由本站自行撰寫**，用來取代資料集中有問題的句子：
  套版的假例句（例如 "The department implemented innovative X procedures…"）、句子裡根本沒有該單字、
  用成其他字或詞形（例如 coast 的例句其實是 cost、makeup 的例句是 made up）、或中文欄位錯誤。
  自寫的句子依照本站列出的中文釋義與詞性撰寫，完整清單見 [`dev/examples_generated.tsv`](dev/examples_generated.tsv)，
  同樣以 CC BY-SA 4.0 釋出。
- 例句檔 `ex/*.json` 為上述資料修改後的衍生作品，授權同為 CC BY-SA 4.0。

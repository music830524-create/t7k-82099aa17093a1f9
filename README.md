# 多益單字練習 7000

手機用的多益單字練習網站：7,010 個單字分基礎／核心／進階／高階（780–900 分）四級，每 100 字一個單元。
模式有單字卡、英→中、中→英、拼字和單字表，另有錯題本（間隔複習 0/1/3/7/14/30 天）與搜尋。

- 進度每答一題就存在瀏覽器 localStorage（`toeic7000_progress_v1`），可加入手機主畫面離線使用。
- 首頁「備份進度」可匯出／匯入進度碼。
- 原始碼在 `dev/`（React + esbuild），`cd dev && npm ci && ./build.sh` 會重新產生 `app.js` 與 `sw.js`。

## 資料來源與授權

單字資料來自 [kknono668/toeic-vocab-tw](https://huggingface.co/datasets/kknono668/toeic-vocab-tw)（Hugging Face），採 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 授權；
本站對資料做了簡轉繁（OpenCC s2twp）、分級與縮短部分釋義，修改後的資料（`dev/src/data.ts`、打包進 `app.js`）同樣以 CC BY-SA 4.0 釋出。

# 多益單字練習 7000

手機用的多益單字練習網站：7,010 個單字分基礎／核心／進階／高階（780–900 分）四級，每 100 字一個單元。
模式有單字卡、英→中、中→英、拼字和單字表，另有錯題本（間隔複習 0/1/3/7/14/30 天）與搜尋。
每個單字都有兩個英文例句與繁體中文翻譯，出現在單字卡翻面、測驗對答案、單字表／搜尋／錯題本的「例句」；點例句可聽發音。
每個單字旁顯示 KK 音標（單字卡、測驗對答案、單字表／搜尋／錯題本、例句面板）。

- 進度每答一題就存在瀏覽器 localStorage（`toeic7000_progress_v1`），可加入手機主畫面離線使用。
- 首頁「備份進度」可匯出／匯入進度碼。
- 例句放在 `ex/{級數}-{單元}.json`（每 100 字一檔，共 72 檔），用到時才載入，背景會慢慢抓齊並由 service worker 快取，離線也能看。
- 原始碼在 `dev/`（React + esbuild），`cd dev && npm ci && ./build.sh` 會重新產生 `app.js` 與 `sw.js`（esbuild 用 `--charset=utf8`，中文與音標符號不轉成 \u 跳脫，檔案較小）。

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

### KK 音標

- 來源：[edc026588/toeic-cards](https://github.com/edc026588/toeic-cards) 的 `vocab.json`（`k` 欄位）。該專案 README 載明資料以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 釋出，
  KK 音標由 [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict)（BSD 授權，條文見 [`dev/LICENSE-cmudict.txt`](dev/LICENSE-cmudict.txt)）轉換而來。
  （該 repo 本身沒有 LICENSE 檔，授權以其 README 的說明為準。）
- 依單字比對（不分大小寫、忽略空白／連字號／句點），7,010 字全部對得到；其中：
  - **6,621 字** 直接沿用來源；
  - **384 字** 由本站修正，清單與原因見 [`dev/kk_edits.tsv`](dev/kk_edits.tsv)：
    依本站列出的第一個詞性選讀音（例如 record 名詞 ˋrɛkɚd、use 動詞 juz、close 動詞 kloz）、縮寫改成逐字母讀法、
    把 CMU 斷音節時放錯的重音移回複合字分界（例如 bedroom ˋbɛdˏrum）、去掉主重音前單一音節上多餘的次重音（例如 increase）、動詞 over-/under-/out- 的重音等；
  - **5 個縮寫不顯示**（ave、attn、exp、apr、ett），因為讀法就是原字，不硬標。
  - 沒有任何一筆是本站自行從 CMUdict 推導的。
- 標記採台灣慣用的 ˋ（主重音）、ˏ（次重音），美式發音；修改後的音標（`dev/src/kk.ts`）同樣以 CC BY-SA 4.0 釋出。
- 注意：源自 CMUdict，部分弱讀以 ə 表示（KK 字典常寫 ɪ 或成節音 ḷ、ṇ，如 apple 顯示 ˋæpəl），一字多音只顯示一種。

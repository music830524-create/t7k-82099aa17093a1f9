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

## 例句查字與生字本

- 例句中的每個英文字都可以點：有虛線底線的字在 7,010 字庫中，點下去會跳出該字的音標、詞性、中文、級數單元與它自己的例句（可以再點，連續查），並可「加入不熟」（與單字卡「不熟」完全相同：進錯題本、排入間隔複習）、「去練習」跳到該單元。「◀ 返回」回到上一個字或原本的練習畫面，進度不會跑掉。
- 字形還原規則在 `dev/src/lookup.ts`：複數、過去式（-ed/-d/-ied、重複子音）、-ing、比較級、所有格、常見不規則變化，以及連字號的多字詞（follow-up、state-of-the-art…）。同一個字形可能對應多個字時會列出「也可能是」。
- 不在字庫的字可「加入生字本」，連同例句存在 `localStorage` 的 `toeic7000_extra_v1`（不影響 `toeic7000_progress_v1`），首頁可查看、發音、刪除。進度碼會一併包含生字本（欄位 `e`）；舊的進度碼沒有這個欄位，匯入時會保留目前的生字本。
- 聽例句：點例句前面的 🔊，或點中文翻譯/空白處。

## 首頁統計方塊與搜尋

- 首頁「學習進度」四個方塊都可以點：已認識 / 不熟 / 今天待複習 / 測驗正確率，各自開一個「單字卡・測驗・清單」畫面，只針對那一組字（測驗正確率＝曾答錯的字；還沒答過題時直接進測驗畫面）。清單每個字可點開看音標、中文、兩個例句，並可「加入不熟」「標為已認識」。
- 首頁最上面有搜尋欄（輸入後約 0.12 秒顯示結果）：英文開頭／片段、中文都可以，也可以打 approved 這類變化形；也會搜尋生字本。找不到時可「加入生字本」。
- 沒有新增任何儲存欄位，`toeic7000_progress_v1`、`toeic7000_extra_v1` 格式不變。

## 主題分類（身體部位、餐廳、家具…）

首頁「主題分類」列出 28 個生活場景的分類，每類 27–53 字，點進去是同一個「單字卡・測驗・清單」畫面（測驗的錯誤選項取自同一分類）。按「認識」「不熟」寫進同一份 `toeic7000_progress_v1`（以單字本身為 key，所以「apple」不管從哪裡標都是同一筆），不熟的字也會出現在首頁「不熟」與錯題本。首頁搜尋也找得到主題字（英文、中文都可以，並標示它屬於哪些主題）。

| 分類 | English | 字數 |
|---|---|---|
| 🧍 身體部位 | Body parts | 53 |
| 🍽️ 餐廳 | Restaurant | 42 |
| 🛋️ 家具 | Furniture | 36 |
| 🍳 廚房 | Kitchen | 37 |
| 👕 衣物 | Clothing | 40 |
| 🖇️ 辦公室 | Office | 37 |
| ✈️ 機場與旅行 | Airport & travel | 37 |
| 🏨 旅館 | Hotel | 33 |
| 🚌 交通工具 | Transportation | 37 |
| ⛅ 天氣 | Weather | 38 |
| 👨‍👩‍👧 家人親屬 | Family | 34 |
| 👷 職業 | Occupations | 44 |
| 🏥 醫院與健康 | Health & hospital | 38 |
| 🛍️ 購物 | Shopping | 33 |
| ⚽ 運動 | Sports | 40 |
| 🐶 動物 | Animals | 41 |
| 🍎 水果 | Fruits | 31 |
| 🥕 蔬菜 | Vegetables | 32 |
| 🎨 顏色 | Colors | 27 |
| 🏫 學校 | School | 31 |
| 😊 情緒 | Emotions | 30 |
| 🏠 房屋與房間 | House & rooms | 32 |
| 🍞 食物與飲料 | Food & drink | 44 |
| 🏔️ 自然與地形 | Nature & geography | 38 |
| 💰 銀行與金錢 | Banking & money | 31 |
| 💻 電腦與科技 | Computers & tech | 30 |
| 🔧 工具 | Tools | 27 |
| 🏙️ 城市地點 | Places in town | 34 |

共 1007 個分類成員，其中 **319 個字不在 7,010 字庫**（顯示為「主題單字」，查字時排在 7,010 字庫的結果之後），其餘沿用 7,010 字庫的單字。

### 資料來源與授權

- **找過的現成資料集**：GitHub 與網路上沒有找到「依主題分類、又附繁體中文與例句」且授權清楚可用的單一資料集。看過的有 Multi Linguis（CC BY-SA 3.0，授權版本與本站不同）、DictionaryData、KyleBing/english-vocabulary、CodingFriends 等，品質或授權不適合直接納入，所以**沒有直接複製任何一個**。
- **實際作法**：以 [English Wiktionary](https://en.wiktionary.org/) 的主題分類（如 Category:en:Body parts、en:Furniture，文字以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 釋出）當作分類與涵蓋範圍的參考，**由本站自行挑選**每類的常用字（`dev/topics/cats.py`）。沒有複製 Wiktionary 的條目文字。
- **本站自行撰寫**：319 個新字的繁體中文解釋、詞性與每字 2 個例句（含中文翻譯）（`dev/topics/nw/b*.tsv`，`ex/topics.json`）；另有 123 個「7,010 字庫已有、但在該主題下意思不同」的字（例如 body 的 head、heart；restaurant 的 host、special）另寫了該主題的中文解釋與例句（`dev/topics/nw/ov.tsv`），只在主題畫面使用，字庫原本的條目不變。
- **KK 音標**（319 個新字，`dev/src/topics.ts`）：104 字取自 edc026588/toeic-cards（CC BY-SA 4.0，同上）；194 字由本站用 CMU Pronouncing Dictionary（BSD）的音素轉成 KK（`dev/topics/kkconv.py`，拿同一轉換規則對照 edc 的 9,408 個字，完全相同的有 99.7%）；21 字（CMUdict 沒有的、或需要手動修正重音與複合字的，如 toothbrush、tornado、ice-cream）由本站手動標。因此這 319 字的音標有一部分是本站推導，與上面「沒有任何一筆是本站自行從 CMUdict 推導」那句只適用於 7,010 字庫。
- 以上衍生資料（主題字表、中文解釋、例句、音標）同樣以 CC BY-SA 4.0 釋出。
- 產生流程：`dev/topics/gen.py` 讀 `cats.py`、`nw/*.tsv`，輸出 `dev/src/topics.ts` 與 `ex/topics.json`（腳本內的路徑是作者環境的路徑，僅供參考；產出已提交在 repo）。
- 例句檔 `ex/topics.json`（約 76 KB）第一次需要時才下載，並與其他例句檔一樣由 service worker 快取，離線也能用。

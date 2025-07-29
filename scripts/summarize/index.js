require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/default.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Retry function with exponential backoff
async function retry(fn, retries = 5, delay = 30000) { // Increased default delay to 30 seconds
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            console.error(`Error occurred: ${error.message || error}`);
            if ((error.message && (
                error.message.includes('429 Too Many Requests') ||
                error.message.includes('500 Internal Server Error') ||
                error.message.includes('レスポンスが有効なJSON形式ではありません') ||
                error.message.includes('概要情報が不足しています') ||
                error.message.includes('タイムスタンプが2時間30分を超えるものが含まれています')
            )) && i < retries - 1) {
                console.warn(`Rate limit hit or invalid JSON response. Retrying in ${delay / 1000} seconds... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Re-throw other errors or if max retries reached
            }
        }
    }
}

async function generateSummary(videoId, videoDurationSeconds, videoTitle) {
    const formatExample = {
        "overview": {
            "summary": "配信の全体的な内容を200字程度で説明",
            "mood": "配信の雰囲気や配信者の感情を表す短い説明（例：「終始和やかな雰囲気」「感動的な場面が多い」など）"
        },
        "highlights": [
            {
                "title": "見どころのタイトル",
                "description": "その内容の詳細説明",
                "timestamp": "見どころの開始ポイント（動画の経過時間、形式は\"MM:SS\"）",
                "type": "トピックの種類（お知らせ/トーク/ゲーム/歌/リアクション等）"
            }
        ],
        "tags": ["配信内容に関連するタグ（例：雑談、ゲーム実況、歌枠等）"]
    };

    const promptTemplate = (clipStart, clipEnd, formatExample, videoTitle, existingSummary = null) => {
        let prompt = `# 指示内容
「${videoTitle}」というタイトルの動画を要約し、JSONオブジェクトとして出力する。

## 現在の動画の範囲:
- 開始時間: ${formatTimestamp(clipStart)}
- 終了時間: ${formatTimestamp(clipEnd)}
- 動画の長さ: 約${formatDuration(videoDurationSeconds)}分間

## 出力形式は以下の構造に厳密に従う:
\`\`\`
${JSON.stringify(formatExample, null, 2)}
\`\`\`

### ⚠️注意事項:
1. マークダウンやコードブロックは使用せず、純粋なJSONオブジェクトのみを出力する。
2. 全てのフィールドは必須である。
3. 出演者の名前が分からない場合は「配信者」と記載する。
4. 共演者（ゲスト）の名前が分からない場合は「ゲスト」と記載する。
5. "00:00"付近は配信開始時の待ち時間になるケースが多いため、配信者がしゃべりだしてから要約を開始する。
6. 概要(overviewのsummary)は200字程度で、配信の全体像が分かるように要約する。
7. 配信の種類や内容に応じて適切なタグを付与する。
8. 見どころ(highlights)は各範囲ごとに最低3以上、目安としては5分間隔で出来るだけ多く抽出する。
- データの順番は動画の内容に沿って時系列で並べる。
9. 見どころのタイムスタンプ(timestamp)は動画の開始からの経過時間を正確に記載する。
- 秒数があいまいな場合も秒の情報を省略せず、必ず"MM:SS"または"HH:MM:SS"形式で記載する。

### ❌許可されない出力形式:
#### 再生時間:
"timestamp": "MM:SS:00"  // 秒が真ん中に来ている
"timestamp": "HH:MM"  // 秒の情報がない

#### JSONの出力形式:
\`\`\`json
{...}
\`\`\`

### ✅正しい出力形式:
#### 再生時間:
"timestamp": "MM:SS"  // 時間が0の場合
"timestamp": "HH:MM:SS"  // 時間が1時間以上の場合

#### JSONの出力形式:
{
  "overview": {
      "summary": "...",
      "mood": "..."
  },
  "highlights": [...],
  "tags": [...]
}`;

        if (existingSummary) {
            prompt += `\n\n
## 既存の要約データ:
この要約データを更新・追記する形で、新しい期間の情報を追加する。
- overviewは全体を考慮して更新する。
- highlightsとtagsは既存の内容をそのまま残して、新しい情報を追加する。

### これまでの要約データ:
\`\`\`
${JSON.stringify(existingSummary, null, 2)}
\`\`\`
`;
        }

        return prompt;
    };

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const chunkSizeSeconds = 2400; // 40 minutes per chunk
    const adjustedVideoDurationSeconds = Math.max(0, videoDurationSeconds - 10); // Reduce duration by 10 seconds
    const maxChunks = Math.ceil(adjustedVideoDurationSeconds / chunkSizeSeconds); // Calculate max chunks based on adjusted duration
    let currentOffsetSeconds = 0;
    let chunkCount = 0;

    // Initial empty summary structure for the first chunk
    let currentSummary = {
        "overview": {
            "summary": "",
            "mood": "不明"
        },
        "highlights": [],
        "tags": []
    };

    while (true) {
        if (chunkCount >= maxChunks) {
            console.warn(`Max chunks (${maxChunks}) reached for video ${videoId}. Stopping summarization for this video.`);
            break;
        }

        const clipStartSeconds = currentOffsetSeconds;
        let clipEndSeconds = currentOffsetSeconds + chunkSizeSeconds;
        if (clipEndSeconds > adjustedVideoDurationSeconds) {
            clipEndSeconds = adjustedVideoDurationSeconds;
        }

        console.log(`Processing chunk: ${videoId} from ${clipStartSeconds}s to ${clipEndSeconds}s`);

        try {
            const chunkSummary = await retry(async () => {
                const result = await model.generateContent([
                    promptTemplate(clipStartSeconds, clipEndSeconds, formatExample, videoTitle, currentSummary),
                    {
                        fileData: {
                            fileUri: videoUrl,
                        },
                        videoMetadata: {
                            startOffset: { seconds: clipStartSeconds },
                            endOffset: { seconds: clipEndSeconds }
                        },
                    },
                ]);

                const response = await result.response;
                let text = response.text();
                console.log(`${videoId}: ${text}`);

                // マークダウンのコードブロックを除去
                text = text.replace(/```json|```/g, '').trim();
                if (!text.startsWith('{') || !text.endsWith('}')) {
                    throw new Error('レスポンスが有効なJSON形式ではありません');
                }
                const parsedSummary = JSON.parse(text);

                if (!parsedSummary.overview || !parsedSummary.overview.summary) {
                    throw new Error('概要情報が不足しています');
                }

                // タイムスタンプが2時間30分を超えるものが含まれている場合は再実行
                if (parsedSummary.highlights && parsedSummary.highlights.some(highlight => {
                    const [hours, minutes, seconds] = highlight.timestamp.split(':').map(Number);
                    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    return totalSeconds > 9000; // 2.5 hours in seconds
                })) {
                    throw new Error('タイムスタンプが2時間30分を超えるものが含まれています');
                }
                return parsedSummary;
            });
            if (!Array.isArray(chunkSummary.highlights)) { // Highlights can be empty
                chunkSummary.highlights = [];
            }
            if (!Array.isArray(chunkSummary.tags)) {
                chunkSummary.tags = [];
            }

            currentSummary.overview.summary = chunkSummary.overview.summary;
            currentSummary.overview.mood = chunkSummary.overview.mood;
            currentSummary.highlights.push(...chunkSummary.highlights.map(h => ({
                ...h,
                // Adjust timestamp to be relative to the start of the video, not the chunk
                timestamp: h.timestamp ? formatTimestamp(parseTimestampToSeconds(h.timestamp)) : 'タイムスタンプなし'
            })));
            // Deduplicate highlights based on title and timestamp
            currentSummary.highlights = Array.from(new Map(currentSummary.highlights.map(item => [`${item.title}-${item.timestamp}`, item])).values());
            chunkSummary.tags.forEach(tag => {
                if (!currentSummary.tags.includes(tag)) {
                    currentSummary.tags.push(tag);
                }
            });

            // Update overall mood from the first successful chunk
            if (currentSummary.overview.mood === "不明" && chunkSummary.overview.mood) {
                currentSummary.overview.mood = chunkSummary.overview.mood;
            }

            currentOffsetSeconds += chunkSizeSeconds;
            chunkCount++;
        } catch (error) {
            // Check for specific errors indicating end of video or invalid clip
            if (error.message && (
                error.message.includes('Invalid argument') ||
                error.message.includes('video duration') ||
                error.message.includes('too short')
            )) {
                console.log(`Reached end of video or invalid clip for ${videoId} at offset ${currentOffsetSeconds}s.`);
                break; // End of video
            } else if (error.message && (error.message.includes('No transcripts are available for this video') || error.message.includes('Could not find transcript for'))) {
                console.log(`要約可能な字幕が見つかりません: ${videoId}`);
                throw error; // Re-throw if no transcript
            } else {
                console.error(`Error processing chunk for ${videoId} at offset ${currentOffsetSeconds}s:`, error.message || error);
                throw error; // Re-throw to allow the retry mechanism to handle it
            }
        }
    }

    return currentSummary;
}

// Helper function to parse timestamp string (e.g., "0:30", "1:05:10") to seconds
function parseTimestampToSeconds(timestampStr) {
    if (typeof timestampStr !== 'string') {
        console.warn(`parseTimestampToSeconds received non-string input: ${timestampStr}. Returning 0.`);
        return 0;
    }
    const parts = timestampStr.split(':').map(Number);
    
    // Check if any part is NaN after conversion
    if (parts.some(isNaN)) {
        console.warn(`parseTimestampToSeconds received invalid number parts for: "${timestampStr}". Returning 0.`);
        return 0;
    }

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    console.warn(`parseTimestampToSeconds received unexpected timestamp format: "${timestampStr}". Returning 0.`);
    return 0; // Default to 0 if format is unexpected
}

// Helper function to format seconds back to "HH:MM:SS" or "MM:SS"
function formatTimestamp(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => num.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Helper function to format total seconds into a human-readable duration string
function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let durationStr = "";
    if (hours > 0) {
        durationStr += `${hours}時間`;
    }
    if (minutes > 0) {
        durationStr += `${minutes}分`;
    }
    if (seconds > 0 || durationStr === "") { // Include seconds if no hours/minutes, or if it's 0 seconds
        durationStr += `${seconds}秒`;
    }
    return durationStr.trim();
}

async function generateSummaries() {
    try {
        // アーカイブ情報を読み込み
        const archivePath = path.join(__dirname, '../../data/archives.json');
        const archives = JSON.parse(await fs.readFile(archivePath, 'utf8'));

        // すでに要約済みのデータを読み込み
        let existingSummaries = [];
        const summaryPath = path.join(__dirname, '../../src/data/summaries.json');
        try {
            existingSummaries = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
        } catch (e) {
            // ファイルが存在しない場合は無視
        }

        // 要約済みの動画IDを取得
        const summarizedIds = new Set(existingSummaries.map(s => s.videoId));
        const summaries = [...existingSummaries];
        const MAX_VIDEOS_TO_PROCESS = 10;
        let processedCount = 0;

        for (const archive of archives) {
            if (summarizedIds.has(archive.videoId)) continue;
            if (processedCount >= MAX_VIDEOS_TO_PROCESS) {
                console.log(`Processed ${MAX_VIDEOS_TO_PROCESS} videos. Stopping further summarization.`);
                break;
            }

            try {
                // Gemini APIを使用して動画を直接要約
                const summary = await generateSummary(archive.videoId, archive.duration, archive.title);
                
                // 要約データを配列に追加
                summaries.push({
                    videoId: archive.videoId,
                    title: archive.title,
                    streamer: archive.streamer,
                    date: archive.date,
                    thumbnailUrl: archive.thumbnailUrl,
                    overview: {
                        summary: summary.overview.summary,
                        mood: summary.overview.mood
                    },
                    duration: archive.duration,
                    highlights: summary.highlights,
                    tags: summary.tags,
                    lastUpdated: new Date().toISOString()
                });

                // summaries.jsonを更新
                await fs.writeFile(summaryPath, JSON.stringify(summaries, null, 2));
                
                console.log(`要約を生成しました: ${archive.videoId}`);
                processedCount++;
            } catch (error) {
                if (error.message && (error.message.includes('No transcripts are available for this video') || error.message.includes('Could not find transcript for'))) {
                    console.log(`要約可能な字幕が見つかりません: ${archive.videoId}`);
                } else if (error.message && error.message.includes('[403 Forbidden] The caller does not have permission')) {
                    console.error(`要約生成中に権限エラーが発生しました。次の動画にスキップします: ${archive.videoId}`, error.message || error);
                    continue; // Skip to the next video
                } else {
                    console.error(`要約生成中にエラー: ${archive.videoId}`, error.message || error);
                }
            }
        }

        console.log('要約処理を完了しました');

    } catch (error) {
        console.error('要約生成に失敗しました:', error);
        process.exit(1);
    }
}

generateSummaries();

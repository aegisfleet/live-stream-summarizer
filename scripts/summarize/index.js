require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

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

async function generateSummary(videoId, videoDurationSeconds, videoTitle, streamer, thumbnailUrl) {
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

    const promptTemplate = (clipStart, clipEnd, formatExample, videoTitle, streamer, existingSummary = null) => {
        let prompt = `# 指示内容
サムネイル画像から出演者やゲストなど動画の内容を把握し、動画の内容を要約してJSONオブジェクトを出力してください。

## 最重要事項
- 見どころの時間は最も重要な要素であり、正確な時間を記載する必要がある。
- 見どころの範囲に偏りが無いよう、動画の最初から最後までを時系列通りに要約する。

## 動画の情報:
- 動画タイトル: ${videoTitle}
- 配信者: ${streamer}

### 現在の解析範囲:
- 現在の開始時間: ${formatDuration(clipStart)}
- 現在の終了時間: ${formatDuration(clipEnd)}
- 動画の全体の長さ: ${formatDuration(videoDurationSeconds)}

## 出力形式は以下の構造に厳密に従う:
\`\`\`
${JSON.stringify(formatExample, null, 2)}
\`\`\`

### ⚠️注意事項:
1. マークダウンやコードブロックは使用せず、純粋なJSONオブジェクトのみを出力する。
2. 全てのフィールドは必須である。
3. 共演者（ゲスト）の名前が分からない場合は「ゲスト」と記載する。（共演者の名前は動画のタイトルやサムネイルに記載されていることが多い）
4. "00:00"付近は配信開始時の待ち時間になるケースが多いため、配信者がしゃべりだしてから要約を開始する。
5. 概要(overviewのsummary)は200字程度で、配信の全体像が分かるように要約する。
6. 配信の種類や内容に応じて適切なタグを付与する。
7. 見どころ(highlights)は視聴者が動画を見返す際のタイムラインとして機能するように、以下のルールに従って抽出する。
- 目安としては最長でも5分間隔で出来るだけ細かく抽出する。
- データの順番は動画の内容に沿って時系列で並べる。
- 動画は分割して解析しており、続きの動画があることを考慮する。
8. 見どころのタイムスタンプ(timestamp)は、その話題が最初に言及された瞬間の時間を動画の開始時点からの経過時間で正確に記載する。
- 秒数があいまいな場合も秒の情報を省略せず、必ず"MM:SS"または"HH:MM:SS"形式で記載する。

### ❌許可されない出力形式:
#### 再生時間:
"timestamp": "MM:SS:00"  // 秒が真ん中に来ている
"timestamp": "HH:MM"  // 秒の情報がない

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
}
`;

        if (existingSummary) {
            prompt += `
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
                const imageResponse = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });
                const imageBase64 = Buffer.from(imageResponse.data).toString('base64');

                const result = await model.generateContent([
                    promptTemplate(clipStartSeconds, clipEndSeconds, formatExample, videoTitle, streamer, currentSummary),
                    {
                        inlineData: {
                            data: imageBase64,
                            mimeType: 'image/jpeg',
                        },
                    },
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

async function translateSummary(summaryJp) {
    const translationPrompt = `
# Instruction
Translate the following Japanese JSON data into English.
- Keep the JSON structure exactly the same.
- Do not translate the "timestamp" and "type" fields within the "highlights" array.
- Translate the "summary" and "mood" in "overview".
- Translate "title" and "description" in each element of the "highlights" array.
- Translate each string in the "tags" array.

# Japanese JSON Data
\`\`\`json
${JSON.stringify(summaryJp, null, 2)}
\`\`\`

# Output Format
Provide only the translated JSON object, without any markdown or code blocks.
`;

    try {
        const result = await retry(async () => {
            const generationResult = await model.generateContent(translationPrompt);
            const response = await generationResult.response;
            let text = response.text();

            // Clean up the response
            text = text.replace(/```json|```/g, '').trim();
            if (!text.startsWith('{') || !text.endsWith('}')) {
                throw new Error('Translated response is not a valid JSON format.');
            }
            const translatedSummary = JSON.parse(text);
            return translatedSummary;
        });
        return result;

    } catch (error) {
        console.error('Error during translation:', error);
        throw new Error('Failed to translate summary.');
    }
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
                const summary = await generateSummary(archive.videoId, archive.duration, archive.title, archive.streamer, archive.thumbnailUrl);
                
                // 英語に翻訳
                console.log(`Translating summary for ${archive.videoId}...`);
                const summary_en = await translateSummary(summary);
                console.log(`Successfully translated summary for ${archive.videoId}.`);

                // 要約データを配列に追加
                summaries.push({
                    videoId: archive.videoId,
                    title: archive.title,
                    streamer: archive.streamer,
                    date: archive.date,
                    thumbnailUrl: archive.thumbnailUrl,
                    duration: archive.duration,
                    overview: summary.overview,
                    highlights: summary.highlights,
                    tags: summary.tags,
                    overview_en: summary_en.overview,
                    highlights_en: summary_en.highlights,
                    tags_en: summary_en.tags,
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

async function updateSummary(videoId) {
    try {
        // 既存の要約とアーカイブ情報を読み込む
        const summaryPath = path.join(__dirname, '../../src/data/summaries.json');
        const archivePath = path.join(__dirname, '../../data/archives.json');

        let summaries = [];
        try {
            summaries = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
        } catch (e) {
            console.error('要約ファイル(summaries.json)が見つからないか、読み込めません。');
            process.exit(1);
        }

        const archives = JSON.parse(await fs.readFile(archivePath, 'utf8'));

        const summaryIndex = summaries.findIndex(s => s.videoId === videoId);
        if (summaryIndex === -1) {
            console.error(`指定されたvideoId (${videoId}) の要約が summaries.json に見つかりません。`);
            return;
        }

        let archiveInfo = archives.find(a => a.videoId === videoId);
        if (!archiveInfo) {
            console.warn(`指定されたvideoId (${videoId}) の情報が archives.json に見つかりません。summaries.json の情報を使用します。`);
            archiveInfo = summaries[summaryIndex];
            if (!archiveInfo.duration || !archiveInfo.title || !archiveInfo.streamer || !archiveInfo.thumbnailUrl || !archiveInfo.date) {
                console.error(`summaries.json の情報が不足しているため、処理を続行できません。`);
                return;
            }
        }

        console.log(`要約を更新します: ${videoId} - ${archiveInfo.title}`);

        // generateSummary を呼び出して新しい要約を生成
        const newSummaryData = await generateSummary(
            archiveInfo.videoId,
            archiveInfo.duration,
            archiveInfo.title,
            archiveInfo.streamer,
            archiveInfo.thumbnailUrl
        );

        // 英語に翻訳
        console.log(`Translating updated summary for ${archiveInfo.videoId}...`);
        const newSummaryData_en = await translateSummary(newSummaryData);
        console.log(`Successfully translated updated summary for ${archiveInfo.videoId}.`);

        // 新しい要約データで更新
        const updatedSummary = {
            videoId: archiveInfo.videoId,
            title: archiveInfo.title,
            streamer: archiveInfo.streamer,
            date: archiveInfo.date,
            thumbnailUrl: archiveInfo.thumbnailUrl,
            duration: archiveInfo.duration,
            overview: newSummaryData.overview,
            highlights: newSummaryData.highlights,
            tags: newSummaryData.tags,
            overview_en: newSummaryData_en.overview,
            highlights_en: newSummaryData_en.highlights,
            tags_en: newSummaryData_en.tags,
            lastUpdated: new Date().toISOString()
        };

        // summaries 配列内のデータを更新
        summaries[summaryIndex] = updatedSummary;

        // 更新した内容をファイルに書き込む
        await fs.writeFile(summaryPath, JSON.stringify(summaries, null, 2));
        console.log(`要約を更新しました: ${videoId}`);

    } catch (error) {
        console.error(`要約の更新中にエラーが発生しました: ${videoId}`, error.message || error);
        process.exit(1);
    }
}

// メイン処理
async function main() {
    // process.argv[0] is 'node', process.argv[1] is the script path.
    // The actual arguments start from index 2.
    const videoId = process.argv[2];

    if (videoId) {
        await updateSummary(videoId);
    } else {
        await generateSummaries();
    }
}

main();

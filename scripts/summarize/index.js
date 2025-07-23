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
            if ((error.message && (error.message.includes('429 Too Many Requests') || error.message.includes('レスポンスが有効なJSON形式ではありません') || error.message.includes('概要情報が不足しています'))) && i < retries - 1) {
                console.warn(`Rate limit hit or invalid JSON response. Retrying in ${delay / 1000} seconds... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Re-throw other errors or if max retries reached
            }
        }
    }
}

async function generateSummary(videoId, videoDurationSeconds) {
    const formatExample = {
        "overview": {
            "summary": "配信の全体的な内容を200字程度で説明",
            "mood": "配信の雰囲気や配信者の感情を表す短い説明（例：「終始和やかな雰囲気」「感動的な場面が多い」など）"
        },
        "highlights": [
            {
                "title": "見どころのタイトル",
                "description": "その内容の詳細説明",
                "timestamp": "発生時間（動画の開始からの経過時間、フォーマットはHH:MM:SS）",
                "type": "トピックの種類（お知らせ/トーク/ゲーム/歌/リアクション等）"
            }
        ],
        "tags": ["配信内容に関連するタグ（例：雑談、ゲーム実況、歌枠等）"]
    };

    const promptTemplate = (clipStart, clipEnd, formatExample, existingSummary = null) => {
        let prompt = `以下のホロライブ所属タレントのYouTubeライブ配信の、${formatTimestamp(clipStart)}から${formatTimestamp(clipEnd)}までの範囲を要約し、JSONオブジェクトとして出力してください。`;

        if (existingSummary) {
            prompt += `\n\nこれまでの要約データ:\n${JSON.stringify(existingSummary, null, 2)}\n\nこの要約データを更新・追記する形で、新しい期間の情報を追加してください。特に、ハイライトとタグは既存のものに追記し、概要は全体を考慮して更新してください。`;
        }

        prompt += `\n\n出力形式は以下の構造に厳密に従ってください:\n${JSON.stringify(formatExample, null, 2)}\n\n注意事項:\n1. 概要は200字程度で、配信の全体像が分かるように要約してください\n2. 見どころは3-5個抽出してください\n3. タイムスタンプは、動画の開始を00:00:00として、そこからの経過時間を時間、分、秒をコロンで区切った形式で正確に記載してください。秒が不確かな場合は00とせず、最も近い秒に丸めてください。
   - **重要**: タイムスタンプは必ずHH:MM:SS形式（例: 00:05:30）で出力してください。MM:SS:00のような形式は避けてください。\n4. 配信の種類や内容に応じて適切なタグを付与してください\n5. マークダウンやコードブロックは使用せず、純粋なJSONオブジェクトのみを出力してください\n6. 全てのフィールドは必須です。不明な場合は適切なデフォルト値を設定してください\n\n以下は許可されない出力形式の例です:\n❌ \`\`\`json\n{...}\`\`\`\n\n正しい出力形式:\n✅ {\n  "overview": {...},\n  "highlights": [...],\n  "tags": [...]}\n`;
        return prompt;
    };

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const chunkSizeSeconds = 1800; // 30 minutes per chunk
    const maxChunks = Math.ceil(videoDurationSeconds / chunkSizeSeconds); // Calculate max chunks based on duration
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
        if (clipEndSeconds > videoDurationSeconds) {
            clipEndSeconds = videoDurationSeconds;
        }

        console.log(`Processing chunk: ${videoId} from ${clipStartSeconds}s to ${clipEndSeconds}s`);

        try {
            const result = await retry(async () => {
                return await model.generateContent([
                    promptTemplate(clipStartSeconds, clipEndSeconds, formatExample, currentSummary),
                    {
                        fileData: {
                            fileUri: videoUrl,
                        },
                        videoMetadata: {
                            startOffset: { seconds: clipStartSeconds },
                            endOffset: { seconds: clipEndSeconds }
                        },
                    },
                ], {
                    generationConfig: {
                        mediaResolution: 'LOW',
                    },
                });
            });

            const response = await result.response;
            let text = response.text();
            console.log(`${videoId}: ${text}`);

            // マークダウンのコードブロックを除去
            text = text.replace(/```json|```/g, '').trim();
            if (!text.startsWith('{') || !text.endsWith('}')) {
                throw new Error('レスポンスが有効なJSON形式ではありません');
            }
            const chunkSummary = JSON.parse(text);

            if (!chunkSummary.overview || !chunkSummary.overview.summary) {
                throw new Error('概要情報が不足しています');
            }
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
                // Decide whether to break or continue on other errors. For now, break.
                break;
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

        for (const archive of archives) {
            if (summarizedIds.has(archive.videoId)) continue;

            try {
                // Gemini APIを使用して動画を直接要約
                const summary = await generateSummary(archive.videoId, archive.duration);
                
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
            } catch (error) {
                if (error.message && (error.message.includes('No transcripts are available for this video') || error.message.includes('Could not find transcript for'))) {
                    console.log(`要約可能な字幕が見つかりません: ${archive.videoId}`);
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

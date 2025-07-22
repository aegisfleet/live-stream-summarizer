require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/default.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini APIの初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generateSummary(videoId) {
    const formatExample = {
        "overview": {
            "summary": "配信の全体的な内容を200字程度で説明",
            "mood": "配信の雰囲気や配信者の感情を表す短い説明（例：「終始和やかな雰囲気」「感動的な場面が多い」など）",
            "duration": "配信時間（例：2時間30分）"
        },
        "highlights": [
            {
                "title": "見どころのタイトル",
                "description": "その内容の詳細説明",
                "timestamp": "発生時間（配信開始からの経過時間）",
                "type": "トピックの種類（announcement/talk/gaming/singing/reaction等）"
            }
        ],
        "tags": ["配信内容に関連するタグ（例：雑談、ゲーム実況、歌枠等）"]
    };

    const prompt = `以下のホロライブ所属タレントのYouTubeライブ配信を要約し、JSONオブジェクトとして出力してください。

出力形式は以下の構造に厳密に従ってください:
${JSON.stringify(formatExample, null, 2)}

注意事項:
1. 概要は200字程度で、配信の全体像が分かるように要約してください
2. 見どころは3-5個抽出してください
3. タイムスタンプは可能な限り正確に記載してください
4. 配信の種類や内容に応じて適切なタグを付与してください
5. マークダウンやコードブロックは使用せず、純粋なJSONオブジェクトのみを出力してください
6. 全てのフィールドは必須です。不明な場合は適切なデフォルト値を設定してください

以下は許可されない出力形式の例です:
❌ \`\`\`json
{...}
\`\`\`

正しい出力形式:
✅ {
  "overview": {...},
  "highlights": [...],
  "tags": [...]
}
`;

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const result = await model.generateContent([
        prompt,
        {
            fileData: {
                fileUri: videoUrl,
            },
        },
    ]);
    const response = await result.response;
    let text = response.text();

    try {
        // マークダウンのコードブロックを除去
        text = text.replace(/```json\n|\n```/g, '');
        
        // 余分な空白や改行を整理
        text = text.trim();
        
        // テキストが有効なJSONかどうか確認
        if (!text.startsWith('{') || !text.endsWith('}')) {
            throw new Error('レスポンスが有効なJSON形式ではありません');
        }

        // JSON形式の文字列から実際のオブジェクトに変換
        const summary = JSON.parse(text);

        // 必須フィールドの存在確認と整形
        if (!summary.overview || !summary.overview.summary) {
            throw new Error('概要情報が不足しています');
        }

        if (!Array.isArray(summary.highlights) || summary.highlights.length === 0) {
            throw new Error('見どころ情報が不足しています');
        }

        // タグが無い場合は空配列をデフォルト値として設定
        if (!Array.isArray(summary.tags)) {
            summary.tags = [];
        }

        return {
            overview: summary.overview,
            highlights: summary.highlights.map(h => ({
                ...h,
                timestamp: h.timestamp || 'タイムスタンプなし'
            })),
            tags: summary.tags
        };
    } catch (error) {
        console.error('要約のパース中にエラーが発生:', error);
        throw new Error('要約の解析に失敗しました');
    }
}

async function generateSummaries() {
    try {
        // アーカイブ情報を読み込み
        const archivePath = path.join(__dirname, '../../data/archives.json');
        const archives = JSON.parse(await fs.readFile(archivePath, 'utf8'));

        // すでに要約済みのデータを読み込み
        let existingSummaries = [];
        const summaryPath = path.join(__dirname, '../src/data/summaries.json');
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
                const summary = await generateSummary(archive.videoId);
                
                // 要約データを配列に追加
                summaries.push({
                    videoId: archive.videoId,
                    title: archive.title,
                    channelName: archive.channelName,
                    streamDate: archive.streamDate,
                    thumbnailUrl: archive.thumbnailUrl,
                    overview: {
                        summary: summary.overview.summary,
                        mood: summary.overview.mood,
                        duration: summary.overview.duration
                    },
                    highlights: summary.highlights,
                    tags: summary.tags,
                    lastUpdated: new Date().toISOString()
                });

                // summaries.jsonを更新
                await fs.writeFile(summaryPath, JSON.stringify(summaries, null, 2));
                
                console.log(`要約を生成しました: ${archive.videoId}`);
                
                // APIレート制限を考慮して少し待機
                await new Promise(resolve => setTimeout(resolve, 1000));
                
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

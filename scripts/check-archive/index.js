require('dotenv').config();
const { google } = require('googleapis');
const { YoutubeTranscript } = require('youtube-transcript');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config/default.json');

const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

async function checkArchives() {
    try {
        // スケジュールデータを読み込み
        const schedulePath = path.join(__dirname, '../../data/schedules.json');
        const schedules = JSON.parse(await fs.readFile(schedulePath, 'utf8'));
        const archives = [];

        for (const stream of schedules) {
            try {
                // 動画情報を取得
                const videoResponse = await youtube.videos.list({
                    part: ['snippet', 'liveStreamingDetails'],
                    id: [stream.videoId]
                });

                const videoInfo = videoResponse.data.items[0];
                if (!videoInfo) continue;

                // ライブ配信が終了しているか確認
                const liveDetails = videoInfo.liveStreamingDetails;
                if (!liveDetails || !liveDetails.actualEndTime) continue;

                // 字幕が利用可能か確認
                let hasTranscript = false;
                try {
                    await YoutubeTranscript.fetchTranscript(stream.videoId);
                    hasTranscript = true;
                } catch (e) {
                    console.log(`字幕なし: ${stream.videoId}`);
                    continue;
                }

                if (hasTranscript) {
                    archives.push({
                        ...stream,
                        title: videoInfo.snippet.title,
                        thumbnailUrl: videoInfo.snippet.thumbnails.medium.url,
                        endTime: liveDetails.actualEndTime
                    });
                }
            } catch (error) {
                console.error(`動画の確認中にエラー: ${stream.videoId}`, error);
            }
        }

        // アーカイブ情報を保存
        const outputPath = path.join(__dirname, '../../data/archives.json');
        await fs.writeFile(outputPath, JSON.stringify(archives, null, 2));
        console.log(`アーカイブ情報を保存しました: ${archives.length}件`);

    } catch (error) {
        console.error('アーカイブ確認に失敗しました:', error);
        process.exit(1);
    }
}

checkArchives();

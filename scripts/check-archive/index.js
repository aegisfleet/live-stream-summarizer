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

function parseISO8601Duration(isoDuration) {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  const hours = matches[1] ? parseInt(matches[1], 10) : 0;
  const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
  const seconds = matches[3] ? parseInt(matches[3], 10) : 0;

  return hours * 3600 + minutes * 60 + seconds;
}

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
                    part: ['snippet', 'liveStreamingDetails', 'contentDetails', 'status'],
                    id: [stream.videoId]
                });

                const videoInfo = videoResponse.data.items[0];
                if (!videoInfo) continue;

                // メンバー限定動画（非公開または限定公開）を除外
                if (videoInfo.status.privacyStatus !== 'public') {
                    console.log(`メンバー限定動画のため除外: ${stream.videoId} (Privacy Status: ${videoInfo.status.privacyStatus})`);
                    continue;
                }

                // ライブ配信が終了しているか確認
                const liveDetails = videoInfo.liveStreamingDetails;
                if (!liveDetails || !liveDetails.actualEndTime) continue;

                const durationInSeconds = parseISO8601Duration(videoInfo.contentDetails.duration);

                // 再生時間が2時間30分を超えるものは除外
                if (durationInSeconds > 2.5 * 60 * 60) {
                    console.log(`2時間を超えるため除外: ${stream.videoId}`);
                    continue;
                }

                archives.push({
                    ...stream,
                    title: videoInfo.snippet.title,
                    thumbnailUrl: videoInfo.snippet.thumbnails.medium.url,
                    endTime: liveDetails.actualEndTime,
                    duration: durationInSeconds
                });
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

require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const SCHEDULE_URLS = [
  "https://schedule.hololive.tv/simple/hololive",
  "https://schedule.hololive.tv/simple/dev_is",
  "https://schedule.hololive.tv/simple/indonesia",
  "https://schedule.hololive.tv/simple/english"
];

async function fetchSchedule() {
    try {
        let allStreams = [];

        for (const url of SCHEDULE_URLS) {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const streams = [];

            // 配信枠の情報を取得
            let currentDate = '';
            
            $('.container .row').each((_, row) => {
                const $row = $(row);
                
                // 日付の取得
                const dateHeader = $row.find('.navbar-text');
                if (dateHeader.length > 0) {
                    currentDate = dateHeader.text().trim();
                }
                
                // 配信情報の取得
                $row.find('a').each((_, link) => {
                    const $link = $(link);
                    const videoUrl = $link.attr('href');
                    if (!videoUrl) return;
                    let videoHost;
                    try {
                        videoHost = new URL(videoUrl).host;
                    } catch (error) {
                        console.warn(`不正なURL形式をスキップします: ${videoUrl}`, error.message);
                        return;
                    }
                    const allowedHosts = ['youtube.com', 'www.youtube.com'];
                    if (!allowedHosts.includes(videoHost)) return;

                    let videoId;
                    try {
                        videoId = new URL(videoUrl).searchParams.get('v');
                        if (!videoId) {
                            console.warn(`無効なYouTube URL (video idがありません): ${videoUrl}`);
                            return;
                        }
                    } catch (error) {
                        console.warn(`不正なURL形式をスキップします: ${videoUrl}`, error.message);
                        return;
                    }

                    const linkText = $link.text().trim();
                    const [time, ...streamerParts] = linkText.split(/\s+/);
                    const streamer = streamerParts.join(' ');
                    // 日付と時間のパース
                    const [month, day] = currentDate.match(/(\d{2})\/(\d{2})/).slice(1);
                    const year = new Date().getFullYear();
                    const [hours, minutes] = time.split(':');
                    const date = new Date(year, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));

                    streams.push({
                        videoId,
                        videoUrl,
                        streamer,
                        date: date.toISOString(),
                    });
                });
            });
            allStreams = allStreams.concat(streams);
        }

        // videoIdでスケジュールを重複排除
        const uniqueStreams = [...new Map(allStreams.map(item => [item.videoId, item])).values()];

        // データを保存
        const outputPath = path.join(__dirname, '../../data/schedules.json');
        await fs.writeFile(outputPath, JSON.stringify(uniqueStreams, null, 2));
        console.log(`配信スケジュールを保存しました: ${uniqueStreams.length}件`);

    } catch (error) {
        console.error('配信スケジュールの取得に失敗しました:', error);
        process.exit(1);
    }
}

fetchSchedule();

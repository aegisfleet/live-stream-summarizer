const { LiveChat } = require('youtube-chat');
const { google } = require('googleapis');

const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

/**
 * Formats seconds into a HH:MM:SS string.
 * @param {number} totalSeconds - The total seconds to format.
 * @returns {string} The formatted timestamp string.
 */
function formatTimestamp(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Fetches the live chat replay for a given YouTube video ID.
 * @param {string} videoId - The ID of the YouTube video.
 * @returns {Promise<Array<{timestamp: number, message: string}>>} A promise that resolves to an array of chat message objects.
 */
async function fetchChatReplay(videoId) {
    try {
        console.log(`Fetching channelId for videoId: ${videoId}`);
        const videoResponse = await youtube.videos.list({
            part: ['snippet'],
            id: [videoId]
        });

        if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
            throw new Error(`Video not found for videoId: ${videoId}`);
        }

        const channelId = videoResponse.data.items[0].snippet.channelId;
        console.log(`Found channelId: ${channelId} for videoId: ${videoId}`);

        const liveChat = new LiveChat({ videoId, channelId });
        const chatMessages = [];

        // Event listener for each chat message
        liveChat.on('chat', (chatItem) => {
            const timestampInSeconds = Math.floor(chatItem.timestamp / 1000);
            const formattedTime = formatTimestamp(timestampInSeconds);
            const message = `[${formattedTime}] ${chatItem.author.name}: ${chatItem.message.map(m => m.text).join('')}`;

            chatMessages.push({
                timestamp: timestampInSeconds,
                message: message,
            });
        });

        // Event listener for errors
        liveChat.on('error', (err) => {
            console.error(`Chat fetching error for videoId ${videoId}:`, err);
            // Stop the chat fetcher on error to prevent hanging
            liveChat.stop();
        });

        // Start fetching chat
        await liveChat.start();

        console.log(`Successfully fetched ${chatMessages.length} chat messages for videoId: ${videoId}`);

        // The 'start' method resolves when the replay is fully fetched,
        // so we can stop it immediately.
        liveChat.stop();

        return chatMessages;
    } catch (error) {
        console.error(`Failed to initialize chat fetching for videoId ${videoId}:`, error);
        // If initialization fails, return an empty array
        return [];
    }
}

module.exports = { fetchChatReplay };

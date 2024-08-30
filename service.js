const { WebClient } = require('@slack/web-api');
const {GoogleSpreadsheet} = require('google-spreadsheet');
const {JWT} = require('google-auth-library');
require('dotenv').config();
const privateKey = process.env.SPREADSHEET_PRIVATE_KEY.replace(/\\n/g, '\n');
const clientEmail = process.env.SPREADSHEET_CLIENT_EMAIL;
const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetId = 0;
const token = process.env.SLACK_APP_TOKEN;
const channelId = process.env.SLACK_CHANNEL_ID;
// Initialize Slack Web API client
const web = new WebClient(token);

async function getUsersInChannel() {
    try {
        // Fetch the members of the channel
        const result = await web.conversations.members({
            channel: channelId,
        });

        // Get user details for each user ID
        const userPromises = result.members.map(userId => web.users.info({ user: userId }));
        const users = (await Promise.all(userPromises)).map(user => {
            const { id, profile } = user.user;
            if(!['Sam', 'Adria', 'Grace Henitsoa', "Onja2", "Marieke", 'Ivan', ''].includes(profile.display_name)) {
                return { id, name: profile.display_name, status: profile.status_text }
            }
        }).filter(user => Boolean(user));
        return users;
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

function formatDate(timestamp) {
    if(!timestamp) return 'No date';
    const date = new Date(Math.floor(parseInt(timestamp)) * 1000);
    const options = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const formattedDate = date.toLocaleDateString('en-GB', options);
    return formattedDate;
}

// Function to get all messages from a channel sent by a specific user
async function getAllMessagesByUser() {
    let allMessages = [];
    let hasMore = true;
    let cursor;

    while (hasMore) {
        try {
            // Fetch conversation history with pagination
            const result = await web.conversations.history({
                channel: channelId,
                cursor: cursor,
            });

            // Add filtered messages to the list
            allMessages = allMessages.concat(result.messages);

            // Check if there are more messages to fetch
            hasMore = result.has_more;
            cursor = result.response_metadata.next_cursor;

        } catch (error) {
            console.error('Error fetching messages:', error);
            hasMore = false;
        }
    }

    const allUsers = await getUsersInChannel();

    const groupedMessages = allUsers.map(user => {
        // Get messages by user and format the date
        const messagesByUser = allMessages
            .map((message) => ({ user: message.user, date: formatDate(message.ts) }))
            .filter(message => message.user === user?.id);
    
        // Calculate the date two days ago
        const SevenDaysAgo = new Date();
        SevenDaysAgo.setDate(SevenDaysAgo.getDate() - 7);
        SevenDaysAgo.setHours(0, 0, 0, 0); // Set time to midnight
    
        // Filter based on last_message_date being before two days ago
        const lastMessageDate = new Date(messagesByUser[1]?.date);
        const isBeforeSevenDaysAgo = lastMessageDate < SevenDaysAgo;
    
        return {
            id: user.id,
            name: user.name,
            length: messagesByUser.length,
            last_message_date: messagesByUser[1]?.date,
            isBeforeSevenDaysAgo
        };
    });

    return groupedMessages;
}

async function updateSpreadSheetData (_req, res) {
    if(!clientEmail || !privateKey) {
        return res.status(500).json({ success: false, error: 'Missing credentials' });
    }
    const serviceAccountAuth = new JWT({
        email: String(clientEmail),
        key: String(privateKey),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);

    try {
        await doc.loadInfo();
        const sheet = doc.sheetsById[sheetId];

        if (!sheet) {
            return res.status(404).json({ success: false, error: 'Sheet not found' });
        }
        const groupedMessages = await getAllMessagesByUser();

        await sheet.clearRows()

        const rowsData = groupedMessages.map(user => ({
            "Developer": user.name,
            "Number Of Stand-ups": user.length,
            "Last Message Date": user.last_message_date,
            "Is Before Seven Days Ago?": user.isBeforeSevenDaysAgo ? "Yes" : "No",
            "Has Been Reminded?": user.isBeforeSevenDaysAgo ? "Yes" : "No",
        })).sort((a, b) => b['Number Of Stand-ups'] - a['Number Of Stand-ups']);

        for (const item of rowsData) {
            await sheet.addRow(item);
        }
        res.json({ success: true, message: "Data updated" }); 
    } catch (e) {
        console.error('Error interacting with Google Sheets:', e);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
}

async function sendReminder(_req, res) {
    try {
        const groupedMessages = await getAllMessagesByUser();
        const usersWhoHaveNotPostedForAWeek = ["USP0XSXCM", ...groupedMessages
        .filter(user => user.isBeforeSevenDaysAgo)
        .map(user => user.id)]
        
        for(const userId of usersWhoHaveNotPostedForAWeek) {
            await web.chat.postMessage({
                channel: userId,
                text: `Dear <@${userId}>, this is just a friendly reminder to post your daily stand-up in the <#${channelId}> channel whenever you have some time, as you have been quiet for a while. Thanks for the collaboration!`,
            });
        }
        res.json({ success: true, message: "Reminders sent" });
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

module.exports = {
    updateSpreadSheetData,
    sendReminder
};
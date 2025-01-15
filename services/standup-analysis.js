const { WebClient } = require('@slack/web-api');
const { loadSpreadsheet } = require('../utils');
require('dotenv').config();
const spreadsheetId = process.env.DEVS_STAND_UPS_SPREADSHEET_ID;
const sheetId = 0;
const token = process.env.DEVS_STAND_UPS_SLACK_APP_TOKEN;
const channelId = process.env.DEVS_STAND_UPS_SLACK_CHANNEL_ID;
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
            if (!['Sam', 'Adria', 'Grace Henitsoa', "Onja2", "Marieke", 'Ivan', 'Ahmed', 'Virginie', 'Synthia'].includes(profile.display_name)) {
                return { id, real_name: profile.real_name, name: profile.display_name, status: profile.status_text }
            }
        }).filter(user => Boolean(user?.name));
        return users;
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

function formatDate(timestamp) {
    if (!timestamp) return 'No date';
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
        const todayMonth = new Date().getMonth() + 1;
        const userMessagesCurrentMonth = messagesByUser.filter(message => {
            const messageMonthAndYear = `${new Date(message.date).getMonth() + 1}/${new Date(message.date).getFullYear()}`;
            const currentMonthAndYear = `${todayMonth}/${new Date().getFullYear()}`;
            return messageMonthAndYear === currentMonthAndYear
        });

        // console.log("messagesByUser", messagesByUser)
        return {
            id: user.id,
            name: user.name,
            length: messagesByUser.length,
            last_message_date: messagesByUser[1]?.date,
            isBeforeSevenDaysAgo,
            number_of_messages_current_month: userMessagesCurrentMonth.length,
            weekly_average: Math.round(((userMessagesCurrentMonth.length / 5) + Number.EPSILON) * 100) / 100, // Calculate weekly average
        };
    });

    return groupedMessages;
}

async function updateSpreadSheetData(_req, res) {
    try {
        const doc = await loadSpreadsheet(spreadsheetId);
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
            "Has Been Reminded?": "No",
        })).sort((a, b) => b['Number Of Stand-ups'] - a['Number Of Stand-ups']);

        for (const item of rowsData) {
            await sheet.addRow(item);
        }
        await updateMonthlyStats();
        res.json({ success: true, message: "Data updated" });
    } catch (e) {
        console.error('Error interacting with Google Sheets:', e);
        return res.status(500).json({ success: false, error: 'Server error' });
    }
}

async function sendReminder(_req, res) {
    try {
        const doc = await loadSpreadsheet(spreadsheetId);
        const groupedMessages = await getAllMessagesByUser();
        const usersWhoHaveNotPostedForAWeek = ["USP0XSXCM", ...groupedMessages
            .filter(user => user.isBeforeSevenDaysAgo)
            .map(user => user.id)].filter(userId => userId !== 'USNGMG1KN');

        for (const userId of usersWhoHaveNotPostedForAWeek) {
            await web.chat.postMessage({
                channel: userId,
                text: `Dear <@${userId}>, this is just a friendly reminder to post your daily stand-up in the <#${channelId}> channel whenever you have some time, as you have been quiet for a while. Thanks for the collaboration!`,
            });
        }

        await doc.loadInfo();
        const sheet = doc.sheetsById[sheetId];
        if (!sheet) {
            return res.status(404).json({ success: false, error: 'Sheet not found' });
        }
        const rows = await sheet.getRows();
        const columns = await sheet.headerValues;
        let rowsUpdated = 0;
        const indexOfIsBeforeSevenDaysAgo = columns.findIndex(column => column.includes("Seven Days"));
        const indexOfHasBeenReminded = columns.findIndex(column => column.includes("Remind"));
        const currentMonthStatSheet = await loadThisMonthSheet();
        const currentMonthRows = await currentMonthStatSheet.getRows();
        // Iterate over each row and update "Has Been Reminded?" if "Is Before Seven Days Ago?" is "Yes"
        for (const row of rows) {
            if (row._rawData[indexOfIsBeforeSevenDaysAgo] === "Yes") {
                const currentMonthRow = currentMonthRows.find(
                    monthRow => monthRow._rawData[0] === row._rawData[0]
                );
        
                if (currentMonthRow) {
                    currentMonthRow._rawData[2] = (parseInt(currentMonthRow._rawData[2]) || 0) + 1;
                    await currentMonthRow.save();
                }
                row._rawData[indexOfHasBeenReminded] = "Yes";
                await row.save();
                rowsUpdated++;
            }
        }
        // Check if any rows were updated and send appropriate response
        if (rowsUpdated > 0) {
            res.json({ success: true, message: `Reminders sent and ${rowsUpdated} rows updated with reminder status.` });
        } else {
            res.json({ success: true, message: "Reminders sent but no rows required updating." });
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

function getMonthName(monthIndex) {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return monthNames[monthIndex - 1]; // since month index is 1 to 12  
}

async function loadThisMonthSheet() {
    const doc = await loadSpreadsheet(spreadsheetId);
    await doc.loadInfo();
    const allSheets = doc.sheetsByIndex.map(sheet => sheet.title);
    const todayMonth = getMonthName(new Date().getMonth() + 1);
    const sheetName = `Monthly Stats - ${todayMonth} ${new Date().getFullYear()}`;
    const sheetExist = allSheets.includes(sheetName);
    let sheet = null;
    if (sheetExist) {
        sheet = doc.sheetsByIndex[allSheets.indexOf(sheetName)];
    } else {
        sheet = await doc.addSheet({
            title: sheetName,
            headerValues: ['Developer', 'Number of Stand-ups', 'Number of Reminders', 'Weekly Average', 'Comments from Mentor', 'Action Taken']
        });
    }
    return sheet;
}

async function updateMonthlyStats() {
    try {
        const sheet = await loadThisMonthSheet(); // Load the sheet
        const existingRows = await sheet.getRows(); // Fetch all existing rows
        const groupedMessages = await getAllMessagesByUser(); // Get new data

        const rowsData = groupedMessages.map(message => ({
            Developer: message.name,
            "Number of Stand-ups": message.number_of_messages_current_month,
            "Weekly Average": message.weekly_average,
            "Number of Reminders": 0
        }));

        for (const rowData of rowsData) {
            const matchingRow = existingRows.find(row => {
                return row._rawData[0].trim().toLowerCase() === rowData.Developer.trim().toLowerCase()
            });

            if (matchingRow) {
                // Update the row
                matchingRow._rawData[1] = rowData['Number of Stand-ups'];
                matchingRow._rawData[2] = matchingRow._rawData[2];
                matchingRow._rawData[3] = rowData["Weekly Average"];
                try {
                    await matchingRow.save(); // Save changes
                    console.log('Matching row saved successfully!');
                } catch (error) {
                    console.error('Error saving matching row:', error);
                }
            } else {
                // Add new row if no match is found
                await sheet.addRow(rowData);
            }
        }
    } catch (error) {
        console.error('Error updating monthly stats:', error);
    }
}

module.exports = {
    getUsersInChannel,
    updateSpreadSheetData,
    sendReminder
};
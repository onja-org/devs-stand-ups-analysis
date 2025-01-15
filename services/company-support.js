const { loadSpreadsheet } = require('../utils');
const { getUsersInChannel } = require('./standup-analysis');
const { WebClient } = require('@slack/web-api');
require('dotenv').config();
const COMPANY_SUPPORT_TIME_SLACK_TOKEN = process.env.COMPANY_SUPPORT_TIME_SLACK_TOKEN;
const supportTimeSlackWeb = new WebClient(COMPANY_SUPPORT_TIME_SLACK_TOKEN);

async function sendMessage(channel, text) {
    try {
        const result = await supportTimeSlackWeb.chat.postMessage({
            channel: channel,
            text: text,
        });

        console.log('Message sent successfully:', result.ts);
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function sendCompanySupportTimeReminder() {
    try {
        const doc = await loadSpreadsheet(process.env.COMPANY_SUPPORT_TIME_SPREADSHEET_ID);
        await doc.loadInfo(); // Load the document properties
        const sheetTitle = "Weekly Check";
        // Access the sheet by title
        const sheet = doc.sheetsByTitle[sheetTitle];
        if (!sheet) {
            throw new Error(`Sheet with title "${sheetTitle}" not found.`);
        }
        await sheet.loadHeaderRow(4);
        // Fetch rows
        const rows = await sheet.getRows();
        const rowData = rows.map(row => row._rawData.filter(row => row !== 'FALSE')).slice(0, 18);
        const currentWeekColIndex = Math.max(...rowData.map(row => row.length));
        const allUsers = await getUsersInChannel();

        const thisWeekStatuses = rowData.map(row => {
            const devSlackId = allUsers
            .find(user => user.name.includes(row[1]) ||  user.real_name.includes(row[1]))?.id;
            return {
                developer: row[1],
                slackId: devSlackId,
                hasFilled: row[currentWeekColIndex - 1] === 'TRUE'
            }
        });

        // thisWeekStatuses.filter(status => !status.hasFilled).forEach(status => {
        //     const message = 
        //     `Reminder:\nDear <@${status.slackId}>, this is a friendly reminder to fill out the <https://forms.gle/4qyjQaBpZk6H2c6A7|form> about the support you received last week at your company.\nThis is very important for the Enterprise team, and it won't take you longer than 1-2 minutes.\nThanks for your collaboration!`
        //     sendMessage(status.slackId, message);
        // })
        const message = 
            `Reminder:\nDear <@USP0XSXCM>, this is a friendly reminder to fill out the <https://docs.google.com/forms/d/e/1FAIpQLSc92wEBcds8PO6S7oYXL0i8da7tUYVZTxDPRkkfzfKy94JyKA/viewform|form> about the support you received last week at your company.\nThis is very important for the Enterprise team, and it won't take you longer than 1-2 minutes.\nThanks for your collaboration!`
        sendMessage("USP0XSXCM", message);

        const message2 = 
        `Reminder:\nDear <@U06CM96F7HU>, this is a friendly reminder to fill out the <https://docs.google.com/forms/d/e/1FAIpQLSc92wEBcds8PO6S7oYXL0i8da7tUYVZTxDPRkkfzfKy94JyKA/viewform|form> about the support you received last week at your company.\nThis is very important for the Enterprise team, and it won't take you longer than 1-2 minutes.\nThanks for your collaboration!`
    sendMessage("U06CM96F7HU", message2);
        } catch (error) {
        console.error('Error loading the specific sheet:', error);
    }
}


module.exports = {
    sendCompanySupportTimeReminder
}
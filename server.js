const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { updateSpreadSheetData, sendReminder } = require('./services/standup-analysis');
const { sendCompanySupportTimeReminder } = require('./services/company-support');

const app = express();
app.use(express.json());
const PORT = process.env.port || 4000;
app.use(cors());

cron.schedule('15 8 * * 1', async () => {
    console.log('Scheduled task started at 8:15 AM GMT+3');

    try {
        await updateSpreadSheetData();
        await sendReminder();
    } catch (error) {
        console.error('An error occurred during the scheduled task:', error);
    }
}, {
    timezone: "Etc/GMT-3"
});

app.get('/api/update-data', updateSpreadSheetData);
app.get('/api/send-reminder', sendReminder);
app.get('/api/send-company-support-time-reminder', sendCompanySupportTimeReminder)

// Set up Express app
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

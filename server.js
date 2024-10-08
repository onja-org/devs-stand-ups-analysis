const express = require('express');
const cors = require('cors');
const { updateSpreadSheetData, sendReminder } = require('./service');

const app = express();
app.use(express.json());
const PORT = process.env.port || 4000;
app.use(cors());

app.get('/api/update-data', updateSpreadSheetData);
app.get('/api/send-reminder', sendReminder);

// Set up Express app
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

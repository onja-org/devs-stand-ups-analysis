const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();
const privateKey = process.env.SPREADSHEET_PRIVATE_KEY.replace(/\\n/g, '\n');
const clientEmail = process.env.SPREADSHEET_CLIENT_EMAIL;

const loadSpreadsheet = async (sheetId) => {
    if (!clientEmail || !privateKey) {
        return res.status(500).json({ success: false, error: 'Missing credentials' });
    }
    const serviceAccountAuth = new JWT({
        email: String(clientEmail),
        key: String(privateKey),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    return doc;
}

module.exports = {
    loadSpreadsheet
}
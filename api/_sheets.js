const { google } = require('googleapis');

const SHEET_NAME = 'Responses';

const HEADER_ROW = [
  'Timestamp', 'Name', 'Email', 'Mobile', 'DOB', 'Country',
  'Address', 'Lat', 'Lon', 'Reason', 'Slot Date', 'Time Slot',
];

let cachedClient = null;

async function getSheetsClient() {
  if (cachedClient) return cachedClient;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variable.');
  }

  // Vercel env vars store literal \n as two characters ("\" and "n");
  // convert them back into real newlines for the PEM key to parse correctly.
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  await auth.authorize();

  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

async function ensureHeaderRow(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:L1`,
  });

  const existing = res.data.values && res.data.values[0];
  const hasHeader = existing && existing.length === HEADER_ROW.length &&
    existing.every((val, i) => val === HEADER_ROW[i]);

  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:L1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

async function getAllRows(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:L`,
  });
  return res.data.values || [];
}

module.exports = {
  getSheetsClient,
  ensureHeaderRow,
  getAllRows,
  SHEET_NAME,
};

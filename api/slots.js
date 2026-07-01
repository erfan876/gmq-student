const { getSheetsClient, ensureHeaderRow, getAllRows } = require('./_sheets');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const date = req.query.date;
  if (!date) {
    res.status(400).json({ message: 'Missing date query parameter.' });
    return;
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
    }

    const sheets = await getSheetsClient();
    await ensureHeaderRow(sheets, spreadsheetId);
    const rows = await getAllRows(sheets, spreadsheetId);

    // Columns: Timestamp, Name, Email, Mobile, DOB, Country, Address, Lat, Lon, Reason, SlotDate, TimeSlot
    // SlotDate is column index 10 (K... adjust if header changes), TimeSlot is index 11
    const booked = rows
      .filter(row => row[10] === date)
      .map(row => row[11])
      .filter(Boolean);

    res.status(200).json({ booked });
  } catch (err) {
    console.error('Error fetching slots:', err);
    res.status(500).json({ message: 'Could not load slot availability.' });
  }
};

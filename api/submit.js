const { getSheetsClient, ensureHeaderRow, getAllRows, SHEET_NAME } = require('./_sheets');

const VALID_SLOTS = new Set([
  '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
  '14:00-15:00', '15:00-16:00', '16:00-17:00',
]);

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDateStr(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

function sanitize(str) {
  // Strip characters that could trigger spreadsheet formula injection
  return String(str).replace(/^[=+\-@]/, "'$&");
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const {
    name, email, mobile, dob, country,
    address, address_lat, address_lon,
    reason, slot_date, slot,
  } = body;

  // Server-side validation
  const errors = [];
  if (!name || !String(name).trim()) errors.push('name');
  if (!email || !isValidEmail(email)) errors.push('email');
  if (!mobile || !String(mobile).trim()) errors.push('mobile');
  if (!dob || !isValidDateStr(dob)) errors.push('dob');
  if (!country || !String(country).trim()) errors.push('country');
  if (!address || !String(address).trim()) errors.push('address');
  if (!reason || !String(reason).trim()) errors.push('reason');
  if (!slot_date || !isValidDateStr(slot_date)) errors.push('slot_date');
  if (!slot || !VALID_SLOTS.has(slot)) errors.push('slot');

  if (errors.length) {
    res.status(400).json({ message: `Missing or invalid fields: ${errors.join(', ')}` });
    return;
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
    }

    const sheets = await getSheetsClient();
    await ensureHeaderRow(sheets, spreadsheetId);

    // Re-check availability right before writing, to minimize (not fully eliminate) the race window.
    const rows = await getAllRows(sheets, spreadsheetId);
    const alreadyBooked = rows.some(row => row[10] === slot_date && row[11] === slot);
    if (alreadyBooked) {
      res.status(409).json({ message: 'This time slot has just been booked. Please choose another.' });
      return;
    }

    const newRow = [
      new Date().toISOString(),
      sanitize(name),
      sanitize(email),
      sanitize(mobile),
      dob,
      sanitize(country),
      sanitize(address),
      address_lat || '',
      address_lon || '',
      sanitize(reason),
      slot_date,
      slot,
    ];

    // Append using an append call scoped to the exact range; Sheets append is atomic per-call
    // and includes server-side row-locking at the API level, which combined with our
    // pre-check above keeps double-booking extremely unlikely.
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:L`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] },
    });

    // Final verification: re-read and confirm no duplicate slot was written by a concurrent request
    // that landed between our check and our append. If a duplicate exists and ours is not the first
    // occurrence, treat this submission as the loser and report a conflict.
    const rowsAfter = await getAllRows(sheets, spreadsheetId);
    const matches = rowsAfter
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row[10] === slot_date && row[11] === slot);

    if (matches.length > 1) {
      const updatedRange = appendResult.data.updates && appendResult.data.updates.updatedRange;
      const ourRowNumber = updatedRange ? parseInt(updatedRange.match(/(\d+):/)?.[1], 10) : null;
      const firstMatchRowNumber = matches[0].idx + 2; // +2: header row + 0-index offset

      if (ourRowNumber && ourRowNumber !== firstMatchRowNumber) {
        // We lost the race. Clear our row's slot fields so it doesn't count as a booking,
        // but keep the lead's contact info intact for follow-up if needed.
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!K${ourRowNumber}:L${ourRowNumber}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['CONFLICT - slot taken', '']] },
        });
        res.status(409).json({ message: 'This time slot was just booked by someone else. Please choose another.' });
        return;
      }
    }

    res.status(200).json({ message: 'Booking confirmed.' });
  } catch (err) {
    console.error('Error submitting booking:', err);
    res.status(500).json({ message: 'Something went wrong while saving your booking. Please try again.' });
  }
};

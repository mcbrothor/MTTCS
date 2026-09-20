export function parseTelegramResponse(body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  if (parsed?.ok === true && Number.isInteger(parsed.result?.message_id)) return parsed.result;
  if (parsed?.ok === false && Number.isInteger(parsed.error_code) && parsed.error_code >= 400 && parsed.error_code < 500) {
    const error = new Error(`Telegram rejected message: ${parsed.description || parsed.error_code}`);
    error.response = { status: parsed.error_code, data: parsed };
    throw error;
  }
  const uncertain = new Error('Telegram response did not confirm acceptance or definitive rejection.');
  uncertain.deliveryUncertain = true;
  throw uncertain;
}

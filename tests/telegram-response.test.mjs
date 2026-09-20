import assert from 'node:assert/strict';
import { parseTelegramResponse } from '../scripts/lib/telegram-response.mjs';
assert.equal(parseTelegramResponse('{"ok":true,"result":{"message_id":123}}').message_id, 123);
for (const body of ['', '<html>error</html>', '{}', '{"ok":true}', '{"ok":false,"error_code":500}']) {
  assert.throws(() => parseTelegramResponse(body), (error) => error.deliveryUncertain === true);
}
assert.throws(() => parseTelegramResponse('{"ok":false,"error_code":400,"description":"cannot parse entities"}'), (error) => error.response.status === 400 && !error.deliveryUncertain);
console.log('Telegram response tests passed');

# Capture Claude.ai API Response

Debug task to capture the full API response from Claude.ai usage endpoint.

## Steps

1. Add debug logging to `src/scraper.js` in the `processApiResponse` method:
```javascript
console.log('RAW API RESPONSE:', JSON.stringify(apiResponse, null, 2));
```

2. Run extension in debug mode (F5)

3. Execute "Fetch Claude Usage Now" command

4. Check Output Channel "Claude Usage - Token Monitor" for the full response

## Expected New Fields (Nov 2025)
Based on screenshot, look for:
- `sonnet_only` or similar (Sonnet-specific weekly limit)
- `extra_usage` or `wallet` (Extra usage/wallet data)
- `spending_cap` (Monthly limit)
- `wallet_balance` (Remaining funds)

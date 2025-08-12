#!/bin/bash

echo "🧪 Testing Orchestrator Service"
echo "================================"

BASE_URL="http://localhost:3002"

echo ""
echo "1️⃣  Testing Health Check..."
curl -s -X GET "$BASE_URL/health" | jq '.'

echo ""
echo "2️⃣  Testing Queue Stats..."
curl -s -X GET "$BASE_URL/stats" | jq '.'

echo ""
echo "3️⃣  Testing Remittance Processing..."
echo "Sending remittance request..."
REMITTANCE_RESPONSE=$(curl -s -X POST "$BASE_URL/test/remittance" \
  -H "Content-Type: application/json" \
  -d '{
    "remittanceId": "test-rem-123",
    "userId": "user-123",
    "senderAccountId": "sender-account-123", 
    "receiverAccountId": "receiver-account-123",
    "amount": 100,
    "currency": "USD",
    "fee": 5,
    "idempotencyKey": "unique-key-123"
  }')

echo "$REMITTANCE_RESPONSE" | jq '.'

echo ""
echo "4️⃣  Testing Payment Callback..."
echo "Sending payment callback..."
CALLBACK_RESPONSE=$(curl -s -X POST "$BASE_URL/test/callback" \
  -H "Content-Type: application/json" \
  -d '{
    "remittanceId": "test-rem-123",
    "providerTxnId": "provider-txn-123",
    "status": "COMPLETED"
  }')

echo "$CALLBACK_RESPONSE" | jq '.'

echo ""
echo "5️⃣  Checking Remittance Status..."
curl -s -X GET "$BASE_URL/remittance/test-rem-123" | jq '.'

echo ""
echo "6️⃣  Final Queue Stats..."
curl -s -X GET "$BASE_URL/stats" | jq '.'

echo ""
echo "✅ Testing Complete!"
